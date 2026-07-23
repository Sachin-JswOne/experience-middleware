import { Injectable, Logger } from '@nestjs/common';
import { ValkeyClient } from '../cache/valkey/valkey.client';
import {
  MetricsSnapshot,
  TimelineBucket,
  RouteBreakdown,
  RouteDownstreamPair,
  RouteErrorSample,
  RouteTimelinePoint,
  DownstreamBreakdown,
  DownstreamTimeline,
  StatusClassCounts,
  CacheProviderStats,
  RecentError,
  DeployMarker,
} from './metrics.types';
import {
  BUCKET_INTERVAL_MS,
  CLUSTER_SAMPLES_KEY_SUFFIX,
  CLUSTER_SAMPLES_MAX,
  HOUR_INTERVAL_MS,
  estimatePercentileFromHistogram,
  histogramToApi,
  isClusterEnabled,
  keyPrefix,
  readGranularity,
  timelineBucketMs,
} from './metrics.cluster.shared';
import { RECENT_ERRORS_KEY_SUFFIX, RECENT_ERRORS_MAX } from './metrics.publisher';

type Hash = Record<string, string>;

interface MinuteData {
  bucketTs: number;
  g: Hash;
  r: Hash;
  d: Hash;
  p: Hash;
}

export const DEPLOYS_KEY_SUFFIX = 'deploys';
export const DEPLOYS_MAX = 50;
const MAX_RECENT_ERRORS_RETURNED = 20;

/**
 * Reads the cluster-wide metric counters written by MetricsPublisher (from all
 * pods) and merges them into a MetricsSnapshot. Returns null on any Valkey
 * failure so callers can fall back to the local in-memory aggregator.
 */
@Injectable()
export class MetricsClusterStore {
  private readonly logger = new Logger(MetricsClusterStore.name);
  private snapshotCache = new Map<string, { at: number; snapshot: MetricsSnapshot }>();

  constructor(private readonly valkeyClient: ValkeyClient) {}

  isEnabled(): boolean {
    return isClusterEnabled();
  }

  async getSnapshot(windowMs: number): Promise<MetricsSnapshot | null> {
    const now = Date.now();
    return this.getSnapshotRange(now - windowMs, now);
  }

  async getSnapshotRange(fromTs: number, toTs: number): Promise<MetricsSnapshot | null> {
    const windowMs = toTs - fromTs;
    // Large windows read far more keys — cache their snapshots longer.
    // (30d reads ~2.9k hashes; a 60s cache keeps that off the hot path.)
    const cacheTtlMs =
      windowMs > 48 * HOUR_INTERVAL_MS ? 60_000 : windowMs > 6 * HOUR_INTERVAL_MS ? 30_000 : 5_000;
    // Round the cache key so a sliding relative window reuses entries.
    const cacheKey = `${Math.floor(fromTs / 5_000)}:${Math.floor(toTs / 5_000)}`;
    const cached = this.snapshotCache.get(cacheKey);
    if (cached && Date.now() - cached.at < cacheTtlMs) {
      return cached.snapshot;
    }

    const granularity = readGranularity(windowMs);
    const keyIntervalMs = granularity === 'minute' ? BUCKET_INTERVAL_MS : HOUR_INTERVAL_MS;
    const now = Date.now();
    const endTs = Math.min(toTs, now);
    const oldestBucketTs = Math.floor(fromTs / keyIntervalMs) * keyIntervalMs;
    const bucketTimestamps: number[] = [];
    for (let ts = oldestBucketTs; ts <= endTs; ts += keyIntervalMs) {
      bucketTimestamps.push(ts);
    }

    const prefix = keyPrefix();
    const minutes = await this.fetchBuckets(prefix, granularity, bucketTimestamps);
    if (!minutes) return null;

    const snapshot = this.merge(minutes, now, windowMs);
    if (this.snapshotCache.size > 100) this.snapshotCache.clear();
    this.snapshotCache.set(cacheKey, { at: Date.now(), snapshot });
    return snapshot;
  }

  // Cluster-wide error feed published by every pod. Returns null on Valkey
  // failure so the caller can keep the local pod's errors instead.
  async getRecentErrors(fromTs: number, toTs: number): Promise<RecentError[] | null> {
    const entries = await this.valkeyClient.execute((client) =>
      client.lrange(`${keyPrefix()}:${RECENT_ERRORS_KEY_SUFFIX}`, 0, RECENT_ERRORS_MAX - 1),
    );
    if (!entries) return null;
    const errors: RecentError[] = [];
    for (const entry of entries) {
      try {
        const parsed = JSON.parse(entry) as RecentError;
        if (parsed.ts >= fromTs && parsed.ts <= toTs) errors.push(parsed);
      } catch {
        // Skip malformed entries.
      }
    }
    return errors.sort((a, b) => b.ts - a.ts).slice(0, MAX_RECENT_ERRORS_RETURNED);
  }

  async getDeployMarkers(fromTs: number, toTs: number): Promise<DeployMarker[] | null> {
    const entries = await this.valkeyClient.execute((client) =>
      client.lrange(`${keyPrefix()}:${DEPLOYS_KEY_SUFFIX}`, 0, DEPLOYS_MAX - 1),
    );
    if (!entries) return null;
    const markers: DeployMarker[] = [];
    for (const entry of entries) {
      try {
        const parsed = JSON.parse(entry) as DeployMarker;
        if (parsed.ts >= fromTs && parsed.ts <= toTs) markers.push(parsed);
      } catch {
        // Skip malformed entries.
      }
    }
    return markers.sort((a, b) => a.ts - b.ts);
  }

  // One route's traffic bucketed over a range, extracted from the per-bucket
  // route hashes. Returns null on Valkey failure (caller falls back local).
  async getRouteTimeline(
    method: string,
    route: string,
    fromTs: number,
    toTs: number,
  ): Promise<{ points: RouteTimelinePoint[]; bucketIntervalMs: number } | null> {
    const windowMs = toTs - fromTs;
    const granularity = readGranularity(windowMs);
    const keyIntervalMs = granularity === 'minute' ? BUCKET_INTERVAL_MS : HOUR_INTERVAL_MS;
    const rKey = granularity === 'minute' ? 'r' : 'rh';
    const bucketMs = timelineBucketMs(windowMs);
    const routeKey = `${method} ${route}`;
    const prefix = keyPrefix();

    const now = Date.now();
    const endTs = Math.min(toTs, now);
    const oldestKeyTs = Math.floor(fromTs / keyIntervalMs) * keyIntervalMs;
    const keyTimestamps: number[] = [];
    for (let ts = oldestKeyTs; ts <= endTs; ts += keyIntervalMs) {
      keyTimestamps.push(ts);
    }

    const hashes = await this.valkeyClient.execute(async (client) => {
      const pipeline = client.pipeline();
      for (const ts of keyTimestamps) {
        pipeline.hgetall(`${prefix}:${rKey}:${ts}`);
      }
      const results = await pipeline.exec();
      if (!results) throw new Error('Empty pipeline result');
      return results.map(([err, hash]) => {
        if (err) throw err;
        return (hash as Hash) || {};
      });
    });
    if (!hashes) return null;

    const acc = new Map<
      number,
      { count: number; latSum: number; err: number; histogram: Record<string, number> }
    >();
    // Pre-fill so quiet periods render as zero, not gaps.
    const oldestBucketTs = Math.floor(fromTs / bucketMs) * bucketMs;
    for (let ts = oldestBucketTs; ts <= endTs; ts += bucketMs) {
      acc.set(ts, { count: 0, latSum: 0, err: 0, histogram: {} });
    }
    const prefixLen = routeKey.length + 1;
    for (let i = 0; i < hashes.length; i++) {
      const coalescedTs = Math.floor(keyTimestamps[i] / bucketMs) * bucketMs;
      const point = acc.get(coalescedTs);
      if (!point) continue;
      const hash = hashes[i];
      for (const field of Object.keys(hash)) {
        if (!field.startsWith(routeKey) || field[routeKey.length] !== '|') continue;
        const metric = field.slice(prefixLen);
        const value = Number(hash[field]);
        if (metric === 'count') point.count += value;
        else if (metric === 'latSum') point.latSum += value;
        else if (metric === 'err') point.err += value;
        else if (metric.startsWith('h:')) {
          point.histogram[metric] = (point.histogram[metric] || 0) + value;
        }
      }
    }

    return {
      bucketIntervalMs: bucketMs,
      points: Array.from(acc.entries())
        .sort(([a], [b]) => a - b)
        .map(([bucketTs, p]) => {
          const histTotal = Object.values(p.histogram).reduce((a, b) => a + b, 0);
          return {
            bucketTs,
            requestCount: p.count,
            avgLatencyMs: p.count > 0 ? p.latSum / p.count : 0,
            errorCount: p.err,
            p95LatencyMs:
              histTotal > 0
                ? estimatePercentileFromHistogram(p.histogram, histTotal, 95)
                : undefined,
          };
        }),
    };
  }

  // Cluster-wide error/slow samples pushed by every pod's publisher.
  // Returns null on Valkey failure so callers keep the local store.
  async getClusterSamples(): Promise<RouteErrorSample[] | null> {
    const entries = await this.valkeyClient.execute((client) =>
      client.lrange(`${keyPrefix()}:${CLUSTER_SAMPLES_KEY_SUFFIX}`, 0, CLUSTER_SAMPLES_MAX - 1),
    );
    if (!entries) return null;
    const samples: RouteErrorSample[] = [];
    for (const entry of entries) {
      try {
        samples.push(JSON.parse(entry) as RouteErrorSample);
      } catch {
        // Skip malformed entries.
      }
    }
    return samples;
  }

  private async fetchBuckets(
    prefix: string,
    granularity: 'minute' | 'hour',
    bucketTimestamps: number[],
  ): Promise<MinuteData[] | null> {
    const [gKey, rKey, dKey, pKey] =
      granularity === 'minute' ? ['g', 'r', 'd', 'p'] : ['gh', 'rh', 'dh', 'ph'];
    return this.valkeyClient.execute(async (client) => {
      const pipeline = client.pipeline();
      for (const ts of bucketTimestamps) {
        pipeline.hgetall(`${prefix}:${gKey}:${ts}`);
        pipeline.hgetall(`${prefix}:${rKey}:${ts}`);
        pipeline.hgetall(`${prefix}:${dKey}:${ts}`);
        pipeline.hgetall(`${prefix}:${pKey}:${ts}`);
      }
      const results = await pipeline.exec();
      if (!results) throw new Error('Empty pipeline result');

      const minutes: MinuteData[] = [];
      for (let i = 0; i < bucketTimestamps.length; i++) {
        const [gErr, g] = results[i * 4];
        const [rErr, r] = results[i * 4 + 1];
        const [dErr, d] = results[i * 4 + 2];
        const [pErr, p] = results[i * 4 + 3];
        if (gErr || rErr || dErr || pErr) throw gErr || rErr || dErr || pErr;
        minutes.push({
          bucketTs: bucketTimestamps[i],
          g: (g as Hash) || {},
          r: (r as Hash) || {},
          d: (d as Hash) || {},
          p: (p as Hash) || {},
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
    const histogram: Record<string, number> = {};

    const bucketMs = timelineBucketMs(windowMs);
    const timelineAcc = new Map<
      number,
      {
        count: number;
        err: number;
        latSum: number;
        statusClasses: StatusClassCounts;
        histogram: Record<string, number>;
      }
    >();
    const routeAcc = new Map<
      string,
      {
        count: number;
        err: number;
        latSum: number;
        hit: number;
        s2: number;
        s3: number;
        s4: number;
        s5: number;
        histogram: Record<string, number>;
      }
    >();
    const dsAcc = new Map<
      string,
      {
        count: number;
        err: number;
        netErr: number;
        latSum: number;
        s2: number;
        s3: number;
        s4: number;
        s5: number;
        stCount: number;
        stBuild: number;
        stClient: number;
        stDown: number;
        stXform: number;
        histogram: Record<string, number>;
      }
    >();
    // target -> coalesced bucket -> counters (downstream time series)
    const dsTimelineAcc = new Map<
      string,
      Map<number, { count: number; err: number; latSum: number; histogram: Record<string, number> }>
    >();
    // "<METHOD> <route>|<target>" -> counters (route-scoped downstream)
    const pairAcc = new Map<string, { count: number; err: number; latSum: number }>();

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

      const coalescedTs = Math.floor(minute.bucketTs / bucketMs) * bucketMs;
      let tb = timelineAcc.get(coalescedTs);
      if (!tb) {
        tb = {
          count: 0,
          err: 0,
          latSum: 0,
          statusClasses: { c2xx: 0, c3xx: 0, c4xx: 0, c5xx: 0 },
          histogram: {},
        };
        timelineAcc.set(coalescedTs, tb);
      }
      tb.count += count;
      tb.err += err;
      tb.latSum += bucketLatSum;
      tb.statusClasses.c2xx += num(g, 's2');
      tb.statusClasses.c3xx += num(g, 's3');
      tb.statusClasses.c4xx += num(g, 's4');
      tb.statusClasses.c5xx += num(g, 's5');

      for (const field of Object.keys(g)) {
        if (field.startsWith('h:')) {
          const value = Number(g[field]);
          histogram[field] = (histogram[field] || 0) + value;
          tb.histogram[field] = (tb.histogram[field] || 0) + value;
        }
      }

      for (const field of Object.keys(minute.r)) {
        const sep = field.lastIndexOf('|');
        if (sep < 0) continue;
        const routeKey = field.slice(0, sep);
        const metric = field.slice(sep + 1);
        let acc = routeAcc.get(routeKey);
        if (!acc) {
          acc = { count: 0, err: 0, latSum: 0, hit: 0, s2: 0, s3: 0, s4: 0, s5: 0, histogram: {} };
          routeAcc.set(routeKey, acc);
        }
        const value = Number(minute.r[field]);
        if (metric === 'count') acc.count += value;
        else if (metric === 'err') acc.err += value;
        else if (metric === 'latSum') acc.latSum += value;
        else if (metric === 'hit') acc.hit += value;
        else if (metric === 's2') acc.s2 += value;
        else if (metric === 's3') acc.s3 += value;
        else if (metric === 's4') acc.s4 += value;
        else if (metric === 's5') acc.s5 += value;
        else if (metric.startsWith('h:')) {
          acc.histogram[metric] = (acc.histogram[metric] || 0) + value;
        }
      }

      for (const field of Object.keys(minute.d)) {
        const sep = field.lastIndexOf('|');
        if (sep < 0) continue;
        const target = field.slice(0, sep);
        const metric = field.slice(sep + 1);
        let acc = dsAcc.get(target);
        if (!acc) {
          acc = {
            count: 0,
            err: 0,
            netErr: 0,
            latSum: 0,
            s2: 0,
            s3: 0,
            s4: 0,
            s5: 0,
            stCount: 0,
            stBuild: 0,
            stClient: 0,
            stDown: 0,
            stXform: 0,
            histogram: {},
          };
          dsAcc.set(target, acc);
        }
        const value = Number(minute.d[field]);
        if (metric.startsWith('h:')) {
          acc.histogram[metric] = (acc.histogram[metric] || 0) + value;
        } else if (metric in acc) (acc as any)[metric] += value;

        if (
          metric === 'count' ||
          metric === 'err' ||
          metric === 'latSum' ||
          metric.startsWith('h:')
        ) {
          let series = dsTimelineAcc.get(target);
          if (!series) {
            series = new Map();
            dsTimelineAcc.set(target, series);
          }
          let point = series.get(coalescedTs);
          if (!point) {
            point = { count: 0, err: 0, latSum: 0, histogram: {} };
            series.set(coalescedTs, point);
          }
          if (metric.startsWith('h:')) {
            point.histogram[metric] = (point.histogram[metric] || 0) + value;
          } else {
            (point as any)[metric] += value;
          }
        }
      }

      // Pair fields: "<METHOD> <route>|<target>|<metric>" — parse from the
      // right since route paths may themselves contain no separator but
      // targets/metrics never do.
      for (const field of Object.keys(minute.p)) {
        const metricSep = field.lastIndexOf('|');
        if (metricSep < 0) continue;
        const metric = field.slice(metricSep + 1);
        if (metric !== 'count' && metric !== 'err' && metric !== 'latSum') continue;
        const pairKey = field.slice(0, metricSep);
        if (pairKey.lastIndexOf('|') < 0) continue;
        let acc = pairAcc.get(pairKey);
        if (!acc) {
          acc = { count: 0, err: 0, latSum: 0 };
          pairAcc.set(pairKey, acc);
        }
        (acc as any)[metric] += Number(minute.p[field]);
      }
    }

    // Route targets derived from pair keys (no extra storage).
    const routeTargets = new Map<string, Set<string>>();
    const routeDownstream: RouteDownstreamPair[] = [];
    for (const [pairKey, acc] of pairAcc.entries()) {
      const targetSep = pairKey.lastIndexOf('|');
      const routeKey = pairKey.slice(0, targetSep);
      const target = pairKey.slice(targetSep + 1);
      let targets = routeTargets.get(routeKey);
      if (!targets) {
        targets = new Set();
        routeTargets.set(routeKey, targets);
      }
      targets.add(target);
      const spaceIdx = routeKey.indexOf(' ');
      routeDownstream.push({
        method: spaceIdx > 0 ? routeKey.slice(0, spaceIdx) : '',
        route: spaceIdx > 0 ? routeKey.slice(spaceIdx + 1) : routeKey,
        target,
        requestCount: acc.count,
        avgLatencyMs: acc.count > 0 ? acc.latSum / acc.count : 0,
        errorCount: acc.err,
      });
    }

    const routeBreakdown: RouteBreakdown[] = Array.from(routeAcc.entries())
      .map(([routeKey, acc]) => {
        const spaceIdx = routeKey.indexOf(' ');
        const targets = routeTargets.get(routeKey);
        return {
          method: spaceIdx > 0 ? routeKey.slice(0, spaceIdx) : '',
          route: spaceIdx > 0 ? routeKey.slice(spaceIdx + 1) : routeKey,
          requestCount: acc.count,
          avgLatencyMs: acc.count > 0 ? acc.latSum / acc.count : 0,
          errorCount: acc.err,
          cacheHitRate: acc.count > 0 ? (acc.hit / acc.count) * 100 : 0,
          p95LatencyMs: estimatePercentileFromHistogram(acc.histogram, acc.count, 95),
          statusClasses: { c2xx: acc.s2, c3xx: acc.s3, c4xx: acc.s4, c5xx: acc.s5 },
          targets: targets ? Array.from(targets).sort() : undefined,
        };
      })
      .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs);

    const downstream: DownstreamBreakdown[] = Array.from(dsAcc.entries()).map(([target, acc]) => {
      // Counters written before per-target histograms shipped have no h:*
      // fields — estimate over what the histogram actually covers, or skip.
      const histTotal = Object.values(acc.histogram).reduce((a, b) => a + b, 0);
      return {
      target,
      requestCount: acc.count,
      avgLatencyMs: acc.count > 0 ? acc.latSum / acc.count : 0,
      errorCount: acc.err,
      p95LatencyMs:
        histTotal > 0 ? estimatePercentileFromHistogram(acc.histogram, histTotal, 95) : undefined,
      p99LatencyMs:
        histTotal > 0 ? estimatePercentileFromHistogram(acc.histogram, histTotal, 99) : undefined,
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
      };
    });

    const downstreamTimeline: DownstreamTimeline[] = Array.from(dsTimelineAcc.entries()).map(
      ([target, series]) => ({
        target,
        points: Array.from(series.entries())
          .sort(([a], [b]) => a - b)
          .map(([bucketTs, p]) => {
            const histTotal = Object.values(p.histogram).reduce((a, b) => a + b, 0);
            return {
              bucketTs,
              requestCount: p.count,
              avgLatencyMs: p.count > 0 ? p.latSum / p.count : 0,
              errorCount: p.err,
              p95LatencyMs:
                histTotal > 0
                  ? estimatePercentileFromHistogram(p.histogram, histTotal, 95)
                  : undefined,
            };
          }),
      }),
    );

    const cacheProviders: CacheProviderStats[] = [];
    if (cpValkey > 0) cacheProviders.push({ provider: 'valkey', hits: cpValkey, misses: 0 });
    if (cpLocal > 0) cacheProviders.push({ provider: 'local', hits: cpLocal, misses: 0 });
    if (totalRequests - cacheHits > 0) {
      cacheProviders.push({ provider: 'none', hits: 0, misses: totalRequests - cacheHits });
    }

    const timeline: TimelineBucket[] = Array.from(timelineAcc.entries())
      .sort(([a], [b]) => a - b)
      .map(([bucketTs, tb]) => ({
        bucketTs,
        requestCount: tb.count,
        avgLatencyMs: tb.count > 0 ? tb.latSum / tb.count : 0,
        errorCount: tb.err,
        statusClasses: tb.statusClasses,
        p90LatencyMs: estimatePercentileFromHistogram(tb.histogram, tb.count, 90),
        p99LatencyMs: estimatePercentileFromHistogram(tb.histogram, tb.count, 99),
        histogram: histogramToApi(tb.histogram),
      }));

    return {
      timestamp: now,
      windowMs,
      windowCoverageMs: windowMs,
      bucketIntervalMs: bucketMs,
      source: 'cluster',
      summary: {
        totalRequests,
        errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0,
        avgLatencyMs: totalRequests > 0 ? latSum / totalRequests : 0,
        cacheHitRate: totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0,
        p50LatencyMs: estimatePercentileFromHistogram(histogram, totalRequests, 50),
        p90LatencyMs: estimatePercentileFromHistogram(histogram, totalRequests, 90),
        p99LatencyMs: estimatePercentileFromHistogram(histogram, totalRequests, 99),
        statusClasses,
        cacheProviders,
        percentileSource: 'histogram',
      },
      timeline,
      routeBreakdown,
      downstream,
      downstreamTimeline,
      routeDownstream,
    };
  }
}
