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
      const result = await this.getWithSource(key, provider);
      return result ? result.value : null;
  }

  async getWithSource(
      key: string,
      provider: CacheProvider,
  ): Promise<{ value: string; source: 'valkey' | 'local' } | null> {

      if (!this.props.cacheEnabled || provider === 'NONE') {
          return null;
      }

      switch (provider) {

          case 'VALKEY': {

              const value = await this.valkeyClient.execute<string | null>(client =>
                  client.get(key),
              );

              // If Valkey misses OR is unavailable,
              // do NOT use local cache.
              return value ? { value, source: 'valkey' } : null;
          }

          case 'LOCAL': {
              const value = this.localCache.get(key);
              return value ? { value, source: 'local' } : null;
          }

          case 'AUTO': {

              const value = await this.valkeyClient.execute<string | null>(client =>
                  client.get(key),
              );

              if (value) {
                  return { value, source: 'valkey' };
              }

              const localValue = this.localCache.get(key);
              return localValue ? { value: localValue, source: 'local' } : null;
          }

          default:
              return null;
      }
  }

  async set(key: string,
      value: string,
      ttl: number,
      provider: CacheProvider,
  ) {

      if (!this.props.cacheEnabled || provider === 'NONE') {
          return;
      }

      ttl += this.randomJitter();

      switch (provider) {

          case 'VALKEY':

              await this.valkeyClient.executeWrite(client =>
                  client.set(key, value, 'EX', ttl),
              );
              return;

          case 'LOCAL':

              this.localCache.set(key, value, ttl);
              return;

          case 'AUTO': {

              const stored = await this.valkeyClient.executeWrite(client =>
                  client.set(key, value, 'EX', ttl),
              );

              if (!stored) {
                  this.localCache.set(key, value, ttl);
              }

              return;
          }
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