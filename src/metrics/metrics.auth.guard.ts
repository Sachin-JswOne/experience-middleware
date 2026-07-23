import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { Request } from 'express';
import { APP_ENV, JWT_SECRET } from '../config/app.config';

const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 30 * 1000;
const VALIDATE_TIMEOUT_MS = 3_000;
const TOKEN_CACHE_MAX = 500;

/**
 * Protects the observability endpoints. The dashboard sends the same bearer
 * token the rest of the admin UI holds after login; it is accepted when it
 * verifies against JWT_SECRET, or (for tokens issued by the UAM service with
 * a different secret) when the UAM user-info endpoint accepts it. Validated
 * tokens are cached briefly so polling dashboards don't hammer UAM.
 *
 * Enforcement is on in prod (APP_ENV=prod) and opt-in elsewhere via
 * METRICS_AUTH_ENFORCED=true. Escape hatches:
 *  - METRICS_AUTH_DISABLED=true turns the guard off entirely.
 *  - METRICS_AUTH_TOKEN=<secret> allows scripts/monitors to authenticate
 *    with an "x-metrics-token" header instead of a user token.
 */
@Injectable()
export class MetricsAuthGuard implements CanActivate {
  private readonly logger = new Logger(MetricsAuthGuard.name);
  private tokenCache = new Map<string, { validUntil: number; ok: boolean }>();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.METRICS_AUTH_DISABLED === 'true') return true;
    const enforced = APP_ENV === 'prod' || process.env.METRICS_AUTH_ENFORCED === 'true';
    if (!enforced) return true;

    const req = context.switchToHttp().getRequest<Request>();

    const staticToken = process.env.METRICS_AUTH_TOKEN;
    if (staticToken && req.headers['x-metrics-token'] === staticToken) return true;

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) {
      throw new UnauthorizedException('Metrics endpoints require authentication');
    }

    if (JWT_SECRET) {
      try {
        jwt.verify(token, JWT_SECRET);
        return true;
      } catch {
        // Not one of ours — fall through to UAM validation.
      }
    }

    if (await this.validateWithUam(token)) return true;
    throw new UnauthorizedException('Invalid or expired token');
  }

  private async validateWithUam(token: string): Promise<boolean> {
    const key = createHash('sha256').update(token).digest('hex');
    const cached = this.tokenCache.get(key);
    if (cached && cached.validUntil > Date.now()) return cached.ok;

    // The middleware already proxies the UAM user-info route — validate
    // against ourselves so no new downstream config is needed.
    const validateUrl =
      process.env.METRICS_AUTH_VALIDATE_URL ||
      `http://127.0.0.1:${process.env.PORT ?? 3000}/xp-mi/public/v1/auth/user/me`;

    let ok = false;
    try {
      const response = await axios.get(validateUrl, {
        headers: { authorization: `Bearer ${token}` },
        timeout: VALIDATE_TIMEOUT_MS,
        validateStatus: () => true,
      });
      ok = response.status >= 200 && response.status < 300;
    } catch (error) {
      this.logger.warn(
        `Token validation call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Network failure to the validator is not proof of a bad token, but
      // failing open would defeat the guard — deny and let the client retry.
      ok = false;
    }

    if (this.tokenCache.size > TOKEN_CACHE_MAX) this.tokenCache.clear();
    this.tokenCache.set(key, {
      ok,
      validUntil: Date.now() + (ok ? TOKEN_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
    });
    return ok;
  }
}
