import { useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';

import ValkeyAdminService from '@/services/ValkeyAdminService';

interface EditKeyDialogProps {
  open: boolean;
  /** When set, the dialog edits this key (key field locked); otherwise creates a new one. */
  editKey?: string | null;
  initialValue?: string;
  onClose: () => void;
  onSaved: () => void;
}

const EditKeyDialog = ({ open, editKey, initialValue, onClose, onSaved }: EditKeyDialogProps) => {
  const { enqueueSnackbar } = useSnackbar();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [ttl, setTtl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setKey(editKey ?? '');
      setValue(initialValue ?? '');
      setTtl('');
    }
  }, [open, editKey, initialValue]);

  const ttlNumber = ttl.trim() ? Number(ttl.trim()) : undefined;
  const ttlValid = ttlNumber === undefined || (Number.isInteger(ttlNumber) && ttlNumber >= 0);
  const canSubmit = key.trim().length > 0 && ttlValid;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const result = await ValkeyAdminService.setKey(key.trim(), value, ttlNumber);
    if (result.error.message || result.error.code) {
      enqueueSnackbar(result.error.message || 'Failed to save key', { variant: 'error' });
    } else {
      enqueueSnackbar(`Key '${key.trim()}' saved`, { variant: 'success' });
      onSaved();
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{editKey ? 'Edit Key' : 'Add Key'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            fullWidth
            required
            autoFocus={!editKey}
            disabled={submitting || !!editKey}
          />
          <TextField
            label="Value (string)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            multiline
            minRows={8}
            fullWidth
            autoFocus={!!editKey}
            disabled={submitting}
            inputProps={{
              style: {
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '0.875em',
              },
            }}
          />
          <TextField
            label="TTL seconds (empty = no expiry)"
            value={ttl}
            onChange={(e) => setTtl(e.target.value)}
            fullWidth
            error={!ttlValid}
            helperText={ttlValid ? '' : 'TTL must be a non-negative integer'}
            disabled={submitting}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!canSubmit || submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditKeyDialog;
