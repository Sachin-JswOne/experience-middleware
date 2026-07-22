import { Box, Card, Typography } from '@mui/material';
import type { MetricsSummary } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';

interface SummaryCardsProps {
  summary: MetricsSummary;
  loading: boolean;
}

const errorColor = (rate: number) => {
  if (rate < 2) return tokens.success;
  if (rate < 5) return tokens.warning;
  return tokens.danger;
};

const MetricCard = ({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
}) => (
  <Card sx={{ p: 2, height: '100%' }}>
    <Typography variant="body2" sx={{ color: tokens.textSubtle, mb: 0.5 }}>
      {label}
    </Typography>
    <Typography variant="h4" sx={{ color: color ?? tokens.text, fontWeight: 700 }}>
      {value}
      {unit && (
        <Typography component="span" variant="body2" sx={{ ml: 0.5, color: tokens.textSubtle }}>
          {unit}
        </Typography>
      )}
    </Typography>
  </Card>
);

const SummaryCards = ({ summary, loading }: SummaryCardsProps) => {
  const avgLatMs = Math.round(summary.avgLatencyMs);
  const p50Ms = Math.round(summary.p50LatencyMs);
  const p90Ms = Math.round(summary.p90LatencyMs);
  const p99Ms = Math.round(summary.p99LatencyMs);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 2,
        mb: 3,
      }}
    >
      <MetricCard label="Total Requests" value={loading ? '-' : String(summary.totalRequests)} />
      <MetricCard
        label="Error Rate"
        value={loading ? '-' : `${summary.errorRate.toFixed(1)}`}
        unit="%"
        color={loading ? undefined : errorColor(summary.errorRate)}
      />
      <MetricCard
        label="Avg Latency"
        value={loading ? '-' : String(avgLatMs)}
        unit="ms"
      />
      <MetricCard
        label="Cache Hit Rate"
        value={loading ? '-' : `${summary.cacheHitRate.toFixed(1)}`}
        unit="%"
      />
      <Card sx={{ p: 2, height: '100%' }}>
        <Typography variant="body2" sx={{ color: tokens.textSubtle, mb: 0.5 }}>
          Latency Percentiles
        </Typography>
        {loading ? (
          <Typography variant="h4" sx={{ fontWeight: 700 }}>-</Typography>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="body2" sx={{ color: tokens.textSubtle }}>P50</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{p50Ms}</Typography>
            <Typography variant="body2" sx={{ color: tokens.textSubtle }}>ms</Typography>
            <Typography variant="body2" sx={{ color: tokens.textSubtle }}>P90</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{p90Ms}</Typography>
            <Typography variant="body2" sx={{ color: tokens.textSubtle }}>ms</Typography>
            <Typography variant="body2" sx={{ color: tokens.textSubtle }}>P99</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{p99Ms}</Typography>
            <Typography variant="body2" sx={{ color: tokens.textSubtle }}>ms</Typography>
          </Box>
        )}
      </Card>
    </Box>
  );
};

export default SummaryCards;
