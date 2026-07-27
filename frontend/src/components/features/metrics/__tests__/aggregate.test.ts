import { describe, expect, it } from 'vitest';
import type { MetricsSnapshot, RouteDownstreamPair } from '@/_types/metrics.interface';
import {
  downstreamAggregates,
  filterByTarget,
  isRouteFilterActive,
  matchesRouteFilter,
  requestsPerSecond,
  rollupByTarget,
} from '../aggregate';

const pair = (over: Partial<RouteDownstreamPair>): RouteDownstreamPair => ({
  method: 'GET',
  route: '/a',
  target: 'svc-1',
  requestCount: 10,
  errorCount: 1,
  avgLatencyMs: 100,
  ...over,
});

describe('matchesRouteFilter', () => {
  it('passes everything with an empty filter', () => {
    expect(matchesRouteFilter({ routes: [], method: null }, 'GET', '/a')).toBe(true);
  });

  it('filters by method', () => {
    const filter = { routes: [], method: 'POST' };
    expect(matchesRouteFilter(filter, 'POST', '/a')).toBe(true);
    expect(matchesRouteFilter(filter, 'GET', '/a')).toBe(false);
  });

  it('filters by "METHOD route" key', () => {
    const filter = { routes: ['GET /a'], method: null };
    expect(matchesRouteFilter(filter, 'GET', '/a')).toBe(true);
    expect(matchesRouteFilter(filter, 'GET', '/b')).toBe(false);
  });
});

describe('isRouteFilterActive', () => {
  it('is false only when nothing is selected', () => {
    expect(isRouteFilterActive({ routes: [], method: null })).toBe(false);
    expect(isRouteFilterActive({ routes: ['GET /a'], method: null })).toBe(true);
    expect(isRouteFilterActive({ routes: [], method: 'GET' })).toBe(true);
  });
});

describe('rollupByTarget', () => {
  it('sums counts and weights latency by request volume', () => {
    const rolled = rollupByTarget(
      [
        pair({ route: '/a', requestCount: 10, errorCount: 1, avgLatencyMs: 100 }),
        pair({ route: '/b', requestCount: 30, errorCount: 2, avgLatencyMs: 200 }),
      ],
      { routes: [], method: null },
    );

    expect(rolled).toHaveLength(1);
    // (10*100 + 30*200) / 40 = 175 — not the unweighted mean of 150.
    expect(rolled[0]).toEqual({
      target: 'svc-1',
      requestCount: 40,
      errorCount: 3,
      avgLatencyMs: 175,
    });
  });

  it('only counts pairs matching the route filter', () => {
    const rolled = rollupByTarget(
      [pair({ route: '/a', requestCount: 10 }), pair({ route: '/b', requestCount: 30 })],
      { routes: ['GET /a'], method: null },
    );
    expect(rolled[0]?.requestCount).toBe(10);
  });

  it('keeps targets separate', () => {
    const rolled = rollupByTarget(
      [pair({ target: 'svc-1' }), pair({ target: 'svc-2' })],
      { routes: [], method: null },
    );
    expect(rolled.map((r) => r.target).sort()).toEqual(['svc-1', 'svc-2']);
  });

  it('avoids dividing by zero on empty targets', () => {
    const rolled = rollupByTarget([pair({ requestCount: 0, avgLatencyMs: 0 })], {
      routes: [],
      method: null,
    });
    expect(rolled[0]?.avgLatencyMs).toBe(0);
  });
});

const snapshot = (over: Partial<MetricsSnapshot> = {}): MetricsSnapshot => ({
  timestamp: 0,
  windowMs: 60_000,
  summary: {
    totalRequests: 120,
    errorRate: 0,
    avgLatencyMs: 0,
    cacheHitRate: 0,
    p50LatencyMs: 0,
    p90LatencyMs: 0,
    p99LatencyMs: 0,
  },
  timeline: [],
  routeBreakdown: [],
  downstream: [{ target: 'svc-1', requestCount: 5, errorCount: 0, avgLatencyMs: 50 }],
  ...over,
});

describe('downstreamAggregates', () => {
  it('uses the plain rollup when no route filter is set', () => {
    const result = downstreamAggregates(snapshot(), { routes: [], method: null }, []);
    expect(result).toEqual(snapshot().downstream);
  });

  it('switches to the per-pair rollup when a route filter is active', () => {
    const result = downstreamAggregates(
      snapshot({ routeDownstream: [pair({ requestCount: 7 })] }),
      { routes: ['GET /a'], method: null },
      [],
    );
    expect(result[0]?.requestCount).toBe(7);
  });

  it('applies the target filter on top', () => {
    const result = downstreamAggregates(snapshot(), { routes: [], method: null }, ['other']);
    expect(result).toEqual([]);
  });
});

describe('filterByTarget', () => {
  it('is a passthrough when no targets are selected', () => {
    const items = [{ target: 'a' }, { target: 'b' }];
    expect(filterByTarget(items, [])).toBe(items);
    expect(filterByTarget(items, ['b'])).toEqual([{ target: 'b' }]);
  });
});

describe('requestsPerSecond', () => {
  it('divides by the covered window, not the requested one', () => {
    expect(requestsPerSecond(snapshot())).toBe(2); // 120 over 60s
    expect(requestsPerSecond(snapshot({ windowCoverageMs: 30_000 }))).toBe(4);
  });

  it('returns zero when the window has no duration', () => {
    expect(requestsPerSecond(snapshot({ windowMs: 0 }))).toBe(0);
  });
});
