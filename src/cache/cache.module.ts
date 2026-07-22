import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { LocalCacheService } from './local/local-cache.service';
import { ValkeyClient } from './valkey/valkey.client';
import { ValkeyConfig } from './valkey/valkey.config';
import { ValkeyProperties } from './valkey/valkey.properties';
import { ValkeyTrustStore } from './valkey/valkey.trust-store';

@Module({
  providers: [
    CacheService,
    LocalCacheService,
    ValkeyProperties,
    ValkeyTrustStore,
    ValkeyConfig,
    ValkeyClient,
  ],
  exports: [CacheService, ValkeyClient],
})
export class CacheModule {}