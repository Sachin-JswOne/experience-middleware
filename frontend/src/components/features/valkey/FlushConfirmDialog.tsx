import { useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';

import ValkeyAdminService from '@/services/ValkeyAdminService';

interface FlushConfirmDialogProps {
  scope: 'db' | 'all' | null;
  onClose: () => void;
  onFlushed: () => void;
}

const FlushConfirmDialog = ({ scope, onClose, onFlushed }: FlushConfirmDialogProps) => {
  const { enqueueSnackbar } = useSnackbar();
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (scope) setConfirmText('');
  }, [scope]);

  const handleFlush = async () => {
    if (!scope || confirmText !== 'FLUSH') return;
    setSubmitting(true);
    const result = await ValkeyAdminService.flush(scope, confirmText);
    if (result.error.message || result.error.code) {
      enqueueSnackbar(result.error.message || 'Flush failed', { variant: 'error' });
    } else {
      enqueueSnackbar(
        `Flushed ${scope === 'all' ? 'all databases' : 'current database'} on ${result.data?.nodes ?? 0} node(s)`,
        { variant: 'success' },
      );
      onFlushed();
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={!!scope} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {scope === 'all' ? 'Flush ALL databases?' : 'Flush current database?'}
      </DialogTitle>
      <DialogContent>
        <Alert severity="error" sx={{ mb: 2 }}>
          This permanently deletes{' '}
          {scope === 'all' ? 'every key on every database' : 'every key in the current database'}{' '}
          across all cluster nodes. This cannot be undone.
        </Alert>
        <DialogContentText sx={{ mb: 2 }}>
          Type <strong>FLUSH</strong> to confirm.
        </DialogContentText>
        <TextField
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="FLUSH"
          fullWidth
          autoFocus
          disabled={submitting}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleFlush}
          color="error"
          variant="contained"
          disabled={confirmText !== 'FLUSH' || submitting}
        >
          {submitting ? 'Flushing…' : 'Flush'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlushConfirmDialog;
