import { Inject, Injectable, Logger } from '@nestjs/common';
// import Redis from 'ioredis';
 
@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);    
  
  // constructor(@Inject('REDIS_CLIENT') private redisClient: Redis) {
  //   this.setupRedisEventHandlers();
  // }

  // Subscribe to cache events (used in main.ts)
  // async subscribeToCacheEvents(): Promise<void> {
  //   await this.redisClient.subscribe('cache-events');
  // }

  // Test Redis connection (used in main.ts)
  // async testRedisConnection(): Promise<boolean> {
  //   try {
  //     const pong = await this.redisClient.ping();
  //     this.logger.log('Redis connection test successful:', pong);
  //     return true;
  //   } catch (error) {
  //     this.logger.error('Redis connection test failed:', error);
  //     return false;
  //   }
  // }

  // Setup Redis event handlers
  // private setupRedisEventHandlers(): void {
  //   this.redisClient.on('connect', () => {
  //     this.logger.log('Redis client connected');
  //   });

  //   this.redisClient.on('ready', () => {
  //     this.logger.log('Redis client ready');
  //   });

  //   this.redisClient.on('error', (error) => {
  //     this.logger.error('Redis client error:', error);
  //   });

  //   this.redisClient.on('close', () => {
  //     this.logger.warn('Redis client connection closed');
  //   });

  //   // Handle pub/sub messages
  //   this.redisClient.on('message', (channel, message) => {
  //     this.logger.log(`Received message on channel '${channel}': ${message}`);   
  //     // Handle cache events specifically
  //     if (channel === 'cache-events') {
  //       try {
  //         const event = JSON.parse(message);
  //         this.logger.log(`Cache event: ${event.type} for key: ${event.key}`);
  //       } catch (error) {
  //         this.logger.error('Error parsing cache event:', error);
  //       }
  //     }
  //   });
  // }
}