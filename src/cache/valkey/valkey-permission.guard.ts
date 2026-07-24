import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import axios from 'axios';
import { Request } from 'express';
import { APP_ENV } from '../../config/app.config';

const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 30 * 1000;
const VALIDATE_TIMEOUT_MS = 3_000;
const TOKEN_CACHE_MAX = 500;

interface CachedEntry {
  validUntil: number;
  ok: boolean;
  permissions: string[];
  user: string;
}

/**
 * Protects Valkey admin write/flush endpoints. Unlike MetricsAuthGuard (which
 * only validates the token), this guard fetches the UAM user-info body and
 * requires a specific permission name among the user's UAM roles/permissions.
 *
 * Config:
 *  - VALKEY_WRITE_PERMISSION (default VALKEY_ADMIN_WRITE) — required permission.
 *  - VALKEY_UAM_APP_KEYS (default central_catalogue_admin) — UAM application
 *    keys whose roles are considered, comma-separated.
 * Enforcement mirrors MetricsAuthGuard: on in prod or when
 * METRICS_AUTH_ENFORCED=true; METRICS_AUTH_DISABLED=true turns it off.
 */
@Injectable()
export class ValkeyPermissionGuard implements CanActivate {
  private readonly logger = new Logger(ValkeyPermissionGuard.name);
  private tokenCache = new Map<string, CachedEntry>();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.METRICS_AUTH_DISABLED === 'true') return true;
    const enforced = APP_ENV === 'prod' || process.env.METRICS_AUTH_ENFORCED === 'true';
    if (!enforced) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) {
      throw new UnauthorizedException('Valkey admin writes require authentication');
    }

    const entry = await this.resolvePermissions(token);
    if (!entry.ok) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    (req as Request & { valkeyAdminUser?: string }).valkeyAdminUser = entry.user;

    const required = process.env.VALKEY_WRITE_PERMISSION || 'VALKEY_ADMIN_WRITE';
    if (!entry.permissions.includes(required)) {
      throw new ForbiddenException(`Requires permission '${required}'`);
    }
    return true;
  }

  private async resolvePermissions(token: string): Promise<CachedEntry> {
    const key = createHash('sha256').update(token).digest('hex');
    const cached = this.tokenCache.get(key);
    if (cached && cached.validUntil > Date.now()) return cached;

    const validateUrl =
      process.env.METRICS_AUTH_VALIDATE_URL ||
      `http://127.0.0.1:${process.env.PORT ?? 3000}/xp-mi/public/v1/auth/user/me`;

    let entry: CachedEntry = { ok: false, permissions: [], user: 'unknown', validUntil: 0 };
    try {
      const response = await axios.get(validateUrl, {
        headers: { authorization: `Bearer ${token}` },
        timeout: VALIDATE_TIMEOUT_MS,
        validateStatus: () => true,
      });
      if (response.status >= 200 && response.status < 300) {
        const data = response.data ?? {};
        entry = {
          ok: true,
          permissions: this.extractPermissions(data),
          user: data.email_id || data.email || data.name || 'unknown',
          validUntil: 0,
        };
      }
    } catch (error) {
      this.logger.warn(
        `Permission lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (this.tokenCache.size > TOKEN_CACHE_MAX) this.tokenCache.clear();
    entry.validUntil = Date.now() + (entry.ok ? TOKEN_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS);
    this.tokenCache.set(key, entry);
    return entry;
  }

  /**
   * Server-side twin of the frontend's processUamAuthorities: collect
   * permission names from roles of the configured UAM applications, unioned
   * with the flat `roles` array (older sessions store role names there).
   */
  private extractPermissions(data: Record<string, any>): string[] {
    const appKeys = (process.env.VALKEY_UAM_APP_KEYS || 'central_catalogue_admin')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const permissions = new Set<string>();
    for (const role of data.roles ?? []) {
      if (typeof role === 'string') permissions.add(role);
    }
    for (const org of data.uamAuthorities?.organizations ?? []) {
      for (const app of org.applications ?? []) {
        if (!appKeys.includes(app.applicationKey)) continue;
        for (const role of app.roles ?? []) {
          for (const permission of role.permissions ?? []) {
            if (permission.permissionName) permissions.add(permission.permissionName);
          }
        }
      }
    }
    return [...permissions];
  }
}
