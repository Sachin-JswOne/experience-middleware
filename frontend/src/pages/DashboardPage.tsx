import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import dayjs from 'dayjs';
import type { ILooseObject } from '@/_types/common.interface';
import type { MetricsSnapshot } from '@/_types/metrics.interface';
import LocalStorage from '@/utils/LocalStorage';
import { tokens } from '@/styles/theme';
import useMetricsQuery, {
  type MetricsWindow,
} from '@/components/features/metrics/useMetricsQuery';
import SummaryCards from '@/components/features/metrics/SummaryCards';
import RequestTimelineChart from '@/components/features/metrics/RequestTimelineChart';
import RouteBreakdownChart from '@/components/features/metrics/RouteBreakdownChart';
import DownstreamLatencyChart from '@/components/features/metrics/DownstreamLatencyChart';
import CacheHitPieChart from '@/components/features/metrics/CacheHitPieChart';

const emptySnapshot: MetricsSnapshot = {
  timestamp: Date.now(),
  windowMs: 300_000,
  summary: { totalRequests: 0, errorRate: 0, avgLatencyMs: 0, cacheHitRate: 0, p50LatencyMs: 0, p90LatencyMs: 0, p99LatencyMs: 0 },
  timeline: [],
  routeBreakdown: [],
  downstream: [],
};

const DashboardPage = () => {
  const userInfo: ILooseObject | undefined = LocalStorage.getItem('userInfo');
  const firstName = String(userInfo?.name || '')
    .trim()
    .split(' ')[0];

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [timeWindow, setTimeWindow] = useState<MetricsWindow>('5m');

  const { data, isPending, isFetching, isError, refetch } = useMetricsQuery(
    timeWindow,
    autoRefresh,
  );
  const snapshot = data ?? emptySnapshot;

  return (
    <Box>
      <Typography variant="h3" component="h1">
        {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
      </Typography>
      <Typography variant="body1" sx={{ color: tokens.textSubtle, mt: 0.5 }}>
        Service health at a glance.
      </Typography>

      <Box sx={{ mt: 5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: { xs: 'flex-start', md: 'center' },
            justifyContent: 'space-between',
            flexDirection: { xs: 'column', md: 'row' },
            gap: 2,
            mb: 3,
          }}
        >
          <Box>
            <Typography variant="h3" component="h2">
              Observability
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.textSubtle, mt: 0.5 }}>
              Last updated {dayjs(snapshot.timestamp).format('HH:mm:ss')}
              {isError ? ' \u2014 data may be stale' : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <ToggleButtonGroup
              value={timeWindow}
              exclusive
              size="small"
              onChange={(_, next: MetricsWindow | null) => {
                if (next) setTimeWindow(next);
              }}
              aria-label="Metrics window"
            >
              <ToggleButton value="5m" aria-label="5 minute window">
                5m
              </ToggleButton>
              <ToggleButton value="15m" aria-label="15 minute window">
                15m
              </ToggleButton>
            </ToggleButtonGroup>
            <Chip
              label={autoRefresh ? 'Auto: 10s' : 'Paused'}
              color={autoRefresh ? 'primary' : 'default'}
              size="small"
              role="switch"
              aria-pressed={autoRefresh}
              aria-label={autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'}
              onClick={() => setAutoRefresh((prev) => !prev)}
              sx={{ cursor: 'pointer' }}
            />
            <IconButton
              onClick={() => refetch()}
              size="small"
              aria-label="Refresh metrics"
              disabled={isFetching}
            >
              <RefreshIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
        </Box>

        {isError && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            }
          >
            Failed to load metrics.
          </Alert>
        )}

        <SummaryCards summary={snapshot.summary} loading={isPending} />

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
            gap: 2,
          }}
        >
          <Box sx={{ gridColumn: { xs: '1', lg: '1 / -1' } }}>
            <RequestTimelineChart data={snapshot.timeline} loading={isPending} />
          </Box>
          <CacheHitPieChart data={snapshot.routeBreakdown} loading={isPending} />
          <DownstreamLatencyChart data={snapshot.downstream} loading={isPending} />
        </Box>
      </Box>
    </Box>
  );
};

export default DashboardPage;
