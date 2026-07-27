import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Select,
  Tab,
  Tabs,
  ToggleButton,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import type { MetricsSnapshot, RecentError, RouteBreakdown } from '@/_types/metrics.interface';
import { formatTs } from '@/utils/format';
import { tokens } from '@/styles/theme';
import ErrorBoundary from '@/components/features/layout/ErrorBoundary';
import useMetricsQuery, {
  rangeSpanMs,
  useBaselineMetricsQuery,
  useMetricsHealthQuery,
  useMetricsStream,
  usePreviousMetricsQuery,
} from '@/components/features/metrics/useMetricsQuery';
import useDashboardView from '@/components/features/metrics/useDashboardView';
import useDashboardShortcuts from '@/components/features/metrics/useDashboardShortcuts';
import TimeRangePicker from '@/components/features/metrics/TimeRangePicker';
import ComparePanel from '@/components/features/metrics/ComparePanel';
import RouteSamplesDrawer, {
  type SamplesQuery,
} from '@/components/features/metrics/samples/RouteSamplesDrawer';
import SavedViews from '@/components/features/metrics/SavedViews';
import SystemPanel from '@/components/features/metrics/SystemPanel';
import { loadSloConfig, type SloConfig } from '@/components/features/metrics/SloCard';
import {
  AlertSettings,
  evaluateAlerts,
  useAlertNotifications,
  useSharedAlertConfig,
} from '@/components/features/metrics/alerts';
import OverviewTab, {
  type HeatmapBand,
} from '@/components/features/metrics/tabs/OverviewTab';
import RoutesTab from '@/components/features/metrics/tabs/RoutesTab';
import DownstreamTab from '@/components/features/metrics/tabs/DownstreamTab';
import { matchesRouteFilter } from '@/components/features/metrics/aggregate';

const emptySnapshot: MetricsSnapshot = {
  timestamp: 0,
  windowMs: 300_000,
  summary: {
    totalRequests: 0,
    errorRate: 0,
    avgLatencyMs: 0,
    cacheHitRate: 0,
    p50LatencyMs: 0,
    p90LatencyMs: 0,
    p99LatencyMs: 0,
  },
  timeline: [],
  routeBreakdown: [],
  downstream: [],
};

const REFRESH_OPTIONS = [
  { value: 0, label: 'Refresh: Off' },
  { value: -1, label: 'Live (SSE)' },
  { value: 10_000, label: 'Refresh: 10s' },
  { value: 30_000, label: 'Refresh: 30s' },
  { value: 60_000, label: 'Refresh: 60s' },
];

const TAB_LABELS = ['Overview', 'Routes', 'Downstream', 'System'];

// While the stream is down we fall back to a slow poll rather than nothing.
const LIVE_FALLBACK_POLL_MS = 10_000;

// Latency band label for the heatmap drill-through drawer title.
const bandLabel = (minMs: number, maxMs: number | null): string => {
  if (maxMs === null) return `>${minMs >= 1000 ? `${minMs / 1000}s` : `${minMs}ms`}`;
  return maxMs >= 1000 ? `≤${maxMs / 1000}s` : `≤${maxMs}ms`;
};

const DashboardPage = () => {
  const view = useDashboardView();
  const { range, tab, filter, targetFilter, utc, refreshMs } = view;

  const [sloConfig, setSloConfig] = useState<SloConfig>(loadSloConfig);
  const [drawerQuery, setDrawerQuery] = useState<SamplesQuery | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const alerts = useSharedAlertConfig();
  const { thresholds } = alerts;

  // Live (SSE) mode pushes snapshots; the poll query then only serves as the
  // fallback while the stream is down.
  const live = refreshMs === -1 && range.type === 'relative';
  const stream = useMetricsStream(range, live);
  const pollInterval = live
    ? stream.connected
      ? false
      : LIVE_FALLBACK_POLL_MS
    : refreshMs > 0
      ? refreshMs
      : false;

  const { data, isPending, isFetching, isError, refetch } = useMetricsQuery(range, pollInterval);
  // The comparison windows are extra full-snapshot fetches per tick, so they
  // only run where their output is actually rendered: delta chips and the
  // anomaly overlay (Overview), and the compare drawer.
  const previousQuery = usePreviousMetricsQuery(range, pollInterval, tab === 0 || compareOpen);
  const baselineQuery = useBaselineMetricsQuery(range, pollInterval, tab === 0);
  // The health feed also powers loop-lag / Valkey / pod alerts, so keep it
  // polling whenever such a rule is configured — not just on the System tab.
  const healthRulesActive = thresholds.eventLoopLagP99Ms !== null || thresholds.valkeyUnavailable;
  const healthQuery = useMetricsHealthQuery(tab === 3 || healthRulesActive);
  const snapshot = (live ? stream.snapshot : null) ?? data ?? emptySnapshot;

  const breaches = useMemo(
    () =>
      evaluateAlerts(snapshot, thresholds, {
        previous: previousQuery.data?.summary,
        health: healthQuery.data,
      }),
    [snapshot, thresholds, previousQuery.data?.summary, healthQuery.data],
  );
  useAlertNotifications(breaches, thresholds);

  const routeOptions = useMemo(
    () => snapshot.routeBreakdown.map((r) => `${r.method} ${r.route}`),
    [snapshot.routeBreakdown],
  );
  const methodOptions = useMemo(
    () => Array.from(new Set(snapshot.routeBreakdown.map((r) => r.method))).sort(),
    [snapshot.routeBreakdown],
  );
  const targetOptions = useMemo(
    () => snapshot.downstream.map((d) => d.target).sort(),
    [snapshot.downstream],
  );
  const filteredRoutes = useMemo(
    () => snapshot.routeBreakdown.filter((r) => matchesRouteFilter(filter, r.method, r.route)),
    [snapshot.routeBreakdown, filter],
  );

  const openRouteSamples = useCallback((method: string, route: string) => {
    setDrawerQuery({ kind: 'route', method, route });
  }, []);

  const handleHeatmapCell = useCallback((band: HeatmapBand) => {
    setDrawerQuery({ kind: 'band', ...band, label: bandLabel(band.minMs, band.maxMs) });
  }, []);

  const handleErrorSelect = useCallback((error: RecentError) => {
    setDrawerQuery({ kind: 'route', method: error.method, route: error.route });
  }, []);

  // Routes tab → Downstream tab scoped to one route.
  const { setFilter, setTab, setTargetFilter } = view;
  const handleDrill = useCallback(
    (route: RouteBreakdown) => {
      setFilter({ routes: [`${route.method} ${route.route}`], method: null });
      setTargetFilter([]);
      setTab(2);
    },
    [setFilter, setTargetFilter, setTab],
  );

  const handleRefresh = useCallback(() => void refetch(), [refetch]);
  useDashboardShortcuts({
    onRefresh: handleRefresh,
    onToggleUtc: view.toggleUtc,
    onSelectTab: setTab,
  });

  // Breach count in the browser tab so alerts are visible from other tabs.
  useEffect(() => {
    const original = document.title;
    document.title = breaches.length > 0 ? `(${breaches.length}⚠) Observability` : original;
    return () => {
      document.title = original;
    };
  }, [breaches.length]);

  const span = rangeSpanMs(range);

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
            <Typography variant="h3" component="h1">
              Observability
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.textSubtle, mt: 0.5 }}>
              Last updated{' '}
              {snapshot.timestamp ? formatTs(snapshot.timestamp, 'HH:mm:ss', utc) : '—'}
              {snapshot.timestamp && utc ? ' UTC' : ''}
              {live ? (stream.connected ? ' · live' : ' · live (reconnecting, polling)') : ''}
              {snapshot.source === 'cluster' ? ' · cluster-wide' : ''}
              {snapshot.windowCoverageMs && snapshot.windowCoverageMs < snapshot.windowMs
                ? ` · showing last ${Math.round(snapshot.windowCoverageMs / 60_000)} min only (local data)`
                : ''}
              {isError ? ' — data may be stale' : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {view.canResetZoom && (
              <Tooltip title="Back to the range before the last zoom">
                <Chip
                  icon={<ZoomOutIcon sx={{ fontSize: 16 }} />}
                  label="Reset zoom"
                  size="small"
                  onClick={view.resetZoom}
                  sx={{ fontWeight: tokens.weightBold }}
                />
              </Tooltip>
            )}
            <TimeRangePicker range={range} onChange={view.changeRange} utc={utc} />
            <Tooltip title="Show timestamps in UTC">
              <ToggleButton
                value="utc"
                selected={utc}
                size="small"
                onChange={view.toggleUtc}
                aria-label="Toggle UTC timestamps"
                sx={{ px: 1.25, fontSize: 12, height: 32 }}
              >
                UTC
              </ToggleButton>
            </Tooltip>
            <Select
              value={refreshMs}
              onChange={(e) => view.changeRefresh(Number(e.target.value))}
              size="small"
              aria-label="Auto-refresh interval"
              sx={{ fontSize: '0.875rem' }}
            >
              {REFRESH_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.875rem' }}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
            <Tooltip title="Compare this window with the previous one">
              <IconButton
                size="small"
                aria-label="Compare with previous window"
                onClick={() => setCompareOpen(true)}
              >
                <CompareArrowsIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
            <SavedViews
              currentParams={view.searchParams.toString()}
              onApply={view.applyViewParams}
            />
            <AlertSettings
              thresholds={thresholds}
              onChange={alerts.setThresholds}
              breached={breaches.length > 0}
              routeOptions={routeOptions}
              targetOptions={targetOptions}
              utc={utc}
              shared={alerts.shared}
              onPersistServer={alerts.persistServer}
              serverHistory={alerts.serverHistory}
            />
            <IconButton
              onClick={handleRefresh}
              size="small"
              aria-label="Refresh metrics"
              disabled={isFetching}
            >
              <RefreshIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
        </Box>

        {breaches.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {`Alert threshold${breaches.length > 1 ? 's' : ''} breached: ${breaches.join(' · ')}`}
          </Alert>
        )}

        {isError && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" onClick={handleRefresh}>
                Retry
              </Button>
            }
          >
            We can't reach the metrics service. Check your connection and retry.
          </Alert>
        )}

        <Tabs
          value={tab}
          onChange={(_, next) => setTab(next)}
          sx={{ mb: 2, borderBottom: `1px solid ${tokens.border}` }}
        >
          {TAB_LABELS.map((label) => (
            <Tab key={label} label={label} />
          ))}
        </Tabs>

        {/* A chart that throws takes down its tab, not the whole dashboard. */}
        <ErrorBoundary scope="dashboard-tab" resetKey={tab}>
          {tab === 0 && (
            <OverviewTab
              snapshot={snapshot}
              previous={previousQuery.data}
              baseline={baselineQuery.data}
              loading={isPending}
              utc={utc}
              rangeSpanMs={span}
              sloConfig={sloConfig}
              onSloConfigChange={setSloConfig}
              onZoom={view.zoomTo}
              onHeatmapCell={handleHeatmapCell}
              onErrorSelect={handleErrorSelect}
              onRouteSelect={openRouteSamples}
            />
          )}

          {tab === 1 && (
            <RoutesTab
              routes={filteredRoutes}
              routeOptions={routeOptions}
              methodOptions={methodOptions}
              filter={filter}
              loading={isPending}
              onFilterChange={setFilter}
              onRouteSelect={openRouteSamples}
              onDrillToDownstream={handleDrill}
            />
          )}

          {tab === 2 && (
            <DownstreamTab
              snapshot={snapshot}
              filter={filter}
              targetFilter={targetFilter}
              routeOptions={routeOptions}
              targetOptions={targetOptions}
              loading={isPending}
              utc={utc}
              onFilterChange={setFilter}
              onTargetFilterChange={setTargetFilter}
              onZoom={view.zoomTo}
            />
          )}

          {tab === 3 && (
            <SystemPanel data={healthQuery.data} loading={healthQuery.isPending} utc={utc} />
          )}
        </ErrorBoundary>

        <RouteSamplesDrawer
          query={drawerQuery}
          onClose={() => setDrawerQuery(null)}
          utc={utc}
          range={range}
        />
        <ComparePanel
          open={compareOpen}
          onClose={() => setCompareOpen(false)}
          current={snapshot}
          previous={previousQuery.data}
        />
      </Box>
    </Box>
  );
};

export default DashboardPage;
