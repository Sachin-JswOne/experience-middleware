import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { readSessionCookie } from './auth-cookie';

/**
 * Promotes the session cookie to the `authorization` / `access_token` headers
 * before anything else in the pipeline runs.
 *
 * This is what keeps cookie sessions a one-place change: guards
 * (MetricsAuthGuard, ValkeyPermissionGuard) and the proxy's `headersToPass`
 * rules keep reading headers exactly as they do today, and never need to know
 * whether the token arrived in a header or a cookie.
 *
 * An explicit header always wins, so service-to-service callers and the
 * legacy (token-in-localStorage) frontend are unaffected.
 */
@Injectable()
export class SessionCookieMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const token = readSessionCookie(req.headers.cookie);
    if (token) {
      if (!req.headers.authorization) {
        req.headers.authorization = `Bearer ${token}`;
      }
      if (!req.headers.access_token) {
        req.headers.access_token = token;
      }
    }
    next();
  }
}
