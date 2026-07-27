import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Drawer,
  IconButton,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import { useQuery } from '@tanstack/react-query';
import MetricsService from '@/services/MetricsService';
import type { RouteErrorSample } from '@/_types/metrics.interface';
import { formatMs, formatTs } from '@/utils/format';
import { tokens } from '@/styles/theme';
import type { MetricsRange } from '../useMetricsQuery';
import SampleAccordion from './SampleAccordion';
import RouteTrendChart from './RouteTrendChart';
import { exportSamplesCsv } from './sampleExport';

/**
 * What the drawer shows: one route's samples, or every route's samples inside
 * a time window + latency band (latency-heatmap drill-through).
 */
export type SamplesQuery =
  | { kind: 'route'; method: string; route: string }
  | {
      kind: 'band';
      fromTs: number;
      toTs: number;
      minMs: number;
      maxMs: number | null;
      label: string;
    };

type SampleKind = 'all' | 'errors' | 'slow';

// Backend caps sample responses at 500 — "view all" asks for that maximum.
const MAX_SAMPLES = 500;
const REFRESH_MS = 15_000;
const DEFAULT_SLOW_MS = 3000;

interface Props {
  query: SamplesQuery | null;
  onClose: () => void;
  utc?: boolean;
  // Dashboard's current range — the route trend chart follows it.
  range?: MetricsRange;
}

const queryTitle = (query: SamplesQuery, utc?: boolean): string => {
  if (query.kind === 'route') return `${query.method} ${query.route}`;
  return `${query.label} · ${formatTs(query.fromTs, 'HH:mm', utc)}–${formatTs(query.toTs, 'HH:mm', utc)}`;
};

const sourceCaption = (query: SamplesQuery | null, source?: 'cluster' | 'local'): string => {
  if (query?.kind === 'band') {
    return source === 'cluster'
      ? 'Samples in this latency band — errors & slow cluster-wide'
      : 'Samples in this latency band across all routes (this pod only)';
  }
  return source === 'cluster'
    ? 'Errors & slow cluster-wide, successes from this pod — newest first'
    : 'Request samples (last few on this pod, newest first)';
};

const RouteSamplesDrawer = ({ query, onClose, utc, range }: Props) => {
  const open = query !== null;
  const [kind, setKind] = useState<SampleKind>('all');
  const [podFilter, setPodFilter] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [lastQuery, setLastQuery] = useState<SamplesQuery | null>(null);

  // Keep the last query while the drawer animates closed.
  if (query && query !== lastQuery) {
    setLastQuery(query);
    setShowAll(false);
  }
  const active = query ?? lastQuery;
  const limit = showAll ? MAX_SAMPLES : undefined;

  const { data, isPending } = useQuery({
    queryKey: ['metrics-samples', active, showAll],
    queryFn: async () => {
      if (!active) throw new Error('No sample query');
      const result =
        active.kind === 'route'
          ? await MetricsService.getRouteSamples(active.method, active.route, limit)
          : await MetricsService.getSamplesInBand({
              from: active.fromTs,
              to: active.toTs,
              minMs: active.minMs > 0 ? active.minMs : undefined,
              maxMs: active.maxMs ?? undefined,
              limit,
            });
      if (!result.data || result.error.code) {
        throw new Error(result.error.message || 'Failed to load samples');
      }
      return result.data;
    },
    enabled: open && active !== null,
    refetchInterval: open ? REFRESH_MS : false,
  });

  const samples = useMemo(() => data?.samples ?? [], [data]);
  const slowThresholdMs = data?.slowThresholdMs ?? DEFAULT_SLOW_MS;
  const isSlow = (s: RouteErrorSample) => s.statusCode < 400 && s.durationMs >= slowThresholdMs;

  const podOptions = useMemo(
    () => Array.from(new Set(samples.map((s) => s.pod).filter(Boolean) as string[])).sort(),
    [samples],
  );

  const filtered = useMemo(
    () =>
      samples.filter((s) => {
        if (podFilter && s.pod !== podFilter) return false;
        if (kind === 'errors') return s.statusCode >= 400;
        if (kind === 'slow') return s.statusCode < 400 && s.durationMs >= slowThresholdMs;
        return true;
      }),
    [samples, podFilter, kind, slowThresholdMs],
  );

  // Older backends don't send totalMatched — fall back so the button hides.
  const totalMatched = data?.totalMatched ?? samples.length;
  const truncated = !showAll && data !== undefined && totalMatched > samples.length;

  const renderBody = () => {
    if (isPending) return <Skeleton variant="rounded" height={160} />;
    if (data && !data.enabled) {
      return (
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
          Request sampling is disabled (METRICS_SAMPLES_ENABLED).
        </Typography>
      );
    }
    if (filtered.length === 0) {
      return (
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
          No {kind === 'errors' ? 'error ' : kind === 'slow' ? 'slow ' : ''}samples captured{' '}
          {active?.kind === 'band' ? 'in this band' : 'for this route'} yet (kept in memory since
          the pod started).
        </Typography>
      );
    }
    return filtered.map((s, idx) => (
      <SampleAccordion
        key={`${s.ts}-${idx}`}
        sample={s}
        slow={isSlow(s)}
        showRoute={active?.kind === 'band'}
        utc={utc}
      />
    ));
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: '100vw', md: '80vw' }, p: 2.5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            mb: 0.5,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" component="h2" sx={{ wordBreak: 'break-all' }}>
              {active ? queryTitle(active, utc) : ''}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.textSubtle, mt: 0.5 }}>
              {sourceCaption(active, data?.source)}
              {samples.length > 0 ? ` — showing ${samples.length} of ${totalMatched}` : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Tooltip title="Export samples as CSV">
              <span>
                <IconButton
                  size="small"
                  aria-label="Export samples as CSV"
                  onClick={() => exportSamplesCsv(filtered)}
                  disabled={filtered.length === 0}
                >
                  <DownloadIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
            <IconButton size="small" onClick={onClose} aria-label="Close samples drawer">
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </Box>

        {active?.kind === 'route' && (
          <RouteTrendChart method={active.method} route={active.route} range={range} utc={utc} />
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, flexWrap: 'wrap' }}>
          <ToggleButtonGroup
            value={kind}
            exclusive
            size="small"
            onChange={(_, next: SampleKind | null) => {
              if (next) setKind(next);
            }}
            aria-label="Sample filter"
          >
            <ToggleButton value="all" aria-label="All samples">
              All
            </ToggleButton>
            <ToggleButton value="errors" aria-label="Error samples only">
              Errors
            </ToggleButton>
            <ToggleButton value="slow" aria-label="Slow samples only">
              {`Slow (≥${formatMs(slowThresholdMs)})`}
            </ToggleButton>
          </ToggleButtonGroup>
          {podOptions.length > 1 && (
            <ToggleButtonGroup
              value={podFilter}
              exclusive
              size="small"
              onChange={(_, next: string | null) => setPodFilter(next)}
              aria-label="Pod filter"
            >
              {podOptions.map((pod) => (
                <ToggleButton
                  key={pod}
                  value={pod}
                  aria-label={`Only pod ${pod}`}
                  sx={{ fontFamily: 'monospace', textTransform: 'none' }}
                >
                  {pod}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}
        </Box>

        <Box sx={{ mt: 2 }}>
          {renderBody()}
          {truncated && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
              <Button size="small" variant="text" onClick={() => setShowAll(true)}>
                {`View all ${totalMatched} captured hits`}
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Drawer>
  );
};

export default RouteSamplesDrawer;
