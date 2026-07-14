import { Injectable, Logger } from '@nestjs/common';

type LocalCacheEntry = {
  value: string;
  expiresAt: number;
};

@Injectable()
export class LocalCacheService {
  private readonly logger = new Logger(LocalCacheService.name);
  private readonly cache = new Map<string, LocalCacheEntry>();

  get(key: string): string | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    this.logger.log(`Cache HIT source=LOCAL key=${key}`);
    return entry.value;
  }

  set(key: string, value: string, ttlSeconds: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    this.logger.log(`Cache STORED source=LOCAL key=${key} ttl=${ttlSeconds}`);
  }

  del(key: string): void {
    this.cache.delete(key);
  }
}