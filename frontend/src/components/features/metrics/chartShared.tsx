import type { ReactNode } from 'react';
import { Box, Card, Skeleton, Typography } from '@mui/material';
import { tokens } from '@/styles/theme';

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
