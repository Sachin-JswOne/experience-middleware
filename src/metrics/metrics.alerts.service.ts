import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { ValkeyClient } from '../cache/valkey/valkey.client';
import { MetricsAggregator } from './metrics.aggregator';
import { MetricsClusterStore } from './metrics.cluster-store';
import { isClusterEnabled, keyPrefix, podName } from './metrics.cluster.shared';
import { AlertConfig, AlertHistoryRecord, MetricsSnapshot } from './metrics.types';

const DEFAULT_EVAL_INTERVAL_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 15 * 60_000;
const DEFAULT_WINDOW_MS = 5 * 60_000;
// Below this traffic level rates are noise, not signal.
const DEFAULT_MIN_REQUESTS = 10;

// Multiwindow burn-rate factors (Google SRE workbook defaults): page when
// the error budget burns ≥14.4× on the fast window AND ≥6× on the slow one.
const BURN_FAST_WINDOW_MS = 5 * 60_000;
const BURN_SLOW_WINDOW_MS = 60 * 60_000;
const BURN_FAST_FACTOR = 14.4;
const BURN_SLOW_FACTOR = 6;

const CONFIG_KEY_SUFFIX = 'alert-config';
const HISTORY_KEY_SUFFIX = 'alert-history';
const HISTORY_MAX = 100;
const HISTORY_TTL_SEC = 30 * 24 * 60 * 60;

export interface AlertBreach {
  kind: string;
  message: string;
}

export const emptyAlertConfig = (): AlertConfig => ({
  errorRatePct: null,
  p99Ms: null,
  targetErrorRatePct: null,
  trafficDropPct: null,
  sloAvailabilityPct: null,
  alertOnNoData: false,
  snoozeUntil: null,
  routeRules: [],
  targetRules: [],
  updatedAt: 0,
});

/**
 * Server-side alerting: evaluates recent traffic against the shared alert
 * config (Valkey; env vars fill in until one is saved from the dashboard)
 * and posts breaches to a webhook (Slack and Teams both accept `{ text }`).
 * Browser notifications only work while someone has the dashboard open —
 * this fires regardless.
 *
 * Enabled by setting METRICS_ALERT_WEBHOOK_URL. Env fallback thresholds:
 *   METRICS_ALERT_ERROR_RATE_PCT, METRICS_ALERT_P99_MS,
 *   METRICS_ALERT_TARGET_ERROR_RATE_PCT, METRICS_ALERT_TRAFFIC_DROP_PCT,
 *   METRICS_ALERT_SLO_AVAILABILITY_PCT
 * Tuning: METRICS_ALERT_EVAL_INTERVAL_MS, METRICS_ALERT_WINDOW_MS,
 * METRICS_ALERT_COOLDOWN_MS, METRICS_ALERT_MIN_REQUESTS.
 *
 * In cluster mode every pod evaluates the same shared snapshot; a Valkey
 * SET NX cooldown key makes sure only one of them posts each breach. Posted
 * breaches also land in a shared history list the dashboard can read.
 */
@Injectable()
export class MetricsAlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsAlertsService.name);
  private readonly webhookUrl = process.env.METRICS_ALERT_WEBHOOK_URL;
  private readonly evalIntervalMs =
    envNumber('METRICS_ALERT_EVAL_INTERVAL_MS') ?? DEFAULT_EVAL_INTERVAL_MS;
  private readonly windowMs = envNumber('METRICS_ALERT_WINDOW_MS') ?? DEFAULT_WINDOW_MS;
  private readonly cooldownMs = envNumber('METRICS_ALERT_COOLDOWN_MS') ?? DEFAULT_COOLDOWN_MS;
  private readonly minRequests = envNumber('METRICS_ALERT_MIN_REQUESTS') ?? DEFAULT_MIN_REQUESTS;

  private timer?: NodeJS.Timeout;
  // Local-mode fallbacks (no Valkey to coordinate through).
  private localCooldowns = new Map<string, number>();
  private localConfig: AlertConfig | null = null;
  private localHistory: AlertHistoryRecord[] = [];

  constructor(
    private readonly aggregator: MetricsAggregator,
    private readonly clusterStore: MetricsClusterStore,
    private readonly valkeyClient: ValkeyClient,
  ) {}

  onModuleInit(): void {
    if (!this.webhookUrl) return;
    this.timer = setInterval(() => void this.evaluate(), this.evalIntervalMs);
    this.timer.unref?.();
    this.logger.log(
      `Metrics alerting enabled (window ${this.windowMs / 1000}s, every ${this.evalIntervalMs / 1000}s)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // --- Shared config store ----------------------------------------------

  // True when the config lives in Valkey and is shared across pods and
  // browsers; false means per-process fallback only.
  isShared(): boolean {
    return isClusterEnabled();
  }

  async getConfig(): Promise<AlertConfig | null> {
    if (isClusterEnabled()) {
      const raw = await this.valkeyClient.execute((client) =>
        client.get(`${keyPrefix()}:${CONFIG_KEY_SUFFIX}`),
      );
      if (raw) {
        try {
          return { ...emptyAlertConfig(), ...(JSON.parse(raw) as Partial<AlertConfig>) };
        } catch {
          this.logger.warn('Stored alert config is malformed — ignoring');
        }
      }
      if (raw !== null) return null;
    }
    return this.localConfig;
  }

  async saveConfig(config: AlertConfig): Promise<AlertConfig> {
    const next: AlertConfig = { ...emptyAlertConfig(), ...config, updatedAt: Date.now() };
    this.localConfig = next;
    if (isClusterEnabled()) {
      await this.valkeyClient.executeWrite((client) =>
        client.set(`${keyPrefix()}:${CONFIG_KEY_SUFFIX}`, JSON.stringify(next)),
      );
    }
    return next;
  }

  async getHistory(limit = 50): Promise<AlertHistoryRecord[]> {
    if (isClusterEnabled()) {
      const entries = await this.valkeyClient.execute((client) =>
        client.lrange(`${keyPrefix()}:${HISTORY_KEY_SUFFIX}`, 0, limit - 1),
      );
      if (entries) {
        const records: AlertHistoryRecord[] = [];
        for (const entry of entries) {
          try {
            records.push(JSON.parse(entry) as AlertHistoryRecord);
          } catch {
            // Skip malformed entries.
          }
        }
        return records;
      }
    }
    return this.localHistory.slice(0, limit);
  }

  // --- Evaluation ---------------------------------------------------------

  // Effective config: stored one, else env fallbacks.
  async effectiveConfig(): Promise<AlertConfig> {
    const stored = await this.getConfig();
    if (stored) return stored;
    return {
      ...emptyAlertConfig(),
      errorRatePct: envNumber('METRICS_ALERT_ERROR_RATE_PCT') ?? null,
      p99Ms: envNumber('METRICS_ALERT_P99_MS') ?? null,
      targetErrorRatePct: envNumber('METRICS_ALERT_TARGET_ERROR_RATE_PCT') ?? null,
      trafficDropPct: envNumber('METRICS_ALERT_TRAFFIC_DROP_PCT') ?? null,
      sloAvailabilityPct: envNumber('METRICS_ALERT_SLO_AVAILABILITY_PCT') ?? null,
    };
  }

  // Pure threshold evaluation over one snapshot (+ optional previous window
  // for traffic-drop). Burn-rate runs separately — it needs two windows.
  computeBreaches(
    snapshot: MetricsSnapshot,
    config: AlertConfig,
    previous?: MetricsSnapshot,
  ): AlertBreach[] {
    const breaches: AlertBreach[] = [];
    const { summary } = snapshot;

    if (summary.totalRequests >= this.minRequests) {
      if (config.errorRatePct !== null && summary.errorRate >= config.errorRatePct) {
        breaches.push({
          kind: 'error-rate',
          message: `Error rate ${summary.errorRate.toFixed(1)}% ≥ ${config.errorRatePct}% (${summary.totalRequests} req)`,
        });
      }
      if (config.p99Ms !== null && summary.p99LatencyMs >= config.p99Ms) {
        breaches.push({
          kind: 'p99-latency',
          message: `P99 latency ${Math.round(summary.p99LatencyMs)}ms ≥ ${config.p99Ms}ms`,
        });
      }
      if (config.targetErrorRatePct !== null) {
        for (const target of snapshot.downstream) {
          if (target.requestCount < this.minRequests) continue;
          const rate = (target.errorCount / target.requestCount) * 100;
          if (rate >= config.targetErrorRatePct) {
            breaches.push({
              kind: `target-error-rate:${target.target}`,
              message: `Downstream ${target.target} error rate ${rate.toFixed(1)}% ≥ ${config.targetErrorRatePct}% (${target.requestCount} calls)`,
            });
          }
        }
      }

      for (const rule of config.routeRules) {
        const route = snapshot.routeBreakdown.find((r) => `${r.method} ${r.route}` === rule.key);
        if (!route || route.requestCount < this.minRequests) continue;
        const rate = (route.errorCount / route.requestCount) * 100;
        if (rule.errorRatePct !== null && rate >= rule.errorRatePct) {
          breaches.push({
            kind: `route-err:${rule.key}`,
            message: `${rule.key} error rate ${rate.toFixed(1)}% ≥ ${rule.errorRatePct}%`,
          });
        }
        if (
          rule.p95Ms !== null &&
          route.p95LatencyMs !== undefined &&
          route.p95LatencyMs >= rule.p95Ms
        ) {
          breaches.push({
            kind: `route-p95:${rule.key}`,
            message: `${rule.key} p95 ${Math.round(route.p95LatencyMs)}ms ≥ ${rule.p95Ms}ms`,
          });
        }
      }

      for (const rule of config.targetRules) {
        const target = snapshot.downstream.find((d) => d.target === rule.target);
        if (!target || target.requestCount < this.minRequests) continue;
        const rate = (target.errorCount / target.requestCount) * 100;
        if (rule.errorRatePct !== null && rate >= rule.errorRatePct) {
          breaches.push({
            kind: `target-err:${rule.target}`,
            message: `${rule.target} error rate ${rate.toFixed(1)}% ≥ ${rule.errorRatePct}%`,
          });
        }
        if (rule.avgLatencyMs !== null && target.avgLatencyMs >= rule.avgLatencyMs) {
          breaches.push({
            kind: `target-avg:${rule.target}`,
            message: `${rule.target} avg latency ${Math.round(target.avgLatencyMs)}ms ≥ ${rule.avgLatencyMs}ms`,
          });
        }
      }
    }

    // Zero traffic where the previous window had plenty: a dead ingress or a
    // broken rollout reports "no errors" — the absence itself is the alert.
    if (
      config.alertOnNoData &&
      summary.totalRequests === 0 &&
      previous &&
      previous.summary.totalRequests >= this.minRequests * 3
    ) {
      breaches.push({
        kind: 'no-data',
        message: `No traffic in the last window (previous window had ${previous.summary.totalRequests} requests)`,
      });
    }

    if (
      config.trafficDropPct !== null &&
      previous &&
      previous.summary.totalRequests >= this.minRequests * 3
    ) {
      const drop =
        ((previous.summary.totalRequests - summary.totalRequests) /
          previous.summary.totalRequests) *
        100;
      if (drop >= config.trafficDropPct) {
        breaches.push({
          kind: 'traffic-drop',
          message: `Traffic dropped ${drop.toFixed(0)}% vs previous window (${summary.totalRequests} vs ${previous.summary.totalRequests})`,
        });
      }
    }

    return breaches;
  }

  // Multiwindow burn rate: error budget consumption speed on a fast and a
  // slow window must BOTH exceed their factors — fast alone is too twitchy,
  // slow alone pages hours late.
  computeBurnBreach(
    fast: MetricsSnapshot,
    slow: MetricsSnapshot,
    sloAvailabilityPct: number,
  ): AlertBreach | null {
    const budgetPct = 100 - sloAvailabilityPct;
    if (budgetPct <= 0) return null;
    if (fast.summary.totalRequests < this.minRequests) return null;
    const fastBurn = fast.summary.errorRate / budgetPct;
    const slowBurn = slow.summary.errorRate / budgetPct;
    if (fastBurn >= BURN_FAST_FACTOR && slowBurn >= BURN_SLOW_FACTOR) {
      return {
        kind: 'slo-burn',
        message: `SLO ${sloAvailabilityPct}% burning fast: ${fastBurn.toFixed(1)}× budget over 5m, ${slowBurn.toFixed(1)}× over 1h`,
      };
    }
    return null;
  }

  private async evaluate(): Promise<void> {
    try {
      const config = await this.effectiveConfig();
      // Snoozed: evaluate nothing so cooldowns don't burn while muted.
      if (config.snoozeUntil !== null && Date.now() < config.snoozeUntil) return;
      const snapshot = await this.getSnapshot(this.windowMs);
      if (!snapshot) return;

      let previous: MetricsSnapshot | undefined;
      if (config.trafficDropPct !== null || config.alertOnNoData) {
        previous = (await this.getPreviousSnapshot(this.windowMs)) ?? undefined;
      }

      const breaches = this.computeBreaches(snapshot, config, previous);

      if (config.sloAvailabilityPct !== null) {
        const fast = await this.getSnapshot(BURN_FAST_WINDOW_MS);
        const slow = await this.getSnapshot(BURN_SLOW_WINDOW_MS);
        if (fast && slow) {
          const burn = this.computeBurnBreach(fast, slow, config.sloAvailabilityPct);
          if (burn) breaches.push(burn);
        }
      }

      for (const breach of breaches) {
        if (await this.acquireCooldown(breach.kind)) {
          await this.recordHistory(breach);
          await this.post(`🚨 [${podName()}] ${breach.message} (last ${this.windowMs / 60_000}m)`);
        }
      }
    } catch (error) {
      this.logger.warn(`Alert evaluation failed: ${(error as Error).message}`);
    }
  }

  private async getSnapshot(windowMs: number): Promise<MetricsSnapshot | null> {
    if (this.clusterStore.isEnabled()) {
      const cluster = await this.clusterStore.getSnapshot(windowMs);
      if (cluster) return cluster;
    }
    return this.aggregator.getSnapshot(windowMs);
  }

  private async getPreviousSnapshot(windowMs: number): Promise<MetricsSnapshot | null> {
    const to = Date.now() - windowMs;
    if (this.clusterStore.isEnabled()) {
      const cluster = await this.clusterStore.getSnapshotRange(to - windowMs, to);
      if (cluster) return cluster;
    }
    return this.aggregator.getSnapshotRange(to - windowMs, to);
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

  private async recordHistory(breach: AlertBreach): Promise<void> {
    const record: AlertHistoryRecord = {
      ts: Date.now(),
      kind: breach.kind,
      message: breach.message,
      pod: podName(),
    };
    this.localHistory.unshift(record);
    this.localHistory = this.localHistory.slice(0, HISTORY_MAX);
    if (!isClusterEnabled()) return;
    await this.valkeyClient.executeWrite(async (client) => {
      const key = `${keyPrefix()}:${HISTORY_KEY_SUFFIX}`;
      const pipeline = client.pipeline();
      pipeline.lpush(key, JSON.stringify(record));
      pipeline.ltrim(key, 0, HISTORY_MAX - 1);
      pipeline.expire(key, HISTORY_TTL_SEC);
      await pipeline.exec();
    });
  }

  private async post(text: string): Promise<void> {
    if (!this.webhookUrl) return;
    // Slack and Teams both render `{ text }`; a dashboard link (when
    // configured) turns the ping into one click to the graphs.
    const dashboardUrl = process.env.METRICS_DASHBOARD_URL;
    const body = dashboardUrl ? `${text}\n${dashboardUrl}` : text;
    try {
      await axios.post(this.webhookUrl, { text: body }, { timeout: 5_000 });
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

// Rule kinds embed route/target names — flatten for key safety.
const hashKind = (kind: string): string => kind.replace(/[^a-zA-Z0-9:_-]/g, '_');
