import { useMemo, useState } from 'react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
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
import type { DeployMarker, DownstreamTimeline } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import ChartCard, {
  CHART_COLORS,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  deployMarkerPositions,
  formatBucketTs,
  formatMs,
  useDragZoom,
} from './chartShared';

interface Props {
  data: DownstreamTimeline[];
  loading: boolean;
  bucketIntervalMs?: number;
  deployMarkers?: DeployMarker[];
  utc?: boolean;
  onZoom?: (fromTs: number, toTs: number) => void;
}

type LatencyMode = 'avg' | 'p95';

const DownstreamTimelineChart = ({
  data,
  loading,
  bucketIntervalMs,
  deployMarkers,
  utc,
  onZoom,
}: Props) => {
  const [mode, setMode] = useState<LatencyMode>('avg');
  const hasP95 = useMemo(
    () => data.some((series) => series.points.some((p) => p.p95LatencyMs !== undefined)),
    [data],
  );
  const effectiveMode: LatencyMode = hasP95 ? mode : 'avg';

  const { chartData, targets } = useMemo(() => {
    const targetNames = data.map((d) => d.target);
    const rows = new Map<number, Record<string, number | string>>();
    for (const series of data) {
      for (const point of series.points) {
        let row = rows.get(point.bucketTs);
        if (!row) {
          row = {
            bucketTs: point.bucketTs,
            time: formatBucketTs(point.bucketTs, bucketIntervalMs, utc),
          };
          rows.set(point.bucketTs, row);
        }
        const value =
          effectiveMode === 'p95' ? (point.p95LatencyMs ?? point.avgLatencyMs) : point.avgLatencyMs;
        row[series.target] = Math.round(value);
      }
    }
    return {
      chartData: Array.from(rows.values()).sort(
        (a, b) => (a.bucketTs as number) - (b.bucketTs as number),
      ),
      targets: targetNames,
    };
  }, [data, bucketIntervalMs, utc, effectiveMode]);

  const buckets = useMemo(
    () => chartData.map((row) => ({ bucketTs: row.bucketTs as number })),
    [chartData],
  );
  const markers = deployMarkerPositions(deployMarkers, buckets, bucketIntervalMs, utc);
  const zoom = useDragZoom(onZoom, bucketIntervalMs);

  return (
    <ChartCard
      title="Downstream latency over time"
      loading={loading}
      empty={chartData.length === 0}
      emptyMessage="No downstream calls in this window"
      action={
        hasP95 ? (
          <ToggleButtonGroup
            value={effectiveMode}
            exclusive
            size="small"
            onChange={(_, next: LatencyMode | null) => {
              if (next) setMode(next);
            }}
            aria-label="Latency statistic"
          >
            <ToggleButton value="avg" sx={{ px: 1, py: 0.25, fontSize: 11 }}>
              Avg
            </ToggleButton>
            <ToggleButton value="p95" sx={{ px: 1, py: 0.25, fontSize: 11 }}>
              P95
            </ToggleButton>
          </ToggleButtonGroup>
        ) : undefined
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart
          data={chartData}
          margin={{ top: 4, right: 4, left: -4, bottom: 0 }}
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
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
            formatter={(value, name) => [formatMs(Number(value)), name as string]}
          />
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
          {zoom.refArea && (
            <ReferenceArea
              x1={zoom.refArea.x1}
              x2={zoom.refArea.x2}
              fill={tokens.brand}
              fillOpacity={0.12}
            />
          )}
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
