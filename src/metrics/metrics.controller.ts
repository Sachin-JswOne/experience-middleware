import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { MetricsAggregator } from './metrics.aggregator';
import { MetricsClusterStore } from './metrics.cluster-store';
import { MetricsSampleStore } from './metrics.sample-store';
import { MetricsSnapshot, RouteErrorSample } from './metrics.types';
import { retentionMs } from './metrics.cluster.shared';

const WINDOW_PRESETS: Record<string, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '60m': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

@Controller()
export class MetricsController {
  constructor(
    private readonly aggregator: MetricsAggregator,
    private readonly clusterStore: MetricsClusterStore,
    private readonly sampleStore: MetricsSampleStore,
  ) {}

  @Get('metrics/samples')
  getRouteSamples(
    @Query('route') route?: string,
    @Query('method') method?: string,
  ): { enabled: boolean; samples: RouteErrorSample[] } {
    if (!route || !method) {
      throw new BadRequestException('route and method query params are required');
    }
    return {
      enabled: this.sampleStore.isEnabled(),
      samples: this.sampleStore.getSamples(method.toUpperCase(), route),
    };
  }

  @Get('metrics')
  async getMetrics(
    @Query('window') window?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<MetricsSnapshot> {
    let fromTs: number;
    let toTs: number;

    if (from || to) {
      // Absolute range (epoch ms), Kibana-style.
      fromTs = parseInt(from ?? '', 10);
      toTs = to ? parseInt(to, 10) : Date.now();
      if (isNaN(fromTs) || isNaN(toTs) || fromTs >= toTs) {
        throw new BadRequestException('from/to must be epoch ms with from < to');
      }
      if (toTs - fromTs > retentionMs()) {
        fromTs = toTs - retentionMs();
      }
    } else {
      let windowMs: number | undefined;
      if (window && WINDOW_PRESETS[window]) {
        windowMs = WINDOW_PRESETS[window];
      } else if (window) {
        const minutes = parseInt(window, 10);
        if (!isNaN(minutes) && minutes > 0) {
          windowMs = minutes * 60 * 1000;
        }
      }
      const effectiveWindowMs = Math.min(
        windowMs || this.aggregator.getRetentionMs(),
        retentionMs(),
      );
      toTs = Date.now();
      fromTs = toTs - effectiveWindowMs;
    }

    const localSnapshot = this.aggregator.getSnapshotRange(fromTs, toTs);

    if (this.clusterStore.isEnabled()) {
      const clusterSnapshot = await this.clusterStore.getSnapshotRange(fromTs, toTs);
      if (clusterSnapshot) {
        // Recent errors are only available from the local buffer; counters
        // written to Valkey cannot carry per-request detail.
        clusterSnapshot.recentErrors = localSnapshot.recentErrors;
        return clusterSnapshot;
      }
    }

    return localSnapshot;
  }
}
