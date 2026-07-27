import { useState } from 'react';
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
import type { AlertConfig, AlertHistoryRecord } from '@/_types/metrics.interface';
import { formatTs } from '@/utils/format';
import { useNow } from '@/utils/useNow';
import { tokens } from '@/styles/theme';
import NumberField from './NumberField';
import { hasActiveRules } from './evaluate';
import {
  clearAlertHistory,
  loadAlertHistory,
  saveThresholds,
  toServerConfig,
} from './storage';
import type { AlertHistoryEntry, AlertThresholds, RouteAlertRule, TargetAlertRule } from './types';

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

const SNOOZE_OPTIONS_HOURS = [1, 4, 24];

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
  // Ticks so an expiring snooze flips the icon back without a page refresh.
  const now = useNow(30_000);

  const update = (next: AlertThresholds) => {
    onChange(next);
    saveThresholds(next);
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

  const snoozed = thresholds.snoozeUntil !== null && now < thresholds.snoozeUntil;
  const active = hasActiveRules(thresholds);
  const showServerHistory = Boolean(serverHistory && serverHistory.length > 0);

  return (
    <>
      <Tooltip title={snoozed ? 'Alerts snoozed' : 'Alert thresholds'}>
        <IconButton
          size="small"
          onClick={open}
          aria-label="Configure alert thresholds"
          sx={{
            color: snoozed
              ? tokens.warning
              : breached
                ? tokens.danger
                : active
                  ? tokens.brand
                  : undefined,
          }}
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
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={thresholds.alertOnNoData}
                onChange={(e) => update({ ...thresholds, alertOnNoData: e.target.checked })}
              />
            }
            label={<Typography variant="body2">Alert when traffic flatlines to zero</Typography>}
          />

          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mr: 0.5 }}>
              Snooze
            </Typography>
            {snoozed && thresholds.snoozeUntil !== null ? (
              <>
                <Typography variant="caption" sx={{ color: tokens.warning }}>
                  Muted until {formatTs(thresholds.snoozeUntil, 'DD MMM HH:mm', utc)}
                </Typography>
                <Button
                  size="small"
                  onClick={() => update({ ...thresholds, snoozeUntil: null })}
                  sx={{ fontSize: 12 }}
                >
                  Resume
                </Button>
              </>
            ) : (
              SNOOZE_OPTIONS_HOURS.map((hours) => (
                <Button
                  key={hours}
                  size="small"
                  onClick={() =>
                    update({ ...thresholds, snoozeUntil: Date.now() + hours * 60 * 60 * 1000 })
                  }
                  sx={{ fontSize: 12 }}
                >
                  {hours}h
                </Button>
              ))
            )}
          </Box>
          <Typography variant="caption" sx={{ color: tokens.textSubtlest, display: 'block' }}>
            Snoozing mutes the banner, notifications{shared ? ' and the server webhook' : ''} until
            it expires.
          </Typography>
          <Typography variant="caption" sx={{ color: tokens.textSubtlest, display: 'block', mb: 1 }}>
            Loop-lag and Valkey checks use the health feed and are evaluated alongside every metrics
            refresh. SLO burn is evaluated server-side (webhook) only.
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
            Leave a field empty to disable that check. Evaluated on every refresh of the selected
            window.
          </Typography>

          <Divider sx={{ my: 1.5 }} />
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {showServerHistory ? 'Recent breaches (server, webhook-posted)' : 'Recent breaches'}
            </Typography>
            {!showServerHistory && history.length > 0 && (
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
          {showServerHistory ? (
            serverHistory!.slice(0, 8).map((entry) => (
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
                  <Typography
                    key={i}
                    variant="caption"
                    sx={{ display: 'block', color: tokens.textSubtlest }}
                  >
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
