import { ProxyService } from '../proxy.service';
import { createHttpClient } from '../../utils/http-client.factory';

jest.mock('../../utils/http-client.factory');
// These tests exercise handleTransformRequest directly and never touch
// ROUTE_CONFIG, so route.config's env-placeholder resolution (which needs
// env vars this local/test environment doesn't set, e.g.
// TMS_AUTH_TOKEN_ORDER_LISTING) is irrelevant here — mock it out.
jest.mock('../../config/route.config', () => ({ ROUTE_CONFIG: [] }));

// Covers the scenarios in .github/reviews/feature/code-review/testcases.md
// (JSWOC-21490 — sensitive-data logging fix in handleTransformRequest).
describe('ProxyService - downstream request/response logging (JSWOC-21490)', () => {
  let service: ProxyService;
  let logSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  const baseTarget: any = {
    name: 'downstream-target',
    url: 'http://downstream.local/api',
    method: 'POST',
    timeout: { request: 5000, socket: 1000 },
    headersToPass: [{ source: 'authorization', destination: 'authorization' }],
  };

  const buildReq = (body: any, path = '/xp-mi/public/v1/verify-passcode'): any => ({
    method: 'POST',
    url: path,
    path,
    headers: { authorization: 'Bearer secret-jwt-token' },
    query: {},
    params: {},
    body,
  });

  function mockDownstream(response: any) {
    (createHttpClient as jest.Mock).mockResolvedValue({
      request: jest.fn().mockResolvedValue(response),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LOG_LEVEL;
    service = new ProxyService();
    logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation();
    debugSpy = jest.spyOn((service as any).logger, 'debug').mockImplementation();
  });

  it('scenario 1: production log level does not write the raw request body to logs', async () => {
    mockDownstream({ status: 200, data: { ok: true }, headers: {} });
    const req = buildReq({ mobile: '9999999999', passcode: '123456' });

    await (service as any).handleTransformRequest(baseTarget, req);

    const allLines = [...logSpy.mock.calls, ...debugSpy.mock.calls].map((c) => String(c[0]));
    expect(allLines.some((line) => line.includes('123456'))).toBe(false);
  });

  it('scenario 2: production log level does not write the raw response body to logs', async () => {
    mockDownstream({ status: 200, data: { token: 'abc.def.ghi' }, headers: {} });
    const req = buildReq({ mobile: '9999999999' });

    await (service as any).handleTransformRequest(baseTarget, req);

    const allLines = [...logSpy.mock.calls, ...debugSpy.mock.calls].map((c) => String(c[0]));
    expect(allLines.some((line) => line.includes('abc.def.ghi'))).toBe(false);
  });

  it('scenario 3: debug log level masks password/OTP/token fields instead of printing them raw', async () => {
    process.env.LOG_LEVEL = 'debug';
    mockDownstream({ status: 200, data: { ok: true }, headers: {} });
    const req = buildReq({ mobile: '9999999999', passcode: '123456' });

    await (service as any).handleTransformRequest(baseTarget, req);

    const debugLines = debugSpy.mock.calls.map((c) => String(c[0]));
    expect(debugLines.some((line) => line.includes('[DOWNSTREAM REQUEST]'))).toBe(true);
    expect(debugLines.some((line) => line.includes('123456'))).toBe(false);
    expect(debugLines.some((line) => line.includes('***masked***'))).toBe(true);
  });

  it('scenario 4: debug log level still logs non-sensitive fields in full', async () => {
    process.env.LOG_LEVEL = 'debug';
    mockDownstream({ status: 200, data: { ok: true }, headers: {} });
    const req = buildReq({ orderId: 'ORD-4242' });

    await (service as any).handleTransformRequest(baseTarget, req);

    const debugLines = debugSpy.mock.calls.map((c) => String(c[0]));
    expect(debugLines.some((line) => line.includes('ORD-4242'))).toBe(true);
  });

  it('scenario 5: Authorization header is still masked in the downstream request log', async () => {
    process.env.LOG_LEVEL = 'debug';
    mockDownstream({ status: 200, data: { ok: true }, headers: {} });
    const req = buildReq({ mobile: '9999999999' });

    await (service as any).handleTransformRequest(baseTarget, req);

    const debugLines = debugSpy.mock.calls.map((c) => String(c[0]));
    expect(debugLines.some((line) => line.includes('secret-jwt-token'))).toBe(false);
  });

  it('scenario 6: target duration and status metadata is still logged at info level', async () => {
    mockDownstream({ status: 200, data: { ok: true }, headers: {} });
    const req = buildReq({ mobile: '9999999999' });

    await (service as any).handleTransformRequest(baseTarget, req);

    const infoLines = logSpy.mock.calls.map((c) => String(c[0]));
    expect(
      infoLines.some(
        (line) => line.includes('[DOWNSTREAM RESPONSE]') && line.includes('status=200'),
      ),
    ).toBe(true);
  });

  it('scenario 7: a route with no sensitive fields logs normally with no behavior change', async () => {
    process.env.LOG_LEVEL = 'debug';
    mockDownstream({ status: 200, data: { status: 'ok' }, headers: {} });
    const req = buildReq({}, '/xp-mi/public/health');

    await (service as any).handleTransformRequest(baseTarget, req);

    const debugLines = debugSpy.mock.calls.map((c) => String(c[0]));
    expect(debugLines.some((line) => line.includes('[DOWNSTREAM REQUEST]'))).toBe(true);
  });

  it('scenario 8: large response bodies are still truncated in the tracing span preview attribute', async () => {
    const fakeSpan = {
      setAttribute: jest.fn(),
      setStatus: jest.fn(),
      recordException: jest.fn(),
    };
    jest
      .spyOn((service as any).tracer, 'startActiveSpan')
      .mockImplementation((..._args: any[]) => (_args[1] as any)(fakeSpan));

    const bigPassword = 'p'.repeat(2000);
    mockDownstream({ status: 200, data: { password: bigPassword, ok: true }, headers: {} });
    const req = buildReq({ mobile: '9999999999' });

    await (service as any).handleTransformRequest(baseTarget, req);

    const previewCall = fakeSpan.setAttribute.mock.calls.find(
      ([key]: [string]) => key === 'api.response.preview',
    );
    expect(previewCall?.[1]).toContain('***masked***');
  });
});
