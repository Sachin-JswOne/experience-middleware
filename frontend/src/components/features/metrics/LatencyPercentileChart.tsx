import { memo } from 'react';
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
} from 'recharts';
import type { TimelineBucket } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import ChartCard, {
  CHART_BRAND,
  CHART_PURPLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  CHART_WARNING,
  OVERVIEW_SYNC_ID,
  estimatePercentileFromHistogram,
  formatBucketTs,
  useDragZoom,
} from './chartShared';

interface Props {
  data: TimelineBucket[];
  loading: boolean;
  bucketIntervalMs?: number;
  utc?: boolean;
  onZoom?: (fromTs: number, toTs: number) => void;
}

// Latency percentiles over time, separated from the request/error counts so
// the latency story is readable on its own axis. p50 is estimated
// client-side from each bucket's histogram (the API only ships p90/p99).
const LatencyPercentileChart = ({ data, loading, bucketIntervalMs, utc, onZoom }: Props) => {
  const chartData = data.map((b) => {
    const p50 = b.histogram ? estimatePercentileFromHistogram(b.histogram, 50) : undefined;
    return {
      bucketTs: b.bucketTs,
      time: formatBucketTs(b.bucketTs, bucketIntervalMs, utc),
      p50: p50 !== undefined ? Math.round(p50) : undefined,
      p90: b.p90LatencyMs !== undefined ? Math.round(b.p90LatencyMs) : undefined,
      p99: b.p99LatencyMs !== undefined ? Math.round(b.p99LatencyMs) : undefined,
      avg: Math.round(b.avgLatencyMs),
    };
  });
  const hasPercentiles = chartData.some((d) => d.p50 !== undefined || d.p90 !== undefined);
  const zoom = useDragZoom(onZoom, bucketIntervalMs);

  return (
    <ChartCard
      title="Latency percentiles"
      loading={loading}
      empty={chartData.length === 0 || !hasPercentiles}
      emptyMessage="No latency histogram data for this range (cluster mode required for percentile timelines)."
    >
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
            tick={{ fontSize: 12, fill: tokens.textSubtle }}
            label={{
              value: 'ms',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 12, fill: tokens.textSubtle },
            }}
          />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
          <Legend />
          <Line
            type="monotone"
            dataKey="avg"
            stroke={tokens.textSubtlest}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            name="Avg (ms)"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke={CHART_BRAND}
            strokeWidth={2}
            name="P50 (ms)"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="p90"
            stroke={CHART_PURPLE}
            strokeWidth={2}
            name="P90 (ms)"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="p99"
            stroke={CHART_WARNING}
            strokeWidth={2}
            name="P99 (ms)"
            dot={false}
          />
          {zoom.refArea && (
            <ReferenceArea
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

export default memo(LatencyPercentileChart);
