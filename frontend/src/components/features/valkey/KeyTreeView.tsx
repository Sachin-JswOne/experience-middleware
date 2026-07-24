import { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Tooltip,
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';

interface KeyTreeViewProps {
  keys: string[];
  canWrite: boolean;
  onView: (key: string) => void;
  onEdit: (key: string) => void;
  onDelete: (key: string) => void;
}

interface TreeNode {
  label: string;
  path: string;
  children: Map<string, TreeNode>;
  /** Set when this exact path is itself a key (a node can be both). */
  fullKey?: string;
  leafCount: number;
}

const buildTree = (keys: string[]): TreeNode => {
  const root: TreeNode = { label: '', path: '', children: new Map(), leafCount: 0 };
  for (const key of keys) {
    const segments = key.split(':');
    let node = root;
    node.leafCount += 1;
    let path = '';
    for (const [i, segment] of segments.entries()) {
      path = i === 0 ? segment : `${path}:${segment}`;
      let child = node.children.get(segment);
      if (!child) {
        child = { label: segment, path, children: new Map(), leafCount: 0 };
        node.children.set(segment, child);
      }
      child.leafCount += 1;
      node = child;
    }
    node.fullKey = key;
  }
  return root;
};

const KeyTreeView = ({ keys, canWrite, onView, onEdit, onDelete }: KeyTreeViewProps) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildTree(keys), [keys]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderActions = (fullKey: string) => (
    <Box sx={{ display: 'flex', flexShrink: 0 }}>
      <Tooltip title="View">
        <IconButton
          aria-label="View key"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onView(fullKey);
          }}
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
              onClick={(e) => {
                e.stopPropagation();
                onEdit(fullKey);
              }}
            >
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton
              aria-label="Delete key"
              size="small"
              color="error"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(fullKey);
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      )}
    </Box>
  );

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const isFolder = node.children.size > 0;
    const isOpen = expanded.has(node.path);

    return (
      <Box key={node.path}>
        <ListItemButton
          dense
          onClick={() => (isFolder ? toggle(node.path) : node.fullKey && onView(node.fullKey))}
          sx={{ pl: 1.5 + depth * 2.5, pr: 1 }}
        >
          {isFolder ? (
            isOpen ? (
              <ExpandMoreIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />
            ) : (
              <ChevronRightIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />
            )
          ) : (
            <Box sx={{ width: 20, mr: 0.5 }} />
          )}
          {isFolder ? (
            <FolderOutlinedIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
          ) : (
            <KeyOutlinedIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
          )}
          <ListItemText
            primary={node.label}
            primaryTypographyProps={{
              sx: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
              title: node.fullKey ?? node.path,
            }}
          />
          {isFolder && (
            <Chip label={node.leafCount} size="small" variant="outlined" sx={{ mr: 1 }} />
          )}
          {node.fullKey && renderActions(node.fullKey)}
        </ListItemButton>
        {isFolder && (
          <Collapse in={isOpen} timeout="auto" unmountOnExit>
            {[...node.children.values()].map((child) => renderNode(child, depth + 1))}
          </Collapse>
        )}
      </Box>
    );
  };

  return (
    <Paper variant="outlined">
      <List disablePadding dense>
        {[...tree.children.values()].map((child) => renderNode(child, 0))}
      </List>
    </Paper>
  );
};

export default KeyTreeView;
