import LocalStorage from '@/utils/LocalStorage';

export const USER_INFO_KEY = 'userInfo';

/**
 * The signed-in user as the SPA knows them.
 *
 * `token` is optional because the app supports two server modes:
 *
 *  - **cookie mode** (`AUTH_COOKIE_ENABLED=true`) — the access token lives in
 *    an httpOnly cookie the browser attaches automatically and JS cannot read.
 *    Only the non-sensitive profile is mirrored into localStorage, purely so
 *    the shell can render a name without a round-trip.
 *  - **legacy mode** — the server returns the token and it is stored here, as
 *    it always was.
 *
 * Nothing in the app branches on the mode: `authHeaders()` returns the bearer
 * header when there is a token, and an empty object when the cookie is doing
 * the work.
 */
export interface SessionUser {
  token?: string;
  compatibleVersion: string;
  permissions: string[];
  name: string;
  email: string;
  username: string;
  organizations: unknown[];
}

/** The token-free half of the session, as returned by /auth/session. */
export interface SessionProfile {
  name: string;
  email: string;
  username: string;
  permissions: string[];
  organizations: unknown[];
}

const AUTH_EXPIRED_EVENT = 'auth:expired';

export const readSession = (): SessionUser | null => {
  const stored: unknown = LocalStorage.getItem(USER_INFO_KEY);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
  const user = stored as Partial<SessionUser>;
  // A record is a session if it carries a token (legacy) or was written by the
  // cookie-mode handshake, which stamps compatibleVersion.
  const hasToken = typeof user.token === 'string' && user.token.length > 0;
  const hasProfile = typeof user.compatibleVersion === 'string';
  return hasToken || hasProfile ? (user as SessionUser) : null;
};

export const writeSession = (user: SessionUser): void => {
  LocalStorage.setItem(USER_INFO_KEY, user);
};

/**
 * Ends the session. Removes only the session key — the user's dashboard
 * preferences (saved views, alert thresholds, SLO config) survive a logout or
 * an expiry, which a blanket localStorage.clear() would destroy.
 */
export const clearSession = (): void => {
  LocalStorage.removeItem(USER_INFO_KEY);
};

/**
 * Signals that the server rejected our credentials. ApiClient fires this on
 * 401; ProtectedLayout listens and routes to /login. Kept as a DOM event
 * rather than a hard `window.location` redirect so the SPA navigates in-place
 * and keeps the redirectTo trail.
 */
export const notifyAuthExpired = (): void => {
  clearSession();
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
};

export const onAuthExpired = (handler: () => void): (() => void) => {
  window.addEventListener(AUTH_EXPIRED_EVENT, handler);
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
};

/**
 * Authorization header for guarded endpoints. Empty in cookie mode — there is
 * no token to send and the browser attaches the cookie itself.
 */
export const authHeaders = (): Record<string, string> => {
  const token = readSession()?.token;
  return token ? { authorization: `Bearer ${token}` } : {};
};

/**
 * Guards against open redirects: only same-origin, single-slash paths are
 * accepted as a post-login destination.
 */
export const safeRedirectPath = (raw: string | null, fallback = '/'): string => {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
};
