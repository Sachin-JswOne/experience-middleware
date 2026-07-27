export type CacheServedBy = 'valkey' | 'local' | 'none';

// Mirrors HISTOGRAM_BOUNDS in src/metrics/metrics.cluster.shared.ts — the
// upper bounds (ms) of the latency histogram buckets, plus the open 'inf'
// bucket. Order matters: heatmap rows render in this order.
export const LATENCY_HISTOGRAM_BOUNDS = [
  25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000,
] as const;

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
  p90LatencyMs?: number;
  p99LatencyMs?: number;
  // Latency histogram counts keyed by upper bound ('25'…'30000', 'inf').
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
  targets?: string[];
}

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
  p95LatencyMs?: number;
}

export interface RouteTimelinePoint {
  bucketTs: number;
  requestCount: number;
  avgLatencyMs: number;
  errorCount: number;
  p95LatencyMs?: number;
}

// --- Alerting (shared config, mirrors src/metrics/metrics.types.ts) ------

export interface AlertConfigRouteRule {
  key: string;
  errorRatePct: number | null;
  p95Ms: number | null;
}

export interface AlertConfigTargetRule {
  target: string;
  errorRatePct: number | null;
  avgLatencyMs: number | null;
}

export interface AlertConfig {
  errorRatePct: number | null;
  p99Ms: number | null;
  targetErrorRatePct: number | null;
  trafficDropPct: number | null;
  sloAvailabilityPct: number | null;
  // Alert when traffic flatlines to zero while the previous window had it.
  alertOnNoData: boolean;
  // Epoch ms until which all alerting is muted (webhook + dashboard banner).
  snoozeUntil: number | null;
  routeRules: AlertConfigRouteRule[];
  targetRules: AlertConfigTargetRule[];
  updatedAt: number;
}

export interface AlertHistoryRecord {
  ts: number;
  kind: string;
  message: string;
  pod: string;
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

// One heartbeat's worth of pod stats — the System tab draws these as
// trend sparklines.
export interface PodHealthPoint {
  ts: number;
  heapUsedMb: number;
  rssMb: number;
  eventLoopLagP99Ms: number;
  requestsLastMin: number;
  cpuPct: number;
  // Optional: heartbeats written before this field shipped lack it.
  gcPauseMs?: number;
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
  cpuPct?: number;
  gcCount?: number;
  gcPauseMs?: number;
  history?: PodHealthPoint[];
}

export interface MetricsHealth {
  pod: PodHealth;
  cluster: PodHealth[];
  valkey: 'connected' | 'unavailable' | 'disabled';
}

export interface SampleDownstream {
  target: string;
  durationMs: number;
  statusCode?: number;
  success: boolean;
  // Per-stage split of durationMs — powers the waterfall in the samples drawer.
  stages?: StageTimings;
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
  // Pod that served the request (cluster samples mix pods).
  pod?: string;
  requestId?: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  downstream: SampleDownstream[];
}

export interface MetricsSnapshot {
  timestamp: number;
  windowMs: number;
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
