import { describe, expect, it } from 'vitest';
import { parseRange, parseTab, parseView, serializeView } from '../dashboardUrlState';

const params = (query: string) => new URLSearchParams(query);

describe('parseRange', () => {
  it('reads an absolute range', () => {
    expect(parseRange(params('from=1000&to=2000'))).toEqual({
      type: 'absolute',
      from: 1000,
      to: 2000,
    });
  });

  it('reads a relative window', () => {
    expect(parseRange(params('window=6h'))).toEqual({ type: 'relative', window: '6h' });
  });

  it('falls back to 5m for an unknown window', () => {
    expect(parseRange(params('window=99y'))).toEqual({ type: 'relative', window: '5m' });
  });

  it('falls back when the absolute range is inverted or unparseable', () => {
    expect(parseRange(params('from=5000&to=1000'))).toEqual({ type: 'relative', window: '5m' });
    expect(parseRange(params('from=abc&to=def'))).toEqual({ type: 'relative', window: '5m' });
  });

  it('prefers the absolute range when both are present', () => {
    expect(parseRange(params('window=6h&from=1000&to=2000'))).toEqual({
      type: 'absolute',
      from: 1000,
      to: 2000,
    });
  });
});

describe('parseTab', () => {
  it('maps names to indices', () => {
    expect(parseTab(params('tab=overview'))).toBe(0);
    expect(parseTab(params('tab=routes'))).toBe(1);
    expect(parseTab(params('tab=downstream'))).toBe(2);
    expect(parseTab(params('tab=system'))).toBe(3);
  });

  it('defaults to overview for missing or unknown names', () => {
    expect(parseTab(params(''))).toBe(0);
    expect(parseTab(params('tab=nope'))).toBe(0);
  });
});

describe('parseView / serializeView', () => {
  it('round-trips a full view', () => {
    const query =
      'tab=downstream&window=1h&refresh=30000&method=GET&routes=GET%20%2Fa,POST%20%2Fb&targets=svc-1&utc=1';
    const view = parseView(params(query));

    expect(view).toEqual({
      range: { type: 'relative', window: '1h' },
      tab: 2,
      filter: { routes: ['GET /a', 'POST /b'], method: 'GET' },
      targets: ['svc-1'],
      utc: true,
      refreshMs: 30000,
    });

    const serialized = serializeView({ ...view, refreshMs: 30000 });
    expect(parseView(new URLSearchParams(serialized))).toEqual(view);
  });

  it('omits empty filters from the query string', () => {
    const serialized = serializeView({
      range: { type: 'relative', window: '5m' },
      tab: 0,
      filter: { routes: [], method: null },
      targets: [],
      utc: false,
      refreshMs: 10_000,
    });

    expect(serialized).toEqual({ tab: 'overview', window: '5m', refresh: '10000' });
    expect(serialized).not.toHaveProperty('routes');
    expect(serialized).not.toHaveProperty('utc');
  });

  it('serializes an absolute range as from/to', () => {
    const serialized = serializeView({
      range: { type: 'absolute', from: 111, to: 222 },
      tab: 1,
      filter: { routes: [], method: null },
      targets: [],
      utc: false,
      refreshMs: 0,
    });

    expect(serialized.from).toBe('111');
    expect(serialized.to).toBe('222');
    expect(serialized).not.toHaveProperty('window');
  });

  it('reports a missing refresh param as null so the stored default wins', () => {
    expect(parseView(params('tab=overview')).refreshMs).toBeNull();
    expect(parseView(params('refresh=0')).refreshMs).toBe(0);
    expect(parseView(params('refresh=-1')).refreshMs).toBe(-1);
  });
});
