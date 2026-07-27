import type {
  MetricsHealth,
  MetricsSnapshot,
  MetricsSummary,
} from '@/_types/metrics.interface';
import type { AlertThresholds } from './types';

// Rate thresholds on a trickle of requests are noise.
const MIN_SCOPED_REQUESTS = 5;
const MIN_TRAFFIC_BASELINE = 30;

export interface AlertContext {
  previous?: MetricsSummary;
  health?: MetricsHealth;
}

/**
 * Pure threshold evaluation: snapshot + rules in, human-readable breach lines
 * out. No storage, no React — the UI, the notification hook and the tests all
 * call this.
 */
export const evaluateAlerts = (
  snapshot: MetricsSnapshot,
  thresholds: AlertThresholds,
  context: AlertContext = {},
): string[] => {
  // Snoozed: nothing breaches until the mute expires.
  if (thresholds.snoozeUntil !== null && Date.now() < thresholds.snoozeUntil) return [];
  const breaches: string[] = [];
  const { summary } = snapshot;

  if (
    thresholds.alertOnNoData &&
    summary.totalRequests === 0 &&
    context.previous &&
    context.previous.totalRequests >= MIN_TRAFFIC_BASELINE
  ) {
    breaches.push(
      `No traffic in this window (previous window had ${context.previous.totalRequests} requests)`,
    );
  }

  if (summary.totalRequests > 0) {
    if (thresholds.errorRatePct !== null && summary.errorRate >= thresholds.errorRatePct) {
      breaches.push(`Error rate ${summary.errorRate.toFixed(1)}% ≥ ${thresholds.errorRatePct}%`);
    }
    if (thresholds.p99Ms !== null && summary.p99LatencyMs >= thresholds.p99Ms) {
      breaches.push(`P99 latency ${Math.round(summary.p99LatencyMs)}ms ≥ ${thresholds.p99Ms}ms`);
    }

    if (thresholds.targetErrorRatePct !== null) {
      for (const target of snapshot.downstream) {
        if (target.requestCount < MIN_SCOPED_REQUESTS) continue;
        const rate = (target.errorCount / target.requestCount) * 100;
        if (rate >= thresholds.targetErrorRatePct) {
          breaches.push(
            `${target.target} error rate ${rate.toFixed(1)}% ≥ ${thresholds.targetErrorRatePct}%`,
          );
        }
      }
    }

    for (const rule of thresholds.routeRules) {
      const route = snapshot.routeBreakdown.find((r) => `${r.method} ${r.route}` === rule.key);
      if (!route || route.requestCount < MIN_SCOPED_REQUESTS) continue;
      const rate = (route.errorCount / route.requestCount) * 100;
      if (rule.errorRatePct !== null && rate >= rule.errorRatePct) {
        breaches.push(`${rule.key} error rate ${rate.toFixed(1)}% ≥ ${rule.errorRatePct}%`);
      }
      if (
        rule.p95Ms !== null &&
        route.p95LatencyMs !== undefined &&
        route.p95LatencyMs >= rule.p95Ms
      ) {
        breaches.push(`${rule.key} p95 ${Math.round(route.p95LatencyMs)}ms ≥ ${rule.p95Ms}ms`);
      }
    }

    for (const rule of thresholds.targetRules) {
      const target = snapshot.downstream.find((d) => d.target === rule.target);
      if (!target || target.requestCount < MIN_SCOPED_REQUESTS) continue;
      const rate = (target.errorCount / target.requestCount) * 100;
      if (rule.errorRatePct !== null && rate >= rule.errorRatePct) {
        breaches.push(`${rule.target} error rate ${rate.toFixed(1)}% ≥ ${rule.errorRatePct}%`);
      }
      if (rule.avgLatencyMs !== null && target.avgLatencyMs >= rule.avgLatencyMs) {
        breaches.push(
          `${rule.target} avg latency ${Math.round(target.avgLatencyMs)}ms ≥ ${rule.avgLatencyMs}ms`,
        );
      }
    }
  }

  if (
    thresholds.trafficDropPct !== null &&
    context.previous &&
    context.previous.totalRequests >= MIN_TRAFFIC_BASELINE
  ) {
    const drop =
      ((context.previous.totalRequests - summary.totalRequests) / context.previous.totalRequests) *
      100;
    if (drop >= thresholds.trafficDropPct) {
      breaches.push(
        `Traffic dropped ${drop.toFixed(0)}% vs previous window (${summary.totalRequests} vs ${context.previous.totalRequests})`,
      );
    }
  }

  if (thresholds.eventLoopLagP99Ms !== null && context.health) {
    for (const pod of context.health.cluster.length > 0
      ? context.health.cluster
      : [context.health.pod]) {
      if (pod.eventLoopLagP99Ms >= thresholds.eventLoopLagP99Ms) {
        breaches.push(
          `${pod.pod} event-loop lag p99 ${pod.eventLoopLagP99Ms}ms ≥ ${thresholds.eventLoopLagP99Ms}ms`,
        );
      }
    }
  }

  if (thresholds.valkeyUnavailable && context.health?.valkey === 'unavailable') {
    breaches.push('Valkey unavailable — metrics degraded to per-pod view');
  }

  return breaches;
};

/** True when any rule is armed — drives the bell icon's active state. */
export const hasActiveRules = (thresholds: AlertThresholds): boolean =>
  thresholds.errorRatePct !== null ||
  thresholds.p99Ms !== null ||
  thresholds.trafficDropPct !== null ||
  thresholds.eventLoopLagP99Ms !== null ||
  thresholds.valkeyUnavailable ||
  thresholds.routeRules.length > 0 ||
  thresholds.targetRules.length > 0;
