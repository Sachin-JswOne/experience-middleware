import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  RequestRecord,
  MetricsSnapshot,
  TimelineBucket,
  RouteBreakdown,
  DownstreamBreakdown,
  StatusClassCounts,
  StageTimings,
  CacheServedBy,
  RecentError,
} from './metrics.types';
import { localRetentionMs, timelineBucketMs } from './metrics.cluster.shared';

const DEFAULT_MAX_RECORDS = 250_000;
const MAX_RECENT_ERRORS = 10;

export const emptyStatusClasses = (): StatusClassCounts => ({
  c2xx: 0,
  c3xx: 0,
  c4xx: 0,
  c5xx: 0,
});

export const addStatusClass = (counts: StatusClassCounts, statusCode: number): void => {
  if (statusCode >= 500) counts.c5xx++;
  else if (statusCode >= 400) counts.c4xx++;
  else if (statusCode >= 300) counts.c3xx++;
  else counts.c2xx++;
};

@Injectable()
export class MetricsAggregator implements OnModuleDestroy {
  private buffer: RequestRecord[] = [];
  private retentionMs: number;
  private maxRecords: number;
  private pruneTimer: NodeJS.Timeout;

  constructor() {
    // Local in-memory buffer keeps a short horizon (default 1h); long windows
    // are served by the Valkey-backed cluster store.
    this.retentionMs = localRetentionMs();
    this.maxRecords = parseInt(process.env.METRICS_MAX_RECORDS || String(DEFAULT_MAX_RECORDS), 10);
    this.pruneTimer = setInterval(() => this.prune(), 30_000);
    this.pruneTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.pruneTimer);
  }

  getRetentionMs(): number {
    return this.retentionMs;
  }

  recordRequest(record: RequestRecord): void {
    this.buffer.push(record);
    if (this.buffer.length > this.maxRecords) {
      this.buffer.splice(0, this.buffer.length - this.maxRecords);
    }
  }

  getSnapshot(windowMs?: number): MetricsSnapshot {
    const now = Date.now();
    const requestedWindow = windowMs || this.retentionMs;
    return this.getSnapshotRange(now - requestedWindow, now);
  }

  getSnapshotRange(fromTs: number, toTs: number): MetricsSnapshot {
    const now = Date.now();
    const requestedWindow = toTs - fromTs;
    // The buffer only holds localRetention — report the requested window but
    // be honest about how much of it the data actually covers.
    const availableFrom = now - this.retentionMs;
    const coverageMs = Math.max(0, Math.min(toTs, now) - Math.max(fromTs, availableFrom));
    const cutoff = Math.max(fromTs, availableFrom);

    const windowRecords = this.buffer.filter((r) => r.timestamp >= cutoff && r.timestamp <= toTs);
    const windowDurations = windowRecords.map((r) => r.durationMs).sort((a, b) => a - b);

    const totalRequests = windowRecords.length;
    const errorCount = windowRecords.filter((r) => r.statusCode >= 400).length;
    const totalLatency = windowRecords.reduce((sum, r) => sum + r.durationMs, 0);
    const cacheHits = windowRecords.filter((r) => r.cacheHit).length;

    // Summary status classes + cache provider split
    const statusClasses = emptyStatusClasses();
    const providerMap = new Map<CacheServedBy, { hits: number; misses: number }>();
    for (const record of windowRecords) {
      addStatusClass(statusClasses, record.statusCode);
      const provider: CacheServedBy = record.cacheHit ? record.cacheServedBy || 'none' : 'none';
      if (record.cacheHit) {
        const entry = providerMap.get(provider) || { hits: 0, misses: 0 };
        entry.hits++;
        providerMap.set(provider, entry);
      } else {
        const entry = providerMap.get('none') || { hits: 0, misses: 0 };
        entry.misses++;
        providerMap.set('none', entry);
      }
    }

    // Timeline: bucket size adapts to what we can actually cover, so the
    // local fallback still renders a fine-grained chart.
    const bucketMs = timelineBucketMs(coverageMs > 0 ? coverageMs : requestedWindow);
    const timeline = this.computeTimeline(windowRecords, cutoff, Math.min(toTs, now), bucketMs);

    // Route breakdown
    const routeMap = new Map<string, { rb: RouteBreakdown; cacheHits: number }>();
    for (const record of windowRecords) {
      const rk = `${record.method} ${record.route}`;
      let entry = routeMap.get(rk);
      if (!entry) {
        entry = {
          rb: {
            route: record.route,
            method: record.method,
            requestCount: 0,
            avgLatencyMs: 0,
            errorCount: 0,
            cacheHitRate: 0,
          },
          cacheHits: 0,
        };
        routeMap.set(rk, entry);
      }
      const rb = entry.rb;
      const prevTotal = rb.avgLatencyMs * rb.requestCount;
      rb.requestCount++;
      rb.avgLatencyMs = (prevTotal + record.durationMs) / rb.requestCount;
      if (record.statusCode >= 400) rb.errorCount++;
      if (record.cacheHit) entry.cacheHits++;
    }

    // Finalize cache hit rates
    for (const entry of routeMap.values()) {
      entry.rb.cacheHitRate = entry.rb.requestCount > 0
        ? (entry.cacheHits / entry.rb.requestCount) * 100
        : 0;
    }

    // Downstream breakdown
    const downstreamMap = new Map<
      string,
      { db: DownstreamBreakdown; stageSums: StageTimings; stageCount: number }
    >();
    for (const record of windowRecords) {
      for (const ds of record.downstreamTargets) {
        let entry = downstreamMap.get(ds.target);
        if (!entry) {
          entry = {
            db: {
              target: ds.target,
              avgLatencyMs: 0,
              requestCount: 0,
              errorCount: 0,
              statusClasses: emptyStatusClasses(),
              networkErrorCount: 0,
            },
            stageSums: { buildRequestMs: 0, createClientMs: 0, downstreamMs: 0, resTransformMs: 0 },
            stageCount: 0,
          };
          downstreamMap.set(ds.target, entry);
        }
        const db = entry.db;
        const prevDown = db.avgLatencyMs * db.requestCount;
        db.requestCount++;
        db.avgLatencyMs = (prevDown + ds.durationMs) / db.requestCount;
        if (!ds.success) db.errorCount++;
        if (typeof ds.statusCode === 'number') {
          addStatusClass(db.statusClasses!, ds.statusCode);
        } else if (!ds.success) {
          db.networkErrorCount = (db.networkErrorCount || 0) + 1;
        }
        if (ds.stages) {
          entry.stageSums.buildRequestMs += ds.stages.buildRequestMs;
          entry.stageSums.createClientMs += ds.stages.createClientMs;
          entry.stageSums.downstreamMs += ds.stages.downstreamMs;
          entry.stageSums.resTransformMs += ds.stages.resTransformMs;
          entry.stageCount++;
        }
      }
    }
    for (const entry of downstreamMap.values()) {
      if (entry.stageCount > 0) {
        entry.db.avgStages = {
          buildRequestMs: entry.stageSums.buildRequestMs / entry.stageCount,
          createClientMs: entry.stageSums.createClientMs / entry.stageCount,
          downstreamMs: entry.stageSums.downstreamMs / entry.stageCount,
          resTransformMs: entry.stageSums.resTransformMs / entry.stageCount,
        };
      }
    }

    // Recent errors (newest first)
    const recentErrors: RecentError[] = windowRecords
      .filter((r) => r.statusCode >= 400)
      .slice(-MAX_RECENT_ERRORS)
      .reverse()
      .map((r) => ({
        ts: r.timestamp,
        route: r.route,
        method: r.method,
        statusCode: r.statusCode,
        durationMs: r.durationMs,
      }));

    return {
      timestamp: now,
      windowMs: requestedWindow,
      windowCoverageMs: coverageMs,
      bucketIntervalMs: bucketMs,
      source: 'local',
      summary: {
        totalRequests,
        errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0,
        avgLatencyMs: totalRequests > 0 ? totalLatency / totalRequests : 0,
        cacheHitRate: totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0,
        p50LatencyMs: this.percentile(windowDurations, 50),
        p90LatencyMs: this.percentile(windowDurations, 90),
        p99LatencyMs: this.percentile(windowDurations, 99),
        statusClasses,
        cacheProviders: Array.from(providerMap.entries()).map(([provider, stats]) => ({
          provider,
          hits: stats.hits,
          misses: stats.misses,
        })),
        percentileSource: 'exact',
      },
      timeline,
      routeBreakdown: Array.from(routeMap.values()).map((e) => e.rb).sort((a, b) => b.avgLatencyMs - a.avgLatencyMs),
      downstream: Array.from(downstreamMap.values()).map((e) => e.db),
      recentErrors,
    };
  }

  private computeTimeline(
    records: RequestRecord[],
    cutoff: number,
    now: number,
    bucketIntervalMs: number,
  ): TimelineBucket[] {
    // Find the oldest bucket boundary within the covered window
    const oldestBucketTs = Math.floor(cutoff / bucketIntervalMs) * bucketIntervalMs;
    const bucketMap = new Map<
      number,
      { totalLatency: number; requestCount: number; errorCount: number; statusClasses: StatusClassCounts }
    >();

    // Initialize all buckets in range (even empty ones)
    for (let ts = oldestBucketTs; ts <= now; ts += bucketIntervalMs) {
      bucketMap.set(ts, { totalLatency: 0, requestCount: 0, errorCount: 0, statusClasses: emptyStatusClasses() });
    }

    for (const record of records) {
      const bucketTs = Math.floor(record.timestamp / bucketIntervalMs) * bucketIntervalMs;
      const bucket = bucketMap.get(bucketTs);
      if (bucket) {
        bucket.totalLatency += record.durationMs;
        bucket.requestCount++;
        if (record.statusCode >= 400) bucket.errorCount++;
        addStatusClass(bucket.statusClasses, record.statusCode);
      }
    }

    return Array.from(bucketMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([bucketTs, b]) => ({
        bucketTs,
        requestCount: b.requestCount,
        avgLatencyMs: b.requestCount > 0 ? b.totalLatency / b.requestCount : 0,
        errorCount: b.errorCount,
        statusClasses: b.statusClasses,
      }));
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  private prune(): void {
    const cutoff = Date.now() - this.retentionMs;
    this.buffer = this.buffer.filter((r) => r.timestamp >= cutoff);
  }
}
