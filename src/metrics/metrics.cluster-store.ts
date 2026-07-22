import { Injectable, Logger } from '@nestjs/common';
import { ValkeyClient } from '../cache/valkey/valkey.client';
import {
  MetricsSnapshot,
  TimelineBucket,
  RouteBreakdown,
  DownstreamBreakdown,
  StatusClassCounts,
  CacheProviderStats,
} from './metrics.types';
import {
  BUCKET_INTERVAL_MS,
  HISTOGRAM_BOUNDS,
  isClusterEnabled,
  keyPrefix,
} from './metrics.cluster.shared';

const SNAPSHOT_CACHE_TTL_MS = 5_000;

type Hash = Record<string, string>;

interface MinuteData {
  bucketTs: number;
  g: Hash;
  r: Hash;
  d: Hash;
}

/**
 * Reads the cluster-wide metric counters written by MetricsPublisher (from all
 * pods) and merges them into a MetricsSnapshot. Returns null on any Valkey
 * failure so callers can fall back to the local in-memory aggregator.
 */
@Injectable()
export class MetricsClusterStore {
  private readonly logger = new Logger(MetricsClusterStore.name);
  private snapshotCache = new Map<number, { at: number; snapshot: MetricsSnapshot }>();

  constructor(private readonly valkeyClient: ValkeyClient) {}

  isEnabled(): boolean {
    return isClusterEnabled();
  }

  async getSnapshot(windowMs: number): Promise<MetricsSnapshot | null> {
    const cached = this.snapshotCache.get(windowMs);
    if (cached && Date.now() - cached.at < SNAPSHOT_CACHE_TTL_MS) {
      return cached.snapshot;
    }

    const now = Date.now();
    const cutoff = now - windowMs;
    const oldestBucketTs = Math.floor(cutoff / BUCKET_INTERVAL_MS) * BUCKET_INTERVAL_MS;
    const bucketTimestamps: number[] = [];
    for (let ts = oldestBucketTs; ts <= now; ts += BUCKET_INTERVAL_MS) {
      bucketTimestamps.push(ts);
    }

    const prefix = keyPrefix();
    const minutes = await this.fetchMinutes(prefix, bucketTimestamps);
    if (!minutes) return null;

    const snapshot = this.merge(minutes, now, windowMs);
    this.snapshotCache.set(windowMs, { at: Date.now(), snapshot });
    return snapshot;
  }

  private async fetchMinutes(prefix: string, bucketTimestamps: number[]): Promise<MinuteData[] | null> {
    return this.valkeyClient.execute(async (client) => {
      const pipeline = client.pipeline();
      for (const ts of bucketTimestamps) {
        pipeline.hgetall(`${prefix}:g:${ts}`);
        pipeline.hgetall(`${prefix}:r:${ts}`);
        pipeline.hgetall(`${prefix}:d:${ts}`);
      }
      const results = await pipeline.exec();
      if (!results) throw new Error('Empty pipeline result');

      const minutes: MinuteData[] = [];
      for (let i = 0; i < bucketTimestamps.length; i++) {
        const [gErr, g] = results[i * 3];
        const [rErr, r] = results[i * 3 + 1];
        const [dErr, d] = results[i * 3 + 2];
        if (gErr || rErr || dErr) throw gErr || rErr || dErr;
        minutes.push({
          bucketTs: bucketTimestamps[i],
          g: (g as Hash) || {},
          r: (r as Hash) || {},
          d: (d as Hash) || {},
        });
      }
      return minutes;
    });
  }

  private merge(minutes: MinuteData[], now: number, windowMs: number): MetricsSnapshot {
    let totalRequests = 0;
    let errorCount = 0;
    let latSum = 0;
    let cacheHits = 0;
    let cpValkey = 0;
    let cpLocal = 0;
    const statusClasses: StatusClassCounts = { c2xx: 0, c3xx: 0, c4xx: 0, c5xx: 0 };
    const histogram = new Map<string, number>();

    const timeline: TimelineBucket[] = [];
    const routeAcc = new Map<string, { count: number; err: number; latSum: number; hit: number }>();
    const dsAcc = new Map<
      string,
      {
        count: number; err: number; netErr: number; latSum: number;
        s2: number; s3: number; s4: number; s5: number;
        stCount: number; stBuild: number; stClient: number; stDown: number; stXform: number;
      }
    >();

    const num = (hash: Hash, field: string): number => {
      const v = hash[field];
      return v ? Number(v) : 0;
    };

    for (const minute of minutes) {
      const g = minute.g;
      const count = num(g, 'count');
      const err = num(g, 'err');
      const bucketLatSum = num(g, 'latSum');

      totalRequests += count;
      errorCount += err;
      latSum += bucketLatSum;
      cacheHits += num(g, 'hit');
      cpValkey += num(g, 'cpValkey');
      cpLocal += num(g, 'cpLocal');
      statusClasses.c2xx += num(g, 's2');
      statusClasses.c3xx += num(g, 's3');
      statusClasses.c4xx += num(g, 's4');
      statusClasses.c5xx += num(g, 's5');

      for (const field of Object.keys(g)) {
        if (field.startsWith('h:')) {
          histogram.set(field, (histogram.get(field) || 0) + Number(g[field]));
        }
      }

      timeline.push({
        bucketTs: minute.bucketTs,
        requestCount: count,
        avgLatencyMs: count > 0 ? bucketLatSum / count : 0,
        errorCount: err,
        statusClasses: {
          c2xx: num(g, 's2'),
          c3xx: num(g, 's3'),
          c4xx: num(g, 's4'),
          c5xx: num(g, 's5'),
        },
      });

      for (const field of Object.keys(minute.r)) {
        const sep = field.lastIndexOf('|');
        if (sep < 0) continue;
        const routeKey = field.slice(0, sep);
        const metric = field.slice(sep + 1);
        let acc = routeAcc.get(routeKey);
        if (!acc) {
          acc = { count: 0, err: 0, latSum: 0, hit: 0 };
          routeAcc.set(routeKey, acc);
        }
        const value = Number(minute.r[field]);
        if (metric === 'count') acc.count += value;
        else if (metric === 'err') acc.err += value;
        else if (metric === 'latSum') acc.latSum += value;
        else if (metric === 'hit') acc.hit += value;
      }

      for (const field of Object.keys(minute.d)) {
        const sep = field.lastIndexOf('|');
        if (sep < 0) continue;
        const target = field.slice(0, sep);
        const metric = field.slice(sep + 1);
        let acc = dsAcc.get(target);
        if (!acc) {
          acc = {
            count: 0, err: 0, netErr: 0, latSum: 0,
            s2: 0, s3: 0, s4: 0, s5: 0,
            stCount: 0, stBuild: 0, stClient: 0, stDown: 0, stXform: 0,
          };
          dsAcc.set(target, acc);
        }
        const value = Number(minute.d[field]);
        if (metric in acc) (acc as any)[metric] += value;
      }
    }

    const routeBreakdown: RouteBreakdown[] = Array.from(routeAcc.entries())
      .map(([routeKey, acc]) => {
        const spaceIdx = routeKey.indexOf(' ');
        return {
          method: spaceIdx > 0 ? routeKey.slice(0, spaceIdx) : '',
          route: spaceIdx > 0 ? routeKey.slice(spaceIdx + 1) : routeKey,
          requestCount: acc.count,
          avgLatencyMs: acc.count > 0 ? acc.latSum / acc.count : 0,
          errorCount: acc.err,
          cacheHitRate: acc.count > 0 ? (acc.hit / acc.count) * 100 : 0,
        };
      })
      .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs);

    const downstream: DownstreamBreakdown[] = Array.from(dsAcc.entries()).map(([target, acc]) => ({
      target,
      requestCount: acc.count,
      avgLatencyMs: acc.count > 0 ? acc.latSum / acc.count : 0,
      errorCount: acc.err,
      networkErrorCount: acc.netErr,
      statusClasses: { c2xx: acc.s2, c3xx: acc.s3, c4xx: acc.s4, c5xx: acc.s5 },
      avgStages:
        acc.stCount > 0
          ? {
              buildRequestMs: acc.stBuild / acc.stCount,
              createClientMs: acc.stClient / acc.stCount,
              downstreamMs: acc.stDown / acc.stCount,
              resTransformMs: acc.stXform / acc.stCount,
            }
          : undefined,
    }));

    const cacheProviders: CacheProviderStats[] = [];
    if (cpValkey > 0) cacheProviders.push({ provider: 'valkey', hits: cpValkey, misses: 0 });
    if (cpLocal > 0) cacheProviders.push({ provider: 'local', hits: cpLocal, misses: 0 });
    if (totalRequests - cacheHits > 0) {
      cacheProviders.push({ provider: 'none', hits: 0, misses: totalRequests - cacheHits });
    }

    return {
      timestamp: now,
      windowMs,
      bucketIntervalMs: BUCKET_INTERVAL_MS,
      source: 'cluster',
      summary: {
        totalRequests,
        errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0,
        avgLatencyMs: totalRequests > 0 ? latSum / totalRequests : 0,
        cacheHitRate: totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0,
        p50LatencyMs: this.estimatePercentile(histogram, totalRequests, 50),
        p90LatencyMs: this.estimatePercentile(histogram, totalRequests, 90),
        p99LatencyMs: this.estimatePercentile(histogram, totalRequests, 99),
        statusClasses,
        cacheProviders,
        percentileSource: 'histogram',
      },
      timeline,
      routeBreakdown,
      downstream,
    };
  }

  private estimatePercentile(histogram: Map<string, number>, total: number, p: number): number {
    if (total === 0) return 0;
    const targetRank = Math.ceil((p / 100) * total);
    let cumulative = 0;
    let prevBound = 0;
    for (const bound of HISTOGRAM_BOUNDS) {
      const count = histogram.get(`h:${bound}`) || 0;
      if (cumulative + count >= targetRank) {
        // Linear interpolation within the bucket
        const positionInBucket = targetRank - cumulative;
        return prevBound + ((bound - prevBound) * positionInBucket) / count;
      }
      cumulative += count;
      prevBound = bound;
    }
    // Fell into the open-ended bucket; report its lower bound.
    return prevBound;
  }
}
