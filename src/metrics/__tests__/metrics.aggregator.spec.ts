import { MetricsAggregator } from '../metrics.aggregator';
import { DownstreamRecord, RequestRecord } from '../metrics.types';

const makeRecord = (overrides: Partial<RequestRecord> = {}): RequestRecord => ({
  timestamp: Date.now(),
  route: '/api/things',
  method: 'GET',
  statusCode: 200,
  durationMs: 100,
  cacheHit: false,
  downstreamTargets: [],
  ...overrides,
});

const makeDownstream = (overrides: Partial<DownstreamRecord> = {}): DownstreamRecord => ({
  target: 'sap',
  durationMs: 80,
  success: true,
  statusCode: 200,
  ...overrides,
});

describe('MetricsAggregator', () => {
  let aggregator: MetricsAggregator;

  beforeEach(() => {
    aggregator = new MetricsAggregator();
  });

  afterEach(() => {
    aggregator.onModuleDestroy();
  });

  it('summarizes totals, error rate and cache hit rate', () => {
    aggregator.recordRequest(makeRecord({ statusCode: 200, cacheHit: true, cacheServedBy: 'valkey' }));
    aggregator.recordRequest(makeRecord({ statusCode: 500 }));
    aggregator.recordRequest(makeRecord({ statusCode: 404 }));
    aggregator.recordRequest(makeRecord({ statusCode: 200 }));

    const snapshot = aggregator.getSnapshot(60_000);
    expect(snapshot.summary.totalRequests).toBe(4);
    expect(snapshot.summary.errorRate).toBeCloseTo(50);
    expect(snapshot.summary.cacheHitRate).toBeCloseTo(25);
    expect(snapshot.summary.statusClasses).toEqual({ c2xx: 2, c3xx: 0, c4xx: 1, c5xx: 1 });
    expect(snapshot.summary.percentileSource).toBe('exact');
  });

  it('computes exact latency percentiles', () => {
    for (let i = 1; i <= 100; i++) {
      aggregator.recordRequest(makeRecord({ durationMs: i }));
    }
    const snapshot = aggregator.getSnapshot(60_000);
    expect(snapshot.summary.p50LatencyMs).toBe(50);
    expect(snapshot.summary.p90LatencyMs).toBe(90);
    expect(snapshot.summary.p99LatencyMs).toBe(99);
  });

  it('rolls up per-route breakdown with p95 and status classes', () => {
    for (let i = 1; i <= 20; i++) {
      aggregator.recordRequest(makeRecord({ durationMs: i * 10 }));
    }
    aggregator.recordRequest(makeRecord({ route: '/api/other', statusCode: 502, durationMs: 30 }));

    const snapshot = aggregator.getSnapshot(60_000);
    const things = snapshot.routeBreakdown.find((r) => r.route === '/api/things');
    expect(things?.requestCount).toBe(20);
    expect(things?.p95LatencyMs).toBe(190);
    const other = snapshot.routeBreakdown.find((r) => r.route === '/api/other');
    expect(other?.errorCount).toBe(1);
    expect(other?.statusClasses?.c5xx).toBe(1);
  });

  it('computes per-target downstream percentiles', () => {
    for (let i = 1; i <= 100; i++) {
      aggregator.recordRequest(
        makeRecord({
          downstreamTargets: [makeDownstream({ durationMs: i })],
        }),
      );
    }
    const snapshot = aggregator.getSnapshot(60_000);
    const sap = snapshot.downstream.find((d) => d.target === 'sap');
    expect(sap?.requestCount).toBe(100);
    expect(sap?.p95LatencyMs).toBe(95);
    expect(sap?.p99LatencyMs).toBe(99);
  });

  it('tracks downstream network errors separately from HTTP errors', () => {
    aggregator.recordRequest(
      makeRecord({
        downstreamTargets: [makeDownstream({ success: false, statusCode: undefined })],
      }),
    );
    aggregator.recordRequest(
      makeRecord({
        downstreamTargets: [makeDownstream({ success: false, statusCode: 500 })],
      }),
    );
    const snapshot = aggregator.getSnapshot(60_000);
    const sap = snapshot.downstream.find((d) => d.target === 'sap');
    expect(sap?.errorCount).toBe(2);
    expect(sap?.networkErrorCount).toBe(1);
    expect(sap?.statusClasses?.c5xx).toBe(1);
  });

  it('carries the request id into the recent-errors feed', () => {
    aggregator.recordRequest(makeRecord({ statusCode: 500, requestId: 'req-abc-123' }));
    const snapshot = aggregator.getSnapshot(60_000);
    expect(snapshot.recentErrors?.[0]?.requestId).toBe('req-abc-123');
  });

  it('buckets the timeline and attaches latency histograms', () => {
    aggregator.recordRequest(makeRecord({ durationMs: 20 }));
    aggregator.recordRequest(makeRecord({ durationMs: 700 }));
    const snapshot = aggregator.getSnapshot(60_000);
    const nonEmpty = snapshot.timeline.filter((b) => b.requestCount > 0);
    expect(nonEmpty).toHaveLength(1);
    expect(nonEmpty[0].histogram).toEqual({ '25': 1, '1000': 1 });
  });

  it('reports partial coverage when asked for more than the local buffer holds', () => {
    aggregator.recordRequest(makeRecord());
    const requested = 40 * 24 * 60 * 60 * 1000;
    const snapshot = aggregator.getSnapshot(requested);
    expect(snapshot.windowMs).toBe(requested);
    expect(snapshot.windowCoverageMs).toBeLessThan(requested);
  });
});
