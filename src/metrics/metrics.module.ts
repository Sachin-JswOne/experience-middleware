import { Module, Global } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsAggregator } from './metrics.aggregator';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsPublisher } from './metrics.publisher';
import { MetricsClusterStore } from './metrics.cluster-store';
import { CacheModule } from '../cache/cache.module';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Global()
@Module({
  imports: [CacheModule],
  controllers: [MetricsController],
  providers: [
    MetricsAggregator,
    MetricsPublisher,
    MetricsClusterStore,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
  exports: [MetricsAggregator],
})
export class MetricsModule {}
