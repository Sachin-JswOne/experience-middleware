import { NextFunction, Request, Response } from 'express';
import { readSessionCookie, SESSION_COOKIE } from '../auth-cookie';
import { SessionCookieMiddleware } from '../session-cookie.middleware';

describe('readSessionCookie', () => {
  it('reads the session cookie from a multi-cookie header', () => {
    expect(readSessionCookie(`a=1; ${SESSION_COOKIE}=tok-123; b=2`)).toBe('tok-123');
  });

  it('tolerates surrounding whitespace', () => {
    expect(readSessionCookie(`  ${SESSION_COOKIE}=tok-123  `)).toBe('tok-123');
  });

  it('url-decodes the value', () => {
    expect(readSessionCookie(`${SESSION_COOKIE}=a%20b`)).toBe('a b');
  });

  it('returns undefined when absent, empty or unparseable', () => {
    expect(readSessionCookie(undefined)).toBeUndefined();
    expect(readSessionCookie('')).toBeUndefined();
    expect(readSessionCookie('other=1')).toBeUndefined();
    expect(readSessionCookie(`${SESSION_COOKIE}=`)).toBeUndefined();
    expect(readSessionCookie('novalue')).toBeUndefined();
  });

  it('does not match a cookie whose name merely ends with the session name', () => {
    expect(readSessionCookie(`not_${SESSION_COOKIE}=nope`)).toBeUndefined();
  });
});

describe('SessionCookieMiddleware', () => {
  const middleware = new SessionCookieMiddleware();

  const run = (headers: Record<string, string | undefined>) => {
    const req = { headers } as unknown as Request;
    const next = jest.fn() as unknown as NextFunction;
    middleware.use(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    return req.headers;
  };

  it('promotes the cookie to authorization and access_token', () => {
    const headers = run({ cookie: `${SESSION_COOKIE}=tok-123` });
    expect(headers.authorization).toBe('Bearer tok-123');
    expect(headers.access_token).toBe('tok-123');
  });

  it('leaves an explicit Authorization header untouched', () => {
    const headers = run({
      cookie: `${SESSION_COOKIE}=cookie-tok`,
      authorization: 'Bearer header-tok',
    });
    expect(headers.authorization).toBe('Bearer header-tok');
    // The empty slot is still filled, so proxy rules keyed on access_token work.
    expect(headers.access_token).toBe('cookie-tok');
  });

  it('leaves an explicit access_token header untouched', () => {
    const headers = run({ cookie: `${SESSION_COOKIE}=cookie-tok`, access_token: 'header-tok' });
    expect(headers.access_token).toBe('header-tok');
  });

  it('does nothing without a session cookie', () => {
    const headers = run({ cookie: 'other=1' });
    expect(headers.authorization).toBeUndefined();
    expect(headers.access_token).toBeUndefined();
  });

  it('does nothing when there is no cookie header at all', () => {
    const headers = run({});
    expect(headers.authorization).toBeUndefined();
  });
});
