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
import type { DownstreamBreakdown } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';

interface Props {
  data: DownstreamBreakdown[];
  loading: boolean;
}

const COLORS = ['#5B7F24', '#357DE8', '#2898BD', '#AF59E1', '#E06C00'];

const DownstreamLatencyChart = ({ data, loading }: Props) => {
  const chartData = data.map((d) => ({
    name: d.target,
    avgLatencyMs: Math.round(d.avgLatencyMs),
    requestCount: d.requestCount,
    errorCount: d.errorCount,
  }));

  return (
    <Card sx={{ p: 2, height: '100%' }}>
      <Typography variant="h5" sx={{ mb: 1.5 }}>
        Downstream Latency
      </Typography>
      {loading || chartData.length === 0 ? (
        <Box sx={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
            {loading ? 'Loading...' : 'No data yet'}
          </Typography>
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -4, bottom: 0 }}>
            <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: tokens.textSubtle }} />
            <YAxis
              tick={{ fontSize: 11, fill: tokens.textSubtle }}
              label={{ value: 'ms', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: tokens.textSubtle } }}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: tokens.radiusSmall }}
            />
            <Bar dataKey="avgLatencyMs" name="Avg Latency (ms)">
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

export default DownstreamLatencyChart;
