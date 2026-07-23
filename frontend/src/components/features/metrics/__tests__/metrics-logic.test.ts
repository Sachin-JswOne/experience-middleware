import { describe, expect, it } from 'vitest';
import type {
  MetricsHealth,
  MetricsSnapshot,
  PodHealth,
  RouteBreakdown,
  TimelineBucket,
} from '@/_types/metrics.interface';
import {
  defaultThresholds,
  evaluateAlerts,
  mergeServerConfig,
  toServerConfig,
  type AlertThresholds,
} from '../AlertSettings';
import { computeMovers } from '../TopMoversPanel';
import { computeApdex } from '../SloCard';
import { rowBand } from '../LatencyHeatmap';

const makeSnapshot = (overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot => ({
  timestamp: Date.now(),
  windowMs: 300_000,
  summary: {
    totalRequests: 100,
    errorRate: 0,
    avgLatencyMs: 50,
    cacheHitRate: 0,
    p50LatencyMs: 40,
    p90LatencyMs: 80,
    p99LatencyMs: 120,
  },
  timeline: [],
  routeBreakdown: [],
  downstream: [],
  ...overrides,
});

const makeRoute = (overrides: Partial<RouteBreakdown> = {}): RouteBreakdown => ({
  route: '/api/things',
  method: 'GET',
  requestCount: 100,
  avgLatencyMs: 100,
  errorCount: 0,
  cacheHitRate: 0,
  p95LatencyMs: 200,
  ...overrides,
});

const makePod = (overrides: Partial<PodHealth> = {}): PodHealth => ({
  pod: 'pod-a',
  version: '1.0.0',
  lastSeen: Date.now(),
  uptimeSec: 86_400,
  heapUsedMb: 100,
  heapTotalMb: 200,
  rssMb: 300,
  eventLoopLagMs: 5,
  eventLoopLagP99Ms: 12,
  bufferRecords: 1000,
  requestsLastMin: 60,
  ...overrides,
});

const thresholdsWith = (overrides: Partial<AlertThresholds>): AlertThresholds => ({
  ...defaultThresholds,
  ...overrides,
});

describe('evaluateAlerts', () => {
  it('flags global error-rate and p99 breaches', () => {
    const snapshot = makeSnapshot({
      summary: { ...makeSnapshot().summary, errorRate: 8, p99LatencyMs: 2500 },
    });
    const breaches = evaluateAlerts(
      snapshot,
      thresholdsWith({ errorRatePct: 5, p99Ms: 2000 }),
    );
    expect(breaches).toHaveLength(2);
  });

  it('evaluates per-route rules against p95 and error rate', () => {
    const snapshot = makeSnapshot({
      routeBreakdown: [makeRoute({ errorCount: 20, p95LatencyMs: 950 })],
    });
    const breaches = evaluateAlerts(
      snapshot,
      thresholdsWith({
        routeRules: [{ key: 'GET /api/things', errorRatePct: 10, p95Ms: 900 }],
      }),
    );
    expect(breaches).toHaveLength(2);
  });

  it('flags any-target error rate via the blanket threshold', () => {
    const snapshot = makeSnapshot({
      downstream: [{ target: 'sap', requestCount: 40, errorCount: 8, avgLatencyMs: 100 }],
    });
    const breaches = evaluateAlerts(snapshot, thresholdsWith({ targetErrorRatePct: 15 }));
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toContain('sap');
  });

  it('detects traffic drops against the previous window summary', () => {
    const breaches = evaluateAlerts(
      makeSnapshot({ summary: { ...makeSnapshot().summary, totalRequests: 10 } }),
      thresholdsWith({ trafficDropPct: 50 }),
      { previous: { ...makeSnapshot().summary, totalRequests: 100 } },
    );
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toContain('Traffic dropped');
  });

  it('raises loop-lag and valkey alerts from the health feed', () => {
    const health: MetricsHealth = {
      pod: makePod(),
      cluster: [makePod(), makePod({ pod: 'pod-b', eventLoopLagP99Ms: 400 })],
      valkey: 'unavailable',
    };
    const breaches = evaluateAlerts(
      makeSnapshot(),
      thresholdsWith({ eventLoopLagP99Ms: 200, valkeyUnavailable: true }),
      { health },
    );
    expect(breaches.some((b) => b.includes('pod-b'))).toBe(true);
    expect(breaches.some((b) => b.includes('Valkey'))).toBe(true);
  });

  it('stays silent on an empty window', () => {
    const snapshot = makeSnapshot({
      summary: { ...makeSnapshot().summary, totalRequests: 0, errorRate: 0 },
    });
    expect(evaluateAlerts(snapshot, thresholdsWith({ errorRatePct: 1 }))).toEqual([]);
  });
});

describe('server config mapping', () => {
  it('round-trips the shared fields and keeps browser-only ones local', () => {
    const thresholds = thresholdsWith({
      errorRatePct: 5,
      p99Ms: 1000,
      targetErrorRatePct: 20,
      trafficDropPct: 40,
      sloAvailabilityPct: 99.5,
      eventLoopLagP99Ms: 150,
      valkeyUnavailable: true,
      notify: true,
      routeRules: [{ key: 'GET /x', errorRatePct: 1, p95Ms: null }],
    });
    const config = toServerConfig(thresholds);
    expect(config.errorRatePct).toBe(5);
    expect(config.routeRules).toHaveLength(1);
    expect('notify' in config).toBe(false);

    const merged = mergeServerConfig(defaultThresholds, { ...config, updatedAt: 1 });
    expect(merged.errorRatePct).toBe(5);
    expect(merged.sloAvailabilityPct).toBe(99.5);
    // Browser-only fields keep their local values.
    expect(merged.notify).toBe(false);
    expect(merged.eventLoopLagP99Ms).toBeNull();
  });
});

describe('computeMovers', () => {
  it('surfaces latency regressions above the noise gates', () => {
    const current = [makeRoute({ p95LatencyMs: 300 })];
    const previous = [makeRoute({ p95LatencyMs: 200 })];
    const movers = computeMovers(current, previous);
    expect(movers).toHaveLength(1);
    expect(movers[0]!.latencyDeltaPct).toBeCloseTo(50);
  });

  it('ignores low-traffic routes and small moves', () => {
    const lowTraffic = computeMovers(
      [makeRoute({ requestCount: 5, p95LatencyMs: 400 })],
      [makeRoute({ requestCount: 5, p95LatencyMs: 100 })],
    );
    expect(lowTraffic).toHaveLength(0);

    const smallMove = computeMovers(
      [makeRoute({ p95LatencyMs: 210 })],
      [makeRoute({ p95LatencyMs: 200 })],
    );
    expect(smallMove).toHaveLength(0);
  });

  it('ranks error-rate movement above latency movement', () => {
    const current = [
      makeRoute({ route: '/lat', p95LatencyMs: 400 }),
      makeRoute({ route: '/err', errorCount: 10 }),
    ];
    const previous = [
      makeRoute({ route: '/lat', p95LatencyMs: 200 }),
      makeRoute({ route: '/err', errorCount: 0 }),
    ];
    const movers = computeMovers(current, previous);
    expect(movers[0]!.route.route).toBe('/err');
  });
});

describe('computeApdex', () => {
  const bucketWith = (histogram: Record<string, number>): TimelineBucket => ({
    bucketTs: 0,
    requestCount: Object.values(histogram).reduce((a, b) => a + b, 0),
    avgLatencyMs: 0,
    errorCount: 0,
    histogram,
  });

  it('scores satisfied + half of tolerating', () => {
    // T=500 → satisfied ≤500, tolerating ≤2000 (snapped to bound 1000).
    const result = computeApdex([bucketWith({ '250': 70, '1000': 20, '10000': 10 })], 500);
    expect(result).not.toBeNull();
    expect(result!.effectiveTargetMs).toBe(500);
    expect(result!.score).toBeCloseTo((70 + 20 / 2) / 100);
  });

  it('counts inf as frustrated and returns null with no data', () => {
    const result = computeApdex([bucketWith({ '25': 50, inf: 50 })], 25);
    expect(result!.score).toBeCloseTo(0.5);
    expect(computeApdex([], 500)).toBeNull();
  });
});

describe('rowBand', () => {
  it('maps a bound to its (previous, bound] band', () => {
    expect(rowBand(25)).toEqual({ minMs: 0, maxMs: 25 });
    expect(rowBand(250)).toEqual({ minMs: 100, maxMs: 250 });
  });

  it('maps inf to an open-ended band above the top bound', () => {
    expect(rowBand('inf')).toEqual({ minMs: 30000, maxMs: null });
  });
});
