import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ValkeyClient } from '../cache/valkey/valkey.client';
import { RequestRecord } from './metrics.types';
import {
  BUCKET_INTERVAL_MS,
  HOUR_INTERVAL_MS,
  histogramField,
  isClusterEnabled,
  keyPrefix,
  minuteRetentionSeconds,
  podName,
  retentionSeconds,
} from './metrics.cluster.shared';

const DEFAULT_FLUSH_INTERVAL_MS = 10_000;
// Cluster-wide error feed: capped list so it can never grow unbounded.
export const RECENT_ERRORS_KEY_SUFFIX = 'recent-errors';
export const RECENT_ERRORS_MAX = 100;
const RECENT_ERRORS_PER_FLUSH = 50;

type CounterMap = Map<string, number>;

interface BucketDeltas {
  g: CounterMap;
  r: CounterMap;
  d: CounterMap;
  p: CounterMap;
}

/**
 * Flushes per-request metric records to Valkey as per-minute counter deltas so
 * every pod contributes to a shared, cluster-wide view. Failures are dropped —
 * the in-memory aggregator remains the fallback source.
 */
@Injectable()
export class MetricsPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(MetricsPublisher.name);
  private readonly enabled = isClusterEnabled();
  private pending: RequestRecord[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(private readonly valkeyClient: ValkeyClient) {
    if (this.enabled) {
      const interval = parseInt(
        process.env.METRICS_FLUSH_INTERVAL_MS || String(DEFAULT_FLUSH_INTERVAL_MS),
        10,
      );
      this.flushTimer = setInterval(() => void this.flush(), interval);
      this.flushTimer.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
  }

  enqueue(record: RequestRecord): void {
    if (!this.enabled) return;
    this.pending.push(record);
  }

  private async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const records = this.pending;
    this.pending = [];

    // Same deltas at two granularities: minute keys serve short windows with
    // fine timelines, hourly rollups keep 7d reads bounded (~168 keys).
    const minuteBuckets = this.foldIntoBuckets(records, BUCKET_INTERVAL_MS);
    const hourBuckets = this.foldIntoBuckets(records, HOUR_INTERVAL_MS);

    const prefix = keyPrefix();
    const minuteTtl = minuteRetentionSeconds() + 300;
    const hourTtl = retentionSeconds() + 3600;

    // Newest errors from this flush feed the shared recent-errors list.
    const pod = podName();
    const errorPayloads = records
      .filter((r) => r.statusCode >= 400)
      .slice(-RECENT_ERRORS_PER_FLUSH)
      .map((r) =>
        JSON.stringify({
          ts: r.timestamp,
          route: r.route,
          method: r.method,
          statusCode: r.statusCode,
          durationMs: r.durationMs,
          pod,
          requestId: r.requestId,
        }),
      );

    const ok = await this.valkeyClient.executeWrite(async (client) => {
      const pipeline = client.pipeline();
      const writeBuckets = (
        buckets: Map<number, BucketDeltas>,
        prefixes: [string, string, string, string],
        ttl: number,
      ) => {
        for (const [bucketTs, deltas] of buckets.entries()) {
          const groups: Array<[string, CounterMap]> = [
            [`${prefix}:${prefixes[0]}:${bucketTs}`, deltas.g],
            [`${prefix}:${prefixes[1]}:${bucketTs}`, deltas.r],
            [`${prefix}:${prefixes[2]}:${bucketTs}`, deltas.d],
            [`${prefix}:${prefixes[3]}:${bucketTs}`, deltas.p],
          ];
          for (const [key, counters] of groups) {
            if (counters.size === 0) continue;
            for (const [field, delta] of counters.entries()) {
              if (Number.isInteger(delta)) pipeline.hincrby(key, field, delta);
              else pipeline.hincrbyfloat(key, field, delta);
            }
            pipeline.expire(key, ttl);
          }
        }
      };
      writeBuckets(minuteBuckets, ['g', 'r', 'd', 'p'], minuteTtl);
      writeBuckets(hourBuckets, ['gh', 'rh', 'dh', 'ph'], hourTtl);
      if (errorPayloads.length > 0) {
        const errorsKey = `${prefix}:${RECENT_ERRORS_KEY_SUFFIX}`;
        pipeline.lpush(errorsKey, ...errorPayloads);
        pipeline.ltrim(errorsKey, 0, RECENT_ERRORS_MAX - 1);
        pipeline.expire(errorsKey, retentionSeconds());
      }
      await pipeline.exec();
    });

    if (!ok) {
      this.logger.warn(`Dropped ${records.length} metric records (Valkey unavailable)`);
    }
  }

  private foldIntoBuckets(records: RequestRecord[], intervalMs: number): Map<number, BucketDeltas> {
    const buckets = new Map<number, BucketDeltas>();
    for (const record of records) {
      const bucketTs = Math.floor(record.timestamp / intervalMs) * intervalMs;
      let deltas = buckets.get(bucketTs);
      if (!deltas) {
        deltas = { g: new Map(), r: new Map(), d: new Map(), p: new Map() };
        buckets.set(bucketTs, deltas);
      }
      this.foldRecord(deltas, record);
    }
    return buckets;
  }

  private foldRecord(deltas: BucketDeltas, record: RequestRecord): void {
    const inc = (map: CounterMap, field: string, by = 1) =>
      map.set(field, (map.get(field) || 0) + by);

    // Global counters
    inc(deltas.g, 'count');
    inc(deltas.g, 'latSum', record.durationMs);
    if (record.statusCode >= 400) inc(deltas.g, 'err');
    if (record.cacheHit) {
      inc(deltas.g, 'hit');
      if (record.cacheServedBy === 'valkey') inc(deltas.g, 'cpValkey');
      else if (record.cacheServedBy === 'local') inc(deltas.g, 'cpLocal');
    }
    inc(deltas.g, statusClassField(record.statusCode));
    inc(deltas.g, histogramField(record.durationMs));

    // Per-route counters (status classes + latency histogram enable the
    // per-route 4xx/5xx split and p95 column on the dashboard).
    const routeKey = `${record.method} ${record.route}`;
    inc(deltas.r, `${routeKey}|count`);
    inc(deltas.r, `${routeKey}|latSum`, record.durationMs);
    if (record.statusCode >= 400) inc(deltas.r, `${routeKey}|err`);
    if (record.cacheHit) inc(deltas.r, `${routeKey}|hit`);
    inc(deltas.r, `${routeKey}|${statusClassField(record.statusCode)}`);
    inc(deltas.r, `${routeKey}|${histogramField(record.durationMs)}`);

    // Per-downstream counters (histogram powers the per-target p95/p99
    // estimates, mirroring the per-route fields).
    for (const ds of record.downstreamTargets) {
      const t = ds.target;
      inc(deltas.d, `${t}|count`);
      inc(deltas.d, `${t}|latSum`, ds.durationMs);
      inc(deltas.d, `${t}|${histogramField(ds.durationMs)}`);
      if (!ds.success) inc(deltas.d, `${t}|err`);
      if (typeof ds.statusCode === 'number') {
        inc(deltas.d, `${t}|${statusClassField(ds.statusCode)}`);
      } else if (!ds.success) {
        inc(deltas.d, `${t}|netErr`);
      }
      if (ds.stages) {
        inc(deltas.d, `${t}|stCount`);
        inc(deltas.d, `${t}|stBuild`, ds.stages.buildRequestMs);
        inc(deltas.d, `${t}|stClient`, ds.stages.createClientMs);
        inc(deltas.d, `${t}|stDown`, ds.stages.downstreamMs);
        inc(deltas.d, `${t}|stXform`, ds.stages.resTransformMs);
      }

      // Per (route, target) pair counters — powers the downstream tab's
      // route filter. Fields: "<METHOD> <route>|<target>|count/latSum/err".
      inc(deltas.p, `${routeKey}|${t}|count`);
      inc(deltas.p, `${routeKey}|${t}|latSum`, ds.durationMs);
      if (!ds.success) inc(deltas.p, `${routeKey}|${t}|err`);
    }
  }
}

const statusClassField = (statusCode: number): string => {
  if (statusCode >= 500) return 's5';
  if (statusCode >= 400) return 's4';
  if (statusCode >= 300) return 's3';
  return 's2';
};
