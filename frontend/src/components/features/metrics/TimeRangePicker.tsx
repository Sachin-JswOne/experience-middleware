import { useState } from 'react';
import {
  Box,
  Button,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Popover,
  TextField,
  Typography,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import dayjs from 'dayjs';
import { tokens } from '@/styles/theme';
import type { MetricsRange, MetricsWindow } from './useMetricsQuery';
import { formatTs } from './chartShared';

const QUICK_RANGES: Array<{ window: MetricsWindow; label: string }> = [
  { window: '5m', label: 'Last 5 minutes' },
  { window: '15m', label: 'Last 15 minutes' },
  { window: '30m', label: 'Last 30 minutes' },
  { window: '1h', label: 'Last 1 hour' },
  { window: '6h', label: 'Last 6 hours' },
  { window: '24h', label: 'Last 24 hours' },
  { window: '7d', label: 'Last 7 days' },
  { window: '14d', label: 'Last 14 days' },
  { window: '30d', label: 'Last 30 days' },
];

export const rangeLabel = (range: MetricsRange, utc = false): string => {
  if (range.type === 'relative') {
    return QUICK_RANGES.find((q) => q.window === range.window)?.label ?? range.window;
  }
  return `${formatTs(range.from, 'DD MMM HH:mm', utc)} → ${formatTs(range.to, 'DD MMM HH:mm', utc)}`;
};

const toInputValue = (ts: number) => dayjs(ts).format('YYYY-MM-DDTHH:mm');

interface Props {
  range: MetricsRange;
  onChange: (range: MetricsRange) => void;
  utc?: boolean;
}

const TimeRangePicker = ({ range, onChange, utc }: Props) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [fromInput, setFromInput] = useState(() =>
    toInputValue(range.type === 'absolute' ? range.from : Date.now() - 60 * 60 * 1000),
  );
  const [toInput, setToInput] = useState(() =>
    toInputValue(range.type === 'absolute' ? range.to : Date.now()),
  );
  const [rangeError, setRangeError] = useState<string | null>(null);

  const close = () => setAnchorEl(null);

  const applyAbsolute = () => {
    const from = dayjs(fromInput).valueOf();
    const to = dayjs(toInput).valueOf();
    if (isNaN(from) || isNaN(to) || from >= to) {
      setRangeError('Start must be before end');
      return;
    }
    setRangeError(null);
    onChange({ type: 'absolute', from, to });
    close();
  };

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<AccessTimeIcon sx={{ fontSize: 16 }} />}
        endIcon={<ArrowDropDownIcon />}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label="Select time range"
      >
        {rangeLabel(range, utc)}
      </Button>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' } }}>
          <List dense sx={{ minWidth: 180, py: 1 }}>
            {QUICK_RANGES.map((q) => (
              <ListItemButton
                key={q.window}
                selected={range.type === 'relative' && range.window === q.window}
                onClick={() => {
                  onChange({ type: 'relative', window: q.window });
                  close();
                }}
              >
                <ListItemText primary={q.label} primaryTypographyProps={{ fontSize: '0.875rem' }} />
              </ListItemButton>
            ))}
          </List>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
          <Divider sx={{ display: { xs: 'block', sm: 'none' } }} />
          <Box sx={{ p: 2, minWidth: 240 }}>
            <Typography variant="body2" sx={{ fontWeight: tokens.weightBold, mb: 1.5 }}>
              Absolute range
            </Typography>
            <TextField
              label="From"
              type="datetime-local"
              size="small"
              fullWidth
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ mb: 1.5 }}
            />
            <TextField
              label="To"
              type="datetime-local"
              size="small"
              fullWidth
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ mb: 1.5 }}
            />
            {rangeError && (
              <Typography variant="body2" sx={{ color: tokens.danger, mb: 1 }}>
                {rangeError}
              </Typography>
            )}
            <Button variant="contained" size="small" fullWidth onClick={applyAbsolute}>
              Apply range
            </Button>
          </Box>
        </Box>
      </Popover>
    </>
  );
};

export default TimeRangePicker;
