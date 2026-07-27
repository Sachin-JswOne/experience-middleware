import { useState } from 'react';
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

import { useFlush } from './useValkeyQueries';

interface FlushConfirmDialogProps {
  scope: 'db' | 'all' | null;
  onClose: () => void;
  onFlushed: () => void;
}

const CONFIRM_WORD = 'FLUSH';

const FlushConfirmDialog = ({ scope, onClose, onFlushed }: FlushConfirmDialogProps) => {
  const [confirmText, setConfirmText] = useState('');
  // Clears the typed confirmation whenever a new flush is requested, so the
  // destructive button never starts out already armed.
  const [lastScope, setLastScope] = useState(scope);
  if (scope !== lastScope) {
    setLastScope(scope);
    if (scope) setConfirmText('');
  }

  const flushMutation = useFlush(onFlushed);
  const submitting = flushMutation.isPending;

  const handleFlush = () => {
    if (!scope || confirmText !== CONFIRM_WORD) return;
    flushMutation.mutate({ scope, confirm: confirmText });
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
          disabled={confirmText !== CONFIRM_WORD || submitting}
        >
          {submitting ? 'Flushing…' : 'Flush'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlushConfirmDialog;
