import { memo } from 'react';
import { Box, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import MetricsService from '@/services/MetricsService';
import { tokens } from '@/styles/theme';
import { CHART_PURPLE, formatBucketTs } from '../chartShared';
import type { MetricsRange } from '../useMetricsQuery';

const REFRESH_MS = 30_000;

interface Props {
  method: string;
  route: string;
  // The dashboard's current range — the trend follows it.
  range?: MetricsRange;
  utc?: boolean;
}

/** Compact requests / p95 / errors trend for the drawer's route. */
const RouteTrendChart = ({ method, route, range, utc }: Props) => {
  const params =
    range?.type === 'absolute'
      ? { from: range.from, to: range.to }
      : { window: range?.window ?? '1h' };

  const { data } = useQuery({
    queryKey: ['metrics-route-timeline', method, route, params],
    queryFn: async () => {
      const result = await MetricsService.getRouteTimeline(method, route, params);
      if (!result.data || result.error.code) {
        throw new Error(result.error.message || 'Failed to load route timeline');
      }
      return result.data;
    },
    refetchInterval: REFRESH_MS,
  });

  if (!data || data.points.every((p) => p.requestCount === 0)) return null;

  const chartData = data.points.map((p) => ({
    time: formatBucketTs(p.bucketTs, data.bucketIntervalMs, utc),
    requests: p.requestCount,
    errors: p.errorCount,
    p95: p.p95LatencyMs !== undefined ? Math.round(p.p95LatencyMs) : undefined,
  }));

  const legend = [
    { label: 'Requests', color: tokens.brand },
    { label: 'Errors', color: tokens.danger },
    { label: 'P95 (ms)', color: CHART_PURPLE },
  ];

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" sx={{ color: tokens.textSubtle }}>
        Trend over the selected range — requests, errors, p95
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
        {legend.map((item) => (
          <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.color }} />
            <Typography variant="caption" sx={{ color: tokens.textSubtlest }}>
              {item.label}
            </Typography>
          </Box>
        ))}
      </Box>
      <ResponsiveContainer width="100%" height={110}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <XAxis
            dataKey="time"
            tick={{ fontSize: 12, fill: tokens.textSubtlest }}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="count"
            tick={{ fontSize: 12, fill: tokens.textSubtlest }}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="ms"
            orientation="right"
            tick={{ fontSize: 12, fill: tokens.textSubtlest }}
            width={40}
          />
          <ChartTooltip contentStyle={{ fontSize: 12, borderRadius: tokens.radiusSmall }} />
          <Bar
            yAxisId="count"
            dataKey="requests"
            name="Requests"
            fill={tokens.brand}
            fillOpacity={0.45}
          />
          <Bar yAxisId="count" dataKey="errors" name="Errors" fill={tokens.danger} />
          <Line
            yAxisId="ms"
            dataKey="p95"
            name="P95 (ms)"
            stroke={CHART_PURPLE}
            strokeWidth={1.5}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Box>
  );
};

export default memo(RouteTrendChart);
