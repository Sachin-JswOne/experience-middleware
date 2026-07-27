import { memo, useMemo, useState  } from 'react';
import {
  Box,
  Card,
  Chip,
  IconButton,
  LinearProgress,
  Popover,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  YAxis,
} from 'recharts';
import {
  LATENCY_HISTOGRAM_BOUNDS,
  type MetricsSummary,
  type TimelineBucket,
} from '@/_types/metrics.interface';
import LocalStorage from '@/utils/LocalStorage';
import { loadPersisted } from '@/utils/usePersistedState';
import { tokens } from '@/styles/theme';
import { formatMs } from '@/utils/format';

import { pillSx as basePillSx, type PillTone } from './statusPill';

// SLO chips use the shorter lozenge variant.
const pillSx = (tone: PillTone) => basePillSx(tone, 18);

export interface SloConfig {
  availabilityTargetPct: number | null;
  p99TargetMs: number | null;
  // Apdex threshold T: satisfied ≤ T, tolerating ≤ 4T. Snapped to the
  // nearest histogram bound at or below the entered value.
  apdexTargetMs: number | null;
}

const STORAGE_KEY = 'metricsSloConfig';

const defaultSloConfig: SloConfig = {
  availabilityTargetPct: null,
  p99TargetMs: null,
  apdexTargetMs: null,
};

export const loadSloConfig = (): SloConfig => loadPersisted(STORAGE_KEY, defaultSloConfig);

export const saveSloConfig = (config: SloConfig): void => {
  LocalStorage.setItem(STORAGE_KEY, config);
};

// Apdex over the window's latency histograms. T is snapped to a histogram
// bound so bucket boundaries line up exactly.
export const computeApdex = (
  timeline: TimelineBucket[],
  targetMs: number,
): { score: number; total: number; effectiveTargetMs: number } | null => {
  const boundsAsc: number[] = [...LATENCY_HISTOGRAM_BOUNDS];
  const smallest = boundsAsc[0] ?? 25;
  const satBound = [...boundsAsc].reverse().find((b) => b <= targetMs) ?? smallest;
  const tolBound = [...boundsAsc].reverse().find((b) => b <= satBound * 4) ?? satBound;

  let satisfied = 0;
  let tolerating = 0;
  let total = 0;
  for (const bucket of timeline) {
    if (!bucket.histogram) continue;
    for (const [key, count] of Object.entries(bucket.histogram)) {
      total += count;
      if (key === 'inf') continue;
      const bound = Number(key);
      if (bound <= satBound) satisfied += count;
      else if (bound <= tolBound) tolerating += count;
    }
  }
  if (total === 0) return null;
  return {
    score: (satisfied + tolerating / 2) / total,
    total,
    effectiveTargetMs: satBound,
  };
};

// Cumulative error-budget consumption per timeline bucket: at each point,
// errors so far as a % of the errors the SLO allows for the traffic so far.
// A flat line = healthy; a steepening curve = burning budget right now.
export const computeBurnSeries = (
  timeline: TimelineBucket[],
  availabilityTargetPct: number,
): Array<{ bucketTs: number; consumedPct: number }> => {
  const budgetFraction = (100 - availabilityTargetPct) / 100;
  if (budgetFraction <= 0) return [];
  let cumErrors = 0;
  let cumRequests = 0;
  return timeline.map((b) => {
    cumErrors += b.errorCount;
    cumRequests += b.requestCount;
    const allowed = cumRequests * budgetFraction;
    return {
      bucketTs: b.bucketTs,
      consumedPct: allowed > 0 ? Math.min(200, (cumErrors / allowed) * 100) : 0,
    };
  });
};

const numberOrNull = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return isNaN(value) || value <= 0 ? null : value;
};

interface Props {
  summary: MetricsSummary;
  timeline: TimelineBucket[];
  loading: boolean;
  config: SloConfig;
  onConfigChange: (config: SloConfig) => void;
}

// Availability + latency SLO against the selected window. Error budget =
// allowed failure fraction; consumed = actual errors / allowed errors.
const SloCard = ({ summary, timeline, loading, config, onConfigChange }: Props) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const update = (next: SloConfig) => {
    onConfigChange(next);
    saveSloConfig(next);
  };

  const apdex = useMemo(
    () => (config.apdexTargetMs !== null ? computeApdex(timeline, config.apdexTargetMs) : null),
    [timeline, config.apdexTargetMs],
  );

  const burnSeries = useMemo(
    () =>
      config.availabilityTargetPct !== null
        ? computeBurnSeries(timeline, config.availabilityTargetPct)
        : [],
    [timeline, config.availabilityTargetPct],
  );

  const configured =
    config.availabilityTargetPct !== null ||
    config.p99TargetMs !== null ||
    config.apdexTargetMs !== null;
  const availability = 100 - summary.errorRate;
  const budgetPct =
    config.availabilityTargetPct !== null ? 100 - config.availabilityTargetPct : null;
  const budgetConsumedPct =
    budgetPct !== null && budgetPct > 0
      ? Math.min(200, (summary.errorRate / budgetPct) * 100)
      : null;
  const availabilityOk =
    config.availabilityTargetPct !== null && availability >= config.availabilityTargetPct;
  const latencyOk = config.p99TargetMs !== null && summary.p99LatencyMs < config.p99TargetMs;

  const budgetColor =
    budgetConsumedPct === null
      ? tokens.success
      : budgetConsumedPct >= 100
        ? tokens.danger
        : budgetConsumedPct >= 70
          ? tokens.warning
          : tokens.success;

  return (
    <Card sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
          SLO (this window)
        </Typography>
        <Tooltip title="Configure SLO targets">
          <IconButton
            size="small"
            aria-label="Configure SLO targets"
            onClick={(e) => setAnchorEl(e.currentTarget)}
          >
            <SettingsOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
      {loading ? (
        <Skeleton variant="text" sx={{ fontSize: '1.25rem' }} width={120} />
      ) : !configured ? (
        <Typography variant="body2" sx={{ color: tokens.textSubtlest }}>
          No targets set — use the gear to define availability / p99 goals.
        </Typography>
      ) : summary.totalRequests === 0 ? (
        <Typography variant="body2" sx={{ color: tokens.textSubtlest }}>
          No traffic in this window.
        </Typography>
      ) : (
        <Box>
          {config.availabilityTargetPct !== null && (
            <Box sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: tokens.weightBold,
                    color: availabilityOk ? tokens.text : tokens.danger,
                  }}
                >
                  {availability.toFixed(2)}%
                </Typography>
                <Typography variant="caption" sx={{ color: tokens.textSubtle }}>
                  target {config.availabilityTargetPct}%
                </Typography>
                <Chip
                  label={availabilityOk ? 'meeting' : 'breaching'}
                  size="small"
                  sx={pillSx(availabilityOk ? 'success' : 'danger')}
                />
              </Box>
              {budgetConsumedPct !== null && (
                <Tooltip
                  title={`Error budget: ${summary.errorRate.toFixed(2)}% errors of ${budgetPct?.toFixed(2)}% allowed → ${budgetConsumedPct.toFixed(0)}% consumed`}
                >
                  <Box sx={{ mt: 0.75 }}>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, budgetConsumedPct)}
                      sx={{
                        height: 6,
                        borderRadius: 2,
                        bgcolor: tokens.surfaceSunken,
                        '& .MuiLinearProgress-bar': { bgcolor: budgetColor },
                      }}
                    />
                    <Typography variant="caption" sx={{ color: tokens.textSubtle }}>
                      {`${Math.round(budgetConsumedPct)}% of error budget used`}
                    </Typography>
                  </Box>
                </Tooltip>
              )}
              {burnSeries.length > 1 && (
                <Box sx={{ mt: 0.75 }}>
                  <Typography variant="caption" sx={{ color: tokens.textSubtlest }}>
                    Budget consumption over the window
                  </Typography>
                  <ResponsiveContainer width="100%" height={64}>
                    <AreaChart data={burnSeries} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                      <YAxis hide domain={[0, (dataMax: number) => Math.max(110, dataMax)]} />
                      <ChartTooltip
                        contentStyle={{ fontSize: 12, borderRadius: tokens.radiusSmall }}
                        formatter={(value) => [
                          `${Math.round(Number(value ?? 0))}% consumed`,
                          'Budget',
                        ]}
                        labelFormatter={() => ''}
                      />
                      <ReferenceLine y={100} stroke={tokens.danger} strokeDasharray="3 3" />
                      <Area
                        type="monotone"
                        dataKey="consumedPct"
                        stroke={budgetColor}
                        fill={budgetColor}
                        fillOpacity={0.18}
                        strokeWidth={1.5}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Box>
          )}
          {config.p99TargetMs !== null && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
                P99 {formatMs(summary.p99LatencyMs)} / {formatMs(config.p99TargetMs)}
              </Typography>
              <Chip
                label={latencyOk ? 'meeting' : 'breaching'}
                size="small"
                sx={pillSx(latencyOk ? 'success' : 'danger')}
              />
            </Box>
          )}
          {apdex && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              <Tooltip
                title={`Apdex over ${apdex.total.toLocaleString()} requests: satisfied ≤ ${apdex.effectiveTargetMs}ms, tolerating ≤ ${apdex.effectiveTargetMs * 4}ms`}
              >
                <Typography variant="body2" sx={{ color: tokens.textSubtle, cursor: 'default' }}>
                  Apdex {apdex.score.toFixed(2)} (T={apdex.effectiveTargetMs}ms)
                </Typography>
              </Tooltip>
              <Chip
                label={
                  apdex.score >= 0.94
                    ? 'excellent'
                    : apdex.score >= 0.85
                      ? 'good'
                      : apdex.score >= 0.7
                        ? 'fair'
                        : 'poor'
                }
                size="small"
                sx={pillSx(
                  apdex.score >= 0.85 ? 'success' : apdex.score >= 0.7 ? 'warning' : 'danger',
                )}
              />
            </Box>
          )}
        </Box>
      )}
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, width: 260 }}>
          <Typography variant="body2" sx={{ fontWeight: tokens.weightBold, mb: 1.5 }}>
            SLO targets
          </Typography>
          <TextField
            label="Availability target (%)"
            type="number"
            size="small"
            fullWidth
            value={config.availabilityTargetPct ?? ''}
            onChange={(e) =>
              update({ ...config, availabilityTargetPct: numberOrNull(e.target.value) })
            }
            sx={{ mb: 1.5 }}
          />
          <TextField
            label="P99 target (ms)"
            type="number"
            size="small"
            fullWidth
            value={config.p99TargetMs ?? ''}
            onChange={(e) => update({ ...config, p99TargetMs: numberOrNull(e.target.value) })}
            sx={{ mb: 1.5 }}
          />
          <TextField
            label="Apdex threshold T (ms)"
            type="number"
            size="small"
            fullWidth
            value={config.apdexTargetMs ?? ''}
            onChange={(e) => update({ ...config, apdexTargetMs: numberOrNull(e.target.value) })}
            sx={{ mb: 1 }}
          />
          <Typography variant="caption" sx={{ color: tokens.textSubtlest }}>
            e.g. 99.5% availability, 800ms p99, T=500ms apdex. Evaluated over the selected time
            window.
          </Typography>
        </Box>
      </Popover>
    </Card>
  );
};

export default memo(SloCard);
