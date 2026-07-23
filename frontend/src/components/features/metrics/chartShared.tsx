import type { ReactNode } from 'react';
import { Box, Card, Skeleton, Typography } from '@mui/material';
import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';
import { tokens } from '@/styles/theme';

dayjs.extend(utcPlugin);

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
