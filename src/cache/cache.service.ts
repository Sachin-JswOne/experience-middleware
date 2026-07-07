import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis, { Cluster } from 'ioredis';
import { CacheProvider } from './cache-provider.type';

type LocalCacheEntry = {
  value: string;
  expiresAt: number;
};

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly localCache = new Map<string, LocalCacheEntry>();
  private redis?: Redis | Cluster;
  private valkeyAvailable = false;

  constructor() {
    if (process.env.CACHE_ENABLED !== 'true') return;

    if (process.env.CACHE_PROVIDER === 'VALKEY' || process.env.CACHE_PROVIDER === 'AUTO') {
      this.redis =
        process.env.VALKEY_CLUSTER_ENABLED === 'true'
          ? this.createClusterClient()
          : this.createStandaloneClient();

      this.redis.on('ready', () => {
        this.valkeyAvailable = true;
        this.logger.log('Valkey ready');
      });

      this.redis.on('error', (err) => {
        this.valkeyAvailable = false;
        this.logger.warn(`Valkey error: ${err.message}`);
      });
    }
  }

  async onModuleInit() {
    if (!this.redis) return;

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const pong = await this.redis.ping();
        this.valkeyAvailable = pong === 'PONG';
        this.logger.log(`Valkey connectivity check passed response=${pong}`);
        return;
      } catch (err: any) {
        this.valkeyAvailable = false;
        this.logger.warn(`Valkey connectivity attempt ${attempt}/5 failed: ${err.message}`);
        await this.sleep(500 * Math.pow(2, attempt - 1));
      }
    }

    if (process.env.VALKEY_FAIL_STARTUP === 'true') {
      throw new Error('Valkey connectivity check failed');
    }

    this.logger.warn('Valkey unavailable. Continuing with local cache fallback if enabled.');
  }

  private createClusterClient(): Cluster {
    const nodes = (process.env.VALKEY_CLUSTER_NODES || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((node) => {
        const [host, port] = node.split(':');
        return { host, port: Number(port || 6379) };
      });

    if (!nodes.length) {
      throw new Error('VALKEY_CLUSTER_NODES is required when VALKEY_CLUSTER_ENABLED=true');
    }

    return new Redis.Cluster(nodes, {
      redisOptions: {
        password: process.env.VALKEY_PASSWORD || undefined,
        tls: process.env.VALKEY_SSL === 'true' ? {} : undefined,
        connectTimeout: Number(process.env.VALKEY_TIMEOUT_MILLIS || 1500),
        maxRetriesPerRequest: 1,
        offlineQueue: false,
      },
      slotsRefreshTimeout: Number(process.env.VALKEY_TIMEOUT_MILLIS || 1500),
      slotsRefreshInterval: 30000,
      retryDelayOnFailover: 100,
      retryDelayOnClusterDown: 300,
      retryDelayOnTryAgain: 100,
    });
  }

  private createStandaloneClient(): Redis {
    return new Redis({
      host: process.env.VALKEY_HOST,
      port: Number(process.env.VALKEY_PORT || 6379),
      password: process.env.VALKEY_PASSWORD || undefined,
      tls: process.env.VALKEY_SSL === 'true' ? {} : undefined,
      connectTimeout: Number(process.env.VALKEY_TIMEOUT_MILLIS || 1500),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  async get(key: string, provider: CacheProvider): Promise<string | null> {
    if (process.env.CACHE_ENABLED !== 'true' || provider === 'NONE') return null;

    if ((provider === 'AUTO' || provider === 'VALKEY') && this.redis && this.valkeyAvailable) {
      try {
        const value = await this.redis.get(key);
        if (value) {
          this.logger.log(`Cache HIT source=VALKEY key=${key}`);
          return value;
        }
      } catch (err: any) {
        this.valkeyAvailable = false;
        this.logger.warn(`Valkey GET failed key=${key}: ${err.message}`);
      }
    }

    if (provider === 'AUTO' || provider === 'LOCAL') {
      return this.getLocal(key);
    }

    return null;
  }

  async set(
    key: string,
    value: string,
    ttlSeconds: number,
    provider: CacheProvider,
  ): Promise<void> {
    if (process.env.CACHE_ENABLED !== 'true' || provider === 'NONE') return;

    const ttlWithJitter = ttlSeconds + this.randomJitter();

    if ((provider === 'AUTO' || provider === 'VALKEY') && this.redis && this.valkeyAvailable) {
      try {
        await this.redis.set(key, value, 'EX', ttlWithJitter);
        this.logger.log(`Cache STORED source=VALKEY key=${key} ttl=${ttlWithJitter}`);
        return;
      } catch (err: any) {
        this.valkeyAvailable = false;
        this.logger.warn(`Cache STORE failed source=VALKEY key=${key}: ${err.message}`);
      }
    }

    if (provider === 'AUTO' || provider === 'LOCAL') {
      this.setLocal(key, value, ttlWithJitter);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis?.del(key);
    } catch {
      // fail-open
    }

    this.localCache.delete(key);
  }

  private getLocal(key: string): string | null {
    const cached = this.localCache.get(key);

    if (!cached) return null;

    if (cached.expiresAt <= Date.now()) {
      this.localCache.delete(key);
      return null;
    }

    this.logger.log(`Cache HIT source=LOCAL key=${key}`);
    return cached.value;
  }

  private setLocal(key: string, value: string, ttlSeconds: number): void {
    this.localCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    this.logger.log(`Cache STORED source=LOCAL key=${key} ttl=${ttlSeconds}`);
  }

  private randomJitter(): number {
    const jitter = Number(process.env.CACHE_TTL_JITTER_SECONDS || 0);
    return jitter > 0 ? Math.floor(Math.random() * jitter) : 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }
}