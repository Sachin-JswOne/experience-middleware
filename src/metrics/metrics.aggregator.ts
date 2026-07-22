import { Injectable } from '@nestjs/common';
import {
  RequestRecord,
  MetricsSnapshot,
  TimelineBucket,
  RouteBreakdown,
  DownstreamBreakdown,
} from './metrics.types';

const DEFAULT_RETENTION_MS = 15 * 60 * 1000;
const BUCKET_INTERVAL_MS = 60 * 1000;
const MAX_TIMELINE_BUCKETS = 15;

@Injectable()
export class MetricsAggregator {
  private buffer: RequestRecord[] = [];
  private retentionMs: number;

  constructor() {
    this.retentionMs = parseInt(process.env.METRICS_RETENTION_MS || String(DEFAULT_RETENTION_MS), 10);
    setInterval(() => this.prune(), 30_000);
  }

  recordRequest(record: RequestRecord): void {
    this.buffer.push(record);
  }

  getSnapshot(windowMs?: number): MetricsSnapshot {
    const effectiveWindow = windowMs || this.retentionMs;
    const now = Date.now();
    const cutoff = now - effectiveWindow;

    const windowRecords = this.buffer.filter((r) => r.timestamp >= cutoff);
    const windowDurations = windowRecords.map((r) => r.durationMs).sort((a, b) => a - b);

    const totalRequests = windowRecords.length;
    const errorCount = windowRecords.filter((r) => r.statusCode >= 400).length;
    const totalLatency = windowRecords.reduce((sum, r) => sum + r.durationMs, 0);
    const cacheHits = windowRecords.filter((r) => r.cacheHit).length;

    // Timeline: aggregate records into 1-minute buckets
    const timeline = this.computeTimeline(windowRecords, cutoff, now);

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
    const downstreamMap = new Map<string, DownstreamBreakdown>();
    for (const record of windowRecords) {
      for (const ds of record.downstreamTargets) {
        let db = downstreamMap.get(ds.target);
        if (!db) {
          db = { target: ds.target, avgLatencyMs: 0, requestCount: 0, errorCount: 0 };
          downstreamMap.set(ds.target, db);
        }
        const prevDown = db.avgLatencyMs * db.requestCount;
        db.requestCount++;
        db.avgLatencyMs = (prevDown + ds.durationMs) / db.requestCount;
        if (!ds.success) db.errorCount++;
      }
    }

    return {
      timestamp: now,
      windowMs: effectiveWindow,
      summary: {
        totalRequests,
        errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0,
        avgLatencyMs: totalRequests > 0 ? totalLatency / totalRequests : 0,
        cacheHitRate: totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0,
        p50LatencyMs: this.percentile(windowDurations, 50),
        p90LatencyMs: this.percentile(windowDurations, 90),
        p99LatencyMs: this.percentile(windowDurations, 99),
      },
      timeline,
      routeBreakdown: Array.from(routeMap.values()).map((e) => e.rb).sort((a, b) => b.avgLatencyMs - a.avgLatencyMs),
      downstream: Array.from(downstreamMap.values()),
    };
  }

  private computeTimeline(records: RequestRecord[], cutoff: number, now: number): TimelineBucket[] {
    // Find the oldest minute-bucket boundary within window
    const oldestBucketTs = Math.floor(Math.max(cutoff, now - MAX_TIMELINE_BUCKETS * BUCKET_INTERVAL_MS) / BUCKET_INTERVAL_MS) * BUCKET_INTERVAL_MS;
    const bucketMap = new Map<number, { totalLatency: number; requestCount: number; errorCount: number }>();

    // Initialize all buckets in range (even empty ones)
    for (let ts = oldestBucketTs; ts <= now; ts += BUCKET_INTERVAL_MS) {
      bucketMap.set(ts, { totalLatency: 0, requestCount: 0, errorCount: 0 });
    }

    for (const record of records) {
      const bucketTs = Math.floor(record.timestamp / BUCKET_INTERVAL_MS) * BUCKET_INTERVAL_MS;
      const bucket = bucketMap.get(bucketTs);
      if (bucket) {
        bucket.totalLatency += record.durationMs;
        bucket.requestCount++;
        if (record.statusCode >= 400) bucket.errorCount++;
      }
    }

    return Array.from(bucketMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([bucketTs, b]) => ({
        bucketTs,
        requestCount: b.requestCount,
        avgLatencyMs: b.requestCount > 0 ? b.totalLatency / b.requestCount : 0,
        errorCount: b.errorCount,
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
