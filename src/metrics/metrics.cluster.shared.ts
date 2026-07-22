export const BUCKET_INTERVAL_MS = 60 * 1000;

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

export const retentionSeconds = (): number => {
  const retentionMs = parseInt(
    process.env.METRICS_RETENTION_MS || String(60 * 60 * 1000),
    10,
  );
  return Math.ceil(retentionMs / 1000);
};
