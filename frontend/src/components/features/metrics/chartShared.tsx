import { useState, type ReactNode } from 'react';
import { Box, Card, Skeleton, Typography } from '@mui/material';
import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';
import { tokens } from '@/styles/theme';

dayjs.extend(utcPlugin);

// Tooltips of the Overview timeline charts move together when they share
// this id (they render the same buckets).
export const OVERVIEW_SYNC_ID = 'metrics-overview';

// Deep link from a request id to the log store (Kibana etc.). Set
// VITE_LOG_URL_TEMPLATE to e.g.
//   https://kibana.example.com/app/discover#/?_a=(query:(query:'{requestId}'))
// — '{requestId}' is replaced. Unset → chips copy instead of linking.
export const logUrlFor = (requestId: string): string | null => {
  const template = import.meta.env.VITE_LOG_URL_TEMPLATE as string | undefined;
  if (!template) return null;
  return template.replace('{requestId}', encodeURIComponent(requestId));
};

// Single categorical palette for all metrics charts.
export const CHART_COLORS = [
  tokens.brand,
  '#357DE8',
  '#2898BD',
  '#AF59E1',
  '#E06C00',
  '#5B7F24',
  '#55A0F5',
  '#80C0FF',
];

// Colors for HTTP status classes, shared by every status-class chart.
export const STATUS_CLASS_COLORS = {
  c2xx: tokens.success,
  c3xx: '#55A0F5',
  c4xx: tokens.warning,
  c5xx: tokens.danger,
} as const;

export const STATUS_CLASS_LABELS = {
  c2xx: '2xx',
  c3xx: '3xx',
  c4xx: '4xx',
  c5xx: '5xx',
} as const;

export const formatNumber = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
};

export const formatMs = (value: number): string => {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
};

export const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

// All chart/time labels go through this so the dashboard's UTC toggle
// affects every timestamp consistently.
export const formatTs = (ts: number, template: string, utc = false): string =>
  (utc ? dayjs(ts).utc() : dayjs(ts)).format(template);

// Hour-or-coarser buckets span days — include the date in the axis label.
export const formatBucketTs = (ts: number, bucketIntervalMs?: number, utc = false): string =>
  formatTs(ts, (bucketIntervalMs ?? 0) >= 3_600_000 ? 'DD MMM HH:mm' : 'HH:mm', utc);

// Recharts category axes take string labels — map each deploy marker to the
// label of the bucket it falls into so ReferenceLine can anchor to it.
export const deployMarkerPositions = (
  markers: Array<{ ts: number; version: string }> | undefined,
  buckets: Array<{ bucketTs: number }>,
  bucketIntervalMs: number | undefined,
  utc = false,
): Array<{ x: string; version: string }> => {
  if (!markers || markers.length === 0 || buckets.length === 0) return [];
  const interval = bucketIntervalMs ?? 60_000;
  const out: Array<{ x: string; version: string }> = [];
  for (const marker of markers) {
    const bucket = buckets.find(
      (b) => marker.ts >= b.bucketTs && marker.ts < b.bucketTs + interval,
    );
    if (bucket) {
      out.push({ x: formatBucketTs(bucket.bucketTs, bucketIntervalMs, utc), version: marker.version });
    }
  }
  return out;
};

// --- Drag-to-zoom ------------------------------------------------------
// Charts pass Recharts' mouse state here; rows must carry a `bucketTs`
// field. Releasing the drag reports [from, to) in epoch ms so the page can
// switch to an absolute range — Kibana-style zoom.

interface RechartsMouseState {
  activeLabel?: string | number;
  activePayload?: Array<{ payload?: { bucketTs?: number } }>;
}

interface DragPoint {
  label: string;
  ts: number;
}

export const useDragZoom = (
  onZoom: ((fromTs: number, toTs: number) => void) | undefined,
  bucketIntervalMs: number | undefined,
) => {
  const [start, setStart] = useState<DragPoint | null>(null);
  const [end, setEnd] = useState<DragPoint | null>(null);

  const pointOf = (state: RechartsMouseState | null): DragPoint | null => {
    const ts = state?.activePayload?.[0]?.payload?.bucketTs;
    if (ts === undefined || state?.activeLabel === undefined) return null;
    return { label: String(state.activeLabel), ts };
  };

  const onMouseDown = (state: RechartsMouseState | null) => {
    if (!onZoom) return;
    const point = pointOf(state);
    if (point) {
      setStart(point);
      setEnd(point);
    }
  };

  const onMouseMove = (state: RechartsMouseState | null) => {
    if (!start) return;
    const point = pointOf(state);
    if (point) setEnd(point);
  };

  const onMouseUp = () => {
    if (start && end && start.ts !== end.ts && onZoom) {
      const from = Math.min(start.ts, end.ts);
      const to = Math.max(start.ts, end.ts) + (bucketIntervalMs ?? 60_000);
      onZoom(from, to);
    }
    setStart(null);
    setEnd(null);
  };

  // ReferenceArea props while a drag is live (labels for the category axis).
  const refArea = start && end && start.label !== end.label ? { x1: start.label, x2: end.label } : null;

  return { onMouseDown, onMouseMove, onMouseUp, refArea, zoomEnabled: Boolean(onZoom) };
};

// Tiny inline trend line for table cells (System tab). Pure SVG — no
// recharts overhead per row.
export const Sparkline = ({
  values,
  width = 72,
  height = 18,
  color = tokens.brand,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) => {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }} aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
};

interface ChartCardProps {
  title: string;
  loading: boolean;
  empty: boolean;
  emptyMessage?: string;
  height?: number;
  action?: ReactNode;
  children: ReactNode;
}

const ChartCard = ({
  title,
  loading,
  empty,
  emptyMessage = 'No data yet',
  height = 240,
  action,
  children,
}: ChartCardProps) => (
  <Card sx={{ p: 2, height: '100%' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
      <Typography variant="h5">{title}</Typography>
      {action}
    </Box>
    {loading ? (
      <Skeleton variant="rounded" height={height} />
    ) : empty ? (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
          {emptyMessage}
        </Typography>
      </Box>
    ) : (
      children
    )}
  </Card>
);

export default ChartCard;
