import { useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
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
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';

import PromptService, { IPromptVersion } from '@/services/PromptService';
import ViewPromptDialog from './ViewPromptDialog';
import AddPromptDialog from './AddPromptDialog';

interface PromptVersionsPanelProps {
  promptType: string;
}

const cellEllipsis = {
  maxWidth: 280,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const PromptVersionsPanel = ({ promptType }: PromptVersionsPanelProps) => {
  const { enqueueSnackbar } = useSnackbar();
  const [versions, setVersions] = useState<IPromptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewItem, setViewItem] = useState<IPromptVersion | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [activateItem, setActivateItem] = useState<IPromptVersion | null>(null);
  const [activating, setActivating] = useState(false);

  const fetchVersions = async () => {
    setLoading(true);
    setError('');
    const result = await PromptService.getVersions(promptType);
    if (result.error.message || result.error.code) {
      setError(result.error.message || 'Failed to load prompt versions');
      enqueueSnackbar(result.error.message || 'Failed to load prompt versions', {
        variant: 'error',
      });
    } else {
      const sorted = [...result.data].sort((a, b) => {
        const av = typeof a.version === 'number' ? a.version : parseInt(String(a.version), 10) || 0;
        const bv = typeof b.version === 'number' ? b.version : parseInt(String(b.version), 10) || 0;
        return bv - av;
      });
      setVersions(sorted);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchVersions();
  }, [promptType]);

  const handleActivate = async () => {
    if (!activateItem) return;
    setActivating(true);
    const result = await PromptService.activateVersion(promptType, activateItem.version);
    if (result.error.message || result.error.code) {
      enqueueSnackbar(result.error.message || 'Activation failed', { variant: 'error' });
    } else {
      enqueueSnackbar('Version activated successfully', { variant: 'success' });
      setActivateItem(null);
      await fetchVersions();
    }
    setActivating(false);
  };

  const renderTable = () => {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      );
    }

    if (error) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
          <Button variant="outlined" onClick={fetchVersions}>
            Retry
          </Button>
        </Box>
      );
    }

    return (
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Version</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Prompt preview</TableCell>
              <TableCell>Created by</TableCell>
              <TableCell>Created at</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {versions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  No prompt versions yet
                </TableCell>
              </TableRow>
            ) : (
              versions.map((item) => {
                const decodedPreview = PromptService.decodePrompt(item);
                return (
                  <TableRow key={String(item.id)} hover>
                    <TableCell>{item.version}</TableCell>
                    <TableCell>
                      {item.active ? (
                        <Chip label="Active" color="success" size="small" />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Box sx={cellEllipsis} title={item.description || undefined}>
                        {item.description || '—'}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={cellEllipsis} title={decodedPreview || undefined}>
                        {decodedPreview}
                      </Box>
                    </TableCell>
                    <TableCell>{item.createdBy}</TableCell>
                    <TableCell>
                      {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="View">
                        <IconButton
                          size="small"
                          onClick={() => setViewItem(item)}
                          sx={{ mr: 1 }}
                        >
                          <VisibilityOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {!item.active && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setActivateItem(item)}
                        >
                          Make Active
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  return (
    <Box>
      <Toolbar
        disableGutters
        sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, px: 0 }}
      >
        <Box>

        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchVersions} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddOpen(true)}
          >
            Add Prompt
          </Button>
        </Box>
      </Toolbar>

      {renderTable()}

      <ViewPromptDialog item={viewItem} onClose={() => setViewItem(null)} />

      <AddPromptDialog
        open={addOpen}
        promptType={promptType}
        onClose={() => setAddOpen(false)}
        onCreated={async () => {
          setAddOpen(false);
          await fetchVersions();
        }}
      />

      <Dialog
        open={!!activateItem}
        onClose={() => setActivateItem(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Make version active?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Make version {activateItem?.version} active? The currently active version will be
            deactivated.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActivateItem(null)} disabled={activating}>
            Cancel
          </Button>
          <Button
            onClick={handleActivate}
            variant="contained"
            disabled={activating}
          >
            {activating ? 'Activating…' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PromptVersionsPanel;
