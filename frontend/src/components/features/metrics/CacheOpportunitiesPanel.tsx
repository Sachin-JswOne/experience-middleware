import { useMemo } from 'react';
import { Box, Card, Skeleton, Tooltip, Typography } from '@mui/material';
import type { RouteBreakdown } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import { formatNumber, formatPercent } from './chartShared';

interface Props {
  data: RouteBreakdown[];
  loading: boolean;
}

const MIN_REQUESTS = 20;
const MAX_HIT_RATE_PCT = 50;
const TOP_N = 5;

// High-traffic GET routes with poor cache hit rates — ranked by wasted
// (uncached) request volume. The shortlist for cache tuning.
const CacheOpportunitiesPanel = ({ data, loading }: Props) => {
  const opportunities = useMemo(
    () =>
      data
        .filter(
          (r) =>
            r.method === 'GET' &&
            r.requestCount >= MIN_REQUESTS &&
            r.cacheHitRate < MAX_HIT_RATE_PCT,
        )
        .map((r) => ({
          route: r,
          misses: Math.round(r.requestCount * (1 - r.cacheHitRate / 100)),
        }))
        .sort((a, b) => b.misses - a.misses)
        .slice(0, TOP_N),
    [data],
  );

  return (
    <Card sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="h5">Cache Opportunities</Typography>
        <Tooltip
          title={`GET routes with ≥${MIN_REQUESTS} requests and <${MAX_HIT_RATE_PCT}% cache hit rate, ranked by uncached volume.`}
        >
          <Typography variant="caption" sx={{ color: tokens.textSubtlest, cursor: 'default' }}>
            worst first
          </Typography>
        </Tooltip>
      </Box>
      {loading ? (
        <Skeleton variant="rounded" height={160} />
      ) : opportunities.length === 0 ? (
        <Box sx={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
            No obvious cache wins — high-traffic GETs are already cached well
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {opportunities.map(({ route, misses }, idx) => (
            <Box
              key={`${route.method} ${route.route}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                py: 0.5,
                borderBottom:
                  idx < opportunities.length - 1 ? `1px solid ${tokens.border}` : 'none',
              }}
            >
              <Typography
                variant="body2"
                sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {route.route}
              </Typography>
              <Typography variant="body2" sx={{ color: tokens.textSubtle, whiteSpace: 'nowrap' }}>
                {formatNumber(route.requestCount)} req
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: route.cacheHitRate < 10 ? tokens.danger : tokens.warning,
                  minWidth: 64,
                  textAlign: 'right',
                }}
              >
                {formatPercent(route.cacheHitRate)} hit
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: tokens.textSubtle, minWidth: 88, textAlign: 'right' }}
              >
                {formatNumber(misses)} uncached
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Card>
  );
};

export default CacheOpportunitiesPanel;
