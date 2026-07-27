import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import { Request, Response } from 'express';
import { replaceEnvPlaceholders } from '../config/route.config';
import {
  clearSessionCookie,
  isAuthCookieEnabled,
  readSessionCookie,
  setSessionCookie,
} from './auth-cookie';

const REQUEST_TIMEOUT_MS = 5_000;

interface UamUserInfo {
  name?: string;
  email_id?: string;
  roles?: string[];
  uamAuthorities?: {
    organizations?: Array<{
      applications?: Array<{
        applicationKey?: string;
        roles?: Array<{ permissions?: Array<{ permissionName?: string }> }>;
      }>;
    }>;
  };
}

/** What the SPA needs to render the shell. Never includes the token. */
interface SessionProfile {
  name: string;
  email: string;
  username: string;
  permissions: string[];
  organizations: unknown[];
}

/**
 * Session handshake for the admin SPA.
 *
 * The access token is minted by the external auth2-service, which this repo
 * only proxies. These routes wrap that exchange so the token can be parked in
 * an httpOnly cookie server-side and never reach browser-readable storage.
 *
 * Registered ahead of ProxyController's `@All('public/*path')` so these
 * specific paths win over the wildcard.
 */
@Controller('public/v1/auth')
export class AuthSessionController {
  private readonly logger = new Logger(AuthSessionController.name);

  /**
   * Exchanges the one-time `auth-id` from the OAuth redirect for a token.
   *
   * Cookie mode: sets the httpOnly cookie and returns `{ profile }`.
   * Legacy mode: also returns `{ token }`, matching what the SPA reads today.
   */
  @Get('session/exchange')
  async exchange(
    @Query('auth-id') authId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!authId) {
      throw new BadRequestException('auth-id query parameter is required');
    }

    const token = await this.retrieveAccessToken(authId);
    if (!token) {
      throw new UnauthorizedException('No access token was returned for this auth-id');
    }

    const profile = await this.fetchProfile(token);
    const cookieMode = isAuthCookieEnabled();
    if (cookieMode) {
      setSessionCookie(res, token);
    }

    this.logger.log(`Session established for ${profile.email || profile.username || 'unknown'}`);

    // The token is omitted entirely in cookie mode — that is the whole point.
    return cookieMode ? { profile } : { profile, token };
  }

  /**
   * "Am I signed in?" probe. The SPA cannot read an httpOnly cookie, so it
   * asks the server on boot instead of inspecting localStorage.
   */
  @Get('session')
  async session(@Req() req: Request) {
    const token = readSessionCookie(req.headers.cookie);
    if (!token) {
      throw new UnauthorizedException('No active session');
    }
    return { profile: await this.fetchProfile(token) };
  }

  @Post('session/logout')
  logout(@Res({ passthrough: true }) res: Response) {
    clearSessionCookie(res);
    return { ok: true };
  }

  private async retrieveAccessToken(authId: string): Promise<string | undefined> {
    const baseUrl = replaceEnvPlaceholders('${AUTH2_SERVICE_BASE_URL}');
    const response = await axios.get<{ token?: string; data?: { token?: string } }>(
      `${baseUrl}/auth/outlook/retrieve-access-token`,
      { params: { 'auth-id': authId }, timeout: REQUEST_TIMEOUT_MS, validateStatus: () => true },
    );

    if (response.status < 200 || response.status >= 300) {
      this.logger.warn(`Token exchange failed with status ${response.status}`);
      throw new UnauthorizedException('Sign-in failed while retrieving the access token');
    }
    // The service has returned both shapes across versions.
    return response.data?.token ?? response.data?.data?.token;
  }

  /**
   * Best-effort UAM lookup. A token that works but whose profile call fails
   * still yields a usable session — the SPA just shows a bare user chip,
   * which is how the previous client-side flow behaved.
   */
  private async fetchProfile(token: string): Promise<SessionProfile> {
    const empty: SessionProfile = {
      name: '',
      email: '',
      username: '',
      permissions: [],
      organizations: [],
    };

    const baseUrl = replaceEnvPlaceholders('${CATALOGUE_ADMIN_API_BASE_URL}');
    try {
      const response = await axios.get<{ data?: UamUserInfo }>(`${baseUrl}/api/v2/user/me`, {
        headers: { authorization: `Bearer ${token}` },
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      });

      if (response.status < 200 || response.status >= 300) return empty;

      const user = response.data?.data;
      if (!user?.name) return empty;

      return {
        name: user.name,
        email: user.email_id ?? '',
        username: user.name,
        // UAM permission names plus flat role names (some deployments grant
        // admin actions via role name).
        permissions: [
          ...new Set([...extractPermissions(user), ...(user.roles ?? [])]),
        ],
        organizations: user.uamAuthorities?.organizations ?? [],
      };
    } catch (error) {
      this.logger.warn(
        `UAM profile lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return empty;
    }
  }
}

/**
 * Server-side twin of the frontend's processUamAuthorities and the
 * ValkeyPermissionGuard's extractor: permission names from the roles of the
 * configured UAM applications.
 */
const extractPermissions = (user: UamUserInfo): string[] => {
  const appKeys = (process.env.VALKEY_UAM_APP_KEYS || 'central_catalogue_admin')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const permissions = new Set<string>();
  for (const org of user.uamAuthorities?.organizations ?? []) {
    for (const app of org.applications ?? []) {
      if (!app.applicationKey || !appKeys.includes(app.applicationKey)) continue;
      for (const role of app.roles ?? []) {
        for (const permission of role.permissions ?? []) {
          if (permission.permissionName) permissions.add(permission.permissionName);
        }
      }
    }
  }
  return [...permissions];
};
