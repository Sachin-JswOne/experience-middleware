import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  MenuItem,
  Select,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import dayjs from 'dayjs';
import type { MetricsSnapshot, RouteBreakdown } from '@/_types/metrics.interface';
import LocalStorage from '@/utils/LocalStorage';
import { tokens } from '@/styles/theme';
import useMetricsQuery, {
  type MetricsRange,
} from '@/components/features/metrics/useMetricsQuery';
import TimeRangePicker from '@/components/features/metrics/TimeRangePicker';
import SummaryCards from '@/components/features/metrics/SummaryCards';
import RequestTimelineChart from '@/components/features/metrics/RequestTimelineChart';
import StatusClassTimelineChart from '@/components/features/metrics/StatusClassTimelineChart';
import RouteBreakdownChart from '@/components/features/metrics/RouteBreakdownChart';
import DownstreamLatencyChart from '@/components/features/metrics/DownstreamLatencyChart';
import DownstreamStatusChart from '@/components/features/metrics/DownstreamStatusChart';
import LatencyStageChart from '@/components/features/metrics/LatencyStageChart';
import CacheHitPieChart from '@/components/features/metrics/CacheHitPieChart';
import CacheProviderChart from '@/components/features/metrics/CacheProviderChart';
import RoutesTable from '@/components/features/metrics/RoutesTable';
import RouteSamplesDrawer from '@/components/features/metrics/RouteSamplesDrawer';
import RecentErrorsPanel from '@/components/features/metrics/RecentErrorsPanel';
import MetricsFilterBar, {
  emptyFilter,
  type MetricsFilter,
} from '@/components/features/metrics/MetricsFilterBar';

const emptySnapshot: MetricsSnapshot = {
  timestamp: Date.now(),
  windowMs: 300_000,
  summary: { totalRequests: 0, errorRate: 0, avgLatencyMs: 0, cacheHitRate: 0, p50LatencyMs: 0, p90LatencyMs: 0, p99LatencyMs: 0 },
  timeline: [],
  routeBreakdown: [],
  downstream: [],
};

const REFRESH_OPTIONS = [
  { value: 0, label: 'Refresh: Off' },
  { value: 10_000, label: 'Refresh: 10s' },
  { value: 30_000, label: 'Refresh: 30s' },
  { value: 60_000, label: 'Refresh: 60s' },
];

const REFRESH_STORAGE_KEY = 'metricsRefreshMs';

const DashboardPage = () => {
  const [range, setRange] = useState<MetricsRange>({ type: 'relative', window: '5m' });
  const [refreshMs, setRefreshMs] = useState<number>(() => {
    const stored = LocalStorage.getItem(REFRESH_STORAGE_KEY);
    return typeof stored === 'number' ? stored : 10_000;
  });
  const [tab, setTab] = useState(0);
  const [filter, setFilter] = useState<MetricsFilter>(emptyFilter);
  const [selectedRoute, setSelectedRoute] = useState<RouteBreakdown | null>(null);

  const { data, isPending, isFetching, isError, refetch } = useMetricsQuery(
    range,
    refreshMs > 0 ? refreshMs : false,
  );
  const snapshot = data ?? emptySnapshot;

  const routeOptions = useMemo(
    () => snapshot.routeBreakdown.map((r) => `${r.method} ${r.route}`),
    [snapshot.routeBreakdown],
  );
  const methodOptions = useMemo(
    () => Array.from(new Set(snapshot.routeBreakdown.map((r) => r.method))).sort(),
    [snapshot.routeBreakdown],
  );

  const filteredRoutes = useMemo(
    () =>
      snapshot.routeBreakdown.filter((r) => {
        if (filter.method && r.method !== filter.method) return false;
        if (filter.routes.length > 0 && !filter.routes.includes(`${r.method} ${r.route}`)) return false;
        return true;
      }),
    [snapshot.routeBreakdown, filter],
  );

  const handleRefreshChange = (value: number) => {
    setRefreshMs(value);
    LocalStorage.setItem(REFRESH_STORAGE_KEY, value);
  };

  return (
    <Box>
      <Box sx={{ mt: 5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: { xs: 'flex-start', md: 'center' },
            justifyContent: 'space-between',
            flexDirection: { xs: 'column', md: 'row' },
            gap: 2,
            mb: 2,
          }}
        >
          <Box>
            <Typography variant="h3" component="h2">
              Observability
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.textSubtle, mt: 0.5 }}>
              Last updated {dayjs(snapshot.timestamp).format('HH:mm:ss')}
              {snapshot.source === 'cluster' ? ' · cluster-wide' : ''}
              {snapshot.windowCoverageMs && snapshot.windowCoverageMs < snapshot.windowMs
                ? ` · showing last ${Math.round(snapshot.windowCoverageMs / 60_000)} min only (local data)`
                : ''}
              {isError ? ' — data may be stale' : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <TimeRangePicker range={range} onChange={setRange} />
            <Select
              value={refreshMs}
              onChange={(e) => handleRefreshChange(Number(e.target.value))}
              size="small"
              aria-label="Auto-refresh interval"
              sx={{ fontSize: 13 }}
            >
              {REFRESH_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: 13 }}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
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

        <Tabs value={tab} onChange={(_, next) => setTab(next)} sx={{ mb: 2, borderBottom: `1px solid ${tokens.border}` }}>
          <Tab label="Overview" />
          <Tab label="Routes" />
          <Tab label="Downstream" />
        </Tabs>

        {tab === 0 && (
          <>
            <SummaryCards summary={snapshot.summary} loading={isPending} />
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
                gap: 2,
              }}
            >
              <Box sx={{ gridColumn: { xs: '1', lg: '1 / -1' } }}>
                <RequestTimelineChart
                  data={snapshot.timeline}
                  loading={isPending}
                  bucketIntervalMs={snapshot.bucketIntervalMs}
                />
              </Box>
              <StatusClassTimelineChart
                data={snapshot.timeline}
                loading={isPending}
                bucketIntervalMs={snapshot.bucketIntervalMs}
              />
              <RecentErrorsPanel data={snapshot.recentErrors} loading={isPending} />
            </Box>
          </>
        )}

        {tab === 1 && (
          <>
            <MetricsFilterBar
              routeOptions={routeOptions}
              methodOptions={methodOptions}
              filter={filter}
              onChange={setFilter}
            />
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
                gap: 2,
              }}
            >
              <Box sx={{ gridColumn: { xs: '1', lg: '1 / -1' } }}>
                <RoutesTable
                  data={filteredRoutes}
                  loading={isPending}
                  onRowClick={setSelectedRoute}
                />
              </Box>
              <RouteBreakdownChart data={filteredRoutes} loading={isPending} />
              <CacheHitPieChart data={filteredRoutes} loading={isPending} />
            </Box>
          </>
        )}

        {tab === 2 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
              gap: 2,
            }}
          >
            <DownstreamLatencyChart data={snapshot.downstream} loading={isPending} />
            <DownstreamStatusChart data={snapshot.downstream} loading={isPending} />
            <LatencyStageChart data={snapshot.downstream} loading={isPending} />
            <CacheProviderChart data={snapshot.summary.cacheProviders} loading={isPending} />
          </Box>
        )}

        <RouteSamplesDrawer route={selectedRoute} onClose={() => setSelectedRoute(null)} />
      </Box>
    </Box>
  );
};

export default DashboardPage;
