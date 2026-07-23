import {
  Box,
  Card,
  Chip,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import type { MetricsHealth, PodHealth } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import { Sparkline, formatTs } from './chartShared';

interface Props {
  data: MetricsHealth | undefined;
  loading: boolean;
  utc?: boolean;
}

// A pod younger than this gets a "restarted" badge — fresh boots right after
// a deploy are expected; repeated ones are crash-looping.
const RESTART_BADGE_UNDER_SEC = 15 * 60;

const formatUptime = (sec: number): string => {
  if (sec >= 86_400) return `${Math.floor(sec / 86_400)}d ${Math.floor((sec % 86_400) / 3600)}h`;
  if (sec >= 3_600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  if (sec >= 60) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${sec}s`;
};

const VALKEY_CHIP: Record<MetricsHealth['valkey'], { label: string; color: string }> = {
  connected: { label: 'Valkey: connected', color: tokens.success },
  unavailable: { label: 'Valkey: unavailable', color: tokens.danger },
  disabled: { label: 'Valkey: disabled (local mode)', color: tokens.textSubtle },
};

const StatCard = ({ label, value, unit }: { label: string; value: string; unit?: string }) => (
  <Card sx={{ p: 2, height: '100%' }}>
    <Typography variant="body2" sx={{ color: tokens.textSubtle, mb: 0.5 }}>
      {label}
    </Typography>
    <Typography variant="h4" sx={{ fontWeight: 700 }}>
      {value}
      {unit && (
        <Typography component="span" variant="body2" sx={{ ml: 0.5, color: tokens.textSubtle }}>
          {unit}
        </Typography>
      )}
    </Typography>
  </Card>
);

const lagColor = (lagMs: number): string | undefined => {
  if (lagMs >= 200) return tokens.danger;
  if (lagMs >= 50) return tokens.warning;
  return undefined;
};

const cpuColor = (pct: number): string | undefined => {
  if (pct >= 90) return tokens.danger;
  if (pct >= 60) return tokens.warning;
  return undefined;
};

// Value + trend sparkline pulled from the pod's heartbeat history.
const TrendCell = ({
  value,
  values,
  color,
}: {
  value: string;
  values: number[] | undefined;
  color?: string;
}) => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
    {values && values.length > 1 && <Sparkline values={values} color={color ?? tokens.brand} />}
    <Typography variant="body2" component="span" sx={{ color }}>
      {value}
    </Typography>
  </Box>
);

const PodsTable = ({ pods, utc }: { pods: PodHealth[]; utc?: boolean }) => (
  <TableContainer>
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Pod</TableCell>
          <TableCell>Version</TableCell>
          <TableCell align="right">CPU</TableCell>
          <TableCell align="right">Req/min</TableCell>
          <TableCell align="right">Heap</TableCell>
          <TableCell align="right">RSS</TableCell>
          <TableCell align="right">Loop lag (p99)</TableCell>
          <TableCell align="right">GC</TableCell>
          <TableCell align="right">Buffer</TableCell>
          <TableCell align="right">Uptime</TableCell>
          <TableCell align="right">Last seen</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {pods.map((p) => {
          const history = p.history ?? [];
          return (
            <TableRow key={p.pod} hover>
              <TableCell sx={{ fontWeight: 600 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  {p.pod}
                  {p.uptimeSec < RESTART_BADGE_UNDER_SEC && (
                    <Tooltip title={`Pod started ${formatUptime(p.uptimeSec)} ago`}>
                      <Chip
                        label="restarted"
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: 10,
                          fontWeight: 600,
                          color: tokens.textInverse,
                          bgcolor: tokens.warning,
                        }}
                      />
                    </Tooltip>
                  )}
                </Box>
              </TableCell>
              <TableCell>{p.version}</TableCell>
              <TableCell align="right">
                <TrendCell
                  value={p.cpuPct !== undefined ? `${p.cpuPct}%` : '—'}
                  values={history.map((h) => h.cpuPct)}
                  color={p.cpuPct !== undefined ? cpuColor(p.cpuPct) : undefined}
                />
              </TableCell>
              <TableCell align="right">
                <TrendCell
                  value={String(p.requestsLastMin)}
                  values={history.map((h) => h.requestsLastMin)}
                />
              </TableCell>
              <TableCell align="right">
                <TrendCell
                  value={`${p.heapUsedMb} / ${p.heapTotalMb} MB`}
                  values={history.map((h) => h.heapUsedMb)}
                />
              </TableCell>
              <TableCell align="right">{`${p.rssMb} MB`}</TableCell>
              <TableCell align="right">
                <TrendCell
                  value={`${p.eventLoopLagMs} / ${p.eventLoopLagP99Ms} ms`}
                  values={history.map((h) => h.eventLoopLagP99Ms)}
                  color={lagColor(p.eventLoopLagP99Ms)}
                />
              </TableCell>
              <TableCell align="right">
                {p.gcCount !== undefined ? (
                  <Tooltip title="GC runs / pause time since the previous heartbeat">
                    <span>{`${p.gcCount} · ${p.gcPauseMs ?? 0}ms`}</span>
                  </Tooltip>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell align="right">{p.bufferRecords.toLocaleString()}</TableCell>
              <TableCell align="right">{formatUptime(p.uptimeSec)}</TableCell>
              <TableCell align="right" sx={{ color: tokens.textSubtle }}>
                {formatTs(p.lastSeen, 'HH:mm:ss', utc)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </TableContainer>
);

const SystemPanel = ({ data, loading, utc }: Props) => {
  if (loading && !data) {
    return <Skeleton variant="rounded" height={320} />;
  }
  if (!data) {
    return (
      <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
        Health data unavailable.
      </Typography>
    );
  }

  const valkeyChip = VALKEY_CHIP[data.valkey];
  const local = data.pod;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Chip
          label={valkeyChip.label}
          size="small"
          sx={{ fontWeight: 600, color: tokens.textInverse, bgcolor: valkeyChip.color }}
        />
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
          Answering pod: {local.pod} · v{local.version}
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 2,
          mb: 3,
        }}
      >
        <StatCard label="CPU (of one core)" value={local.cpuPct !== undefined ? String(local.cpuPct) : '—'} unit="%" />
        <StatCard label="Event Loop Lag (avg / p99)" value={`${local.eventLoopLagMs} / ${local.eventLoopLagP99Ms}`} unit="ms" />
        <StatCard label="Heap Used" value={`${local.heapUsedMb}`} unit={`/ ${local.heapTotalMb} MB`} />
        <StatCard label="RSS" value={`${local.rssMb}`} unit="MB" />
        <StatCard
          label="GC (since last sample)"
          value={local.gcCount !== undefined ? `${local.gcCount}` : '—'}
          unit={local.gcPauseMs !== undefined ? `runs · ${local.gcPauseMs}ms paused` : undefined}
        />
        <StatCard label="Metrics Buffer" value={local.bufferRecords.toLocaleString()} unit="records" />
        <StatCard label="Requests (last min)" value={String(local.requestsLastMin)} />
        <StatCard label="Uptime" value={formatUptime(local.uptimeSec)} />
      </Box>

      <Card sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ mb: 1.5 }}>
          Pods
        </Typography>
        {data.cluster.length === 0 ? (
          <Box>
            <Typography variant="body2" sx={{ color: tokens.textSubtle, mb: 1.5 }}>
              Cluster metrics disabled — only this pod is visible. Enable METRICS_CLUSTER_ENABLED
              to see every pod.
            </Typography>
            <PodsTable pods={[local]} utc={utc} />
          </Box>
        ) : (
          <PodsTable pods={data.cluster} utc={utc} />
        )}
      </Card>
    </Box>
  );
};

export default SystemPanel;
