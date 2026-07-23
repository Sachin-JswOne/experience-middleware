import { MetricsAlertsService, emptyAlertConfig } from '../metrics.alerts.service';
import { AlertConfig, MetricsSnapshot } from '../metrics.types';

const makeSnapshot = (overrides: {
  totalRequests?: number;
  errorRate?: number;
  p99LatencyMs?: number;
  downstream?: MetricsSnapshot['downstream'];
  routeBreakdown?: MetricsSnapshot['routeBreakdown'];
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
  routeBreakdown: overrides.routeBreakdown ?? [],
  downstream: overrides.downstream ?? [],
});

const makeConfig = (overrides: Partial<AlertConfig>): AlertConfig => ({
  ...emptyAlertConfig(),
  ...overrides,
});

// computeBreaches/computeBurnBreach never touch the injected dependencies.
const makeService = (): MetricsAlertsService =>
  new MetricsAlertsService({} as never, {} as never, {} as never);

describe('MetricsAlertsService.computeBreaches', () => {
  it('flags error-rate and p99 threshold breaches', () => {
    const breaches = makeService().computeBreaches(
      makeSnapshot({ errorRate: 7.5, p99LatencyMs: 1500 }),
      makeConfig({ errorRatePct: 5, p99Ms: 1000 }),
    );
    expect(breaches.map((b) => b.kind).sort()).toEqual(['error-rate', 'p99-latency']);
  });

  it('stays silent below thresholds', () => {
    const breaches = makeService().computeBreaches(
      makeSnapshot({ errorRate: 1, p99LatencyMs: 200 }),
      makeConfig({ errorRatePct: 5, p99Ms: 1000 }),
    );
    expect(breaches).toEqual([]);
  });

  it('ignores windows with too little traffic', () => {
    const breaches = makeService().computeBreaches(
      makeSnapshot({ totalRequests: 3, errorRate: 100 }),
      makeConfig({ errorRatePct: 5 }),
    );
    expect(breaches).toEqual([]);
  });

  it('flags per-target error rates with a per-target traffic gate', () => {
    const breaches = makeService().computeBreaches(
      makeSnapshot({
        downstream: [
          { target: 'sap', requestCount: 50, errorCount: 10, avgLatencyMs: 100 },
          // Under the traffic gate — never alerts, even at 100% errors.
          { target: 'quiet', requestCount: 2, errorCount: 2, avgLatencyMs: 100 },
        ],
      }),
      makeConfig({ targetErrorRatePct: 10 }),
    );
    expect(breaches).toHaveLength(1);
    expect(breaches[0].kind).toBe('target-error-rate:sap');
  });

  it('evaluates per-route rules for error rate and p95', () => {
    const breaches = makeService().computeBreaches(
      makeSnapshot({
        routeBreakdown: [
          {
            route: '/api/orders',
            method: 'GET',
            requestCount: 40,
            avgLatencyMs: 200,
            errorCount: 8,
            cacheHitRate: 0,
            p95LatencyMs: 900,
          },
        ],
      }),
      makeConfig({
        routeRules: [{ key: 'GET /api/orders', errorRatePct: 10, p95Ms: 800 }],
      }),
    );
    expect(breaches.map((b) => b.kind).sort()).toEqual([
      'route-err:GET /api/orders',
      'route-p95:GET /api/orders',
    ]);
  });

  it('flags traffic drops against the previous window', () => {
    const breaches = makeService().computeBreaches(
      makeSnapshot({ totalRequests: 20 }),
      makeConfig({ trafficDropPct: 50 }),
      makeSnapshot({ totalRequests: 100 }),
    );
    expect(breaches).toHaveLength(1);
    expect(breaches[0].kind).toBe('traffic-drop');
  });
});

describe('MetricsAlertsService.computeBurnBreach', () => {
  it('fires only when both fast and slow windows burn', () => {
    const service = makeService();
    // 99.5% SLO -> 0.5% budget. Fast 10% errors = 20x, slow 5% = 10x.
    const burning = service.computeBurnBreach(
      makeSnapshot({ errorRate: 10 }),
      makeSnapshot({ errorRate: 5 }),
      99.5,
    );
    expect(burning?.kind).toBe('slo-burn');

    // Fast spike alone (slow window calm) must not page.
    const spike = service.computeBurnBreach(
      makeSnapshot({ errorRate: 10 }),
      makeSnapshot({ errorRate: 0.1 }),
      99.5,
    );
    expect(spike).toBeNull();
  });

  it('never fires on a 100% target (zero budget)', () => {
    const breach = makeService().computeBurnBreach(
      makeSnapshot({ errorRate: 50 }),
      makeSnapshot({ errorRate: 50 }),
      100,
    );
    expect(breach).toBeNull();
  });
});
