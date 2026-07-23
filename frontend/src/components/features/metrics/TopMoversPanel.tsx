import { useMemo } from 'react';
import { Box, Card, Chip, Skeleton, Tooltip, Typography } from '@mui/material';
import type { RouteBreakdown } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import { formatMs } from './chartShared';

interface Props {
  current: RouteBreakdown[];
  previous: RouteBreakdown[] | undefined;
  loading: boolean;
  onSelect?: (route: RouteBreakdown) => void;
}

// Ignore routes with less traffic than this in either window — deltas on a
// handful of requests are noise.
const MIN_REQUESTS = 10;
// A route must move at least this much to be listed.
const MIN_LATENCY_DELTA_PCT = 20;
const MIN_ERROR_DELTA_PP = 2;

interface Mover {
  route: RouteBreakdown;
  latencyDeltaPct: number | null;
  errorDeltaPp: number | null;
  score: number;
}

const errorRate = (r: RouteBreakdown): number =>
  r.requestCount > 0 ? (r.errorCount / r.requestCount) * 100 : 0;

// Latency basis: p95 when both windows carry it, else avg.
const latencyOf = (r: RouteBreakdown, other: RouteBreakdown): number =>
  r.p95LatencyMs !== undefined && other.p95LatencyMs !== undefined
    ? r.p95LatencyMs
    : r.avgLatencyMs;

const computeMovers = (current: RouteBreakdown[], previous: RouteBreakdown[]): Mover[] => {
  const prevByKey = new Map(previous.map((r) => [`${r.method} ${r.route}`, r]));
  const movers: Mover[] = [];
  for (const route of current) {
    const prev = prevByKey.get(`${route.method} ${route.route}`);
    if (!prev) continue;
    if (route.requestCount < MIN_REQUESTS || prev.requestCount < MIN_REQUESTS) continue;

    const currLat = latencyOf(route, prev);
    const prevLat = latencyOf(prev, route);
    const latencyDeltaPct = prevLat > 0 ? ((currLat - prevLat) / prevLat) * 100 : null;
    const errorDeltaPp = errorRate(route) - errorRate(prev);

    const latSignificant = latencyDeltaPct !== null && Math.abs(latencyDeltaPct) >= MIN_LATENCY_DELTA_PCT;
    const errSignificant = Math.abs(errorDeltaPp) >= MIN_ERROR_DELTA_PP;
    if (!latSignificant && !errSignificant) continue;

    movers.push({
      route,
      latencyDeltaPct: latSignificant ? latencyDeltaPct : null,
      errorDeltaPp: errSignificant ? errorDeltaPp : null,
      // Error movement dominates latency movement of the same magnitude.
      score:
        (latSignificant ? Math.abs(latencyDeltaPct!) : 0) +
        (errSignificant ? Math.abs(errorDeltaPp) * 20 : 0),
    });
  }
  return movers.sort((a, b) => b.score - a.score);
};

const DeltaChip = ({ label, worse }: { label: string; worse: boolean }) => (
  <Chip
    label={label}
    size="small"
    sx={{
      height: 18,
      fontSize: 10,
      fontWeight: 600,
      color: worse ? tokens.danger : tokens.success,
      bgcolor: 'transparent',
      border: `1px solid ${worse ? tokens.danger : tokens.success}`,
    }}
  />
);

// Routes whose latency or error rate moved the most vs the previous window
// of the same length — the "what just got worse" triage list.
const TopMoversPanel = ({ current, previous, loading, onSelect }: Props) => {
  const movers = useMemo(
    () => (previous ? computeMovers(current, previous).slice(0, 6) : []),
    [current, previous],
  );

  return (
    <Card sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="h5">Top Movers</Typography>
        <Tooltip title="Routes whose p95 latency or error rate changed most vs the previous window of the same length. Low-traffic routes are excluded.">
          <Typography variant="caption" sx={{ color: tokens.textSubtlest, cursor: 'default' }}>
            vs previous window
          </Typography>
        </Tooltip>
      </Box>
      {loading ? (
        <Skeleton variant="rounded" height={160} />
      ) : movers.length === 0 ? (
        <Box sx={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
            No significant movement vs the previous window
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {movers.map((m, idx) => (
            <Box
              key={`${m.route.method} ${m.route.route}`}
              onClick={onSelect ? () => onSelect(m.route) : undefined}
              title={onSelect ? 'View samples for this route' : undefined}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 0.5,
                borderBottom: idx < movers.length - 1 ? `1px solid ${tokens.border}` : 'none',
                cursor: onSelect ? 'pointer' : 'default',
                '&:hover': onSelect ? { bgcolor: tokens.surfaceSunken } : undefined,
              }}
            >
              <Typography
                variant="body2"
                sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                <Typography component="span" variant="body2" sx={{ fontWeight: 600, mr: 0.75 }}>
                  {m.route.method}
                </Typography>
                {m.route.route}
              </Typography>
              {m.latencyDeltaPct !== null && (
                <Tooltip
                  title={`Latency now ${formatMs(latencyOf(m.route, m.route))} (${m.latencyDeltaPct > 0 ? '+' : ''}${m.latencyDeltaPct.toFixed(0)}%)`}
                >
                  <span>
                    <DeltaChip
                      label={`${m.latencyDeltaPct > 0 ? '▲' : '▼'} lat ${Math.abs(m.latencyDeltaPct).toFixed(0)}%`}
                      worse={m.latencyDeltaPct > 0}
                    />
                  </span>
                </Tooltip>
              )}
              {m.errorDeltaPp !== null && (
                <Tooltip
                  title={`Error rate now ${errorRate(m.route).toFixed(1)}% (${m.errorDeltaPp > 0 ? '+' : ''}${m.errorDeltaPp.toFixed(1)} pp)`}
                >
                  <span>
                    <DeltaChip
                      label={`${m.errorDeltaPp > 0 ? '▲' : '▼'} err ${Math.abs(m.errorDeltaPp).toFixed(1)}pp`}
                      worse={m.errorDeltaPp > 0}
                    />
                  </span>
                </Tooltip>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Card>
  );
};

export default TopMoversPanel;
