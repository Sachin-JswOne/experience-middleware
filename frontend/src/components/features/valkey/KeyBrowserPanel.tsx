import { useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import {
  Box,
  Button,
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
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchIcon from '@mui/icons-material/Search';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';

import ValkeyAdminService from '@/services/ValkeyAdminService';
import type { ValkeyKeyDetail } from '@/_types/valkey.interface';
import KeyDetailDialog from './KeyDetailDialog';
import EditKeyDialog from './EditKeyDialog';
import KeyTreeView from './KeyTreeView';

interface KeyBrowserPanelProps {
  canWrite: boolean;
}

const cellEllipsis = {
  maxWidth: 480,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const KeyBrowserPanel = ({ canWrite }: KeyBrowserPanelProps) => {
  const { enqueueSnackbar } = useSnackbar();
  const [pattern, setPattern] = useState('*');
  const [keys, setKeys] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [viewItem, setViewItem] = useState<ValkeyKeyDetail | null>(null);
  const [editState, setEditState] = useState<{ open: boolean; key: string | null; value: string }>({
    open: false,
    key: null,
    value: '',
  });
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useState<'tree' | 'list'>('tree');

  const scan = async (fresh = true) => {
    if (fresh) {
      setLoading(true);
      setError('');
    } else {
      setLoadingMore(true);
    }
    const result = await ValkeyAdminService.scanKeys(
      pattern,
      fresh ? undefined : (cursor ?? undefined),
    );
    if (result.error.message || result.error.code) {
      const message = result.error.message || 'Failed to scan keys';
      if (fresh) setError(message);
      else enqueueSnackbar(message, { variant: 'error' });
    } else if (result.data) {
      const batch = result.data.keys;
      setKeys((prev) => (fresh ? batch : [...prev, ...batch]));
      setCursor(result.data.cursor);
    }
    setLoading(false);
    setLoadingMore(false);
  };

  useEffect(() => {
    void scan(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleView = async (key: string) => {
    const result = await ValkeyAdminService.getKeyDetail(key);
    if (result.error.message || result.error.code) {
      enqueueSnackbar(result.error.message || `Failed to load key '${key}'`, { variant: 'error' });
    } else if (result.data) {
      setViewItem(result.data);
    }
  };

  const handleEdit = async (key: string) => {
    const result = await ValkeyAdminService.getKeyDetail(key);
    if (result.error.message || result.error.code) {
      enqueueSnackbar(result.error.message || `Failed to load key '${key}'`, { variant: 'error' });
      return;
    }
    if (result.data && result.data.type !== 'string') {
      enqueueSnackbar(`Only string keys are editable (this key is ${result.data.type})`, {
        variant: 'warning',
      });
      return;
    }
    setEditState({ open: true, key, value: String(result.data?.value ?? '') });
  };

  const handleDelete = async () => {
    if (!deleteKey) return;
    setDeleting(true);
    const result = await ValkeyAdminService.deleteKeys([deleteKey]);
    if (result.error.message || result.error.code) {
      enqueueSnackbar(result.error.message || 'Delete failed', { variant: 'error' });
    } else {
      enqueueSnackbar(`Deleted '${deleteKey}'`, { variant: 'success' });
      setKeys((prev) => prev.filter((k) => k !== deleteKey));
      setDeleteKey(null);
    }
    setDeleting(false);
  };

  const renderTable = () => {
    if (loading && keys.length === 0) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      );
    }

    if (error && keys.length === 0) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
          <Button variant="outlined" onClick={() => scan(true)}>
            Retry
          </Button>
        </Box>
      );
    }

    const loadMore = cursor && (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
        <Button size="small" onClick={() => scan(false)} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      </Box>
    );

    if (view === 'tree') {
      return (
        <Box>
          {loading && <LinearProgress />}
          {keys.length === 0 ? (
            <Paper variant="outlined" sx={{ py: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No keys match this pattern</Typography>
            </Paper>
          ) : (
            <KeyTreeView
              keys={keys}
              canWrite={canWrite}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={setDeleteKey}
            />
          )}
          {loadMore}
        </Box>
      );
    }

    return (
      <TableContainer component={Paper} variant="outlined">
        {loading && <LinearProgress />}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Key</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {keys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} align="center" sx={{ py: 4 }}>
                  No keys match this pattern
                </TableCell>
              </TableRow>
            ) : (
              keys.map((key) => (
                <TableRow key={key} hover>
                  <TableCell>
                    <Box sx={cellEllipsis} title={key}>
                      {key}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="View">
                      <IconButton
                        aria-label="View key"
                        size="small"
                        onClick={() => handleView(key)}
                      >
                        <VisibilityOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {canWrite && (
                      <>
                        <Tooltip title="Edit">
                          <IconButton
                            aria-label="Edit key"
                            size="small"
                            onClick={() => handleEdit(key)}
                          >
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            aria-label="Delete key"
                            size="small"
                            color="error"
                            onClick={() => setDeleteKey(key)}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {loadMore}
      </TableContainer>
    );
  };

  return (
    <Box>
      <Toolbar disableGutters sx={{ display: 'flex', gap: 1, mb: 2, px: 0 }}>
        <TextField
          size="small"
          label="Key pattern"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') scan(true);
          }}
          sx={{ width: 320 }}
        />
        <Button
          variant="outlined"
          startIcon={<SearchIcon />}
          onClick={() => scan(true)}
          disabled={loading}
        >
          Scan
        </Button>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, next) => {
            if (next) setView(next as 'tree' | 'list');
          }}
          aria-label="Key view mode"
        >
          <ToggleButton value="tree" aria-label="Tree view">
            <Tooltip title="Tree view">
              <AccountTreeOutlinedIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="list" aria-label="List view">
            <Tooltip title="List view">
              <ViewListOutlinedIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        {canWrite && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setEditState({ open: true, key: null, value: '' })}
          >
            Add Key
          </Button>
        )}
      </Toolbar>

      {renderTable()}

      <KeyDetailDialog item={viewItem} onClose={() => setViewItem(null)} />

      <EditKeyDialog
        open={editState.open}
        editKey={editState.key}
        initialValue={editState.value}
        onClose={() => setEditState({ open: false, key: null, value: '' })}
        onSaved={async () => {
          setEditState({ open: false, key: null, value: '' });
          await scan(true);
        }}
      />

      <Dialog open={!!deleteKey} onClose={() => setDeleteKey(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete key?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ wordBreak: 'break-all' }}>
            Delete key '{deleteKey}'? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteKey(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default KeyBrowserPanel;
