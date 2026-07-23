export const BUCKET_INTERVAL_MS = 60 * 1000;
export const HOUR_INTERVAL_MS = 60 * 60 * 1000;

// Hourly rollup keys are tiny (4 hashes/hour), so a month of history costs
// ~2.9k keys — cheap enough to keep by default. Override: METRICS_RETENTION_MS.
const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_LOCAL_RETENTION_MS = 60 * 60 * 1000;
// Must cover the largest window served from minute-granularity keys (6h).
const DEFAULT_MINUTE_RETENTION_MS = 6 * HOUR_INTERVAL_MS + 10 * 60 * 1000;

// Upper bounds (ms) for the latency histogram used to estimate cluster-wide
// percentiles. Infinity is stored under the 'h:inf' field.
export const HISTOGRAM_BOUNDS = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000];

export const histogramField = (durationMs: number): string => {
  for (const bound of HISTOGRAM_BOUNDS) {
    if (durationMs <= bound) return `h:${bound}`;
  }
  return 'h:inf';
};

// Estimate a percentile from 'h:<bound>' counter fields via linear
// interpolation inside the winning bucket. Shared by the cluster store
// (summary, per-bucket and per-route estimates).
export const estimatePercentileFromHistogram = (
  counts: Record<string, number>,
  total: number,
  p: number,
): number => {
  if (total === 0) return 0;
  const targetRank = Math.ceil((p / 100) * total);
  let cumulative = 0;
  let prevBound = 0;
  for (const bound of HISTOGRAM_BOUNDS) {
    const count = counts[`h:${bound}`] || 0;
    if (count > 0 && cumulative + count >= targetRank) {
      const positionInBucket = targetRank - cumulative;
      return prevBound + ((bound - prevBound) * positionInBucket) / count;
    }
    cumulative += count;
    prevBound = bound;
  }
  // Fell into the open-ended bucket; report its lower bound.
  return prevBound;
};

// Strip the storage prefix for API payloads: 'h:250' -> '250', 'h:inf' -> 'inf'.
export const histogramToApi = (
  counts: Record<string, number>,
): Record<string, number> | undefined => {
  let any = false;
  const out: Record<string, number> = {};
  for (const [field, value] of Object.entries(counts)) {
    if (!field.startsWith('h:') || value <= 0) continue;
    out[field.slice(2)] = value;
    any = true;
  }
  return any ? out : undefined;
};

export const podName = (): string => process.env.HOSTNAME || 'local';

export const appVersion = (): string =>
  process.env.APP_VERSION || process.env.IMAGE_TAG || 'unknown';

export const isClusterEnabled = (): boolean => process.env.METRICS_CLUSTER_ENABLED === 'true';

export const keyPrefix = (): string => process.env.METRICS_KEY_PREFIX || 'emw:metrics';

export const retentionMs = (): number =>
  parseInt(process.env.METRICS_RETENTION_MS || String(DEFAULT_RETENTION_MS), 10);

export const retentionSeconds = (): number => Math.ceil(retentionMs() / 1000);

export const localRetentionMs = (): number => {
  const configured = parseInt(
    process.env.METRICS_LOCAL_RETENTION_MS || String(DEFAULT_LOCAL_RETENTION_MS),
    10,
  );
  return Math.min(configured, retentionMs());
};

export const minuteRetentionSeconds = (): number => {
  const configured = parseInt(
    process.env.METRICS_MINUTE_RETENTION_MS || String(DEFAULT_MINUTE_RETENTION_MS),
    10,
  );
  return Math.ceil(Math.min(configured, retentionMs()) / 1000);
};

// Windows up to 6h are served from minute keys (fine timeline granularity);
// anything larger reads the hourly rollup keys to keep read volume bounded.
export const readGranularity = (windowMs: number): 'minute' | 'hour' =>
  windowMs <= 6 * HOUR_INTERVAL_MS ? 'minute' : 'hour';

export const timelineBucketMs = (windowMs: number): number => {
  if (windowMs <= 2 * HOUR_INTERVAL_MS) return BUCKET_INTERVAL_MS;
  if (windowMs <= 6 * HOUR_INTERVAL_MS) return 5 * BUCKET_INTERVAL_MS;
  // Past a week, hourly points overwhelm the charts (30d = 720) — coalesce
  // hourly keys into 6h buckets (30d = 120 points).
  if (windowMs <= 7 * 24 * HOUR_INTERVAL_MS) return HOUR_INTERVAL_MS;
  return 6 * HOUR_INTERVAL_MS;
};
