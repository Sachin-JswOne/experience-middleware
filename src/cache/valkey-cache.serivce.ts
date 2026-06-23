// import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
// import Valkey from 'iovalkey';

// @Injectable()
// export class ValkeyCacheService implements OnModuleInit, OnModuleDestroy {
//   private readonly logger = new Logger(ValkeyCacheService.name);
//   private client: Valkey | null = null;

//   async onModuleInit() {
//     if (process.env.VALKEY_ENABLED !== 'true') {
//       this.logger.log('Valkey disabled');
//       return;
//     }

//     this.client = new Valkey({
//       host: process.env.VALKEY_HOST,
//       port: Number(process.env.VALKEY_PORT ?? 6379),
//       username: process.env.VALKEY_USERNAME || undefined,
//       password: process.env.VALKEY_PASSWORD || undefined,
//       tls: process.env.VALKEY_TLS === 'true' ? {} : undefined,
//       lazyConnect: true,
//       maxRetriesPerRequest: 1,
//       enableOfflineQueue: false,
//       connectTimeout: 3000,
//     });

//     this.client.on('error', (err) => {
//       this.logger.error(`Valkey error: ${err.message}`);
//     });

//     try {
//       await this.client.connect();
//       this.logger.log('Valkey connected');
//     } catch (err) {
//       this.logger.error(`Valkey connection failed. Cache bypassed. ${err}`);
//       this.client.disconnect();
//       this.client = null;
//     }
//   }

//   async get<T = any>(key: string): Promise<T | null> {
//     if (!this.client) return null;

//     try {
//       const value = await this.client.get(key);
//       return value ? JSON.parse(value) : null;
//     } catch (err) {
//       this.logger.error(`Valkey GET failed key=${key} error=${err}`);
//       return null;
//     }
//   }

//   async set(key: string, value: any, ttlSeconds: number): Promise<void> {
//     if (!this.client) return;

//     try {
//       await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
//     } catch (err) {
//       this.logger.error(`Valkey SET failed key=${key} error=${err}`);
//     }
//   }

//   async del(key: string): Promise<void> {
//     if (!this.client) return;

//     try {
//       await this.client.del(key);
//     } catch (err) {
//       this.logger.error(`Valkey DEL failed key=${key} error=${err}`);
//     }
//   }

//   async onModuleDestroy() {
//     this.client?.disconnect();
//   }
// }