import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import type { ValkeyKeyDetail } from '@/_types/valkey.interface';

interface KeyDetailDialogProps {
  item: ValkeyKeyDetail | null;
  onClose: () => void;
}

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
};

const formatTtl = (ttl: number): string => {
  if (ttl === -1) return 'No expiry';
  if (ttl === -2) return 'Expired';
  return `${ttl}s`;
};

const KeyDetailDialog = ({ item, onClose }: KeyDetailDialogProps) => {
  const { enqueueSnackbar } = useSnackbar();
  const formatted = item ? formatValue(item.value) : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      enqueueSnackbar('Value copied to clipboard', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to copy value', { variant: 'error' });
    }
  };

  return (
    <Dialog open={!!item} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ wordBreak: 'break-all' }}>{item?.key}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Chip label={item?.type} color="primary" size="small" />
          <Chip label={`TTL: ${item ? formatTtl(item.ttl) : ''}`} size="small" />
          <Chip label={`Size: ${item?.size ?? 0}`} size="small" />
        </Box>
        {item?.truncated && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Value is truncated — only the first part is shown.
          </Alert>
        )}
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 2,
            bgcolor: 'action.hover',
            borderRadius: 1,
            overflow: 'auto',
            maxHeight: 420,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '0.8125rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {formatted}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button startIcon={<ContentCopyIcon />} onClick={handleCopy}>
          Copy value
        </Button>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default KeyDetailDialog;
