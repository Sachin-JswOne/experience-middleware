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
import ChartCard, { CHART_COLORS, formatMs, formatPercent } from './chartShared';

interface Props {
  data: RouteBreakdown[];
  loading: boolean;
}

const truncate = (value: string, max = 28) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

interface RouteTooltipPayload {
  name?: string;
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
        bgcolor: 'background.paper',
        border: `1px solid ${tokens.border}`,
        borderRadius: `${tokens.radiusSmall}px`,
        p: 1.25,
        fontSize: 12,
        boxShadow: 1,
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
        {p.name}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 1.5, rowGap: 0.25 }}>
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>Avg latency</Typography>
        <Typography variant="body2">{formatMs(p.avgLatencyMs)}</Typography>
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>Requests</Typography>
        <Typography variant="body2">{p.requestCount}</Typography>
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>Errors</Typography>
        <Typography variant="body2">{p.errorCount}</Typography>
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>Cache hit</Typography>
        <Typography variant="body2">{formatPercent(p.cacheHitRate)}</Typography>
      </Box>
    </Box>
  );
};

const RouteBreakdownChart = ({ data, loading }: Props) => {
  const sorted = [...data].sort((a, b) => b.avgLatencyMs - a.avgLatencyMs);
  const chartData = sorted.map((r) => ({
    name: `${r.method} ${r.route}`,
    avgLatencyMs: Math.round(r.avgLatencyMs),
    requestCount: r.requestCount,
    errorCount: r.errorCount,
    cacheHitRate: r.cacheHitRate,
  }));

  return (
    <ChartCard title="Route Performance" loading={loading} empty={chartData.length === 0}>
      <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 36 + 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
          <XAxis type="number" tick={{ fontSize: 11, fill: tokens.textSubtle }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: tokens.textSubtle }}
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

export default RouteBreakdownChart;
