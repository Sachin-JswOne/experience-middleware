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

const RouteBreakdownChart = ({ data, loading }: Props) => {
  const sorted = [...data].sort((a, b) => b.avgLatencyMs - a.avgLatencyMs);
  const chartData = sorted.map((r) => ({
    name: `${r.method} ${r.route}`,
    avgLatencyMs: Math.round(r.avgLatencyMs),
    requestCount: r.requestCount,
    errorCount: r.errorCount,
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
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 11, fill: tokens.textSubtle }} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: tokens.textSubtle }}
              width={180}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: tokens.radiusSmall }}
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
