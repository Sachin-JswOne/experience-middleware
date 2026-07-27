/** Scoped rule: key is "<METHOD> <route>". */
export interface RouteAlertRule {
  key: string;
  errorRatePct: number | null;
  p95Ms: number | null;
}

/** Scoped rule for a downstream target. */
export interface TargetAlertRule {
  target: string;
  errorRatePct: number | null;
  avgLatencyMs: number | null;
}

export interface AlertThresholds {
  errorRatePct: number | null;
  p99Ms: number | null;
  // Blanket per-downstream-target error rate.
  targetErrorRatePct: number | null;
  // Total requests dropped by ≥ this % vs the previous window (traffic loss).
  trafficDropPct: number | null;
  // Availability SLO for the server-side burn-rate alert (webhook only —
  // burn needs two windows, evaluated by the backend).
  sloAvailabilityPct: number | null;
  // Alert when traffic flatlines to zero while the previous window had it.
  alertOnNoData: boolean;
  // Epoch ms until which all alerting is muted (banner, notifications and
  // the server webhook when shared).
  snoozeUntil: number | null;
  // Any pod's event-loop lag p99 at or above this (needs the health feed).
  eventLoopLagP99Ms: number | null;
  // Alert when the cluster store is enabled but unreachable.
  valkeyUnavailable: boolean;
  notify: boolean;
  routeRules: RouteAlertRule[];
  targetRules: TargetAlertRule[];
}

export interface AlertHistoryEntry {
  ts: number;
  breaches: string[];
}

export const defaultThresholds: AlertThresholds = {
  errorRatePct: null,
  p99Ms: null,
  targetErrorRatePct: null,
  trafficDropPct: null,
  sloAvailabilityPct: null,
  alertOnNoData: false,
  snoozeUntil: null,
  eventLoopLagP99Ms: null,
  valkeyUnavailable: false,
  notify: false,
  routeRules: [],
  targetRules: [],
};
