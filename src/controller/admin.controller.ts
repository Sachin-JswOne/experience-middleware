import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Patch,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD } from '../config/app.config';
import { ROUTE_CONFIG, reloadRouteConfig } from '../config/route.config';
import { validateNoDuplicateRoutes, validateNewRoute } from '../config/route-config.schema';
import { RouteConfig } from '../models/route-config.model';

@Controller('admin')
export class AdminController {
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: { username: string; password: string }) {
    if (!body.username || !body.password) {
      throw new NotFoundException('Username and password are required');
    }
    if (body.username !== ADMIN_USERNAME || body.password !== ADMIN_PASSWORD) {
      throw new NotFoundException('Invalid credentials');
    }
    const token = jwt.sign(
      { sub: body.username, type: 'admin' as const },
      JWT_SECRET as string,
      { expiresIn: '8h' },
    );
    return { token };
  }

  @Get('config')
  @UseGuards(AdminAuthGuard)
  getConfig(): RouteConfig[] {
    return ROUTE_CONFIG;
  }

  @Post('routes')
  @UseGuards(AdminAuthGuard)
  createRoute(@Body() route: RouteConfig) {
    if (!route?.path || !route?.method) {
      throw new BadRequestException('Route must include "path" and "method"');
    }

    // Full shape validation (enums, handler-specific fields, target rules).
    try {
      validateNewRoute(route);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const configFilePath = path.resolve(__dirname, '../assets/route-config.json');
    const raw = JSON.parse(fs.readFileSync(configFilePath, 'utf-8')) as RouteConfig[];

    const newRoute: RouteConfig = { ...route, id: route.id ?? crypto.randomUUID() };

    // Reject before writing if this path+method already exists.
    try {
      validateNoDuplicateRoutes([...raw, newRoute]);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    raw.push(newRoute);
    fs.writeFileSync(configFilePath, JSON.stringify(raw, null, 2));
    // Rebuild the in-memory config (resolves placeholders + normalizes enums).
    reloadRouteConfig();

    const saved = ROUTE_CONFIG.find((r) => r.id === newRoute.id);
    return { saved: true, route: saved ?? newRoute };
  }

  @Patch('routes/:id')
  @UseGuards(AdminAuthGuard)
  updateRoute(@Param('id') id: string, @Body() updated: RouteConfig) {
    const index = ROUTE_CONFIG.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new NotFoundException(`Route with id '${id}' not found`);
    }
    const merged: RouteConfig = { ...ROUTE_CONFIG[index], ...updated, id };
    ROUTE_CONFIG[index] = merged;

    const configFilePath = path.resolve(__dirname, '../assets/route-config.json');
    fs.writeFileSync(configFilePath, JSON.stringify(ROUTE_CONFIG, null, 2));
    return { saved: true, route: ROUTE_CONFIG[index] };
  }
}