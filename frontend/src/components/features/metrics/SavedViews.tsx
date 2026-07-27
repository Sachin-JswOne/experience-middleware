import { useState } from 'react';
import {
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Popover,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { loadPersistedList, savePersistedList } from '@/utils/usePersistedState';
import { tokens } from '@/styles/theme';

export interface SavedView {
  name: string;
  // The dashboard's URL query string — the page already serializes its whole
  // state there, so a view is just a named copy of it.
  params: string;
  savedAt: number;
}

const STORAGE_KEY = 'metricsSavedViews';
const MAX_VIEWS = 20;

const loadViews = (): SavedView[] => loadPersistedList<SavedView>(STORAGE_KEY);

interface Props {
  currentParams: string;
  onApply: (params: string) => void;
}

const SavedViews = ({ currentParams, onApply }: Props) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState('');

  const open = (e: React.MouseEvent<HTMLElement>) => {
    setViews(loadViews());
    setAnchorEl(e.currentTarget);
  };

  const persist = (next: SavedView[]) => {
    setViews(next);
    savePersistedList(STORAGE_KEY, next);
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = [
      { name: trimmed, params: currentParams, savedAt: Date.now() },
      // Same name overwrites.
      ...views.filter((v) => v.name !== trimmed),
    ].slice(0, MAX_VIEWS);
    persist(next);
    setName('');
  };

  return (
    <>
      <Tooltip title="Saved views">
        <IconButton size="small" onClick={open} aria-label="Saved dashboard views">
          <BookmarkBorderIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, width: 300 }}>
          <Typography variant="body2" sx={{ fontWeight: tokens.weightBold, mb: 1 }}>
            Saved views
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              label="Name this view"
              size="small"
              fullWidth
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
              }}
            />
            <Button size="small" variant="contained" onClick={save} disabled={!name.trim()}>
              Save
            </Button>
          </Box>
          <Typography
            variant="caption"
            sx={{ color: tokens.textSubtlest, display: 'block', mb: 1 }}
          >
            Captures tab, time range, filters and refresh — stored in this browser.
          </Typography>
          {views.length > 0 && <Divider sx={{ mb: 0.5 }} />}
          <List dense disablePadding>
            {views.map((view) => (
              <ListItemButton
                key={view.name}
                onClick={() => {
                  onApply(view.params);
                  setAnchorEl(null);
                }}
                sx={{ borderRadius: 1, pr: 0.5 }}
              >
                <ListItemText
                  primary={view.name}
                  primaryTypographyProps={{ fontSize: '0.875rem' }}
                  secondary={new Date(view.savedAt).toLocaleDateString()}
                  secondaryTypographyProps={{ fontSize: 12 }}
                />
                <IconButton
                  size="small"
                  aria-label={`Delete view ${view.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    persist(views.filter((v) => v.name !== view.name));
                  }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Popover>
    </>
  );
};

export default SavedViews;
