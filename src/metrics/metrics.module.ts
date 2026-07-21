import { Module, Global } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsAggregator } from './metrics.aggregator';
import { MetricsInterceptor } from './metrics.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsAggregator,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
  exports: [MetricsAggregator],
})
export class MetricsModule {}
