import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, IconButton, Chip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import MetricsService from '@/services/MetricsService';
import type { MetricsSnapshot } from '@/_types/metrics.interface';
import SummaryCards from '@/components/features/metrics/SummaryCards';
import RequestTimelineChart from '@/components/features/metrics/RequestTimelineChart';
import RouteBreakdownChart from '@/components/features/metrics/RouteBreakdownChart';
import DownstreamLatencyChart from '@/components/features/metrics/DownstreamLatencyChart';
import { tokens } from '@/styles/theme';

const POLL_INTERVAL = 10_000;

const emptySnapshot: MetricsSnapshot = {
  timestamp: Date.now(),
  windowMs: 300_000,
  summary: { totalRequests: 0, errorRate: 0, avgLatencyMs: 0, cacheHitRate: 0, p50LatencyMs: 0, p90LatencyMs: 0, p99LatencyMs: 0 },
  timeline: [],
  routeBreakdown: [],
  downstream: [],
};

const MetricsPage = () => {
  const [snapshot, setSnapshot] = useState<MetricsSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetrics = useCallback(async () => {
    const result = await MetricsService.getMetrics();
    if (result.data && !result.error?.code) {
      setSnapshot(result.data);
    }
    setLoading(false);
  }, []);

  const manualRefresh = useCallback(async () => {
    setLoading(true);
    await fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchMetrics, POLL_INTERVAL);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, fetchMetrics]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h3" component="h1">
            Observability
          </Typography>
          <Typography variant="body1" sx={{ color: tokens.textSubtle, mt: 0.5 }}>
            Real-time metrics for the experience-middleware service
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={autoRefresh ? 'Auto: 10s' : 'Paused'}
            color={autoRefresh ? 'primary' : 'default'}
            size="small"
            onClick={() => setAutoRefresh((prev) => !prev)}
            sx={{ cursor: 'pointer' }}
          />
          <IconButton onClick={manualRefresh} size="small" disabled={loading}>
            <RefreshIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </Box>

      <SummaryCards summary={snapshot.summary} loading={loading} />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
          gap: 2,
        }}
      >
        <Box sx={{ gridColumn: { xs: '1', lg: '1 / -1' } }}>
          <RequestTimelineChart data={snapshot.timeline} loading={loading} />
        </Box>
        <RouteBreakdownChart data={snapshot.routeBreakdown} loading={loading} />
        <DownstreamLatencyChart data={snapshot.downstream} loading={loading} />
      </Box>
    </Box>
  );
};

export default MetricsPage;
