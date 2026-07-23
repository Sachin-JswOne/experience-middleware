import { MetricsAlertsService } from '../metrics.alerts.service';
import { MetricsSnapshot } from '../metrics.types';

const makeSnapshot = (overrides: {
  totalRequests?: number;
  errorRate?: number;
  p99LatencyMs?: number;
  downstream?: MetricsSnapshot['downstream'];
}): MetricsSnapshot => ({
  timestamp: Date.now(),
  windowMs: 300_000,
  summary: {
    totalRequests: overrides.totalRequests ?? 100,
    errorRate: overrides.errorRate ?? 0,
    avgLatencyMs: 50,
    cacheHitRate: 0,
    p50LatencyMs: 40,
    p90LatencyMs: 80,
    p99LatencyMs: overrides.p99LatencyMs ?? 120,
  },
  timeline: [],
  routeBreakdown: [],
  downstream: overrides.downstream ?? [],
});

// computeBreaches never touches the injected dependencies.
const makeService = (env: Record<string, string>): MetricsAlertsService => {
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
  return new MetricsAlertsService({} as never, {} as never, {} as never);
};

const ENV_KEYS = [
  'METRICS_ALERT_WEBHOOK_URL',
  'METRICS_ALERT_ERROR_RATE_PCT',
  'METRICS_ALERT_P99_MS',
  'METRICS_ALERT_TARGET_ERROR_RATE_PCT',
  'METRICS_ALERT_MIN_REQUESTS',
];

describe('MetricsAlertsService.computeBreaches', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('flags error-rate and p99 threshold breaches', () => {
    const service = makeService({
      METRICS_ALERT_ERROR_RATE_PCT: '5',
      METRICS_ALERT_P99_MS: '1000',
    });
    const breaches = service.computeBreaches(
      makeSnapshot({ errorRate: 7.5, p99LatencyMs: 1500 }),
    );
    expect(breaches.map((b) => b.kind).sort()).toEqual(['error-rate', 'p99-latency']);
  });

  it('stays silent below thresholds', () => {
    const service = makeService({
      METRICS_ALERT_ERROR_RATE_PCT: '5',
      METRICS_ALERT_P99_MS: '1000',
    });
    expect(service.computeBreaches(makeSnapshot({ errorRate: 1, p99LatencyMs: 200 }))).toEqual([]);
  });

  it('ignores windows with too little traffic', () => {
    const service = makeService({ METRICS_ALERT_ERROR_RATE_PCT: '5' });
    const breaches = service.computeBreaches(
      makeSnapshot({ totalRequests: 3, errorRate: 100 }),
    );
    expect(breaches).toEqual([]);
  });

  it('flags per-target error rates with a per-target traffic gate', () => {
    const service = makeService({ METRICS_ALERT_TARGET_ERROR_RATE_PCT: '10' });
    const breaches = service.computeBreaches(
      makeSnapshot({
        downstream: [
          { target: 'sap', requestCount: 50, errorCount: 10, avgLatencyMs: 100 },
          // Under the traffic gate — never alerts, even at 100% errors.
          { target: 'quiet', requestCount: 2, errorCount: 2, avgLatencyMs: 100 },
        ],
      }),
    );
    expect(breaches).toHaveLength(1);
    expect(breaches[0].kind).toBe('target-error-rate:sap');
  });
});
