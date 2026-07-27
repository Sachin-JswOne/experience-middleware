import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import RefreshIcon from '@mui/icons-material/Refresh';

import { formatBytes, formatUptime } from '@/utils/format';
import { tokens } from '@/styles/theme';
import ClientsDialog from './ClientsDialog';
import FlushConfirmDialog from './FlushConfirmDialog';
import { useValkeyClusterNodes, useValkeyInfo } from './useValkeyQueries';

interface ClusterInfoPanelProps {
  canWrite: boolean;
}

const StatCard = ({
  label,
  value,
  caption,
  onClick,
}: {
  label: string;
  value: string;
  caption?: string;
  onClick?: () => void;
}) => (
  <Paper
    variant="outlined"
    onClick={onClick}
    sx={{
      p: 2,
      minWidth: 160,
      flex: 1,
      ...(onClick && { cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }),
    }}
  >
    <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
      {label}
    </Typography>
    <Typography variant="h5" sx={{ mt: 0.5 }}>
      {value}
    </Typography>
    {caption && (
      <Typography variant="caption" sx={{ color: tokens.textSubtle }}>
        {caption}
      </Typography>
    )}
  </Paper>
);

const ClusterInfoPanel = ({ canWrite }: ClusterInfoPanelProps) => {
  const [flushScope, setFlushScope] = useState<'db' | 'all' | null>(null);
  const [clientsOpen, setClientsOpen] = useState(false);

  const infoQuery = useValkeyInfo();
  const nodesQuery = useValkeyClusterNodes();

  const info = infoQuery.data;
  const clusterNodes = nodesQuery.data;
  const loading = infoQuery.isFetching || nodesQuery.isFetching;
  const error = infoQuery.error instanceof Error ? infoQuery.error.message : '';

  const fetchAll = () => {
    void infoQuery.refetch();
    void nodesQuery.refetch();
  };

  if (infoQuery.isPending && !info) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !info) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
        <Button variant="outlined" onClick={fetchAll}>
          Retry
        </Button>
      </Box>
    );
  }

  const totals = info?.totals;
  const hitTotal = (totals?.keyspaceHits ?? 0) + (totals?.keyspaceMisses ?? 0);
  const hitRate =
    hitTotal > 0 ? `${(((totals?.keyspaceHits ?? 0) / hitTotal) * 100).toFixed(1)}%` : '—';

  return (
    <Box>
      <Toolbar disableGutters sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1, px: 0 }}>
        <Tooltip title="Refresh">
          <IconButton aria-label="Refresh cluster info" onClick={fetchAll} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Toolbar>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <StatCard label="Total keys" value={String(totals?.dbSize ?? 0)} />
        <StatCard
          label="Memory used"
          value={
            totals && totals.memoryLimitBytes > 0
              ? `${formatBytes(totals.usedMemoryBytes)} / ${formatBytes(totals.memoryLimitBytes)}`
              : formatBytes(totals?.usedMemoryBytes ?? 0)
          }
          caption={
            totals && totals.memoryLimitBytes > 0
              ? `${((totals.usedMemoryBytes / totals.memoryLimitBytes) * 100).toFixed(1)}% used`
              : undefined
          }
        />
        <StatCard
          label="Connected clients"
          value={String(totals?.connectedClients ?? 0)}
          caption="Click for details"
          onClick={() => setClientsOpen(true)}
        />
        <StatCard label="Hit rate" value={hitRate} />
      </Box>

      <Typography variant="h6" sx={{ mb: 1 }}>
        Nodes
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Node</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Version</TableCell>
              <TableCell>Uptime</TableCell>
              <TableCell align="right">Keys</TableCell>
              <TableCell align="right">Memory</TableCell>
              <TableCell align="right">Clients</TableCell>
              <TableCell align="right">Hit rate</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(info?.nodes ?? []).map((node) => (
              <TableRow key={node.node} hover>
                <TableCell>{node.node}</TableCell>
                <TableCell>
                  <Chip
                    label={node.role}
                    size="small"
                    color={node.role === 'master' ? 'primary' : 'default'}
                  />
                </TableCell>
                <TableCell>{node.version}</TableCell>
                <TableCell>{formatUptime(node.uptimeSeconds)}</TableCell>
                <TableCell align="right">{node.dbSize}</TableCell>
                <TableCell align="right">
                  {node.usedMemoryHuman || formatBytes(node.usedMemoryBytes)}
                  {node.maxMemoryBytes > 0 ? ` / ${formatBytes(node.maxMemoryBytes)}` : ''}
                </TableCell>
                <TableCell align="right">{node.connectedClients}</TableCell>
                <TableCell align="right">
                  {node.hitRate !== null ? `${(node.hitRate * 100).toFixed(1)}%` : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {clusterNodes?.mode === 'cluster' && (
        <>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Cluster topology
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Address</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Slots</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clusterNodes.nodes.map((node) => (
                  <TableRow key={node.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {node.id.slice(0, 12)}
                    </TableCell>
                    <TableCell>{node.address}</TableCell>
                    <TableCell>
                      <Chip
                        label={node.role}
                        size="small"
                        color={node.role === 'master' ? 'primary' : 'default'}
                      />
                    </TableCell>
                    <TableCell>{node.slots || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {canWrite && (
        <Paper variant="outlined" sx={{ p: 2, borderColor: 'error.main' }}>
          <Typography variant="h6" color="error" sx={{ mb: 1 }}>
            Danger zone
          </Typography>
          <Typography variant="body2" sx={{ color: tokens.textSubtle, mb: 2 }}>
            Flushing permanently deletes keys across all cluster nodes.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              color="error"
              variant="outlined"
              startIcon={<DeleteSweepIcon />}
              onClick={() => setFlushScope('db')}
            >
              Flush DB
            </Button>
            <Button
              color="error"
              variant="contained"
              startIcon={<DeleteSweepIcon />}
              onClick={() => setFlushScope('all')}
            >
              Flush All
            </Button>
          </Box>
        </Paper>
      )}

      <ClientsDialog open={clientsOpen} onClose={() => setClientsOpen(false)} />

      <FlushConfirmDialog
        scope={flushScope}
        onClose={() => setFlushScope(null)}
        // The flush mutation already invalidates the valkey queries; this just
        // dismisses the dialog.
        onFlushed={() => setFlushScope(null)}
      />
    </Box>
  );
};

export default ClusterInfoPanel;
