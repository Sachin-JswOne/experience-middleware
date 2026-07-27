import { memo, useMemo, useState  } from 'react';
import {
  Box,
  Card,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import type { RouteBreakdown } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import { PILL_STYLES, type PillTone } from './statusPill';
import { formatMs, formatNumber, formatPercent } from '@/utils/format';

interface Props {
  data: RouteBreakdown[];
  loading: boolean;
  onRowClick?: (route: RouteBreakdown) => void;
  // "View downstream" drill — jumps to the Downstream tab scoped to the route.
  onDrill?: (route: RouteBreakdown) => void;
}

type SortKey =
  | 'requestCount'
  | 'avgLatencyMs'
  | 'p95LatencyMs'
  | 'errorCount'
  | 'c4xx'
  | 'c5xx'
  | 'cacheHitRate'
  | 'health';

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'health', label: 'Health' },
  { key: 'requestCount', label: 'Requests' },
  { key: 'avgLatencyMs', label: 'Avg latency' },
  { key: 'p95LatencyMs', label: 'P95' },
  { key: 'c4xx', label: '4xx' },
  { key: 'c5xx', label: '5xx' },
  { key: 'cacheHitRate', label: 'Cache hit' },
];

// Single sortable 0–100 health score per route: error rate dominates (5xx
// weighted double vs 4xx), latency drags via p95 (fallback avg). Purely a
// triage aid — the raw columns stay authoritative.
export const routeHealthScore = (r: RouteBreakdown): number => {
  if (r.requestCount === 0) return 100;
  const c5xx = r.statusClasses?.c5xx ?? 0;
  const c4xx = r.statusClasses?.c4xx ?? Math.max(0, r.errorCount - c5xx);
  const errorPenalty = ((c5xx * 2 + c4xx) / r.requestCount) * 100 * 2;
  const latencyMs = r.p95LatencyMs ?? r.avgLatencyMs;
  // 0 penalty at ≤200ms, full 30 at ≥3s.
  const latencyPenalty = Math.min(30, Math.max(0, ((latencyMs - 200) / 2800) * 30));
  return Math.max(0, Math.round(100 - errorPenalty - latencyPenalty));
};

const healthGrade = (score: number): { label: string; color: string; bg: string } => {
  const tone: PillTone = score >= 90 ? 'success' : score >= 70 ? 'warning' : 'danger';
  return { label: String(score), color: PILL_STYLES[tone].text, bg: PILL_STYLES[tone].bg };
};

const sortValue = (r: RouteBreakdown, key: SortKey): number => {
  if (key === 'health') return routeHealthScore(r);
  if (key === 'c4xx') return r.statusClasses?.c4xx ?? 0;
  if (key === 'c5xx') return r.statusClasses?.c5xx ?? 0;
  if (key === 'p95LatencyMs') return r.p95LatencyMs ?? 0;
  if (key === 'errorCount') return r.errorCount;
  return r[key];
};

const exportCsv = (rows: RouteBreakdown[]) => {
  const header =
    'method,route,health,requestCount,avgLatencyMs,p95LatencyMs,errors4xx,errors5xx,cacheHitRate';
  const lines = rows.map((r) =>
    [
      r.method,
      `"${r.route}"`,
      routeHealthScore(r),
      r.requestCount,
      Math.round(r.avgLatencyMs),
      r.p95LatencyMs !== undefined ? Math.round(r.p95LatencyMs) : '',
      r.statusClasses?.c4xx ?? '',
      r.statusClasses?.c5xx ?? '',
      r.cacheHitRate.toFixed(1),
    ].join(','),
  );
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'route-metrics.csv';
  a.click();
  URL.revokeObjectURL(url);
};

const RoutesTable = ({ data, loading, onRowClick, onDrill }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>('avgLatencyMs');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(
    () =>
      [...data].sort((a, b) =>
        sortDir === 'desc'
          ? sortValue(b, sortKey) - sortValue(a, sortKey)
          : sortValue(a, sortKey) - sortValue(b, sortKey),
      ),
    [data, sortKey, sortDir],
  );

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <Card sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="h5" component="h2">
          Routes
        </Typography>
        <Tooltip title="Export CSV">
          <span>
            <IconButton
              size="small"
              aria-label="Export routes as CSV"
              onClick={() => exportCsv(sorted)}
              disabled={loading || sorted.length === 0}
            >
              <DownloadIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      {loading ? (
        <Skeleton variant="rounded" height={200} />
      ) : sorted.length === 0 ? (
        <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
            No requests in this time range. Try a wider range or clear filters.
          </Typography>
        </Box>
      ) : (
        <TableContainer sx={{ maxHeight: 360 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Route</TableCell>
                {COLUMNS.map((col) => (
                  <TableCell key={col.key} align="right">
                    <TableSortLabel
                      active={sortKey === col.key}
                      direction={sortKey === col.key ? sortDir : 'desc'}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
                {onDrill && <TableCell align="right" />}
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((r) => (
                <TableRow
                  key={`${r.method} ${r.route}`}
                  hover
                  onClick={() => onRowClick?.(r)}
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(r);
                          }
                        }
                      : undefined
                  }
                  sx={{
                    cursor: onRowClick ? 'pointer' : 'default',
                    '&:focus-visible': onRowClick
                      ? { outline: `2px solid ${tokens.borderFocused}`, outlineOffset: -2 }
                      : undefined,
                  }}
                >
                  <TableCell
                    sx={{
                      maxWidth: 320,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Tooltip title={`${r.method} ${r.route}`}>
                      <Box component="span">
                        <Typography
                          component="span"
                          variant="body2"
                          sx={{ fontWeight: tokens.weightBold, mr: 0.75 }}
                        >
                          {r.method}
                        </Typography>
                        <Typography component="span" variant="body2">
                          {r.route}
                        </Typography>
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    {(() => {
                      const score = routeHealthScore(r);
                      const grade = healthGrade(score);
                      return (
                        <Tooltip title="Health score: 100 minus error-rate and latency penalties (5xx weigh double)">
                          <Box
                            component="span"
                            sx={{
                              display: 'inline-block',
                              px: 0.75,
                              py: 0.1,
                              borderRadius: 1,
                              fontSize: 12,
                              fontWeight: tokens.weightBold,
                              color: grade.color,
                              bgcolor: grade.bg,
                            }}
                          >
                            {grade.label}
                          </Box>
                        </Tooltip>
                      );
                    })()}
                  </TableCell>
                  <TableCell align="right">{formatNumber(r.requestCount)}</TableCell>
                  <TableCell align="right">{formatMs(r.avgLatencyMs)}</TableCell>
                  <TableCell align="right">
                    {r.p95LatencyMs !== undefined ? formatMs(r.p95LatencyMs) : '—'}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: (r.statusClasses?.c4xx ?? 0) > 0 ? tokens.warning : undefined }}
                  >
                    {r.statusClasses?.c4xx ?? '—'}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: (r.statusClasses?.c5xx ?? 0) > 0 ? tokens.danger : undefined }}
                  >
                    {r.statusClasses?.c5xx ?? '—'}
                  </TableCell>
                  <TableCell align="right">{formatPercent(r.cacheHitRate)}</TableCell>
                  {onDrill && (
                    <TableCell align="right" sx={{ width: 40 }}>
                      {(r.targets?.length ?? 0) > 0 && (
                        <Tooltip title="View downstream calls for this route">
                          <IconButton
                            size="small"
                            aria-label={`View downstream for ${r.method} ${r.route}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDrill(r);
                            }}
                          >
                            <AccountTreeIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Card>
  );
};

export default memo(RoutesTable);
