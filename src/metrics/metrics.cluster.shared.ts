export const BUCKET_INTERVAL_MS = 60 * 1000;
export const HOUR_INTERVAL_MS = 60 * 60 * 1000;

const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_LOCAL_RETENTION_MS = 60 * 60 * 1000;
// Must cover the largest window served from minute-granularity keys (6h).
const DEFAULT_MINUTE_RETENTION_MS = 6 * HOUR_INTERVAL_MS + 10 * 60 * 1000;

// Upper bounds (ms) for the latency histogram used to estimate cluster-wide
// percentiles. Infinity is stored under the 'h:inf' field.
export const HISTOGRAM_BOUNDS = [25, 50, 100, 250, 500, 1000, 2500, 5000];

export const histogramField = (durationMs: number): string => {
  for (const bound of HISTOGRAM_BOUNDS) {
    if (durationMs <= bound) return `h:${bound}`;
  }
  return 'h:inf';
};

export const isClusterEnabled = (): boolean =>
  process.env.METRICS_CLUSTER_ENABLED === 'true';

export const keyPrefix = (): string =>
  process.env.METRICS_KEY_PREFIX || 'emw:metrics';

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
  return HOUR_INTERVAL_MS;
};
