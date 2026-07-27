import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { MetricsSnapshot, RouteBreakdown } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import { formatMs, formatNumber, formatPercent } from '@/utils/format';

interface Props {
  open: boolean;
  onClose: () => void;
  current: MetricsSnapshot;
  // Same-length window immediately before the selected one.
  previous: MetricsSnapshot | undefined;
}

const deltaColor = (delta: number, higherIsWorse: boolean): string | undefined => {
  if (Math.abs(delta) < 0.005) return undefined;
  const worse = higherIsWorse ? delta > 0 : delta < 0;
  return worse ? tokens.danger : tokens.success;
};

const DeltaText = ({
  delta,
  higherIsWorse,
  format,
}: {
  delta: number;
  higherIsWorse: boolean;
  format: (v: number) => string;
}) => (
  <Typography
    component="span"
    variant="body2"
    sx={{ color: deltaColor(delta, higherIsWorse), fontWeight: tokens.weightBold }}
  >
    {delta > 0 ? '+' : ''}
    {format(delta)}
  </Typography>
);

interface RouteDelta {
  key: string;
  current?: RouteBreakdown;
  previous?: RouteBreakdown;
  latencyDelta: number;
  errorDelta: number;
  requestDelta: number;
}

// Every route present in either window, with per-metric deltas. Sorted by
// latency regression first — that's what a pre/post-deploy check looks for.
const computeRouteDeltas = (
  current: RouteBreakdown[],
  previous: RouteBreakdown[],
): RouteDelta[] => {
  const byKey = new Map<string, RouteDelta>();
  for (const r of current) {
    byKey.set(`${r.method} ${r.route}`, {
      key: `${r.method} ${r.route}`,
      current: r,
      latencyDelta: r.avgLatencyMs,
      errorDelta: r.errorCount,
      requestDelta: r.requestCount,
    });
  }
  for (const r of previous) {
    const key = `${r.method} ${r.route}`;
    const entry = byKey.get(key);
    if (entry) {
      entry.previous = r;
      entry.latencyDelta = (entry.current?.avgLatencyMs ?? 0) - r.avgLatencyMs;
      entry.errorDelta = (entry.current?.errorCount ?? 0) - r.errorCount;
      entry.requestDelta = (entry.current?.requestCount ?? 0) - r.requestCount;
    } else {
      byKey.set(key, {
        key,
        previous: r,
        latencyDelta: -r.avgLatencyMs,
        errorDelta: -r.errorCount,
        requestDelta: -r.requestCount,
      });
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => Math.abs(b.latencyDelta) - Math.abs(a.latencyDelta),
  );
};

// Side-by-side of the selected window vs the window immediately before it —
// summary deltas plus the per-route regression table.
const ComparePanel = ({ open, onClose, current, previous }: Props) => {
  const routeDeltas = useMemo(
    () => (previous ? computeRouteDeltas(current.routeBreakdown, previous.routeBreakdown) : []),
    [current.routeBreakdown, previous],
  );

  const summaryRows: Array<{
    label: string;
    cur: number;
    prev: number | undefined;
    format: (v: number) => string;
    higherIsWorse: boolean;
  }> = [
    {
      label: 'Requests',
      cur: current.summary.totalRequests,
      prev: previous?.summary.totalRequests,
      format: formatNumber,
      higherIsWorse: false,
    },
    {
      label: 'Error rate',
      cur: current.summary.errorRate,
      prev: previous?.summary.errorRate,
      format: formatPercent,
      higherIsWorse: true,
    },
    {
      label: 'Avg latency',
      cur: current.summary.avgLatencyMs,
      prev: previous?.summary.avgLatencyMs,
      format: formatMs,
      higherIsWorse: true,
    },
    {
      label: 'P99 latency',
      cur: current.summary.p99LatencyMs,
      prev: previous?.summary.p99LatencyMs,
      format: formatMs,
      higherIsWorse: true,
    },
    {
      label: 'Cache hit rate',
      cur: current.summary.cacheHitRate,
      prev: previous?.summary.cacheHitRate,
      format: formatPercent,
      higherIsWorse: false,
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Compare with previous window
        <IconButton size="small" onClick={onClose} aria-label="Close compare view">
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {!previous ? (
          <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
            Previous-window data is still loading.
          </Typography>
        ) : (
          <>
            <Table size="small" sx={{ mb: 3 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Metric</TableCell>
                  <TableCell align="right">Previous window</TableCell>
                  <TableCell align="right">This window</TableCell>
                  <TableCell align="right">Δ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summaryRows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell align="right">
                      {row.prev !== undefined ? row.format(row.prev) : '—'}
                    </TableCell>
                    <TableCell align="right">{row.format(row.cur)}</TableCell>
                    <TableCell align="right">
                      {row.prev !== undefined ? (
                        <DeltaText
                          delta={row.cur - row.prev}
                          higherIsWorse={row.higherIsWorse}
                          format={row.format}
                        />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Typography variant="h5" component="h3" sx={{ mb: 1 }}>
              Routes — biggest latency movement first
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Route</TableCell>
                  <TableCell align="right">Requests Δ</TableCell>
                  <TableCell align="right">Avg latency Δ</TableCell>
                  <TableCell align="right">Errors Δ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {routeDeltas.slice(0, 15).map((r) => (
                  <TableRow key={r.key}>
                    <TableCell
                      sx={{
                        maxWidth: 340,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.key}
                      {!r.previous && (
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{ ml: 0.75, color: tokens.textSubtlest }}
                        >
                          new
                        </Typography>
                      )}
                      {!r.current && (
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{ ml: 0.75, color: tokens.textSubtlest }}
                        >
                          gone
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <DeltaText
                        delta={r.requestDelta}
                        higherIsWorse={false}
                        format={formatNumber}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <DeltaText delta={r.latencyDelta} higherIsWorse format={formatMs} />
                    </TableCell>
                    <TableCell align="right">
                      <DeltaText delta={r.errorDelta} higherIsWorse format={formatNumber} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ComparePanel;
