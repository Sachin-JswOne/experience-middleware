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
import ChartCard, {
  CHART_BRAND,
  CHART_PURPLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  formatMs,
} from './chartShared';

interface Props {
  data: DownstreamBreakdown[];
  loading: boolean;
}

const DownstreamLatencyChart = ({ data, loading }: Props) => {
  const chartData = data.map((d) => ({
    name: d.target,
    avgLatencyMs: Math.round(d.avgLatencyMs),
    p95LatencyMs: d.p95LatencyMs !== undefined ? Math.round(d.p95LatencyMs) : undefined,
    requestCount: d.requestCount,
    errorCount: d.errorCount,
  }));

  return (
    <ChartCard title="Downstream latency & errors" loading={loading} empty={chartData.length === 0}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
          <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: tokens.textSubtle }} />
          <YAxis
            yAxisId="latency"
            tick={{ fontSize: 12, fill: tokens.textSubtle }}
            label={{
              value: 'ms',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 12, fill: tokens.textSubtle },
            }}
          />
          <YAxis
            yAxisId="count"
            orientation="right"
            tick={{ fontSize: 12, fill: tokens.textSubtle }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
            formatter={(value, name) => {
              if (name === 'Avg latency (ms)' || name === 'P95 (ms)') {
                return [formatMs(Number(value)), name];
              }
              return [value as number | string, name as string];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="avgLatencyMs"
            name="Avg latency (ms)"
            yAxisId="latency"
            fill={CHART_BRAND}
          />
          <Bar dataKey="p95LatencyMs" name="P95 (ms)" yAxisId="latency" fill={CHART_PURPLE} />
          <Bar dataKey="errorCount" name="Errors" yAxisId="count" fill={tokens.danger} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default DownstreamLatencyChart;
