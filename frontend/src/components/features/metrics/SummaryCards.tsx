import { Box, Card, Typography, Tooltip } from '@mui/material';
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
  tooltip,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  tooltip?: string;
}) => {
  const content = (
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

  if (tooltip) {
    return (
      <Tooltip title={tooltip} arrow>
        {content}
      </Tooltip>
    );
  }
  return content;
};

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
        tooltip={
          loading ? undefined : `P50: ${p50Ms}ms · P90: ${p90Ms}ms · P99: ${p99Ms}ms`
        }
      />
      <MetricCard
        label="Cache Hit Rate"
        value={loading ? '-' : `${summary.cacheHitRate.toFixed(1)}`}
        unit="%"
      />
    </Box>
  );
};

export default SummaryCards;
