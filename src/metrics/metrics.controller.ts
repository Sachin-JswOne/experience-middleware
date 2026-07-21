import { Controller, Get, Query } from '@nestjs/common';
import { MetricsAggregator } from './metrics.aggregator';
import { MetricsSnapshot } from './metrics.types';

@Controller()
export class MetricsController {
  constructor(private readonly aggregator: MetricsAggregator) {}

  @Get('metrics')
  getMetrics(@Query('window') window?: string): MetricsSnapshot {
    let windowMs: number | undefined;
    if (window === '15m') windowMs = 15 * 60 * 1000;
    else if (window === '5m') windowMs = 5 * 60 * 1000;
    else if (window) {
      const minutes = parseInt(window, 10);
      if (!isNaN(minutes) && minutes > 0) {
        windowMs = minutes * 60 * 1000;
      }
    }
    return this.aggregator.getSnapshot(windowMs);
  }
}
