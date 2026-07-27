import { memo } from 'react';
import { Typography, Box } from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { RouteBreakdown } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import { formatMs, formatPercent } from '@/utils/format';
import ChartCard, { CHART_COLORS } from './chartShared';

interface Props {
  data: RouteBreakdown[];
  loading: boolean;
}

const truncate = (value: string, max = 28) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

// Compact axis label like the downstream charts' target names — strip the
// common gateway prefix and API version; the tooltip shows the full route.
const shortRouteName = (route: string) => route.replace(/^\/xp-mi\/public\/(v\d+\/)?/, '');

interface RouteTooltipPayload {
  name?: string;
  fullName?: string;
  avgLatencyMs: number;
  requestCount: number;
  errorCount: number;
  cacheHitRate: number;
}

interface RouteTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: RouteTooltipPayload }>;
}

const RouteTooltip = ({ active, payload }: RouteTooltipProps) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const p = entry?.payload;
  if (!p) return null;
  return (
    <Box
      sx={{
        bgcolor: tokens.backgroundNeutralBold,
        borderRadius: `${tokens.radiusSmall}px`,
        p: 1.5,
        fontSize: 12,
        boxShadow: tokens.shadowOverlay,
        color: tokens.textInverse,
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: tokens.weightBold, mb: 0.5, color: 'inherit' }}>
        {p.fullName ?? p.name}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 1.5, rowGap: 0.25 }}>
        <Typography variant="body2" sx={{ color: tokens.textInverse, opacity: 0.7 }}>
          Avg latency
        </Typography>
        <Typography variant="body2" sx={{ color: 'inherit' }}>
          {formatMs(p.avgLatencyMs)}
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.textInverse, opacity: 0.7 }}>
          Requests
        </Typography>
        <Typography variant="body2" sx={{ color: 'inherit' }}>
          {p.requestCount}
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.textInverse, opacity: 0.7 }}>
          Errors
        </Typography>
        <Typography variant="body2" sx={{ color: 'inherit' }}>
          {p.errorCount}
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.textInverse, opacity: 0.7 }}>
          Cache hit
        </Typography>
        <Typography variant="body2" sx={{ color: 'inherit' }}>
          {formatPercent(p.cacheHitRate)}
        </Typography>
      </Box>
    </Box>
  );
};

const MAX_ROUTES = 10;
const MIN_AVG_LATENCY_MS = 800;

const RouteBreakdownChart = ({ data, loading }: Props) => {
  const chartData = [...data]
    .filter((r) => r.avgLatencyMs > MIN_AVG_LATENCY_MS)
    .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
    .slice(0, MAX_ROUTES)
    .map((r) => ({
      name: shortRouteName(r.route),
      fullName: `${r.method} ${r.route}`,
      avgLatencyMs: Math.round(r.avgLatencyMs),
      requestCount: r.requestCount,
      errorCount: r.errorCount,
      cacheHitRate: r.cacheHitRate,
    }));

  return (
    <ChartCard
      title={`Slow routes (>${MIN_AVG_LATENCY_MS} ms)`}
      loading={loading}
      empty={chartData.length === 0}
      emptyMessage={`No routes above ${MIN_AVG_LATENCY_MS} ms avg latency`}
    >
      <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 36 + 40)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: tokens.textSubtle }}
            tickFormatter={(value: number) => `${value} ms`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12, fill: tokens.textSubtle }}
            width={140}
            tickFormatter={(value: string) => truncate(value)}
          />
          <Tooltip
            content={<RouteTooltip />}
            cursor={{ fill: tokens.backgroundNeutralSubtleHovered }}
          />
          <Bar dataKey="avgLatencyMs" name="avgLatencyMs">
            {chartData.map((_, idx) => (
              <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default memo(RouteBreakdownChart);
