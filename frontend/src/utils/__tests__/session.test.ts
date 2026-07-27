import { describe, expect, it, vi } from 'vitest';
import {
  authHeaders,
  clearSession,
  notifyAuthExpired,
  onAuthExpired,
  readSession,
  safeRedirectPath,
  writeSession,
  USER_INFO_KEY,
  type SessionUser,
} from '../session';

const user: SessionUser = {
  token: 'tok-123',
  compatibleVersion: '0.1.0',
  permissions: ['VALKEY_ADMIN_WRITE'],
  name: 'Test User',
  email: 'test@jsw.in',
  username: 'test',
  organizations: [],
};

describe('readSession', () => {
  it('round-trips a written session', () => {
    writeSession(user);
    expect(readSession()).toEqual(user);
  });

  it('returns null when nothing is stored', () => {
    expect(readSession()).toBeNull();
  });

  it('accepts a cookie-mode session, which carries a profile but no token', () => {
    const { token: _token, ...cookieSession } = user;
    window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(cookieSession));

    const session = readSession();
    expect(session?.name).toBe('Test User');
    expect(session?.token).toBeUndefined();
  });

  it('rejects a record that is neither a token nor a profile', () => {
    window.localStorage.setItem(USER_INFO_KEY, JSON.stringify({ name: 'stray' }));
    expect(readSession()).toBeNull();
  });

  it('rejects non-object garbage', () => {
    window.localStorage.setItem(USER_INFO_KEY, '"just-a-string"');
    expect(readSession()).toBeNull();
  });
});

describe('clearSession', () => {
  it('removes the session but preserves other preferences', () => {
    writeSession(user);
    window.localStorage.setItem('metricsSavedViews', JSON.stringify([{ name: 'mine' }]));
    window.localStorage.setItem('metricsAlertThresholds', JSON.stringify({ p99Ms: 500 }));

    clearSession();

    expect(readSession()).toBeNull();
    // A blanket window.localStorage.clear() used to wipe these on every 401.
    expect(window.localStorage.getItem('metricsSavedViews')).not.toBeNull();
    expect(window.localStorage.getItem('metricsAlertThresholds')).not.toBeNull();
  });
});

describe('authHeaders', () => {
  it('carries a bearer token when signed in', () => {
    writeSession(user);
    expect(authHeaders()).toEqual({ authorization: 'Bearer tok-123' });
  });

  it('is empty when signed out', () => {
    expect(authHeaders()).toEqual({});
  });

  // In cookie mode the browser attaches the credential; there is no bearer
  // header to build, and sending an empty one would be wrong.
  it('is empty in cookie mode, where the session has no token', () => {
    const { token: _token, ...cookieSession } = user;
    writeSession(cookieSession);
    expect(authHeaders()).toEqual({});
  });
});

describe('notifyAuthExpired', () => {
  it('clears the session and notifies subscribers', () => {
    writeSession(user);
    const handler = vi.fn();
    const unsubscribe = onAuthExpired(handler);

    notifyAuthExpired();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(readSession()).toBeNull();

    unsubscribe();
    notifyAuthExpired();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('safeRedirectPath', () => {
  it('keeps same-origin absolute paths', () => {
    expect(safeRedirectPath('/prompts/ai-invoke')).toBe('/prompts/ai-invoke');
    expect(safeRedirectPath('/?window=1h&tab=routes')).toBe('/?window=1h&tab=routes');
  });

  it('falls back for missing or empty input', () => {
    expect(safeRedirectPath(null)).toBe('/');
    expect(safeRedirectPath('')).toBe('/');
    expect(safeRedirectPath(null, '/cache-admin')).toBe('/cache-admin');
  });

  it('rejects off-origin destinations', () => {
    expect(safeRedirectPath('//evil.example.com')).toBe('/');
    expect(safeRedirectPath('https://evil.example.com')).toBe('/');
    expect(safeRedirectPath('/\\evil.example.com')).toBe('/');
    expect(safeRedirectPath('javascript:alert(1)')).toBe('/');
  });
});
