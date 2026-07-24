import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import ValkeyAdminService from '@/services/ValkeyAdminService';
import type { ValkeyClients } from '@/_types/valkey.interface';

interface ClientsDialogProps {
  open: boolean;
  onClose: () => void;
}

const formatSeconds = (seconds: number): string => {
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
};

const ClientsDialog = ({ open, onClose }: ClientsDialogProps) => {
  const [clients, setClients] = useState<ValkeyClients | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    void ValkeyAdminService.getClients().then((result) => {
      if (result.error.message || result.error.code) {
        setError(result.error.message || 'Failed to load connected clients');
      } else {
        setClients(result.data);
      }
      setLoading(false);
    });
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Connected clients{clients ? ` (${clients.total})` : ''}</DialogTitle>
      <DialogContent>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {!loading && error && (
          <Typography color="error" sx={{ py: 2 }}>
            {error}
          </Typography>
        )}
        {!loading &&
          !error &&
          clients?.nodes.map(({ node, clients: nodeClients }) => (
            <Box key={node} sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {node} — {nodeClients.length} client{nodeClients.length === 1 ? '' : 's'}
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>ID</TableCell>
                      <TableCell>Address</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>User</TableCell>
                      <TableCell align="right">DB</TableCell>
                      <TableCell align="right">Age</TableCell>
                      <TableCell align="right">Idle</TableCell>
                      <TableCell>Last command</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {nodeClients.map((c) => (
                      <TableRow key={`${node}-${c.id}`} hover>
                        <TableCell>{c.id}</TableCell>
                        <TableCell>{c.addr}</TableCell>
                        <TableCell>{c.name || '—'}</TableCell>
                        <TableCell>{c.user || '—'}</TableCell>
                        <TableCell align="right">{c.db}</TableCell>
                        <TableCell align="right">{formatSeconds(c.ageSeconds)}</TableCell>
                        <TableCell align="right">{formatSeconds(c.idleSeconds)}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {c.lastCommand || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ClientsDialog;
