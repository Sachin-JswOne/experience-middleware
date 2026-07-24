import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { MetricsAuthGuard } from '../../metrics/metrics.auth.guard';
import { ValkeyAdminService } from './valkey-admin.service';
import { ValkeyPermissionGuard } from './valkey-permission.guard';

type AdminRequest = Request & { valkeyAdminUser?: string };

@Controller('admin/cache')
@UseGuards(MetricsAuthGuard)
export class ValkeyAdminController {
  private readonly logger = new Logger(ValkeyAdminController.name);

  constructor(private readonly adminService: ValkeyAdminService) {}

  @Get('status')
  getStatus() {
    return this.adminService.getStatus();
  }

  @Get('info')
  getInfo() {
    return this.adminService.getInfo();
  }

  @Get('cluster/nodes')
  getClusterNodes() {
    return this.adminService.getClusterNodes();
  }

  @Get('keys')
  scanKeys(
    @Query('pattern') pattern?: string,
    @Query('cursor') cursor?: string,
    @Query('count') count?: string,
  ) {
    const parsedCount = count ? Number(count) : 100;
    if (!Number.isInteger(parsedCount) || parsedCount <= 0) {
      throw new BadRequestException('count must be a positive integer');
    }
    return this.adminService.scanKeys(pattern || '*', cursor || undefined, parsedCount);
  }

  @Get('keys/detail')
  getKeyDetail(@Query('key') key?: string) {
    if (!key) {
      throw new BadRequestException('key query parameter is required');
    }
    return this.adminService.getKeyDetail(key);
  }

  @Put('keys')
  @UseGuards(ValkeyPermissionGuard)
  async setKey(
    @Req() req: AdminRequest,
    @Body() body: { key?: string; value?: string; ttlSeconds?: number },
  ) {
    const { key, value, ttlSeconds } = body ?? {};
    if (!key || typeof key !== 'string') {
      throw new BadRequestException('key is required');
    }
    if (typeof value !== 'string') {
      throw new BadRequestException('value must be a string');
    }
    if (ttlSeconds !== undefined && (!Number.isInteger(ttlSeconds) || ttlSeconds < 0)) {
      throw new BadRequestException('ttlSeconds must be a non-negative integer');
    }
    await this.adminService.setKey(key, value, ttlSeconds);
    this.logger.warn(
      `Valkey admin SET by ${req.valkeyAdminUser ?? 'unknown'} | key=${key} ttl=${ttlSeconds ?? 'none'}`,
    );
    return { ok: true };
  }

  @Post('keys/delete')
  @UseGuards(ValkeyPermissionGuard)
  async deleteKeys(@Req() req: AdminRequest, @Body() body: { keys?: string[] }) {
    const keys = body?.keys;
    if (
      !Array.isArray(keys) ||
      keys.length === 0 ||
      keys.some((k) => typeof k !== 'string' || !k)
    ) {
      throw new BadRequestException('keys must be a non-empty array of strings');
    }
    const result = await this.adminService.deleteKeys(keys);
    this.logger.warn(
      `Valkey admin DELETE by ${req.valkeyAdminUser ?? 'unknown'} | keys=${keys.join(',')} deleted=${result.deleted}`,
    );
    return result;
  }

  @Post('flush')
  @UseGuards(ValkeyPermissionGuard)
  async flush(@Req() req: AdminRequest, @Body() body: { scope?: string; confirm?: string }) {
    const { scope, confirm } = body ?? {};
    if (scope !== 'db' && scope !== 'all') {
      throw new BadRequestException("scope must be 'db' or 'all'");
    }
    if (confirm !== 'FLUSH') {
      throw new BadRequestException("confirm must be the literal string 'FLUSH'");
    }
    const result = await this.adminService.flush(scope);
    this.logger.warn(
      `Valkey admin FLUSH${scope === 'all' ? 'ALL' : 'DB'} by ${req.valkeyAdminUser ?? 'unknown'} | nodes=${result.nodes}`,
    );
    return result;
  }
}
