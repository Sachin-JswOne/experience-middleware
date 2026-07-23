import { useMemo, useState } from 'react';
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
import { formatMs, formatPercent } from './chartShared';

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
  | 'cacheHitRate';

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'requestCount', label: 'Requests' },
  { key: 'avgLatencyMs', label: 'Avg Latency' },
  { key: 'p95LatencyMs', label: 'P95' },
  { key: 'c4xx', label: '4xx' },
  { key: 'c5xx', label: '5xx' },
  { key: 'cacheHitRate', label: 'Cache Hit' },
];

const sortValue = (r: RouteBreakdown, key: SortKey): number => {
  if (key === 'c4xx') return r.statusClasses?.c4xx ?? 0;
  if (key === 'c5xx') return r.statusClasses?.c5xx ?? 0;
  if (key === 'p95LatencyMs') return r.p95LatencyMs ?? 0;
  if (key === 'errorCount') return r.errorCount;
  return r[key];
};

const exportCsv = (rows: RouteBreakdown[]) => {
  const header = 'method,route,requestCount,avgLatencyMs,p95LatencyMs,errors4xx,errors5xx,cacheHitRate';
  const lines = rows.map((r) =>
    [
      r.method,
      `"${r.route}"`,
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
        <Typography variant="h5">Routes</Typography>
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
            No data yet
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
                  sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Typography component="span" variant="body2" sx={{ fontWeight: 600, mr: 0.75 }}>
                      {r.method}
                    </Typography>
                    <Typography component="span" variant="body2">
                      {r.route}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{r.requestCount}</TableCell>
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

export default RoutesTable;
