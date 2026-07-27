import {
  AreaChart,
  Area,
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
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  OVERVIEW_SYNC_ID,
  STATUS_CLASS_COLORS,
  STATUS_CLASS_LABELS,
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
  onZoom?: (fromTs: number, toTs: number) => void;
}

const CLASS_KEYS = ['c2xx', 'c3xx', 'c4xx', 'c5xx'] as const;

const StatusClassTimelineChart = ({
  data,
  loading,
  bucketIntervalMs,
  deployMarkers,
  utc,
  onZoom,
}: Props) => {
  const hasStatusData = data.some((b) => b.statusClasses);
  const chartData = data.map((b) => ({
    bucketTs: b.bucketTs,
    time: formatBucketTs(b.bucketTs, bucketIntervalMs, utc),
    c2xx: b.statusClasses?.c2xx ?? 0,
    c3xx: b.statusClasses?.c3xx ?? 0,
    c4xx: b.statusClasses?.c4xx ?? 0,
    c5xx: b.statusClasses?.c5xx ?? 0,
  }));
  const markers = deployMarkerPositions(deployMarkers, data, bucketIntervalMs, utc);
  const zoom = useDragZoom(onZoom, bucketIntervalMs);

  return (
    <ChartCard
      title="Responses by status class"
      loading={loading}
      empty={!hasStatusData || chartData.length === 0}
    >
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart
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
          <YAxis tick={{ fontSize: 12, fill: tokens.textSubtle }} allowDecimals={false} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {markers.map((m) => (
            <ReferenceLine
              key={`${m.x}-${m.version}`}
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
          {CLASS_KEYS.map((key) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stackId="status"
              name={STATUS_CLASS_LABELS[key]}
              stroke={STATUS_CLASS_COLORS[key]}
              fill={STATUS_CLASS_COLORS[key]}
              fillOpacity={0.5}
            />
          ))}
          {zoom.refArea && (
            <ReferenceArea
              x1={zoom.refArea.x1}
              x2={zoom.refArea.x2}
              fill={tokens.brand}
              fillOpacity={0.12}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default StatusClassTimelineChart;
