import { useMemo } from 'react';
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
import type { DownstreamTimeline } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import ChartCard, { CHART_COLORS, formatBucketTs, formatMs } from './chartShared';

interface Props {
  data: DownstreamTimeline[];
  loading: boolean;
  bucketIntervalMs?: number;
  utc?: boolean;
}

const DownstreamTimelineChart = ({ data, loading, bucketIntervalMs, utc }: Props) => {
  const { chartData, targets } = useMemo(() => {
    const targetNames = data.map((d) => d.target);
    const rows = new Map<number, Record<string, number | string>>();
    for (const series of data) {
      for (const point of series.points) {
        let row = rows.get(point.bucketTs);
        if (!row) {
          row = { bucketTs: point.bucketTs, time: formatBucketTs(point.bucketTs, bucketIntervalMs, utc) };
          rows.set(point.bucketTs, row);
        }
        row[series.target] = Math.round(point.avgLatencyMs);
      }
    }
    return {
      chartData: Array.from(rows.values()).sort(
        (a, b) => (a.bucketTs as number) - (b.bucketTs as number),
      ),
      targets: targetNames,
    };
  }, [data, bucketIntervalMs, utc]);

  return (
    <ChartCard
      title="Downstream Latency Over Time"
      loading={loading}
      empty={chartData.length === 0}
      emptyMessage="No downstream calls in this window"
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: -4, bottom: 0 }}>
          <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fill: tokens.textSubtle }} />
          <YAxis
            tick={{ fontSize: 11, fill: tokens.textSubtle }}
            label={{ value: 'ms', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: tokens.textSubtle } }}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: tokens.radiusSmall }}
            formatter={(value, name) => [formatMs(Number(value)), name as string]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {targets.map((target, idx) => (
            <Line
              key={target}
              type="monotone"
              dataKey={target}
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default DownstreamTimelineChart;
