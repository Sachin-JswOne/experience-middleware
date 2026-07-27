import { describe, expect, it } from 'vitest';
import { parseMetricsHealth, parseMetricsSnapshot } from '../metricsSchema';

const validSnapshot = {
  timestamp: 1700000000000,
  windowMs: 300000,
  summary: {
    totalRequests: 10,
    errorRate: 1.5,
    avgLatencyMs: 40,
    cacheHitRate: 0.5,
    p50LatencyMs: 30,
    p90LatencyMs: 80,
    p99LatencyMs: 120,
  },
  timeline: [{ bucketTs: 1, requestCount: 3, avgLatencyMs: 10, errorCount: 0 }],
  routeBreakdown: [
    { method: 'GET', route: '/a', requestCount: 3, errorCount: 0, avgLatencyMs: 10 },
  ],
  downstream: [{ target: 'svc', requestCount: 2, errorCount: 1, avgLatencyMs: 20 }],
};

describe('parseMetricsSnapshot', () => {
  it('accepts a well-formed payload', () => {
    const parsed = parseMetricsSnapshot(validSnapshot);
    expect(parsed?.summary.totalRequests).toBe(10);
    expect(parsed?.timeline).toHaveLength(1);
    expect(parsed?.routeBreakdown[0]?.route).toBe('/a');
  });

  it('rejects payloads with no summary', () => {
    expect(parseMetricsSnapshot({ ...validSnapshot, summary: undefined })).toBeNull();
    expect(parseMetricsSnapshot(null)).toBeNull();
    expect(parseMetricsSnapshot('nope')).toBeNull();
    expect(parseMetricsSnapshot([])).toBeNull();
  });

  it('coerces missing numeric summary fields to zero rather than failing', () => {
    const parsed = parseMetricsSnapshot({ ...validSnapshot, summary: {} });
    expect(parsed?.summary.totalRequests).toBe(0);
    expect(parsed?.summary.p99LatencyMs).toBe(0);
  });

  it('drops malformed rows instead of blanking the whole snapshot', () => {
    const parsed = parseMetricsSnapshot({
      ...validSnapshot,
      timeline: [...validSnapshot.timeline, { requestCount: 5 }, null],
      routeBreakdown: [...validSnapshot.routeBreakdown, { route: '/b' }],
      downstream: [...validSnapshot.downstream, {}],
    });
    expect(parsed?.timeline).toHaveLength(1);
    expect(parsed?.routeBreakdown).toHaveLength(1);
    expect(parsed?.downstream).toHaveLength(1);
  });

  it('tolerates absent optional collections', () => {
    const parsed = parseMetricsSnapshot({
      timestamp: 1,
      windowMs: 1,
      summary: validSnapshot.summary,
    });
    expect(parsed?.timeline).toEqual([]);
    expect(parsed?.routeBreakdown).toEqual([]);
    expect(parsed?.downstream).toEqual([]);
  });

  it('rejects a non-finite timestamp by substituting a usable one', () => {
    const parsed = parseMetricsSnapshot({ ...validSnapshot, timestamp: 'soon' });
    expect(Number.isFinite(parsed?.timestamp)).toBe(true);
  });
});

describe('parseMetricsHealth', () => {
  it('accepts a payload with a pod', () => {
    const parsed = parseMetricsHealth({ pod: { pod: 'a' }, cluster: [], valkey: 'connected' });
    expect(parsed?.valkey).toBe('connected');
    expect(parsed?.cluster).toEqual([]);
  });

  it('rejects a payload with no pod', () => {
    expect(parseMetricsHealth({ cluster: [] })).toBeNull();
    expect(parseMetricsHealth(null)).toBeNull();
  });

  it('defaults an unknown valkey state to unavailable', () => {
    const parsed = parseMetricsHealth({ pod: { pod: 'a' } });
    expect(parsed?.valkey).toBe('unavailable');
  });
});
