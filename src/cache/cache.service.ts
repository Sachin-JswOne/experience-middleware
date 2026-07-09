import { Injectable, Logger } from '@nestjs/common';
import { CacheProvider } from './cache.types';
import { LocalCacheService } from './local/local-cache.service';
import { ValkeyClient } from './valkey/valkey.client';
import { ValkeyProperties } from './valkey/valkey.properties';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    private readonly props: ValkeyProperties,
    private readonly valkeyClient: ValkeyClient,
    private readonly localCache: LocalCacheService,
  ) {}

  async get(key: string, provider: CacheProvider): Promise<string | null> {
    if (!this.props.cacheEnabled || provider === 'NONE') return null;

    if (provider === 'AUTO' || provider === 'VALKEY') {
      const value = await this.valkeyClient.execute<string | null>((client) => client.get(key));

      if (value) {
        this.logger.log(`Cache HIT source=VALKEY key=${key}`);
        return value;
      }
    }

    if (provider === 'AUTO' || provider === 'LOCAL') {
      return this.localCache.get(key);
    }

    return null;
  }

  async set(
    key: string,
    value: string,
    ttlSeconds: number,
    provider: CacheProvider,
  ): Promise<void> {
    if (!this.props.cacheEnabled || provider === 'NONE') return;

    const ttlWithJitter = ttlSeconds + this.randomJitter();

    if (provider === 'AUTO' || provider === 'VALKEY') {
      const stored = await this.valkeyClient.executeWrite((client) =>
        client.set(key, value, 'EX', ttlWithJitter),
      );

      if (stored) {
        this.logger.log(`Cache STORED source=VALKEY key=${key} ttl=${ttlWithJitter}`);
        return;
      }
    }

    if (provider === 'AUTO' || provider === 'LOCAL') {
      this.localCache.set(key, value, ttlWithJitter);
    }
  }

  async del(key: string): Promise<void> {
    await this.valkeyClient.executeWrite((client) => client.del(key));
    this.localCache.del(key);
  }

  private randomJitter(): number {
    return this.props.ttlJitterSeconds > 0
      ? Math.floor(Math.random() * this.props.ttlJitterSeconds)
      : 0;
  }
}