import { describe, expect, it } from 'vitest';
import type { RouteErrorSample } from '@/_types/metrics.interface';
import { buildCurl, toCsv, tryPretty } from '../samples/sampleExport';

const sample = (overrides: Partial<RouteErrorSample> = {}): RouteErrorSample => ({
  ts: Date.UTC(2026, 0, 2, 3, 4, 5),
  route: '/v1/orders',
  method: 'POST',
  statusCode: 500,
  durationMs: 1234,
  url: '/xp-mi/v1/orders',
  requestHeaders: {},
  downstream: [],
  ...overrides,
});

describe('buildCurl', () => {
  it('emits method, url and headers', () => {
    const curl = buildCurl(
      sample({ requestHeaders: { 'content-type': 'application/json', 'x-trace': 'abc' } }),
    );
    expect(curl).toContain("curl -X POST '/xp-mi/v1/orders'");
    expect(curl).toContain("-H 'content-type: application/json'");
    expect(curl).toContain("-H 'x-trace: abc'");
  });

  it('drops hop-by-hop headers that add noise', () => {
    const curl = buildCurl(
      sample({
        requestHeaders: { Host: 'api.example.com', Connection: 'keep-alive', 'x-keep': 'yes' },
      }),
    );
    expect(curl).not.toContain('Host');
    expect(curl).not.toContain('Connection');
    expect(curl).toContain('x-keep');
  });

  it('escapes single quotes so the command stays valid', () => {
    const curl = buildCurl(sample({ requestBody: `{"note":"it's here"}` }));
    expect(curl).toContain(`'\\''`);
  });

  it('omits the body for GET and HEAD', () => {
    expect(buildCurl(sample({ method: 'GET', requestBody: 'a=1' }))).not.toContain('-d');
    expect(buildCurl(sample({ method: 'HEAD', requestBody: 'a=1' }))).not.toContain('-d');
    expect(buildCurl(sample({ method: 'POST', requestBody: 'a=1' }))).toContain("-d 'a=1'");
  });
});

describe('toCsv', () => {
  it('writes a header plus one row per sample', () => {
    const lines = toCsv([sample(), sample({ statusCode: 404 })]).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('timestamp,method,route,statusCode,durationMs,requestId,url');
    expect(lines[1]).toContain('2026-01-02T03:04:05.000Z');
    expect(lines[1]).toContain('500');
  });

  it('quotes and escapes fields containing commas or quotes', () => {
    const row = toCsv([sample({ route: '/v1/a,b', url: '/x?q="hi"' })]).split('\n')[1] ?? '';
    expect(row).toContain('"/v1/a,b"');
    expect(row).toContain('""hi""');
  });

  it('rounds duration and tolerates a missing request id', () => {
    const row = toCsv([sample({ durationMs: 12.7 })]).split('\n')[1] ?? '';
    expect(row).toContain(',13,');
    expect(row).toContain(',,');
  });
});

describe('tryPretty', () => {
  it('formats JSON and passes other text through', () => {
    expect(tryPretty('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(tryPretty('plain text')).toBe('plain text');
    expect(tryPretty(undefined)).toBe('—');
  });
});
