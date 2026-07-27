import type {
  DownstreamBreakdown,
  MetricsHealth,
  MetricsSnapshot,
  MetricsSummary,
  RouteBreakdown,
  TimelineBucket,
} from '@/_types/metrics.interface';

/**
 * Runtime guards for the metrics payloads.
 *
 * `_types/metrics.interface.ts` mirrors the backend by hand, so a contract
 * drift is otherwise invisible until a chart throws mid-render. These parsers
 * check the fields the dashboard actually indexes into and coerce the rest to
 * safe defaults. Deliberately lenient about *extra* fields and about optional
 * ones the backend may not send yet — only required shape is enforced.
 */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const optionalNum = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

// Passed through as-is when present — these are display-only and every
// consumer already treats them as optional.
const passthrough = <T>(value: unknown): T | undefined =>
  value === undefined || value === null ? undefined : (value as T);

const parseSummary = (raw: unknown): MetricsSummary | null => {
  if (!isObject(raw)) return null;
  return {
    totalRequests: num(raw.totalRequests),
    errorRate: num(raw.errorRate),
    avgLatencyMs: num(raw.avgLatencyMs),
    cacheHitRate: num(raw.cacheHitRate),
    p50LatencyMs: num(raw.p50LatencyMs),
    p90LatencyMs: num(raw.p90LatencyMs),
    p99LatencyMs: num(raw.p99LatencyMs),
    statusClasses: passthrough(raw.statusClasses),
    cacheProviders: passthrough(raw.cacheProviders),
    percentileSource: passthrough(raw.percentileSource),
  };
};

const parseBucket = (raw: unknown): TimelineBucket | null => {
  if (!isObject(raw) || typeof raw.bucketTs !== 'number') return null;
  return {
    ...(raw as unknown as TimelineBucket),
    bucketTs: raw.bucketTs,
    requestCount: num(raw.requestCount),
    avgLatencyMs: num(raw.avgLatencyMs),
    errorCount: num(raw.errorCount),
  };
};

const parseRoute = (raw: unknown): RouteBreakdown | null => {
  if (!isObject(raw) || typeof raw.route !== 'string' || typeof raw.method !== 'string') {
    return null;
  }
  return {
    ...(raw as unknown as RouteBreakdown),
    method: raw.method,
    route: raw.route,
    requestCount: num(raw.requestCount),
    errorCount: num(raw.errorCount),
    avgLatencyMs: num(raw.avgLatencyMs),
  };
};

const parseDownstream = (raw: unknown): DownstreamBreakdown | null => {
  if (!isObject(raw) || typeof raw.target !== 'string') return null;
  return {
    ...(raw as unknown as DownstreamBreakdown),
    target: raw.target,
    requestCount: num(raw.requestCount),
    errorCount: num(raw.errorCount),
    avgLatencyMs: num(raw.avgLatencyMs),
  };
};

const compact = <T>(items: unknown[], parse: (raw: unknown) => T | null): T[] =>
  items.map(parse).filter((item): item is T => item !== null);

/**
 * Returns null when the payload can't be trusted at all (missing summary or
 * non-object). Individual malformed rows are dropped rather than failing the
 * whole snapshot — a bad route entry shouldn't blank the dashboard.
 */
export const parseMetricsSnapshot = (raw: unknown): MetricsSnapshot | null => {
  if (!isObject(raw)) return null;
  const summary = parseSummary(raw.summary);
  if (!summary) return null;

  return {
    ...(raw as unknown as MetricsSnapshot),
    timestamp: num(raw.timestamp, Date.now()),
    windowMs: num(raw.windowMs),
    summary,
    timeline: compact(arr(raw.timeline), parseBucket),
    routeBreakdown: compact(arr(raw.routeBreakdown), parseRoute),
    downstream: compact(arr(raw.downstream), parseDownstream),
    bucketIntervalMs: optionalNum(raw.bucketIntervalMs),
    windowCoverageMs: optionalNum(raw.windowCoverageMs),
  };
};

export const parseMetricsHealth = (raw: unknown): MetricsHealth | null => {
  if (!isObject(raw) || !isObject(raw.pod)) return null;
  return {
    ...(raw as unknown as MetricsHealth),
    pod: raw.pod as unknown as MetricsHealth['pod'],
    cluster: arr(raw.cluster) as MetricsHealth['cluster'],
    valkey: str(raw.valkey, 'unavailable') as MetricsHealth['valkey'],
  };
};
