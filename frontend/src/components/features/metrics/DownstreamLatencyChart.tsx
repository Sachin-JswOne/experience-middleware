import { Card, Typography, Box } from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { DownstreamBreakdown } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';

interface Props {
  data: DownstreamBreakdown[];
  loading: boolean;
}

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
        Downstream Latency & Errors
      </Typography>
      {loading || chartData.length === 0 ? (
        <Box sx={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
            {loading ? 'Loading...' : 'No data yet'}
          </Typography>
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
            <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: tokens.textSubtle }} />
            <YAxis
              yAxisId="latency"
              tick={{ fontSize: 11, fill: tokens.textSubtle }}
              label={{
                value: 'ms',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 11, fill: tokens.textSubtle },
              }}
            />
            <YAxis
              yAxisId="count"
              orientation="right"
              tick={{ fontSize: 11, fill: tokens.textSubtle }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: tokens.radiusSmall }}
              formatter={(value, name) => {
                if (name === 'Avg Latency (ms)') return [`${value} ms`, name];
                return [value as number | string, name as string];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="avgLatencyMs"
              name="Avg Latency (ms)"
              yAxisId="latency"
              fill="#357DE8"
            />
            <Bar
              dataKey="errorCount"
              name="Errors"
              yAxisId="count"
              fill={tokens.danger}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};

export default DownstreamLatencyChart;
