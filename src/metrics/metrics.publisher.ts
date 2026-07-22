import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ValkeyClient } from '../cache/valkey/valkey.client';
import { RequestRecord } from './metrics.types';
import {
  BUCKET_INTERVAL_MS,
  histogramField,
  isClusterEnabled,
  keyPrefix,
  retentionSeconds,
} from './metrics.cluster.shared';

const DEFAULT_FLUSH_INTERVAL_MS = 10_000;

type CounterMap = Map<string, number>;

interface BucketDeltas {
  g: CounterMap;
  r: CounterMap;
  d: CounterMap;
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

    const buckets = new Map<number, BucketDeltas>();
    for (const record of records) {
      const bucketTs = Math.floor(record.timestamp / BUCKET_INTERVAL_MS) * BUCKET_INTERVAL_MS;
      let deltas = buckets.get(bucketTs);
      if (!deltas) {
        deltas = { g: new Map(), r: new Map(), d: new Map() };
        buckets.set(bucketTs, deltas);
      }
      this.foldRecord(deltas, record);
    }

    const prefix = keyPrefix();
    const ttl = retentionSeconds() + 300;

    const ok = await this.valkeyClient.executeWrite(async (client) => {
      const pipeline = client.pipeline();
      for (const [bucketTs, deltas] of buckets.entries()) {
        const groups: Array<[string, CounterMap]> = [
          [`${prefix}:g:${bucketTs}`, deltas.g],
          [`${prefix}:r:${bucketTs}`, deltas.r],
          [`${prefix}:d:${bucketTs}`, deltas.d],
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
      await pipeline.exec();
    });

    if (!ok) {
      this.logger.warn(`Dropped ${records.length} metric records (Valkey unavailable)`);
    }
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

    // Per-route counters
    const routeKey = `${record.method} ${record.route}`;
    inc(deltas.r, `${routeKey}|count`);
    inc(deltas.r, `${routeKey}|latSum`, record.durationMs);
    if (record.statusCode >= 400) inc(deltas.r, `${routeKey}|err`);
    if (record.cacheHit) inc(deltas.r, `${routeKey}|hit`);

    // Per-downstream counters
    for (const ds of record.downstreamTargets) {
      const t = ds.target;
      inc(deltas.d, `${t}|count`);
      inc(deltas.d, `${t}|latSum`, ds.durationMs);
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
    }
  }
}

const statusClassField = (statusCode: number): string => {
  if (statusCode >= 500) return 's5';
  if (statusCode >= 400) return 's4';
  if (statusCode >= 300) return 's3';
  return 's2';
};
