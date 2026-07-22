import { Box, Card, Chip, Skeleton, Typography } from '@mui/material';
import dayjs from 'dayjs';
import type { RecentError } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import { formatMs } from './chartShared';

interface Props {
  data: RecentError[] | undefined;
  loading: boolean;
}

const RecentErrorsPanel = ({ data, loading }: Props) => {
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
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                py: 0.5,
                borderBottom: idx < errors.length - 1 ? `1px solid ${tokens.border}` : 'none',
              }}
            >
              <Typography variant="body2" sx={{ color: tokens.textSubtle, minWidth: 60 }}>
                {dayjs(e.ts).format('HH:mm:ss')}
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
