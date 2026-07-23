import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MetricsAggregator } from './metrics.aggregator';
import { MetricsClusterStore } from './metrics.cluster-store';
import { MetricsHealthService } from './metrics.health.service';
import { MetricsSampleStore } from './metrics.sample-store';
import { MetricsAuthGuard } from './metrics.auth.guard';
import { DeployMarker, MetricsHealth, MetricsSnapshot, RouteErrorSample } from './metrics.types';
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
  '14d': 14 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

@Controller()
@UseGuards(MetricsAuthGuard)
export class MetricsController {
  constructor(
    private readonly aggregator: MetricsAggregator,
    private readonly clusterStore: MetricsClusterStore,
    private readonly sampleStore: MetricsSampleStore,
    private readonly healthService: MetricsHealthService,
  ) {}

  @Get('metrics/samples')
  getRouteSamples(
    @Query('route') route?: string,
    @Query('method') method?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('minMs') minMs?: string,
    @Query('maxMs') maxMs?: string,
  ): { enabled: boolean; slowThresholdMs: number; samples: RouteErrorSample[] } {
    const base = {
      enabled: this.sampleStore.isEnabled(),
      slowThresholdMs: this.sampleStore.getSlowThresholdMs(),
    };
    if (route && method) {
      return { ...base, samples: this.sampleStore.getSamples(method.toUpperCase(), route) };
    }
    // Band mode (heatmap drill-through): all routes, time window + latency band.
    const fromTs = parseInt(from ?? '', 10);
    const toTs = parseInt(to ?? '', 10);
    if (isNaN(fromTs) || isNaN(toTs) || fromTs >= toTs) {
      throw new BadRequestException(
        'either route+method or from/to (epoch ms, from < to) query params are required',
      );
    }
    const minDurationMs = minMs !== undefined ? Number(minMs) : undefined;
    const maxDurationMs = maxMs !== undefined ? Number(maxMs) : undefined;
    if ((minDurationMs !== undefined && isNaN(minDurationMs)) ||
        (maxDurationMs !== undefined && isNaN(maxDurationMs))) {
      throw new BadRequestException('minMs/maxMs must be numbers');
    }
    return {
      ...base,
      samples: this.sampleStore.getSamplesInBand({
        fromTs,
        toTs,
        minDurationMs,
        maxDurationMs,
      }),
    };
  }

  @Get('metrics/health')
  async getHealth(): Promise<MetricsHealth> {
    return this.healthService.getHealth();
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
    let snapshot = localSnapshot;

    if (this.clusterStore.isEnabled()) {
      const clusterSnapshot = await this.clusterStore.getSnapshotRange(fromTs, toTs);
      if (clusterSnapshot) {
        // Prefer the cluster-wide error feed; fall back to this pod's buffer
        // when Valkey can't serve it.
        const clusterErrors = await this.clusterStore.getRecentErrors(fromTs, toTs);
        clusterSnapshot.recentErrors =
          clusterErrors && clusterErrors.length > 0 ? clusterErrors : localSnapshot.recentErrors;
        snapshot = clusterSnapshot;
      }
    }

    snapshot.deployMarkers = await this.resolveDeployMarkers(fromTs, toTs);
    return snapshot;
  }

  private async resolveDeployMarkers(fromTs: number, toTs: number): Promise<DeployMarker[]> {
    if (this.clusterStore.isEnabled()) {
      const markers = await this.clusterStore.getDeployMarkers(fromTs, toTs);
      if (markers) return markers;
    }
    return this.healthService.getLocalDeployMarkers(fromTs, toTs);
  }
}
