import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { ValkeyClient } from '../cache/valkey/valkey.client';
import { MetricsAggregator } from './metrics.aggregator';
import { MetricsClusterStore } from './metrics.cluster-store';
import { isClusterEnabled, keyPrefix, podName } from './metrics.cluster.shared';
import { MetricsSnapshot } from './metrics.types';

const DEFAULT_EVAL_INTERVAL_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 15 * 60_000;
const DEFAULT_WINDOW_MS = 5 * 60_000;
// Below this traffic level rates are noise, not signal.
const DEFAULT_MIN_REQUESTS = 10;

export interface AlertBreach {
  kind: string;
  message: string;
}

/**
 * Server-side alerting: evaluates the last few minutes of traffic against
 * env-configured thresholds and posts breaches to a webhook (Slack and Teams
 * both accept the `{ text }` payload). Browser notifications only work while
 * someone has the dashboard open — this fires regardless.
 *
 * Enabled by setting METRICS_ALERT_WEBHOOK_URL. Thresholds:
 *   METRICS_ALERT_ERROR_RATE_PCT   e.g. 5   (error rate ≥ 5%)
 *   METRICS_ALERT_P99_MS           e.g. 2000 (p99 latency ≥ 2s)
 *   METRICS_ALERT_TARGET_ERROR_RATE_PCT  per-downstream-target error rate
 * Tuning: METRICS_ALERT_EVAL_INTERVAL_MS, METRICS_ALERT_WINDOW_MS,
 * METRICS_ALERT_COOLDOWN_MS, METRICS_ALERT_MIN_REQUESTS.
 *
 * In cluster mode every pod evaluates the same shared snapshot; a Valkey
 * SET NX cooldown key makes sure only one of them posts each breach.
 */
@Injectable()
export class MetricsAlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsAlertsService.name);
  private readonly webhookUrl = process.env.METRICS_ALERT_WEBHOOK_URL;
  private readonly errorRatePct = envNumber('METRICS_ALERT_ERROR_RATE_PCT');
  private readonly p99Ms = envNumber('METRICS_ALERT_P99_MS');
  private readonly targetErrorRatePct = envNumber('METRICS_ALERT_TARGET_ERROR_RATE_PCT');
  private readonly evalIntervalMs = envNumber('METRICS_ALERT_EVAL_INTERVAL_MS') ?? DEFAULT_EVAL_INTERVAL_MS;
  private readonly windowMs = envNumber('METRICS_ALERT_WINDOW_MS') ?? DEFAULT_WINDOW_MS;
  private readonly cooldownMs = envNumber('METRICS_ALERT_COOLDOWN_MS') ?? DEFAULT_COOLDOWN_MS;
  private readonly minRequests = envNumber('METRICS_ALERT_MIN_REQUESTS') ?? DEFAULT_MIN_REQUESTS;

  private timer?: NodeJS.Timeout;
  // Local-mode cooldown fallback (no Valkey to coordinate through).
  private localCooldowns = new Map<string, number>();

  constructor(
    private readonly aggregator: MetricsAggregator,
    private readonly clusterStore: MetricsClusterStore,
    private readonly valkeyClient: ValkeyClient,
  ) {}

  onModuleInit(): void {
    if (!this.webhookUrl) return;
    if (this.errorRatePct === undefined && this.p99Ms === undefined && this.targetErrorRatePct === undefined) {
      this.logger.warn(
        'METRICS_ALERT_WEBHOOK_URL is set but no thresholds are configured — alerting disabled',
      );
      return;
    }
    this.timer = setInterval(() => void this.evaluate(), this.evalIntervalMs);
    this.timer.unref?.();
    this.logger.log(
      `Metrics alerting enabled (window ${this.windowMs / 1000}s, every ${this.evalIntervalMs / 1000}s)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Exposed for tests.
  computeBreaches(snapshot: MetricsSnapshot): AlertBreach[] {
    const breaches: AlertBreach[] = [];
    const { summary } = snapshot;
    if (summary.totalRequests < this.minRequests) return breaches;

    if (this.errorRatePct !== undefined && summary.errorRate >= this.errorRatePct) {
      breaches.push({
        kind: 'error-rate',
        message: `Error rate ${summary.errorRate.toFixed(1)}% ≥ ${this.errorRatePct}% (${summary.totalRequests} req)`,
      });
    }
    if (this.p99Ms !== undefined && summary.p99LatencyMs >= this.p99Ms) {
      breaches.push({
        kind: 'p99-latency',
        message: `P99 latency ${Math.round(summary.p99LatencyMs)}ms ≥ ${this.p99Ms}ms`,
      });
    }
    if (this.targetErrorRatePct !== undefined) {
      for (const target of snapshot.downstream) {
        if (target.requestCount < this.minRequests) continue;
        const rate = (target.errorCount / target.requestCount) * 100;
        if (rate >= this.targetErrorRatePct) {
          breaches.push({
            kind: `target-error-rate:${target.target}`,
            message: `Downstream ${target.target} error rate ${rate.toFixed(1)}% ≥ ${this.targetErrorRatePct}% (${target.requestCount} calls)`,
          });
        }
      }
    }
    return breaches;
  }

  private async evaluate(): Promise<void> {
    try {
      const snapshot = await this.getSnapshot();
      if (!snapshot) return;
      const breaches = this.computeBreaches(snapshot);
      for (const breach of breaches) {
        if (await this.acquireCooldown(breach.kind)) {
          await this.post(`🚨 [${podName()}] ${breach.message} (last ${this.windowMs / 60_000}m)`);
        }
      }
    } catch (error) {
      this.logger.warn(`Alert evaluation failed: ${(error as Error).message}`);
    }
  }

  private async getSnapshot(): Promise<MetricsSnapshot | null> {
    if (this.clusterStore.isEnabled()) {
      const cluster = await this.clusterStore.getSnapshot(this.windowMs);
      if (cluster) return cluster;
    }
    return this.aggregator.getSnapshot(this.windowMs);
  }

  // True when this pod should post the breach: first to claim it since the
  // cooldown started. Cluster mode uses a Valkey NX key so exactly one pod
  // wins; local mode falls back to an in-memory timestamp.
  private async acquireCooldown(kind: string): Promise<boolean> {
    if (isClusterEnabled()) {
      const key = `${keyPrefix()}:alert-cooldown:${hashKind(kind)}`;
      const acquired = await this.valkeyClient.execute((client) =>
        client.set(key, podName(), 'PX', this.cooldownMs, 'NX'),
      );
      // Valkey down → fall back to local cooldown rather than going silent.
      if (acquired !== null) return acquired === 'OK';
    }
    const now = Date.now();
    const last = this.localCooldowns.get(kind) ?? 0;
    if (now - last < this.cooldownMs) return false;
    this.localCooldowns.set(kind, now);
    return true;
  }

  private async post(text: string): Promise<void> {
    if (!this.webhookUrl) return;
    try {
      await axios.post(this.webhookUrl, { text }, { timeout: 5_000 });
      this.logger.log(`Alert posted: ${text}`);
    } catch (error) {
      this.logger.warn(`Alert webhook failed: ${(error as Error).message}`);
    }
  }
}

const envNumber = (name: string): number | undefined => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return isNaN(value) ? undefined : value;
};

// Target names can contain characters unfriendly to key parsing — flatten.
const hashKind = (kind: string): string => kind.replace(/[^a-zA-Z0-9:_-]/g, '_');
