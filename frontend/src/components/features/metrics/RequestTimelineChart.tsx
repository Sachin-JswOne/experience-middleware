import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import type { DeployMarker, TimelineBucket } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import ChartCard, { deployMarkerPositions, formatBucketTs } from './chartShared';

interface Props {
  data: TimelineBucket[];
  loading: boolean;
  bucketIntervalMs?: number;
  deployMarkers?: DeployMarker[];
  utc?: boolean;
}

const RequestTimelineChart = ({ data, loading, bucketIntervalMs, deployMarkers, utc }: Props) => {
  const chartData = data.map((b) => ({
    ...b,
    avgLatencyMs: Math.round(b.avgLatencyMs),
    p90LatencyMs: b.p90LatencyMs !== undefined ? Math.round(b.p90LatencyMs) : undefined,
    p99LatencyMs: b.p99LatencyMs !== undefined ? Math.round(b.p99LatencyMs) : undefined,
    time: formatBucketTs(b.bucketTs, bucketIntervalMs, utc),
  }));
  const markers = deployMarkerPositions(deployMarkers, data, bucketIntervalMs, utc);

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
          {markers.map((m) => (
            <ReferenceLine
              key={`${m.x}-${m.version}`}
              yAxisId="left"
              x={m.x}
              stroke={tokens.textSubtlest}
              strokeDasharray="4 4"
              label={{
                value: `deploy ${m.version}`,
                position: 'insideTopRight',
                style: { fontSize: 10, fill: tokens.textSubtle },
              }}
            />
          ))}
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
            yAxisId="right"
            type="monotone"
            dataKey="p90LatencyMs"
            stroke="#AF59E1"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            name="P90 (ms)"
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="p99LatencyMs"
            stroke="#E06C00"
            strokeWidth={1.5}
            strokeDasharray="2 3"
            name="P99 (ms)"
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
