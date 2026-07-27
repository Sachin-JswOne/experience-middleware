import ApiClient, { type IResult } from '@/services/ApiClient';
import { API_ROUTES } from '@/configs/ApiRoutes';
import type { SessionProfile } from '@/utils/session';

/**
 * Session handshake response.
 *
 * `token` is present only while the server runs in legacy mode. In cookie
 * mode it is absent — the token was set as an httpOnly cookie and the SPA
 * never sees it.
 */
export interface SessionExchangeResponse {
  profile: SessionProfile;
  token?: string;
}

abstract class UserService {
  /** Exchanges the one-time auth-id from the OAuth redirect for a session. */
  static exchangeAuthId(authId: string): Promise<IResult<SessionExchangeResponse>> {
    return ApiClient.makeRequest<SessionExchangeResponse>({
      url: API_ROUTES.AUTH.SESSION_EXCHANGE(authId),
      method: 'GET',
      // No session exists yet at this point in the handshake.
      skipAuth: true,
    });
  }

  /**
   * Server-side "am I signed in?". The only way to test a cookie session,
   * since an httpOnly cookie is invisible to JS.
   */
  static getSession(): Promise<IResult<{ profile: SessionProfile }>> {
    return ApiClient.makeRequest<{ profile: SessionProfile }>({
      url: API_ROUTES.AUTH.SESSION,
      method: 'GET',
      // A 401 here is the expected "signed out" answer, not a session expiry.
      suppressAuthExpiry: true,
    });
  }

  /** Clears the httpOnly cookie. A no-op in legacy mode, and harmless. */
  static logout(): Promise<IResult<{ ok: boolean }>> {
    return ApiClient.makeRequest<{ ok: boolean }>({
      url: API_ROUTES.AUTH.SESSION_LOGOUT,
      method: 'POST',
      suppressAuthExpiry: true,
    });
  }
}

export default UserService;
