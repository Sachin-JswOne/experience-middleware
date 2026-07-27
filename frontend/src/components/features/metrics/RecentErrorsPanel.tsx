import { useMemo, useState } from 'react';
import {
  Box,
  Card,
  Chip,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import type { RecentError } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import { formatMs, formatTs, logUrlFor } from './chartShared';

interface Props {
  data: RecentError[] | undefined;
  loading: boolean;
  utc?: boolean;
  // Click an error to open its route's samples drawer.
  onSelect?: (error: RecentError) => void;
}

// One row per (method, route, status): a burst of one failure mode stays a
// single line instead of drowning the novel error below it.
interface ErrorGroup {
  key: string;
  method: string;
  route: string;
  statusCode: number;
  count: number;
  firstTs: number;
  lastTs: number;
  pods: string[];
  latest: RecentError;
}

const groupErrors = (errors: RecentError[]): ErrorGroup[] => {
  const groups = new Map<string, ErrorGroup>();
  for (const e of errors) {
    const key = `${e.method}|${e.route}|${e.statusCode}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        method: e.method,
        route: e.route,
        statusCode: e.statusCode,
        count: 1,
        firstTs: e.ts,
        lastTs: e.ts,
        pods: e.pod ? [e.pod] : [],
        latest: e,
      });
    } else {
      existing.count += 1;
      existing.firstTs = Math.min(existing.firstTs, e.ts);
      if (e.ts > existing.lastTs) {
        existing.lastTs = e.ts;
        existing.latest = e;
      }
      if (e.pod && !existing.pods.includes(e.pod)) existing.pods.push(e.pod);
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.lastTs - a.lastTs);
};

const statusChipSx = (statusCode: number) => ({
  height: 20,
  fontSize: 12,
  fontWeight: tokens.weightBold,
  color: tokens.textInverse,
  bgcolor: statusCode >= 500 ? tokens.danger : tokens.warning,
});

const rowInteractionSx = (interactive: boolean, hasBorder: boolean) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 1.5,
  py: 0.5,
  borderBottom: hasBorder ? `1px solid ${tokens.border}` : 'none',
  cursor: interactive ? 'pointer' : 'default',
  '&:hover': interactive ? { bgcolor: tokens.surfaceSunken } : undefined,
  '&:focus-visible': interactive
    ? { outline: `2px solid ${tokens.borderFocused}`, outlineOffset: -2 }
    : undefined,
});

const interactionProps = (onActivate?: () => void) =>
  onActivate
    ? {
        onClick: onActivate,
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (ev: React.KeyboardEvent) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            onActivate();
          }
        },
      }
    : {};

const RecentErrorsPanel = ({ data, loading, utc, onSelect }: Props) => {
  const [view, setView] = useState<'grouped' | 'list'>('grouped');
  const errors = data ?? [];
  const groups = useMemo(() => groupErrors(errors), [errors]);
  const flat = errors.slice(0, 10);

  return (
    <Card sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="h5" component="h2">
          Recent errors
        </Typography>
        <ToggleButtonGroup
          value={view}
          exclusive
          size="small"
          onChange={(_, next: 'grouped' | 'list' | null) => {
            if (next) setView(next);
          }}
          aria-label="Error view"
        >
          <ToggleButton
            value="grouped"
            aria-label="Grouped by route and status"
            sx={{ px: 1, fontSize: 11, height: 26 }}
          >
            Grouped
          </ToggleButton>
          <ToggleButton
            value="list"
            aria-label="Flat list"
            sx={{ px: 1, fontSize: 11, height: 26 }}
          >
            List
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {loading ? (
        <Skeleton variant="rounded" height={160} />
      ) : errors.length === 0 ? (
        <Box sx={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
            No errors in this window
          </Typography>
        </Box>
      ) : view === 'grouped' ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {groups.slice(0, 10).map((g, idx) => (
            <Box
              key={g.key}
              {...interactionProps(onSelect ? () => onSelect(g.latest) : undefined)}
              aria-label={onSelect ? `View samples for ${g.method} ${g.route}` : undefined}
              sx={rowInteractionSx(Boolean(onSelect), idx < Math.min(groups.length, 10) - 1)}
            >
              <Chip label={g.statusCode} size="small" sx={statusChipSx(g.statusCode)} />
              <Tooltip title={`${g.method} ${g.route}`}>
                <Typography
                  variant="body2"
                  sx={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ fontWeight: tokens.weightBold, mr: 0.75 }}
                  >
                    {g.method}
                  </Typography>
                  {g.route}
                </Typography>
              </Tooltip>
              <Chip
                label={`×${g.count}`}
                size="small"
                sx={{ height: 18, fontSize: 12, fontWeight: tokens.weightBold }}
              />
              {g.pods.length > 0 && (
                <Tooltip title={`Pods: ${g.pods.join(', ')}`}>
                  <Typography variant="caption" sx={{ color: tokens.textSubtlest }}>
                    {g.pods.length} pod{g.pods.length > 1 ? 's' : ''}
                  </Typography>
                </Tooltip>
              )}
              <Tooltip
                title={
                  g.count > 1
                    ? `First ${formatTs(g.firstTs, 'HH:mm:ss', utc)}, last ${formatTs(g.lastTs, 'HH:mm:ss', utc)}`
                    : `At ${formatTs(g.lastTs, 'HH:mm:ss', utc)}`
                }
              >
                <Typography
                  variant="body2"
                  sx={{ color: tokens.textSubtle, minWidth: 60, textAlign: 'right' }}
                >
                  {formatTs(g.lastTs, 'HH:mm:ss', utc)}
                </Typography>
              </Tooltip>
            </Box>
          ))}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {flat.map((e, idx) => (
            <Box
              key={`${e.ts}-${idx}`}
              {...interactionProps(onSelect ? () => onSelect(e) : undefined)}
              aria-label={onSelect ? `View samples for ${e.method} ${e.route}` : undefined}
              sx={rowInteractionSx(Boolean(onSelect), idx < flat.length - 1)}
            >
              <Typography variant="body2" sx={{ color: tokens.textSubtle, minWidth: 60 }}>
                {formatTs(e.ts, 'HH:mm:ss', utc)}
              </Typography>
              <Chip label={e.statusCode} size="small" sx={statusChipSx(e.statusCode)} />
              <Tooltip title={`${e.method} ${e.route}`}>
                <Typography
                  variant="body2"
                  sx={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ fontWeight: tokens.weightBold, mr: 0.75 }}
                  >
                    {e.method}
                  </Typography>
                  {e.route}
                </Typography>
              </Tooltip>
              {e.requestId && (
                <Tooltip
                  title={
                    logUrlFor(e.requestId)
                      ? `Open logs for ${e.requestId}`
                      : `Request id ${e.requestId}`
                  }
                >
                  <Chip
                    label={e.requestId.slice(0, 8)}
                    size="small"
                    variant="outlined"
                    {...(logUrlFor(e.requestId)
                      ? {
                          component: 'a' as const,
                          href: logUrlFor(e.requestId)!,
                          target: '_blank',
                          rel: 'noopener',
                          clickable: true,
                          onClick: (ev: React.MouseEvent) => ev.stopPropagation(),
                        }
                      : {})}
                    sx={{
                      height: 18,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      color: tokens.textSubtle,
                    }}
                  />
                </Tooltip>
              )}
              {e.pod && (
                <Tooltip title={`Served by pod ${e.pod}`}>
                  <Chip
                    label={e.pod}
                    size="small"
                    variant="outlined"
                    sx={{ height: 18, fontSize: 12, maxWidth: 120, color: tokens.textSubtle }}
                  />
                </Tooltip>
              )}
              <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
                {formatMs(e.durationMs)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Card>
  );
};

export default RecentErrorsPanel;
