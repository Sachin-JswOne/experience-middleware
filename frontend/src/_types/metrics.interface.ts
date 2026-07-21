export interface DownstreamRecord {
  target: string;
  durationMs: number;
  success: boolean;
}

export interface MetricsSummary {
  totalRequests: number;
  errorRate: number;
  avgLatencyMs: number;
  cacheHitRate: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p99LatencyMs: number;
}

export interface TimelineBucket {
  bucketTs: number;
  requestCount: number;
  avgLatencyMs: number;
  errorCount: number;
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
}

export interface MetricsSnapshot {
  timestamp: number;
  windowMs: number;
  summary: MetricsSummary;
  timeline: TimelineBucket[];
  routeBreakdown: RouteBreakdown[];
  downstream: DownstreamBreakdown[];
}
