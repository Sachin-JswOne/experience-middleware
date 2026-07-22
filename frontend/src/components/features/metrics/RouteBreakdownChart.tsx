import { Card, Typography, Box } from '@mui/material';
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

interface Props {
  data: RouteBreakdown[];
  loading: boolean;
}

const COLORS = [tokens.brand, '#357DE8', '#55A0F5', '#80C0FF', '#AAD4FF'];

const truncate = (value: string, max = 28) =>
  value.length > max ? `${value.slice(0, max - 1)}\u2026` : value;

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
        <Typography variant="body2">{p.avgLatencyMs} ms</Typography>
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>Requests</Typography>
        <Typography variant="body2">{p.requestCount}</Typography>
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>Errors</Typography>
        <Typography variant="body2">{p.errorCount}</Typography>
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>Cache hit</Typography>
        <Typography variant="body2">{p.cacheHitRate.toFixed(1)}%</Typography>
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
    <Card sx={{ p: 2, height: '100%' }}>
      <Typography variant="h5" sx={{ mb: 1.5 }}>
        Route Performance
      </Typography>
      {loading || chartData.length === 0 ? (
        <Box sx={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
            {loading ? 'Loading...' : 'No data yet'}
          </Typography>
        </Box>
      ) : (
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
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};

export default RouteBreakdownChart;
