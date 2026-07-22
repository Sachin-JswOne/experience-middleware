import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardActionArea, Typography, IconButton, Chip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import PeopleIcon from '@mui/icons-material/People';
import InventoryIcon from '@mui/icons-material/Inventory';
import CategoryIcon from '@mui/icons-material/Category';
import type { ElementType } from 'react';
import type { ILooseObject } from '@/_types/common.interface';
import type { MetricsSnapshot } from '@/_types/metrics.interface';
import AppConfig from '@/configs/AppConfig';
import LocalStorage from '@/utils/LocalStorage';
import { tokens } from '@/styles/theme';
import MetricsService from '@/services/MetricsService';
import SummaryCards from '@/components/features/metrics/SummaryCards';
import RequestTimelineChart from '@/components/features/metrics/RequestTimelineChart';
import RouteBreakdownChart from '@/components/features/metrics/RouteBreakdownChart';
import DownstreamLatencyChart from '@/components/features/metrics/DownstreamLatencyChart';
import CacheHitPieChart from '@/components/features/metrics/CacheHitPieChart';

// Decorative accent ramps from DESIGN.md (subtlest background + accent icon).
const moduleMeta: Record<
  string,
  { icon: ElementType; description: string; tileBg: string; tileFg: string }
> = {
  '/products': {
    icon: InventoryIcon,
    description: 'Browse and manage the product catalogue',
    tileBg: '#E9F2FE',
    tileFg: '#357DE8',
  },
  '/categories': {
    icon: CategoryIcon,
    description: 'Organise products into categories',
    tileBg: '#E7F9FF',
    tileFg: '#2898BD',
  },
  '/users': {
    icon: PeopleIcon,
    description: 'Manage user access and roles',
    tileBg: '#F8EEFE',
    tileFg: '#AF59E1',
  },
  '/settings': {
    icon: SettingsIcon,
    description: 'Configure application preferences',
    tileBg: '#F0F1F2',
    tileFg: '#7D818A',
  },
};

const POLL_INTERVAL = 10_000;

const emptySnapshot: MetricsSnapshot = {
  timestamp: Date.now(),
  windowMs: 300_000,
  summary: { totalRequests: 0, errorRate: 0, avgLatencyMs: 0, cacheHitRate: 0, p50LatencyMs: 0, p90LatencyMs: 0, p99LatencyMs: 0 },
  timeline: [],
  routeBreakdown: [],
  downstream: [],
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const userInfo: ILooseObject | undefined = LocalStorage.getItem('userInfo');
  const firstName = String(userInfo?.name || '')
    .trim()
    .split(' ')[0];

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

  const modules = (AppConfig.NAVIGATION_MENUS ?? []).filter(
    (item) => moduleMeta[item.route]
  );

  return (
    <Box>
      <Typography variant="h3" component="h1">
        {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
      </Typography>
      <Typography variant="body1" sx={{ color: tokens.textSubtle, mt: 0.5 }}>
        Jump into a module to manage the catalogue.
      </Typography>

      <Box
        sx={{
          mt: 4,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 2,
        }}
      >
        {modules.map((item) => {
          const meta = moduleMeta[item.route];
          if (!meta) return null;
          const IconComponent = meta.icon;

          return (
            <Card key={item.id}>
              <CardActionArea
                onClick={() => navigate(item.route)}
                sx={{
                  p: 2.5,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  '&:hover': {
                    bgcolor: tokens.backgroundNeutralSubtleHovered,
                  },
                }}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: `${tokens.radiusMedium}px`,
                    bgcolor: meta.tileBg,
                    color: meta.tileFg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mb: 1.5,
                  }}
                >
                  <IconComponent sx={{ fontSize: 18 }} />
                </Box>
                <Typography variant="h5" component="h2">
                  {item.label}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ color: tokens.textSubtle, mt: 0.5 }}
                >
                  {meta.description}
                </Typography>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>

      <Box sx={{ mt: 5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Box>
            <Typography variant="h3" component="h2">
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
          <CacheHitPieChart data={snapshot.routeBreakdown} loading={loading} />
          <DownstreamLatencyChart data={snapshot.downstream} loading={loading} />
        </Box>
      </Box>
    </Box>
  );
};

export default DashboardPage;
