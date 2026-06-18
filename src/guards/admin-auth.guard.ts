import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/app.config';

interface AdminJwtPayload {
  sub: string;
  type: 'admin';
  iat?: number;
  exp?: number;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }
    const token = authHeader.slice(7);
    let payload: AdminJwtPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET as string) as AdminJwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (payload.type !== 'admin') {
      throw new UnauthorizedException('Admin access required');
    }
    return true;
  }
}