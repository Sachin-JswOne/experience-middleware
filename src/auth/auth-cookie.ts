import { Response } from 'express';
import { APP_ENV } from '../config/app.config';

export const SESSION_COOKIE = 'xpmi_session';

/**
 * Cookie-based sessions. When enabled, the access token is issued as an
 * httpOnly cookie instead of being handed to the SPA, so a XSS on the admin
 * origin can no longer read it.
 *
 * Off by default: flipping it changes the login handshake, so it should be
 * switched on per-environment after verifying the flow against the real
 * Outlook IdP. The SPA supports both modes and picks whichever the server
 * gives it, so the flag can be rolled back without a frontend deploy.
 */
export const isAuthCookieEnabled = (): boolean => process.env.AUTH_COOKIE_ENABLED === 'true';

// Matches the auth2-service token lifetime; the SPA re-authenticates when the
// cookie expires and downstream returns 401.
const MAX_AGE_MS = Number(process.env.AUTH_COOKIE_MAX_AGE_MS ?? 12 * 60 * 60 * 1000);

/**
 * `sameSite: 'lax'` is the CSRF control here: the SPA is served from the same
 * origin as the API, so no cross-site request needs the cookie, and Lax keeps
 * it off cross-site POSTs. `secure` everywhere except local dev over http.
 */
export const setSessionCookie = (res: Response, token: string): void => {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: APP_ENV !== 'local',
    path: '/',
    maxAge: MAX_AGE_MS,
  });
};

export const clearSessionCookie = (res: Response): void => {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: APP_ENV !== 'local',
    path: '/',
  });
};

/**
 * Minimal cookie-header parse for one name. Avoids pulling in cookie-parser
 * for a single value read on every request.
 */
export const readSessionCookie = (cookieHeader: string | undefined): string | undefined => {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return value ? decodeURIComponent(value) : undefined;
  }
  return undefined;
};
