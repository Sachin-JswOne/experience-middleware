import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  AlertConfig,
  DownstreamBreakdown,
  MetricsSnapshot,
  RecentError,
  RouteBreakdown,
} from '@/_types/metrics.interface';
import LocalStorage from '@/utils/LocalStorage';
import MetricsService from '@/services/MetricsService';
import { tokens } from '@/styles/theme';
import useMetricsQuery, {
  WINDOW_MS,
  rangeSpanMs,
  usePreviousMetricsQuery,
  useMetricsHealthQuery,
  type MetricsRange,
  type MetricsWindow,
} from '@/components/features/metrics/useMetricsQuery';
import TimeRangePicker from '@/components/features/metrics/TimeRangePicker';
import SummaryCards from '@/components/features/metrics/SummaryCards';
import RequestTimelineChart from '@/components/features/metrics/RequestTimelineChart';
import StatusClassTimelineChart from '@/components/features/metrics/StatusClassTimelineChart';
import LatencyHeatmap from '@/components/features/metrics/LatencyHeatmap';
import RouteBreakdownChart from '@/components/features/metrics/RouteBreakdownChart';
import DownstreamLatencyChart from '@/components/features/metrics/DownstreamLatencyChart';
import DownstreamStatusChart from '@/components/features/metrics/DownstreamStatusChart';
import DownstreamTimelineChart from '@/components/features/metrics/DownstreamTimelineChart';
import LatencyStageChart from '@/components/features/metrics/LatencyStageChart';
import CacheHitPieChart from '@/components/features/metrics/CacheHitPieChart';
import CacheProviderChart from '@/components/features/metrics/CacheProviderChart';
import RoutesTable from '@/components/features/metrics/RoutesTable';
import RouteSamplesDrawer, {
  type SamplesQuery,
} from '@/components/features/metrics/RouteSamplesDrawer';
import RecentErrorsPanel from '@/components/features/metrics/RecentErrorsPanel';
import TopMoversPanel from '@/components/features/metrics/TopMoversPanel';
import SloCard, { loadSloConfig, type SloConfig } from '@/components/features/metrics/SloCard';
import SavedViews from '@/components/features/metrics/SavedViews';
import SystemPanel from '@/components/features/metrics/SystemPanel';
import DependencyMap from '@/components/features/metrics/DependencyMap';
import TrafficPatternPanel from '@/components/features/metrics/TrafficPatternPanel';
import CacheOpportunitiesPanel from '@/components/features/metrics/CacheOpportunitiesPanel';
import AlertSettings, {
  evaluateAlerts,
  loadThresholds,
  mergeServerConfig,
  useAlertNotifications,
  type AlertThresholds,
} from '@/components/features/metrics/AlertSettings';
import MetricsFilterBar, {
  type MetricsFilter,
} from '@/components/features/metrics/MetricsFilterBar';
import { formatTs } from '@/components/features/metrics/chartShared';

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

const TAB_NAMES = ['overview', 'routes', 'downstream', 'system'] as const;

// --- URL <-> state (deep links survive refresh and can be shared) ---

const parseRange = (params: URLSearchParams): MetricsRange => {
  const from = Number(params.get('from'));
  const to = Number(params.get('to'));
  if (params.get('from') && params.get('to') && !isNaN(from) && !isNaN(to) && from < to) {
    return { type: 'absolute', from, to };
  }
  const window = params.get('window');
  if (window && window in WINDOW_MS) {
    return { type: 'relative', window: window as MetricsWindow };
  }
  return { type: 'relative', window: '5m' };
};

const parseTab = (params: URLSearchParams): number => {
  const idx = TAB_NAMES.indexOf((params.get('tab') ?? '') as (typeof TAB_NAMES)[number]);
  return idx >= 0 ? idx : 0;
};

const parseList = (params: URLSearchParams, key: string): string[] => {
  const raw = params.get(key);
  return raw ? raw.split(',').filter(Boolean) : [];
};

// Latency band label for the heatmap drill-through drawer title.
const bandLabel = (minMs: number, maxMs: number | null): string => {
  if (maxMs === null) return `>${minMs >= 1000 ? `${minMs / 1000}s` : `${minMs}ms`}`;
  return maxMs >= 1000 ? `≤${maxMs / 1000}s` : `≤${maxMs}ms`;
};

const DashboardPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [range, setRange] = useState<MetricsRange>(() => parseRange(searchParams));
  const [tab, setTab] = useState(() => parseTab(searchParams));
  const [filter, setFilter] = useState<MetricsFilter>(() => ({
    routes: parseList(searchParams, 'routes'),
    method: searchParams.get('method'),
  }));
  const [targetFilter, setTargetFilter] = useState<string[]>(() => parseList(searchParams, 'targets'));
  const [utc, setUtc] = useState(() => searchParams.get('utc') === '1');
  const [refreshMs, setRefreshMs] = useState<number>(() => {
    const fromUrl = searchParams.get('refresh');
    if (fromUrl !== null && !isNaN(Number(fromUrl))) return Number(fromUrl);
    const stored = LocalStorage.getItem(REFRESH_STORAGE_KEY);
    return typeof stored === 'number' ? stored : 10_000;
  });
  const [thresholds, setThresholds] = useState<AlertThresholds>(loadThresholds);
  const [sloConfig, setSloConfig] = useState<SloConfig>(loadSloConfig);
  const [drawerQuery, setDrawerQuery] = useState<SamplesQuery | null>(null);
  // Ranges we zoomed away from — the reset chip walks back through them.
  const [zoomStack, setZoomStack] = useState<MetricsRange[]>([]);

  // --- Shared alert config (Valkey-backed, same rules drive the webhook) ---
  const alertConfigQuery = useQuery({
    queryKey: ['metrics-alert-config'],
    queryFn: async () => {
      const result = await MetricsService.getAlertConfig();
      if (!result.data || result.error?.code) {
        throw new Error(result.error?.message || 'Failed to load alert config');
      }
      return result.data;
    },
    staleTime: 60_000,
    retry: 1,
  });
  const alertsShared = alertConfigQuery.data?.shared === true;

  // Hydrate thresholds from the server copy once per updatedAt change.
  const hydratedAt = useRef<number>(-1);
  useEffect(() => {
    const config = alertConfigQuery.data?.config;
    if (!alertsShared || !config || config.updatedAt === hydratedAt.current) return;
    hydratedAt.current = config.updatedAt;
    setThresholds((prev) => mergeServerConfig(prev, config));
  }, [alertsShared, alertConfigQuery.data?.config]);

  const saveConfigMutation = useMutation({
    mutationFn: (config: AlertConfig) => MetricsService.saveAlertConfig(config),
  });
  const persistServerConfig = useCallback(
    (config: AlertConfig) => {
      // Mark our own write as seen so the next poll doesn't clobber edits.
      hydratedAt.current = Date.now();
      saveConfigMutation.mutate(config);
    },
    [saveConfigMutation],
  );

  const alertHistoryQuery = useQuery({
    queryKey: ['metrics-alert-history'],
    queryFn: async () => {
      const result = await MetricsService.getAlertHistory(50);
      if (!result.data || result.error?.code) {
        throw new Error(result.error?.message || 'Failed to load alert history');
      }
      return result.data;
    },
    enabled: alertsShared,
    refetchInterval: 60_000,
  });

  // Reflect every view decision in the URL so reload/share restores it.
  useEffect(() => {
    const params: Record<string, string> = { tab: TAB_NAMES[tab] ?? 'overview' };
    if (range.type === 'relative') {
      params.window = range.window;
    } else {
      params.from = String(range.from);
      params.to = String(range.to);
    }
    params.refresh = String(refreshMs);
    if (filter.method) params.method = filter.method;
    if (filter.routes.length > 0) params.routes = filter.routes.join(',');
    if (targetFilter.length > 0) params.targets = targetFilter.join(',');
    if (utc) params.utc = '1';
    setSearchParams(params, { replace: true });
  }, [range, tab, refreshMs, filter, targetFilter, utc, setSearchParams]);

  // Saved views re-apply a previously captured query string.
  const applyViewParams = useCallback((raw: string) => {
    const params = new URLSearchParams(raw);
    setZoomStack([]);
    setRange(parseRange(params));
    setTab(parseTab(params));
    setFilter({ routes: parseList(params, 'routes'), method: params.get('method') });
    setTargetFilter(parseList(params, 'targets'));
    setUtc(params.get('utc') === '1');
    const refresh = params.get('refresh');
    if (refresh !== null && !isNaN(Number(refresh))) setRefreshMs(Number(refresh));
  }, []);

  const { data, isPending, isFetching, isError, refetch } = useMetricsQuery(
    range,
    refreshMs > 0 ? refreshMs : false,
  );
  const previousQuery = usePreviousMetricsQuery(range, refreshMs > 0 ? refreshMs : false);
  // The health feed also powers loop-lag / Valkey / pod alerts, so keep it
  // polling whenever such a rule is configured — not just on the System tab.
  const healthRulesActive =
    thresholds.eventLoopLagP99Ms !== null || thresholds.valkeyUnavailable;
  const healthQuery = useMetricsHealthQuery(tab === 3 || healthRulesActive);
  const snapshot = data ?? emptySnapshot;

  const breaches = useMemo(
    () =>
      evaluateAlerts(snapshot, thresholds, {
        previous: previousQuery.data?.summary,
        health: healthQuery.data,
      }),
    [snapshot, thresholds, previousQuery.data?.summary, healthQuery.data],
  );
  useAlertNotifications(breaches, thresholds);

  const coveredSec = (snapshot.windowCoverageMs ?? snapshot.windowMs) / 1000;
  const rps = coveredSec > 0 ? snapshot.summary.totalRequests / coveredSec : 0;

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

  const matchesRouteFilter = (method: string, route: string) => {
    if (filter.method && method !== filter.method) return false;
    if (filter.routes.length > 0 && !filter.routes.includes(`${method} ${route}`)) return false;
    return true;
  };

  const filteredRoutes = useMemo(
    () => snapshot.routeBreakdown.filter((r) => matchesRouteFilter(r.method, r.route)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.routeBreakdown, filter],
  );

  const routeFilterActive = Boolean(filter.method) || filter.routes.length > 0;

  // Downstream tab data. With a route filter the aggregates come from the
  // per-(route, target) pairs; otherwise the plain per-target rollup is used.
  const downstreamAggregates: DownstreamBreakdown[] = useMemo(() => {
    let base: DownstreamBreakdown[];
    if (routeFilterActive && snapshot.routeDownstream) {
      const byTarget = new Map<string, { count: number; err: number; latSum: number }>();
      for (const pair of snapshot.routeDownstream) {
        if (!matchesRouteFilter(pair.method, pair.route)) continue;
        let acc = byTarget.get(pair.target);
        if (!acc) {
          acc = { count: 0, err: 0, latSum: 0 };
          byTarget.set(pair.target, acc);
        }
        acc.count += pair.requestCount;
        acc.err += pair.errorCount;
        acc.latSum += pair.avgLatencyMs * pair.requestCount;
      }
      base = Array.from(byTarget.entries()).map(([target, acc]) => ({
        target,
        requestCount: acc.count,
        errorCount: acc.err,
        avgLatencyMs: acc.count > 0 ? acc.latSum / acc.count : 0,
      }));
    } else {
      base = snapshot.downstream;
    }
    return targetFilter.length > 0 ? base.filter((d) => targetFilter.includes(d.target)) : base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.downstream, snapshot.routeDownstream, routeFilterActive, filter, targetFilter]);

  const filteredDownstreamAll = useMemo(
    () =>
      targetFilter.length > 0
        ? snapshot.downstream.filter((d) => targetFilter.includes(d.target))
        : snapshot.downstream,
    [snapshot.downstream, targetFilter],
  );

  const filteredDownstreamTimeline = useMemo(() => {
    const series = snapshot.downstreamTimeline ?? [];
    return targetFilter.length > 0 ? series.filter((s) => targetFilter.includes(s.target)) : series;
  }, [snapshot.downstreamTimeline, targetFilter]);

  const handleRefreshChange = (value: number) => {
    setRefreshMs(value);
    LocalStorage.setItem(REFRESH_STORAGE_KEY, value);
  };

  // Routes tab → Downstream tab scoped to one route.
  const handleDrill = (route: RouteBreakdown) => {
    setFilter({ routes: [`${route.method} ${route.route}`], method: null });
    setTargetFilter([]);
    setTab(2);
  };

  const openRouteSamples = (method: string, route: string) => {
    setDrawerQuery({ kind: 'route', method, route });
  };

  // Drag-select on a timeline chart zooms into that slice (absolute range);
  // the reset chip walks back to whatever was selected before.
  const handleZoom = useCallback(
    (fromTs: number, toTs: number) => {
      setZoomStack((stack) => [...stack, range]);
      setRange({ type: 'absolute', from: fromTs, to: toTs });
    },
    [range],
  );

  const handleZoomReset = useCallback(() => {
    setZoomStack((stack) => {
      const previous = stack[stack.length - 1];
      if (previous) setRange(previous);
      return stack.slice(0, -1);
    });
  }, []);

  // Picking a range by hand invalidates the zoom trail.
  const handleRangeChange = useCallback((next: MetricsRange) => {
    setZoomStack([]);
    setRange(next);
  }, []);

  // Breach count in the browser tab so alerts are visible from other tabs.
  useEffect(() => {
    const original = document.title;
    document.title = breaches.length > 0 ? `(${breaches.length}⚠) Observability` : original;
    return () => {
      document.title = original;
    };
  }, [breaches.length]);

  const handleHeatmapCell = useCallback(
    (band: { fromTs: number; toTs: number; minMs: number; maxMs: number | null }) => {
      setDrawerQuery({ kind: 'band', ...band, label: bandLabel(band.minMs, band.maxMs) });
    },
    [],
  );

  const handleErrorSelect = useCallback((error: RecentError) => {
    setDrawerQuery({ kind: 'route', method: error.method, route: error.route });
  }, []);

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
              Last updated {formatTs(snapshot.timestamp, 'HH:mm:ss', utc)}
              {utc ? ' UTC' : ''}
              {snapshot.source === 'cluster' ? ' · cluster-wide' : ''}
              {snapshot.windowCoverageMs && snapshot.windowCoverageMs < snapshot.windowMs
                ? ` · showing last ${Math.round(snapshot.windowCoverageMs / 60_000)} min only (local data)`
                : ''}
              {isError ? ' — data may be stale' : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {zoomStack.length > 0 && (
              <Tooltip title="Back to the range before the last zoom">
                <Chip
                  icon={<ZoomOutIcon sx={{ fontSize: 16 }} />}
                  label="Reset zoom"
                  size="small"
                  onClick={handleZoomReset}
                  sx={{ fontWeight: tokens.weightBold }}
                />
              </Tooltip>
            )}
            <TimeRangePicker range={range} onChange={handleRangeChange} utc={utc} />
            <Tooltip title="Show timestamps in UTC">
              <ToggleButton
                value="utc"
                selected={utc}
                size="small"
                onChange={() => setUtc((prev) => !prev)}
                aria-label="Toggle UTC timestamps"
                sx={{ px: 1.25, fontSize: 12, height: 32 }}
              >
                UTC
              </ToggleButton>
            </Tooltip>
            <Select
              value={refreshMs}
              onChange={(e) => handleRefreshChange(Number(e.target.value))}
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
            <SavedViews currentParams={searchParams.toString()} onApply={applyViewParams} />
            <AlertSettings
              thresholds={thresholds}
              onChange={setThresholds}
              breached={breaches.length > 0}
              routeOptions={routeOptions}
              targetOptions={targetOptions}
              utc={utc}
              shared={alertsShared}
              onPersistServer={persistServerConfig}
              serverHistory={alertHistoryQuery.data ?? null}
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
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            }
          >
            We can't reach the metrics service. Check your connection and retry.
          </Alert>
        )}

        <Tabs value={tab} onChange={(_, next) => setTab(next)} sx={{ mb: 2, borderBottom: `1px solid ${tokens.border}` }}>
          <Tab label="Overview" />
          <Tab label="Routes" />
          <Tab label="Downstream" />
          <Tab label="System" />
        </Tabs>

        {tab === 0 && (
          <>
            <SummaryCards
              summary={snapshot.summary}
              loading={isPending}
              previous={previousQuery.data?.summary}
              rps={rps}
            />
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
                  deployMarkers={snapshot.deployMarkers}
                  utc={utc}
                  onZoom={handleZoom}
                  previousData={previousQuery.data?.timeline}
                />
              </Box>
              <Box sx={{ gridColumn: { xs: '1', lg: '1 / -1' } }}>
                <LatencyHeatmap
                  data={snapshot.timeline}
                  loading={isPending}
                  bucketIntervalMs={snapshot.bucketIntervalMs}
                  utc={utc}
                  onCellClick={handleHeatmapCell}
                />
              </Box>
              <StatusClassTimelineChart
                data={snapshot.timeline}
                loading={isPending}
                bucketIntervalMs={snapshot.bucketIntervalMs}
                deployMarkers={snapshot.deployMarkers}
                utc={utc}
                onZoom={handleZoom}
              />
              <RecentErrorsPanel
                data={snapshot.recentErrors}
                loading={isPending}
                utc={utc}
                onSelect={handleErrorSelect}
              />
              <TopMoversPanel
                current={snapshot.routeBreakdown}
                previous={previousQuery.data?.routeBreakdown}
                loading={isPending}
                onSelect={(route) => openRouteSamples(route.method, route.route)}
              />
              <SloCard
                summary={snapshot.summary}
                timeline={snapshot.timeline}
                loading={isPending}
                config={sloConfig}
                onConfigChange={setSloConfig}
              />
              {rangeSpanMs(range) >= 6.5 * 24 * 60 * 60 * 1000 && (
                <Box sx={{ gridColumn: { xs: '1', lg: '1 / -1' } }}>
                  <TrafficPatternPanel
                    data={snapshot.timeline}
                    loading={isPending}
                    bucketIntervalMs={snapshot.bucketIntervalMs}
                    windowMs={rangeSpanMs(range)}
                    utc={utc}
                  />
                </Box>
              )}
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
                  onRowClick={(r) => openRouteSamples(r.method, r.route)}
                  onDrill={handleDrill}
                />
              </Box>
              <RouteBreakdownChart data={filteredRoutes} loading={isPending} />
              <CacheHitPieChart data={filteredRoutes} loading={isPending} />
              <CacheOpportunitiesPanel data={filteredRoutes} loading={isPending} />
            </Box>
          </>
        )}

        {tab === 2 && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
              <Autocomplete
                multiple
                size="small"
                options={routeOptions}
                value={filter.routes}
                onChange={(_, routes) => setFilter({ ...filter, routes })}
                renderInput={(params) => (
                  <TextField {...params} label="Filter by route" placeholder="All routes" />
                )}
                sx={{ minWidth: 280, flex: '1 1 320px', maxWidth: 480 }}
              />
              <Autocomplete
                multiple
                size="small"
                options={targetOptions}
                value={targetFilter}
                onChange={(_, targets) => setTargetFilter(targets)}
                renderInput={(params) => (
                  <TextField {...params} label="Filter by target" placeholder="All targets" />
                )}
                sx={{ minWidth: 240, flex: '1 1 280px', maxWidth: 420 }}
              />
              {routeFilterActive && (
                <Typography variant="caption" sx={{ color: tokens.textSubtlest }}>
                  Latency & error charts are scoped to the selected route(s); status, stage and
                  timeline charts show all-route traffic per target.
                </Typography>
              )}
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
                gap: 2,
              }}
            >
              <Box sx={{ gridColumn: { xs: '1', lg: '1 / -1' } }}>
                <DownstreamTimelineChart
                  data={filteredDownstreamTimeline}
                  loading={isPending}
                  bucketIntervalMs={snapshot.bucketIntervalMs}
                  deployMarkers={snapshot.deployMarkers}
                  utc={utc}
                  onZoom={handleZoom}
                />
              </Box>
              <DownstreamLatencyChart data={downstreamAggregates} loading={isPending} />
              <DownstreamStatusChart data={filteredDownstreamAll} loading={isPending} />
              <LatencyStageChart data={filteredDownstreamAll} loading={isPending} />
              <CacheProviderChart data={snapshot.summary.cacheProviders} loading={isPending} />
              <Box sx={{ gridColumn: { xs: '1', lg: '1 / -1' } }}>
                <DependencyMap
                  pairs={snapshot.routeDownstream}
                  loading={isPending}
                  onSelectRoute={(routeKey) => setFilter({ routes: [routeKey], method: null })}
                />
              </Box>
            </Box>
          </>
        )}

        {tab === 3 && (
          <SystemPanel data={healthQuery.data} loading={healthQuery.isPending} utc={utc} />
        )}

        <RouteSamplesDrawer
          query={drawerQuery}
          onClose={() => setDrawerQuery(null)}
          utc={utc}
          range={range}
        />
      </Box>
    </Box>
  );
};

export default DashboardPage;
