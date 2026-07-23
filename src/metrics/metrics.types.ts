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
  // Undefined means no HTTP response was received (network error/timeout).
  statusCode?: number;
  stages?: StageTimings;
  // Raw references for error samples only — stripped before the record
  // enters the aggregator buffer (see MetricsInterceptor).
  requestUrl?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
}

export interface RequestRecord {
  timestamp: number;
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  cacheHit: boolean;
  cacheServedBy?: CacheServedBy;
  downstreamTargets: DownstreamRecord[];
  // Correlation id from x-request-id / x-correlation-id, when the caller or
  // ingress supplied one. Lets the dashboard link a sample to log lines.
  requestId?: string;
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
  p90LatencyMs?: number;
  p99LatencyMs?: number;
  // Latency histogram counts keyed by upper bound ('25'…'30000', 'inf').
  // Only non-zero buckets are included; consumers fill gaps from the shared
  // bounds list. Feeds the latency heatmap.
  histogram?: Record<string, number>;
}

export interface RouteBreakdown {
  route: string;
  method: string;
  requestCount: number;
  avgLatencyMs: number;
  errorCount: number;
  cacheHitRate: number;
  p95LatencyMs?: number;
  statusClasses?: StatusClassCounts;
  // Downstream targets this route called within the window.
  targets?: string[];
}

// Per (route, downstream target) aggregate so the downstream tab can be
// scoped to a route selection. Carries counts only — status classes and
// stage timings stay per-target to bound counter cardinality.
export interface RouteDownstreamPair {
  route: string;
  method: string;
  target: string;
  requestCount: number;
  avgLatencyMs: number;
  errorCount: number;
}

export interface DownstreamBreakdown {
  target: string;
  avgLatencyMs: number;
  requestCount: number;
  errorCount: number;
  // Exact locally, histogram-estimated in cluster mode (same as routes).
  p95LatencyMs?: number;
  p99LatencyMs?: number;
  statusClasses?: StatusClassCounts;
  networkErrorCount?: number;
  avgStages?: StageTimings;
}

export interface DownstreamTimelinePoint {
  bucketTs: number;
  requestCount: number;
  avgLatencyMs: number;
  errorCount: number;
}

export interface DownstreamTimeline {
  target: string;
  points: DownstreamTimelinePoint[];
}

export interface RecentError {
  ts: number;
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  pod?: string;
  requestId?: string;
}

export interface DeployMarker {
  ts: number;
  version: string;
  pod?: string;
}

// One heartbeat's worth of pod stats, kept as a short ring so the System tab
// can draw trend sparklines (heap creep, lag spikes) instead of a lone number.
export interface PodHealthPoint {
  ts: number;
  heapUsedMb: number;
  rssMb: number;
  eventLoopLagP99Ms: number;
  requestsLastMin: number;
  cpuPct: number;
}

export interface PodHealth {
  pod: string;
  version: string;
  lastSeen: number;
  uptimeSec: number;
  heapUsedMb: number;
  heapTotalMb: number;
  rssMb: number;
  eventLoopLagMs: number;
  eventLoopLagP99Ms: number;
  bufferRecords: number;
  requestsLastMin: number;
  // Process CPU usage since the previous sample, as % of one core.
  cpuPct?: number;
  // GC activity since the previous sample.
  gcCount?: number;
  gcPauseMs?: number;
  history?: PodHealthPoint[];
}

export interface MetricsHealth {
  pod: PodHealth;
  // All pods that heartbeated recently (cluster mode only; includes self).
  cluster: PodHealth[];
  valkey: 'connected' | 'unavailable' | 'disabled';
}

export interface SampleDownstream {
  target: string;
  durationMs: number;
  statusCode?: number;
  success: boolean;
  requestUrl?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
}

export interface RouteErrorSample {
  ts: number;
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  url: string;
  requestId?: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  downstream: SampleDownstream[];
}

export interface MetricsSnapshot {
  timestamp: number;
  windowMs: number;
  // How much of windowMs the data actually covers (local buffer holds less
  // than the full retention window).
  windowCoverageMs?: number;
  summary: MetricsSummary;
  timeline: TimelineBucket[];
  routeBreakdown: RouteBreakdown[];
  downstream: DownstreamBreakdown[];
  downstreamTimeline?: DownstreamTimeline[];
  routeDownstream?: RouteDownstreamPair[];
  bucketIntervalMs?: number;
  source?: 'local' | 'cluster';
  recentErrors?: RecentError[];
  deployMarkers?: DeployMarker[];
}
