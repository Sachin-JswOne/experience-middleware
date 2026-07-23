import { Box, Card, Chip, Skeleton, Tooltip, Typography } from '@mui/material';
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

const RecentErrorsPanel = ({ data, loading, utc, onSelect }: Props) => {
  const errors = (data ?? []).slice(0, 10);

  return (
    <Card sx={{ p: 2, height: '100%' }}>
      <Typography variant="h5" sx={{ mb: 1.5 }}>
        Recent Errors
      </Typography>
      {loading ? (
        <Skeleton variant="rounded" height={160} />
      ) : errors.length === 0 ? (
        <Box sx={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
            No errors in this window
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {errors.map((e, idx) => (
            <Box
              key={`${e.ts}-${idx}`}
              onClick={onSelect ? () => onSelect(e) : undefined}
              title={onSelect ? 'View samples for this route' : undefined}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                py: 0.5,
                borderBottom: idx < errors.length - 1 ? `1px solid ${tokens.border}` : 'none',
                cursor: onSelect ? 'pointer' : 'default',
                '&:hover': onSelect ? { bgcolor: tokens.surfaceSunken } : undefined,
              }}
            >
              <Typography variant="body2" sx={{ color: tokens.textSubtle, minWidth: 60 }}>
                {formatTs(e.ts, 'HH:mm:ss', utc)}
              </Typography>
              <Chip
                label={e.statusCode}
                size="small"
                sx={{
                  height: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  color: tokens.textInverse,
                  bgcolor: e.statusCode >= 500 ? tokens.danger : tokens.warning,
                }}
              />
              <Typography
                variant="body2"
                sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                <Typography component="span" variant="body2" sx={{ fontWeight: 600, mr: 0.75 }}>
                  {e.method}
                </Typography>
                {e.route}
              </Typography>
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
                    sx={{ height: 18, fontSize: 10, fontFamily: 'monospace', color: tokens.textSubtle }}
                  />
                </Tooltip>
              )}
              {e.pod && (
                <Tooltip title={`Served by pod ${e.pod}`}>
                  <Chip
                    label={e.pod}
                    size="small"
                    variant="outlined"
                    sx={{ height: 18, fontSize: 10, maxWidth: 120, color: tokens.textSubtle }}
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
