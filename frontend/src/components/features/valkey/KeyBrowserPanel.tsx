import { useMemo, useState } from 'react';
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
  ToggleButton,
  ToggleButtonGroup,
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

import type { ValkeyKeyDetail } from '@/_types/valkey.interface';
import { formatTtl } from '@/utils/format';
import KeyDetailDialog from './KeyDetailDialog';
import EditKeyDialog from './EditKeyDialog';
import KeyTreeView from './KeyTreeView';
import { useDeleteKey, useKeyDetailFetcher, useValkeyScan } from './useValkeyQueries';

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
  // Draft lives in the text field; `pattern` is what's actually scanned, so
  // typing doesn't refire the query on every keystroke.
  const [draftPattern, setDraftPattern] = useState('*');
  const [pattern, setPattern] = useState('*');
  const [viewItem, setViewItem] = useState<ValkeyKeyDetail | null>(null);
  const [editState, setEditState] = useState<{ open: boolean; key: string | null; value: string }>({
    open: false,
    key: null,
    value: '',
  });
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [view, setView] = useState<'tree' | 'list'>('tree');

  const scan = useValkeyScan(pattern);
  const fetchKeyDetail = useKeyDetailFetcher();
  const deleteMutation = useDeleteKey(() => setDeleteKey(null));

  const keys = useMemo(() => scan.data?.pages.flatMap((page) => page.keys) ?? [], [scan.data]);
  const errorMessage = scan.error instanceof Error ? scan.error.message : '';

  const handleView = async (key: string) => {
    try {
      setViewItem(await fetchKeyDetail(key));
    } catch (error) {
      enqueueSnackbar((error as Error).message, { variant: 'error' });
    }
  };

  const handleEdit = async (key: string) => {
    try {
      const detail = await fetchKeyDetail(key);
      if (detail.type !== 'string') {
        enqueueSnackbar(`Only string keys are editable (this key is ${detail.type})`, {
          variant: 'warning',
        });
        return;
      }
      setEditState({ open: true, key, value: String(detail.value ?? '') });
    } catch (error) {
      enqueueSnackbar((error as Error).message, { variant: 'error' });
    }
  };

  const closeEdit = () => setEditState({ open: false, key: null, value: '' });

  const loadMore = scan.hasNextPage && (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
      <Button
        size="small"
        onClick={() => void scan.fetchNextPage()}
        disabled={scan.isFetchingNextPage}
      >
        {scan.isFetchingNextPage ? 'Loading…' : 'Load more'}
      </Button>
    </Box>
  );

  const renderTable = () => {
    if (scan.isPending) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      );
    }

    if (scan.isError && keys.length === 0) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="error" sx={{ mb: 2 }}>
            {errorMessage || 'Failed to scan keys'}
          </Typography>
          <Button variant="outlined" onClick={() => void scan.refetch()}>
            Retry
          </Button>
        </Box>
      );
    }

    if (view === 'tree') {
      return (
        <Box>
          {scan.isFetching && <LinearProgress />}
          {keys.length === 0 ? (
            <Paper variant="outlined" sx={{ py: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No keys match this pattern</Typography>
            </Paper>
          ) : (
            <KeyTreeView
              keys={keys.map((k) => k.key)}
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
        {scan.isFetching && <LinearProgress />}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Key</TableCell>
              <TableCell>TTL</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {keys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
                  No keys match this pattern
                </TableCell>
              </TableRow>
            ) : (
              keys.map(({ key, ttl }) => (
                <TableRow key={key} hover>
                  <TableCell>
                    <Box sx={cellEllipsis} title={key}>
                      {key}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTtl(ttl)}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="View">
                      <IconButton aria-label="View key" size="small" onClick={() => handleView(key)}>
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
          value={draftPattern}
          onChange={(e) => setDraftPattern(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setPattern(draftPattern);
          }}
          sx={{ width: 320 }}
        />
        <Button
          variant="outlined"
          startIcon={<SearchIcon />}
          onClick={() => setPattern(draftPattern)}
          disabled={scan.isFetching}
        >
          Scan
        </Button>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, next: 'tree' | 'list' | null) => {
            if (next) setView(next);
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
        onClose={closeEdit}
        onSaved={closeEdit}
      />

      <Dialog open={!!deleteKey} onClose={() => setDeleteKey(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete key?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ wordBreak: 'break-all' }}>
            Delete key '{deleteKey}'? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteKey(null)} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => deleteKey && deleteMutation.mutate(deleteKey)}
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default KeyBrowserPanel;
