import { Module, Global } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsAggregator } from './metrics.aggregator';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsPublisher } from './metrics.publisher';
import { MetricsClusterStore } from './metrics.cluster-store';
import { MetricsSampleStore } from './metrics.sample-store';
import { MetricsHealthService } from './metrics.health.service';
import { MetricsAlertsService } from './metrics.alerts.service';
import { MetricsAuthGuard } from './metrics.auth.guard';
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
    MetricsSampleStore,
    MetricsHealthService,
    MetricsAlertsService,
    MetricsAuthGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
  exports: [MetricsAggregator],
})
export class MetricsModule {}
