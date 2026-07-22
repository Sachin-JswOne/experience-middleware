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
import type { RouteBreakdown } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import { formatMs, formatPercent } from './chartShared';

interface Props {
  data: RouteBreakdown[];
  loading: boolean;
}

type SortKey = 'requestCount' | 'avgLatencyMs' | 'errorCount' | 'cacheHitRate';

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'requestCount', label: 'Requests' },
  { key: 'avgLatencyMs', label: 'Avg Latency' },
  { key: 'errorCount', label: 'Errors' },
  { key: 'cacheHitRate', label: 'Cache Hit' },
];

const exportCsv = (rows: RouteBreakdown[]) => {
  const header = 'method,route,requestCount,avgLatencyMs,errorCount,cacheHitRate';
  const lines = rows.map((r) =>
    [r.method, `"${r.route}"`, r.requestCount, Math.round(r.avgLatencyMs), r.errorCount, r.cacheHitRate.toFixed(1)].join(','),
  );
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'route-metrics.csv';
  a.click();
  URL.revokeObjectURL(url);
};

const RoutesTable = ({ data, loading }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>('avgLatencyMs');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(
    () =>
      [...data].sort((a, b) =>
        sortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey],
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
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={`${r.method} ${r.route}`} hover>
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
                  <TableCell align="right" sx={{ color: r.errorCount > 0 ? tokens.danger : undefined }}>
                    {r.errorCount}
                  </TableCell>
                  <TableCell align="right">{formatPercent(r.cacheHitRate)}</TableCell>
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
