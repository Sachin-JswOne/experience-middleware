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
  CHART_PURPLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  CHART_WARNING,
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
  // Same range one week earlier — the seasonality baseline. Buckets whose
  // traffic deviates hard from it get an anomaly dot.
  baselineData?: TimelineBucket[];
}

// A bucket is anomalous when it moves ≥60% away from a meaningful baseline.
const ANOMALY_DEVIATION = 0.6;
const ANOMALY_MIN_BASELINE = 20;

const RequestTimelineChart = ({
  data,
  loading,
  bucketIntervalMs,
  deployMarkers,
  utc,
  onZoom,
  previousData,
  baselineData,
}: Props) => {
  const chartData = data.map((b, idx) => {
    const baseline = baselineData?.[idx]?.requestCount;
    const anomalous =
      baseline !== undefined &&
      baseline >= ANOMALY_MIN_BASELINE &&
      Math.abs(b.requestCount - baseline) / baseline >= ANOMALY_DEVIATION;
    return {
      ...b,
      avgLatencyMs: Math.round(b.avgLatencyMs),
      p90LatencyMs: b.p90LatencyMs !== undefined ? Math.round(b.p90LatencyMs) : undefined,
      p99LatencyMs: b.p99LatencyMs !== undefined ? Math.round(b.p99LatencyMs) : undefined,
      time: formatBucketTs(b.bucketTs, bucketIntervalMs, utc),
      prevRequestCount: previousData?.[idx]?.requestCount,
      baselineRequestCount: baseline,
      anomaly: anomalous ? b.requestCount : undefined,
    };
  });
  const markers = deployMarkerPositions(deployMarkers, data, bucketIntervalMs, utc);
  const zoom = useDragZoom(onZoom, bucketIntervalMs);

  return (
    <ChartCard title="Requests over time" loading={loading} empty={chartData.length === 0}>
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
          <XAxis dataKey="time" tick={{ fontSize: 12, fill: tokens.textSubtle }} />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 12, fill: tokens.textSubtle }}
            label={{
              value: 'Requests',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 12, fill: tokens.textSubtle },
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12, fill: tokens.textSubtle }}
            label={{
              value: 'ms',
              angle: 90,
              position: 'insideRight',
              style: { fontSize: 12, fill: tokens.textSubtle },
            }}
          />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
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
                style: { fontSize: 12, fill: tokens.textSubtle },
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
          {baselineData && baselineData.length > 0 && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="baselineRequestCount"
              stroke={CHART_PURPLE}
              strokeWidth={1}
              strokeDasharray="2 4"
              name="Requests (last week)"
              dot={false}
            />
          )}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="requestCount"
            stroke={tokens.brand}
            strokeWidth={2}
            name="Requests"
            dot={false}
          />
          {baselineData && baselineData.length > 0 && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="anomaly"
              stroke="none"
              name="Anomaly vs last week"
              dot={{ r: 4, fill: tokens.danger, strokeWidth: 0 }}
              legendType="circle"
              isAnimationActive={false}
            />
          )}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="avgLatencyMs"
            stroke={tokens.warning}
            strokeWidth={2}
            name="Avg latency (ms)"
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="p90LatencyMs"
            stroke={CHART_PURPLE}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            name="P90 (ms)"
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="p99LatencyMs"
            stroke={CHART_WARNING}
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
