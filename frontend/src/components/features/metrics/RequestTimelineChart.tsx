import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import type { DeployMarker, TimelineBucket } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import ChartCard, {
  OVERVIEW_SYNC_ID,
  deployMarkerPositions,
  formatBucketTs,
  useDragZoom,
} from './chartShared';

interface Props {
  data: TimelineBucket[];
  loading: boolean;
  bucketIntervalMs?: number;
  deployMarkers?: DeployMarker[];
  utc?: boolean;
  // Drag-select a region to zoom into it (switches to an absolute range).
  onZoom?: (fromTs: number, toTs: number) => void;
  // Previous window of the same length — rendered as a ghost line so a
  // regression is visible at a glance. Aligned bucket-by-bucket.
  previousData?: TimelineBucket[];
}

const RequestTimelineChart = ({
  data,
  loading,
  bucketIntervalMs,
  deployMarkers,
  utc,
  onZoom,
  previousData,
}: Props) => {
  const chartData = data.map((b, idx) => ({
    ...b,
    avgLatencyMs: Math.round(b.avgLatencyMs),
    p90LatencyMs: b.p90LatencyMs !== undefined ? Math.round(b.p90LatencyMs) : undefined,
    p99LatencyMs: b.p99LatencyMs !== undefined ? Math.round(b.p99LatencyMs) : undefined,
    time: formatBucketTs(b.bucketTs, bucketIntervalMs, utc),
    prevRequestCount: previousData?.[idx]?.requestCount,
  }));
  const markers = deployMarkerPositions(deployMarkers, data, bucketIntervalMs, utc);
  const zoom = useDragZoom(onZoom, bucketIntervalMs);

  return (
    <ChartCard title="Requests Over Time" loading={loading} empty={chartData.length === 0}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart
          data={chartData}
          margin={{ top: 4, right: 4, left: -4, bottom: 0 }}
          syncId={OVERVIEW_SYNC_ID}
          onMouseDown={zoom.onMouseDown}
          onMouseMove={zoom.onMouseMove}
          onMouseUp={zoom.onMouseUp}
          style={zoom.zoomEnabled ? { userSelect: 'none', cursor: 'crosshair' } : undefined}
        >
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
            dataKey="prevRequestCount"
            stroke={tokens.textSubtlest}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            name="Requests (prev window)"
            dot={false}
          />
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
          {zoom.refArea && (
            <ReferenceArea
              yAxisId="left"
              x1={zoom.refArea.x1}
              x2={zoom.refArea.x2}
              fill={tokens.brand}
              fillOpacity={0.12}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default RequestTimelineChart;
