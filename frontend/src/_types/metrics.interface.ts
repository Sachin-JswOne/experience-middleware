export type CacheServedBy = 'valkey' | 'local' | 'none';

export interface StatusClassCounts {
  c2xx: number;
  c3xx: number;
  c4xx: number;
  c5xx: number;
}

export interface StageTimings {
  buildRequestMs: number;
  createClientMs: number;
  downstreamMs: number;
  resTransformMs: number;
}

export interface DownstreamRecord {
  target: string;
  durationMs: number;
  success: boolean;
  statusCode?: number;
  stages?: StageTimings;
}

export interface CacheProviderStats {
  provider: CacheServedBy;
  hits: number;
  misses: number;
}

export interface MetricsSummary {
  totalRequests: number;
  errorRate: number;
  avgLatencyMs: number;
  cacheHitRate: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p99LatencyMs: number;
  statusClasses?: StatusClassCounts;
  cacheProviders?: CacheProviderStats[];
  percentileSource?: 'exact' | 'histogram';
}

export interface TimelineBucket {
  bucketTs: number;
  requestCount: number;
  avgLatencyMs: number;
  errorCount: number;
  statusClasses?: StatusClassCounts;
}

export interface RouteBreakdown {
  route: string;
  method: string;
  requestCount: number;
  avgLatencyMs: number;
  errorCount: number;
  cacheHitRate: number;
}

export interface DownstreamBreakdown {
  target: string;
  avgLatencyMs: number;
  requestCount: number;
  errorCount: number;
  statusClasses?: StatusClassCounts;
  networkErrorCount?: number;
  avgStages?: StageTimings;
}

export interface RecentError {
  ts: number;
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
}

export interface MetricsSnapshot {
  timestamp: number;
  windowMs: number;
  summary: MetricsSummary;
  timeline: TimelineBucket[];
  routeBreakdown: RouteBreakdown[];
  downstream: DownstreamBreakdown[];
  bucketIntervalMs?: number;
  source?: 'local' | 'cluster';
  recentErrors?: RecentError[];
}
