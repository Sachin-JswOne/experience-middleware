import { memo } from 'react';
import { Box, Card, Chip, Skeleton, Tooltip, Typography } from '@mui/material';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import type { MetricsSummary } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import { formatMs, formatNumber } from '@/utils/format';

interface SummaryCardsProps {
  summary: MetricsSummary;
  loading: boolean;
  // Same-length window immediately before the selected one, for delta chips.
  previous?: MetricsSummary;
  // Requests per second over the covered window.
  rps?: number;
}

const errorColor = (rate: number) => {
  if (rate < 2) return tokens.success;
  if (rate < 5) return tokens.warning;
  return tokens.danger;
};

// higherIsBad: latency/error deltas going up render red, down green.
// higherIsGood inverts; neutral keeps the subtle color either way.
type DeltaSense = 'higherIsBad' | 'higherIsGood' | 'neutral';

const DeltaChip = ({
  current,
  previous,
  sense,
}: {
  current: number;
  previous: number | undefined;
  sense: DeltaSense;
}) => {
  if (previous === undefined || !isFinite(previous)) return null;
  // No baseline traffic — a delta would be noise.
  if (previous === 0 && current === 0) return null;
  const deltaPct = previous === 0 ? 100 : ((current - previous) / previous) * 100;
  if (!isFinite(deltaPct) || Math.abs(deltaPct) < 0.05) return null;
  const up = deltaPct > 0;
  let color = tokens.textSubtle;
  if (sense === 'higherIsBad') color = up ? tokens.danger : tokens.success;
  if (sense === 'higherIsGood') color = up ? tokens.success : tokens.danger;
  const label = (
    <Box component="span" sx={{ display: 'flex', alignItems: 'center' }}>
      {up ? <ArrowDropUpIcon sx={{ fontSize: 14 }} /> : <ArrowDropDownIcon sx={{ fontSize: 14 }} />}
      {Math.abs(deltaPct) >= 100 ? Math.round(Math.abs(deltaPct)) : Math.abs(deltaPct).toFixed(1)}%
    </Box>
  );
  return (
    <Tooltip title="vs previous window of the same length">
      <Chip
        label={label}
        size="small"
        sx={{
          height: 18,
          fontSize: 12,
          fontWeight: tokens.weightBold,
          color,
          bgcolor: 'transparent',
          border: `1px solid ${color}`,
        }}
      />
    </Tooltip>
  );
};

const MetricCard = ({
  label,
  value,
  unit,
  color,
  loading,
  delta,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  loading: boolean;
  delta?: React.ReactNode;
}) => (
  <Card sx={{ p: 2, height: '100%' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
      <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
        {label}
      </Typography>
      {!loading && delta}
    </Box>
    {loading ? (
      <Skeleton variant="text" sx={{ fontSize: '1.25rem' }} width={80} />
    ) : (
      <Typography variant="h4" sx={{ color: color ?? tokens.text, fontWeight: tokens.weightBold }}>
        {value}
        {unit && (
          <Typography component="span" variant="body2" sx={{ ml: 0.5, color: tokens.textSubtle }}>
            {unit}
          </Typography>
        )}
      </Typography>
    )}
  </Card>
);

const SummaryCards = ({ summary, loading, previous, rps }: SummaryCardsProps) => {
  const estimated = summary.percentileSource === 'histogram';

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 2,
        mb: 3,
      }}
    >
      <MetricCard
        label="Total requests"
        value={formatNumber(summary.totalRequests)}
        loading={loading}
        delta={
          <DeltaChip
            current={summary.totalRequests}
            previous={previous?.totalRequests}
            sense="neutral"
          />
        }
      />
      {rps !== undefined && (
        <MetricCard
          label="Throughput"
          value={rps >= 10 ? rps.toFixed(0) : rps.toFixed(2)}
          unit="req/s"
          loading={loading}
        />
      )}
      <MetricCard
        label="Error rate"
        value={`${summary.errorRate.toFixed(1)}`}
        unit="%"
        color={loading ? undefined : errorColor(summary.errorRate)}
        loading={loading}
        delta={
          <DeltaChip
            current={summary.errorRate}
            previous={previous?.errorRate}
            sense="higherIsBad"
          />
        }
      />
      <MetricCard
        label="Avg latency"
        value={formatMs(summary.avgLatencyMs)}
        loading={loading}
        delta={
          <DeltaChip
            current={summary.avgLatencyMs}
            previous={previous?.avgLatencyMs}
            sense="higherIsBad"
          />
        }
      />
      <MetricCard
        label="Cache hit rate"
        value={`${summary.cacheHitRate.toFixed(1)}`}
        unit="%"
        loading={loading}
        delta={
          <DeltaChip
            current={summary.cacheHitRate}
            previous={previous?.cacheHitRate}
            sense="higherIsGood"
          />
        }
      />
      <Card sx={{ p: 2, height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
          <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
            Latency percentiles
          </Typography>
          {!loading && estimated && (
            <Chip
              label="estimated"
              size="small"
              variant="outlined"
              sx={{ height: 18, fontSize: 12 }}
            />
          )}
          {!loading && (
            <DeltaChip
              current={summary.p99LatencyMs}
              previous={previous?.p99LatencyMs}
              sense="higherIsBad"
            />
          )}
        </Box>
        {loading ? (
          <Skeleton variant="text" sx={{ fontSize: '1.25rem' }} width={160} />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
              P50
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: tokens.weightBold }}>
              {formatMs(summary.p50LatencyMs)}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
              P90
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: tokens.weightBold }}>
              {formatMs(summary.p90LatencyMs)}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
              P99
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: tokens.weightBold }}>
              {formatMs(summary.p99LatencyMs)}
            </Typography>
          </Box>
        )}
      </Card>
    </Box>
  );
};

export default memo(SummaryCards);
