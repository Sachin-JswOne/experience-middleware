import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { LocalCacheService } from './local/local-cache.service';
import { ValkeyAdminController } from './valkey/valkey-admin.controller';
import { ValkeyAdminService } from './valkey/valkey-admin.service';
import { ValkeyClient } from './valkey/valkey.client';
import { ValkeyConfig } from './valkey/valkey.config';
import { ValkeyPermissionGuard } from './valkey/valkey-permission.guard';
import { ValkeyProperties } from './valkey/valkey.properties';
import { ValkeyTrustStore } from './valkey/valkey.trust-store';

@Module({
  controllers: [ValkeyAdminController],
  providers: [
    CacheService,
    LocalCacheService,
    ValkeyProperties,
    ValkeyTrustStore,
    ValkeyConfig,
    ValkeyClient,
    ValkeyAdminService,
    ValkeyPermissionGuard,
  ],
  exports: [CacheService, ValkeyClient],
})
export class CacheModule {}