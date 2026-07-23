import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MetricsAggregator } from './metrics.aggregator';
import { MetricsAlertsService } from './metrics.alerts.service';
import { MetricsClusterStore } from './metrics.cluster-store';
import { MetricsHealthService } from './metrics.health.service';
import { MetricsSampleStore } from './metrics.sample-store';
import { MetricsAuthGuard } from './metrics.auth.guard';
import {
  AlertConfig,
  AlertHistoryRecord,
  DeployMarker,
  MetricsHealth,
  MetricsSnapshot,
  RouteErrorSample,
  RouteTimelinePoint,
} from './metrics.types';
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

const MAX_SAMPLES_RETURNED = 50;

@Controller()
@UseGuards(MetricsAuthGuard)
export class MetricsController {
  constructor(
    private readonly aggregator: MetricsAggregator,
    private readonly clusterStore: MetricsClusterStore,
    private readonly sampleStore: MetricsSampleStore,
    private readonly healthService: MetricsHealthService,
    private readonly alertsService: MetricsAlertsService,
  ) {}

  @Get('metrics/samples')
  async getRouteSamples(
    @Query('route') route?: string,
    @Query('method') method?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('minMs') minMs?: string,
    @Query('maxMs') maxMs?: string,
  ): Promise<{
    enabled: boolean;
    slowThresholdMs: number;
    // 'cluster' when the shared sample ring contributed (errors/slow from
    // every pod); 'local' when only this pod's store answered.
    source: 'cluster' | 'local';
    samples: RouteErrorSample[];
  }> {
    const base = {
      enabled: this.sampleStore.isEnabled(),
      slowThresholdMs: this.sampleStore.getSlowThresholdMs(),
    };

    const clusterSamples = this.clusterStore.isEnabled()
      ? await this.clusterStore.getClusterSamples()
      : null;

    if (route && method) {
      const methodUpper = method.toUpperCase();
      const local = this.sampleStore.getSamples(methodUpper, route);
      if (!clusterSamples) {
        return { ...base, source: 'local', samples: local.slice(0, MAX_SAMPLES_RETURNED) };
      }
      // Cluster ring carries errors+slow from every pod; successes only
      // exist per-pod. Merge and dedupe (own pod's entries are in both).
      const clusterForRoute = clusterSamples.filter(
        (s) => s.method === methodUpper && s.route === route,
      );
      const merged = dedupeSamples([...clusterForRoute, ...local]);
      return { ...base, source: 'cluster', samples: merged.slice(0, MAX_SAMPLES_RETURNED) };
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
    if (
      (minDurationMs !== undefined && isNaN(minDurationMs)) ||
      (maxDurationMs !== undefined && isNaN(maxDurationMs))
    ) {
      throw new BadRequestException('minMs/maxMs must be numbers');
    }

    const inBand = (s: RouteErrorSample) =>
      s.ts >= fromTs &&
      s.ts <= toTs &&
      (minDurationMs === undefined || s.durationMs >= minDurationMs) &&
      (maxDurationMs === undefined || s.durationMs <= maxDurationMs);

    const local = this.sampleStore.getSamplesInBand({
      fromTs,
      toTs,
      minDurationMs,
      maxDurationMs,
    });
    if (!clusterSamples) {
      return { ...base, source: 'local', samples: local.slice(0, MAX_SAMPLES_RETURNED) };
    }
    const merged = dedupeSamples([...clusterSamples.filter(inBand), ...local]);
    return { ...base, source: 'cluster', samples: merged.slice(0, MAX_SAMPLES_RETURNED) };
  }

  // One route's traffic over time (trend chart in the samples drawer).
  @Get('metrics/route-timeline')
  async getRouteTimeline(
    @Query('route') route?: string,
    @Query('method') method?: string,
    @Query('window') window?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{
    points: RouteTimelinePoint[];
    bucketIntervalMs: number;
    source: 'cluster' | 'local';
  }> {
    if (!route || !method) {
      throw new BadRequestException('route and method query params are required');
    }
    const { fromTs, toTs } = this.resolveRange(window, from, to);
    const methodUpper = method.toUpperCase();

    if (this.clusterStore.isEnabled()) {
      const cluster = await this.clusterStore.getRouteTimeline(methodUpper, route, fromTs, toTs);
      if (cluster) return { ...cluster, source: 'cluster' };
    }
    const local = this.aggregator.getRouteTimeline(methodUpper, route, fromTs, toTs);
    return { points: local.points, bucketIntervalMs: local.bucketIntervalMs, source: 'local' };
  }

  // --- Alert config shared by the dashboard and the webhook evaluator ---

  @Get('metrics/alert-config')
  async getAlertConfig(): Promise<{ shared: boolean; config: AlertConfig | null }> {
    return {
      shared: this.alertsService.isShared(),
      config: await this.alertsService.getConfig(),
    };
  }

  @Put('metrics/alert-config')
  async saveAlertConfig(@Body() body: Partial<AlertConfig>): Promise<AlertConfig> {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('alert config body required');
    }
    return this.alertsService.saveConfig(body as AlertConfig);
  }

  @Get('metrics/alert-history')
  async getAlertHistory(@Query('limit') limit?: string): Promise<AlertHistoryRecord[]> {
    const parsed = limit !== undefined ? parseInt(limit, 10) : 50;
    return this.alertsService.getHistory(isNaN(parsed) ? 50 : Math.min(Math.max(parsed, 1), 100));
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
    const { fromTs, toTs } = this.resolveRange(window, from, to);

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

  // Kibana-style range resolution shared by /metrics and /metrics/route-timeline.
  private resolveRange(
    window?: string,
    from?: string,
    to?: string,
  ): { fromTs: number; toTs: number } {
    if (from || to) {
      const fromTs = parseInt(from ?? '', 10);
      const toTs = to ? parseInt(to, 10) : Date.now();
      if (isNaN(fromTs) || isNaN(toTs) || fromTs >= toTs) {
        throw new BadRequestException('from/to must be epoch ms with from < to');
      }
      return { fromTs: Math.max(fromTs, toTs - retentionMs()), toTs };
    }
    let windowMs: number | undefined;
    if (window && WINDOW_PRESETS[window]) {
      windowMs = WINDOW_PRESETS[window];
    } else if (window) {
      const minutes = parseInt(window, 10);
      if (!isNaN(minutes) && minutes > 0) {
        windowMs = minutes * 60 * 1000;
      }
    }
    const effectiveWindowMs = Math.min(windowMs || this.aggregator.getRetentionMs(), retentionMs());
    const toTs = Date.now();
    return { fromTs: toTs - effectiveWindowMs, toTs };
  }

  private async resolveDeployMarkers(fromTs: number, toTs: number): Promise<DeployMarker[]> {
    if (this.clusterStore.isEnabled()) {
      const markers = await this.clusterStore.getDeployMarkers(fromTs, toTs);
      if (markers) return markers;
    }
    return this.healthService.getLocalDeployMarkers(fromTs, toTs);
  }
}

// Own pod's error/slow samples exist both locally and in the cluster ring.
const dedupeSamples = (samples: RouteErrorSample[]): RouteErrorSample[] => {
  const seen = new Set<string>();
  const out: RouteErrorSample[] = [];
  for (const sample of samples.sort((a, b) => b.ts - a.ts)) {
    const key = `${sample.ts}|${sample.method}|${sample.url}|${sample.statusCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sample);
  }
  return out;
};
