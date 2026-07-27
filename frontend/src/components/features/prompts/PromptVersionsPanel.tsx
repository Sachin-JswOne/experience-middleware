import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  LinearProgress,
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

const versionNumber = (version: IPromptVersion['version']): number =>
  typeof version === 'number' ? version : parseInt(String(version), 10) || 0;

const PromptVersionsPanel = ({ promptType }: PromptVersionsPanelProps) => {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [viewItem, setViewItem] = useState<IPromptVersion | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [activateItem, setActivateItem] = useState<IPromptVersion | null>(null);

  const queryKey = ['prompts', promptType, 'versions'];

  const versionsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await PromptService.getVersions(promptType);
      if (result.error.message || result.error.code || !result.data) {
        throw new Error(result.error.message || 'Failed to load prompt versions');
      }
      // Newest version first.
      return [...result.data].sort((a, b) => versionNumber(b.version) - versionNumber(a.version));
    },
  });

  const versions = versionsQuery.data ?? [];
  const loading = versionsQuery.isFetching;
  const error = versionsQuery.error instanceof Error ? versionsQuery.error.message : '';
  const fetchVersions = () => void versionsQuery.refetch();

  const activateMutation = useMutation({
    mutationFn: async (item: IPromptVersion) => {
      const result = await PromptService.activateVersion(promptType, item.version);
      if (result.error.message || result.error.code) {
        throw new Error(result.error.message || 'Activation failed');
      }
    },
    onSuccess: () => {
      enqueueSnackbar('Version activated successfully', { variant: 'success' });
      setActivateItem(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (mutationError: Error) =>
      enqueueSnackbar(mutationError.message, { variant: 'error' }),
  });
  const activating = activateMutation.isPending;

  const handleActivate = () => {
    if (activateItem) activateMutation.mutate(activateItem);
  };

  const renderTable = () => {
    const isInitialLoad = loading && versions.length === 0;

    if (isInitialLoad) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      );
    }

    if (error && versions.length === 0) {
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
        {loading && <LinearProgress />}
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
                    <TableCell>
                      <Box sx={cellEllipsis} title={item.createdBy || undefined}>
                        {item.createdBy || '—'}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="View">
                        <IconButton
                          aria-label="View prompt"
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
        sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, px: 0 }}
      >
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh">
            <IconButton aria-label="Refresh versions" onClick={fetchVersions} disabled={loading}>
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
