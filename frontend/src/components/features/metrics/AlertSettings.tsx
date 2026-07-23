import { useEffect, useRef, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  IconButton,
  Popover,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type {
  AlertConfig,
  AlertHistoryRecord,
  MetricsHealth,
  MetricsSnapshot,
  MetricsSummary,
} from '@/_types/metrics.interface';
import LocalStorage from '@/utils/LocalStorage';
import { tokens } from '@/styles/theme';
import { formatTs } from './chartShared';

// Scoped rules: key is "<METHOD> <route>" / a downstream target name.
export interface RouteAlertRule {
  key: string;
  errorRatePct: number | null;
  p95Ms: number | null;
}

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
  // Any pod's event-loop lag p99 at or above this (needs the health feed).
  eventLoopLagP99Ms: number | null;
  // Alert when the cluster store is enabled but unreachable.
  valkeyUnavailable: boolean;
  notify: boolean;
  routeRules: RouteAlertRule[];
  targetRules: TargetAlertRule[];
}

// Fields shared with the server-side webhook evaluator (stored in Valkey).
// Browser-only signals (notify, loop lag, valkey) stay in localStorage.
export const toServerConfig = (thresholds: AlertThresholds): AlertConfig => ({
  errorRatePct: thresholds.errorRatePct,
  p99Ms: thresholds.p99Ms,
  targetErrorRatePct: thresholds.targetErrorRatePct,
  trafficDropPct: thresholds.trafficDropPct,
  sloAvailabilityPct: thresholds.sloAvailabilityPct,
  routeRules: thresholds.routeRules,
  targetRules: thresholds.targetRules,
  updatedAt: 0,
});

export const mergeServerConfig = (
  base: AlertThresholds,
  config: AlertConfig,
): AlertThresholds => ({
  ...base,
  errorRatePct: config.errorRatePct,
  p99Ms: config.p99Ms,
  targetErrorRatePct: config.targetErrorRatePct,
  trafficDropPct: config.trafficDropPct,
  sloAvailabilityPct: config.sloAvailabilityPct,
  routeRules: config.routeRules ?? [],
  targetRules: config.targetRules ?? [],
});

const STORAGE_KEY = 'metricsAlertThresholds';
const HISTORY_KEY = 'metricsAlertHistory';
const HISTORY_MAX = 50;
// Rate thresholds on a trickle of requests are noise.
const MIN_SCOPED_REQUESTS = 5;
const MIN_TRAFFIC_BASELINE = 30;

export const defaultThresholds: AlertThresholds = {
  errorRatePct: null,
  p99Ms: null,
  targetErrorRatePct: null,
  trafficDropPct: null,
  sloAvailabilityPct: null,
  eventLoopLagP99Ms: null,
  valkeyUnavailable: false,
  notify: false,
  routeRules: [],
  targetRules: [],
};

export const loadThresholds = (): AlertThresholds => {
  const stored = LocalStorage.getItem(STORAGE_KEY);
  if (stored && typeof stored === 'object') {
    // Older saves lack the newer fields — defaults fill them in.
    return { ...defaultThresholds, ...(stored as Partial<AlertThresholds>) };
  }
  return defaultThresholds;
};

export interface AlertContext {
  previous?: MetricsSummary;
  health?: MetricsHealth;
}

export const evaluateAlerts = (
  snapshot: MetricsSnapshot,
  thresholds: AlertThresholds,
  context: AlertContext = {},
): string[] => {
  const breaches: string[] = [];
  const { summary } = snapshot;

  if (summary.totalRequests > 0) {
    if (thresholds.errorRatePct !== null && summary.errorRate >= thresholds.errorRatePct) {
      breaches.push(`Error rate ${summary.errorRate.toFixed(1)}% ≥ ${thresholds.errorRatePct}%`);
    }
    if (thresholds.p99Ms !== null && summary.p99LatencyMs >= thresholds.p99Ms) {
      breaches.push(
        `P99 latency ${Math.round(summary.p99LatencyMs)}ms ≥ ${thresholds.p99Ms}ms`,
      );
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
      ((context.previous.totalRequests - summary.totalRequests) /
        context.previous.totalRequests) *
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

// --- Breach history (localStorage ring) --------------------------------

export interface AlertHistoryEntry {
  ts: number;
  breaches: string[];
}

export const loadAlertHistory = (): AlertHistoryEntry[] => {
  const stored = LocalStorage.getItem(HISTORY_KEY);
  return Array.isArray(stored) ? (stored as AlertHistoryEntry[]) : [];
};

const appendAlertHistory = (breaches: string[]): void => {
  const history = [{ ts: Date.now(), breaches }, ...loadAlertHistory()].slice(0, HISTORY_MAX);
  LocalStorage.setItem(HISTORY_KEY, history);
};

const clearAlertHistory = (): void => {
  LocalStorage.setItem(HISTORY_KEY, []);
};

// Fires a browser notification (and records history) when a breach appears
// that wasn't present on the previous snapshot (edge-triggered, not on every
// poll).
export const useAlertNotifications = (breaches: string[], thresholds: AlertThresholds) => {
  const previous = useRef<string>('');
  useEffect(() => {
    const signature = breaches.join('|');
    const isNew = signature && signature !== previous.current;
    previous.current = signature;
    if (!isNew) return;
    appendAlertHistory(breaches);
    if (!thresholds.notify) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification('Observability alert', { body: breaches.join('\n') });
  }, [breaches, thresholds.notify]);
};

// --- Settings UI --------------------------------------------------------

interface Props {
  thresholds: AlertThresholds;
  onChange: (thresholds: AlertThresholds) => void;
  breached: boolean;
  routeOptions: string[];
  targetOptions: string[];
  utc?: boolean;
  // True when the config is shared via the backend (cluster mode) — edits
  // are pushed there so the webhook evaluator uses the same rules.
  shared?: boolean;
  onPersistServer?: (config: AlertConfig) => void;
  // Server-side breach log (webhook posts). Shown instead of the local
  // browser history when available.
  serverHistory?: AlertHistoryRecord[] | null;
}

const numberOrNull = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return isNaN(value) || value <= 0 ? null : value;
};

const NumberField = ({
  label,
  value,
  onChange,
  width,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  width?: number;
}) => (
  <TextField
    label={label}
    type="number"
    size="small"
    fullWidth={width === undefined}
    value={value ?? ''}
    onChange={(e) => onChange(numberOrNull(e.target.value))}
    sx={width !== undefined ? { width } : undefined}
  />
);

const AlertSettings = ({
  thresholds,
  onChange,
  breached,
  routeOptions,
  targetOptions,
  utc,
  shared,
  onPersistServer,
  serverHistory,
}: Props) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [history, setHistory] = useState<AlertHistoryEntry[]>([]);

  const update = (next: AlertThresholds) => {
    onChange(next);
    LocalStorage.setItem(STORAGE_KEY, next);
    if (shared && onPersistServer) onPersistServer(toServerConfig(next));
  };

  const open = (e: React.MouseEvent<HTMLElement>) => {
    setHistory(loadAlertHistory());
    setAnchorEl(e.currentTarget);
  };

  const handleNotifyToggle = async (checked: boolean) => {
    if (checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    update({ ...thresholds, notify: checked });
  };

  const updateRouteRule = (idx: number, rule: Partial<RouteAlertRule>) => {
    const routeRules = thresholds.routeRules.map((r, i) => (i === idx ? { ...r, ...rule } : r));
    update({ ...thresholds, routeRules });
  };

  const updateTargetRule = (idx: number, rule: Partial<TargetAlertRule>) => {
    const targetRules = thresholds.targetRules.map((r, i) => (i === idx ? { ...r, ...rule } : r));
    update({ ...thresholds, targetRules });
  };

  const active =
    thresholds.errorRatePct !== null ||
    thresholds.p99Ms !== null ||
    thresholds.trafficDropPct !== null ||
    thresholds.eventLoopLagP99Ms !== null ||
    thresholds.valkeyUnavailable ||
    thresholds.routeRules.length > 0 ||
    thresholds.targetRules.length > 0;

  return (
    <>
      <Tooltip title="Alert thresholds">
        <IconButton
          size="small"
          onClick={open}
          aria-label="Configure alert thresholds"
          sx={{ color: breached ? tokens.danger : active ? tokens.brand : undefined }}
        >
          {active ? (
            <NotificationsActiveIcon sx={{ fontSize: 20 }} />
          ) : (
            <NotificationsNoneIcon sx={{ fontSize: 20 }} />
          )}
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, width: 400, maxHeight: '70vh', overflowY: 'auto' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>
            Alert thresholds
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
            <NumberField
              label="Error rate ≥ (%)"
              value={thresholds.errorRatePct}
              onChange={(v) => update({ ...thresholds, errorRatePct: v })}
            />
            <NumberField
              label="P99 ≥ (ms)"
              value={thresholds.p99Ms}
              onChange={(v) => update({ ...thresholds, p99Ms: v })}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
            <NumberField
              label="Traffic drop ≥ (%)"
              value={thresholds.trafficDropPct}
              onChange={(v) => update({ ...thresholds, trafficDropPct: v })}
            />
            <NumberField
              label="Loop lag p99 ≥ (ms)"
              value={thresholds.eventLoopLagP99Ms}
              onChange={(v) => update({ ...thresholds, eventLoopLagP99Ms: v })}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, mb: 1 }}>
            <NumberField
              label="Any target err ≥ (%)"
              value={thresholds.targetErrorRatePct}
              onChange={(v) => update({ ...thresholds, targetErrorRatePct: v })}
            />
            <NumberField
              label="SLO burn (avail %)"
              value={thresholds.sloAvailabilityPct}
              onChange={(v) => update({ ...thresholds, sloAvailabilityPct: v })}
            />
          </Box>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={thresholds.valkeyUnavailable}
                onChange={(e) => update({ ...thresholds, valkeyUnavailable: e.target.checked })}
              />
            }
            label={<Typography variant="body2">Alert when Valkey is unavailable</Typography>}
          />
          <Typography variant="caption" sx={{ color: tokens.textSubtlest, display: 'block', mb: 1 }}>
            Loop-lag and Valkey checks use the health feed and are evaluated alongside every
            metrics refresh. SLO burn is evaluated server-side (webhook) only.
            {shared
              ? ' Thresholds are shared — the server webhook uses the same rules.'
              : ' Cluster mode off — thresholds live in this browser only.'}
          </Typography>

          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Per-route rules
            </Typography>
            <Button
              size="small"
              startIcon={<AddIcon sx={{ fontSize: 14 }} />}
              onClick={() =>
                update({
                  ...thresholds,
                  routeRules: [
                    ...thresholds.routeRules,
                    { key: '', errorRatePct: null, p95Ms: null },
                  ],
                })
              }
              sx={{ fontSize: 12 }}
            >
              Add
            </Button>
          </Box>
          {thresholds.routeRules.map((rule, idx) => (
            <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
              <Autocomplete
                size="small"
                options={routeOptions}
                value={rule.key || null}
                onChange={(_, key) => updateRouteRule(idx, { key: key ?? '' })}
                renderInput={(params) => <TextField {...params} label="Route" />}
                sx={{ flex: 1, minWidth: 0 }}
              />
              <NumberField
                label="err %"
                value={rule.errorRatePct}
                onChange={(v) => updateRouteRule(idx, { errorRatePct: v })}
                width={74}
              />
              <NumberField
                label="p95 ms"
                value={rule.p95Ms}
                onChange={(v) => updateRouteRule(idx, { p95Ms: v })}
                width={82}
              />
              <IconButton
                size="small"
                aria-label="Remove route rule"
                onClick={() =>
                  update({
                    ...thresholds,
                    routeRules: thresholds.routeRules.filter((_, i) => i !== idx),
                  })
                }
              >
                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          ))}

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Per-target rules
            </Typography>
            <Button
              size="small"
              startIcon={<AddIcon sx={{ fontSize: 14 }} />}
              onClick={() =>
                update({
                  ...thresholds,
                  targetRules: [
                    ...thresholds.targetRules,
                    { target: '', errorRatePct: null, avgLatencyMs: null },
                  ],
                })
              }
              sx={{ fontSize: 12 }}
            >
              Add
            </Button>
          </Box>
          {thresholds.targetRules.map((rule, idx) => (
            <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
              <Autocomplete
                size="small"
                options={targetOptions}
                value={rule.target || null}
                onChange={(_, target) => updateTargetRule(idx, { target: target ?? '' })}
                renderInput={(params) => <TextField {...params} label="Target" />}
                sx={{ flex: 1, minWidth: 0 }}
              />
              <NumberField
                label="err %"
                value={rule.errorRatePct}
                onChange={(v) => updateTargetRule(idx, { errorRatePct: v })}
                width={74}
              />
              <NumberField
                label="avg ms"
                value={rule.avgLatencyMs}
                onChange={(v) => updateTargetRule(idx, { avgLatencyMs: v })}
                width={82}
              />
              <IconButton
                size="small"
                aria-label="Remove target rule"
                onClick={() =>
                  update({
                    ...thresholds,
                    targetRules: thresholds.targetRules.filter((_, i) => i !== idx),
                  })
                }
              >
                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          ))}

          <Divider sx={{ my: 1.5 }} />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={thresholds.notify}
                onChange={(e) => void handleNotifyToggle(e.target.checked)}
              />
            }
            label={<Typography variant="body2">Browser notification on breach</Typography>}
          />
          <Typography variant="caption" sx={{ color: tokens.textSubtlest, display: 'block' }}>
            Leave a field empty to disable that check. Evaluated on every refresh of the
            selected window.
          </Typography>

          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {serverHistory && serverHistory.length > 0
                ? 'Recent breaches (server, webhook-posted)'
                : 'Recent breaches'}
            </Typography>
            {!(serverHistory && serverHistory.length > 0) && history.length > 0 && (
              <Button
                size="small"
                onClick={() => {
                  clearAlertHistory();
                  setHistory([]);
                }}
                sx={{ fontSize: 12 }}
              >
                Clear
              </Button>
            )}
          </Box>
          {serverHistory && serverHistory.length > 0 ? (
            serverHistory.slice(0, 8).map((entry) => (
              <Box key={`${entry.ts}-${entry.kind}`} sx={{ mb: 0.75 }}>
                <Typography variant="caption" sx={{ color: tokens.textSubtle, fontWeight: 600 }}>
                  {formatTs(entry.ts, 'DD MMM HH:mm:ss', utc)} · {entry.pod}
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', color: tokens.textSubtlest }}>
                  {entry.message}
                </Typography>
              </Box>
            ))
          ) : history.length === 0 ? (
            <Typography variant="caption" sx={{ color: tokens.textSubtlest }}>
              No breaches recorded in this browser yet.
            </Typography>
          ) : (
            history.slice(0, 8).map((entry) => (
              <Box key={entry.ts} sx={{ mb: 0.75 }}>
                <Typography variant="caption" sx={{ color: tokens.textSubtle, fontWeight: 600 }}>
                  {formatTs(entry.ts, 'DD MMM HH:mm:ss', utc)}
                </Typography>
                {entry.breaches.map((b, i) => (
                  <Typography key={i} variant="caption" sx={{ display: 'block', color: tokens.textSubtlest }}>
                    {b}
                  </Typography>
                ))}
              </Box>
            ))
          )}
        </Box>
      </Popover>
    </>
  );
};

export default AlertSettings;
