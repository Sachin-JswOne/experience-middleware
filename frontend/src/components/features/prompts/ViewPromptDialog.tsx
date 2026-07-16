import { useSnackbar } from 'notistack';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import PromptService, { IPromptVersion } from '@/services/PromptService';
import { tokens } from '@/styles/theme';

interface ViewPromptDialogProps {
  item: IPromptVersion | null;
  onClose: () => void;
}

const ViewPromptDialog = ({ item, onClose }: ViewPromptDialogProps) => {
  const { enqueueSnackbar } = useSnackbar();
  const decoded = item ? PromptService.decodePrompt(item) : '';

  const handleCopy = async () => {
    if (!decoded) return;
    try {
      await navigator.clipboard.writeText(decoded);
      enqueueSnackbar('Prompt copied to clipboard', { variant: 'success' });
    } catch {
      enqueueSnackbar('Unable to copy prompt', { variant: 'error' });
    }
  };

  return (
    <Dialog open={!!item} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <span>Version {item?.version}</span>
          {item?.active && <Chip label="Active" color="success" size="small" />}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 2,
            mb: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ color: tokens.textSubtle, fontSize: '0.875rem' }}>
            <div>
              <strong>Created by:</strong> {item?.createdBy || '—'}
            </div>
            <div>
              <strong>Created at:</strong>{' '}
              {item?.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
            </div>
            <div>
              <strong>Description:</strong> {item?.description || '—'}
            </div>
          </Box>
          <Tooltip title="Copy prompt">
            <IconButton onClick={handleCopy} size="small">
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box
          component="pre"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'monospace',
            fontSize: '13px',
            maxHeight: '60vh',
            overflow: 'auto',
            bgcolor: tokens.surfaceSunken,
            p: 2,
            borderRadius: `${tokens.radiusMedium}px`,
            border: `1px solid ${tokens.border}`,
          }}
        >
          {decoded}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ViewPromptDialog;
