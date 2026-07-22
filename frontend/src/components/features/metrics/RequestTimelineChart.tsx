import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import dayjs from 'dayjs';
import type { TimelineBucket } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import ChartCard from './chartShared';

interface Props {
  data: TimelineBucket[];
  loading: boolean;
}

const RequestTimelineChart = ({ data, loading }: Props) => {
  const chartData = data.map((b) => ({
    ...b,
    avgLatencyMs: Math.round(b.avgLatencyMs),
    time: dayjs(b.bucketTs).format('HH:mm'),
  }));

  return (
    <ChartCard title="Requests Over Time" loading={loading} empty={chartData.length === 0}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: -4, bottom: 0 }}>
          <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fill: tokens.textSubtle }} />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: tokens.textSubtle }}
            label={{ value: 'Requests', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: tokens.textSubtle } }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: tokens.textSubtle }}
            label={{ value: 'ms', angle: 90, position: 'insideRight', style: { fontSize: 11, fill: tokens.textSubtle } }}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: tokens.radiusSmall }}
          />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="requestCount"
            stroke={tokens.brand}
            strokeWidth={2}
            name="Requests"
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="avgLatencyMs"
            stroke={tokens.warning}
            strokeWidth={2}
            name="Avg Latency (ms)"
            dot={false}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="errorCount"
            stroke={tokens.danger}
            strokeWidth={2}
            name="Errors"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default RequestTimelineChart;
