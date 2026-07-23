import { MetricsSampleStore } from '../metrics.sample-store';
import { RouteErrorSample } from '../metrics.types';

const makeSample = (overrides: Partial<RouteErrorSample> = {}): RouteErrorSample => ({
  ts: Date.now(),
  route: '/api/things',
  method: 'GET',
  statusCode: 200,
  durationMs: 50,
  url: '/api/things?x=1',
  requestHeaders: {},
  downstream: [],
  ...overrides,
});

describe('MetricsSampleStore', () => {
  let store: MetricsSampleStore;

  beforeEach(() => {
    store = new MetricsSampleStore();
  });

  it('keeps error, slow and success quotas separate', () => {
    // Errors survive a flood of successes.
    store.record(makeSample({ statusCode: 500, ts: 1 }));
    for (let i = 0; i < 50; i++) {
      store.record(makeSample({ ts: 100 + i }));
    }
    const samples = store.getSamples('GET', '/api/things');
    expect(samples.some((s) => s.statusCode === 500)).toBe(true);
  });

  it('filters band queries by time and duration', () => {
    store.record(makeSample({ ts: 1_000, durationMs: 30 }));
    store.record(makeSample({ ts: 2_000, durationMs: 300 }));
    store.record(makeSample({ ts: 3_000, durationMs: 3_000, route: '/api/other' }));
    store.record(makeSample({ ts: 9_000, durationMs: 300 }));

    const band = store.getSamplesInBand({
      fromTs: 0,
      toTs: 5_000,
      minDurationMs: 100,
      maxDurationMs: 1_000,
    });
    expect(band).toHaveLength(1);
    expect(band[0].ts).toBe(2_000);
  });

  it('spans all routes in band mode and caps the result', () => {
    for (let i = 0; i < 5; i++) {
      store.record(makeSample({ ts: i, route: `/api/r${i}` }));
    }
    const band = store.getSamplesInBand({ fromTs: 0, toTs: 10, limit: 3 });
    expect(band).toHaveLength(3);
    // Newest first.
    expect(band[0].ts).toBeGreaterThan(band[2].ts);
  });

  it('masks sensitive headers and body fields', () => {
    const headers = MetricsSampleStore.sanitizeHeaders({
      authorization: 'Bearer secret',
      accept: 'application/json',
    });
    expect(headers.authorization).toBe('***masked***');
    expect(headers.accept).toBe('application/json');

    const body = MetricsSampleStore.sanitizeBody({ password: 'hunter2', name: 'ok' });
    expect(body).toContain('***masked***');
    expect(body).toContain('ok');
  });
});
