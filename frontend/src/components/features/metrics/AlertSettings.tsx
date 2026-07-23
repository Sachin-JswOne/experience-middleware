import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Checkbox,
  FormControlLabel,
  IconButton,
  Popover,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import type { MetricsSnapshot } from '@/_types/metrics.interface';
import LocalStorage from '@/utils/LocalStorage';
import { tokens } from '@/styles/theme';

export interface AlertThresholds {
  errorRatePct: number | null;
  p99Ms: number | null;
  notify: boolean;
}

const STORAGE_KEY = 'metricsAlertThresholds';

export const defaultThresholds: AlertThresholds = {
  errorRatePct: null,
  p99Ms: null,
  notify: false,
};

export const loadThresholds = (): AlertThresholds => {
  const stored = LocalStorage.getItem(STORAGE_KEY);
  if (stored && typeof stored === 'object') {
    return { ...defaultThresholds, ...(stored as Partial<AlertThresholds>) };
  }
  return defaultThresholds;
};

export const evaluateAlerts = (
  snapshot: MetricsSnapshot,
  thresholds: AlertThresholds,
): string[] => {
  const breaches: string[] = [];
  if (snapshot.summary.totalRequests === 0) return breaches;
  if (
    thresholds.errorRatePct !== null &&
    snapshot.summary.errorRate >= thresholds.errorRatePct
  ) {
    breaches.push(
      `Error rate ${snapshot.summary.errorRate.toFixed(1)}% ≥ ${thresholds.errorRatePct}%`,
    );
  }
  if (thresholds.p99Ms !== null && snapshot.summary.p99LatencyMs >= thresholds.p99Ms) {
    breaches.push(
      `P99 latency ${Math.round(snapshot.summary.p99LatencyMs)}ms ≥ ${thresholds.p99Ms}ms`,
    );
  }
  return breaches;
};

// Fires a browser notification when a breach appears that wasn't present on
// the previous snapshot (edge-triggered, not on every poll).
export const useAlertNotifications = (breaches: string[], thresholds: AlertThresholds) => {
  const previous = useRef<string>('');
  useEffect(() => {
    const signature = breaches.join('|');
    const isNew = signature && signature !== previous.current;
    previous.current = signature;
    if (!isNew || !thresholds.notify) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification('Observability alert', { body: breaches.join('\n') });
  }, [breaches, thresholds.notify]);
};

interface Props {
  thresholds: AlertThresholds;
  onChange: (thresholds: AlertThresholds) => void;
  breached: boolean;
}

const numberOrNull = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return isNaN(value) || value <= 0 ? null : value;
};

const AlertSettings = ({ thresholds, onChange, breached }: Props) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const update = (next: AlertThresholds) => {
    onChange(next);
    LocalStorage.setItem(STORAGE_KEY, next);
  };

  const handleNotifyToggle = async (checked: boolean) => {
    if (checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    update({ ...thresholds, notify: checked });
  };

  const active = thresholds.errorRatePct !== null || thresholds.p99Ms !== null;

  return (
    <>
      <Tooltip title="Alert thresholds">
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
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
        <Box sx={{ p: 2, width: 260 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>
            Alert thresholds
          </Typography>
          <TextField
            label="Error rate ≥ (%)"
            type="number"
            size="small"
            fullWidth
            value={thresholds.errorRatePct ?? ''}
            onChange={(e) => update({ ...thresholds, errorRatePct: numberOrNull(e.target.value) })}
            sx={{ mb: 1.5 }}
          />
          <TextField
            label="P99 latency ≥ (ms)"
            type="number"
            size="small"
            fullWidth
            value={thresholds.p99Ms ?? ''}
            onChange={(e) => update({ ...thresholds, p99Ms: numberOrNull(e.target.value) })}
            sx={{ mb: 1 }}
          />
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
        </Box>
      </Popover>
    </>
  );
};

export default AlertSettings;
