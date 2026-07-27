import { memo } from 'react';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import type { MetricsSnapshot } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import DownstreamTimelineChart from '../DownstreamTimelineChart';
import DownstreamLatencyChart from '../DownstreamLatencyChart';
import DownstreamStatusChart from '../DownstreamStatusChart';
import LatencyStageChart from '../LatencyStageChart';
import CacheProviderChart from '../CacheProviderChart';
import DependencyMap from '../DependencyMap';
import type { MetricsFilter } from '../MetricsFilterBar';
import { downstreamAggregates, filterByTarget, isRouteFilterActive } from '../aggregate';
import { GRID_SX, FULL_WIDTH_SX } from './layout';

interface Props {
  snapshot: MetricsSnapshot;
  filter: MetricsFilter;
  targetFilter: string[];
  routeOptions: string[];
  targetOptions: string[];
  loading: boolean;
  utc: boolean;
  onFilterChange: (filter: MetricsFilter) => void;
  onTargetFilterChange: (targets: string[]) => void;
  onZoom: (fromTs: number, toTs: number) => void;
}

const DownstreamTab = ({
  snapshot,
  filter,
  targetFilter,
  routeOptions,
  targetOptions,
  loading,
  utc,
  onFilterChange,
  onTargetFilterChange,
  onZoom,
}: Props) => {
  const aggregates = downstreamAggregates(snapshot, filter, targetFilter);
  const allTargets = filterByTarget(snapshot.downstream, targetFilter);
  const timeline = filterByTarget(snapshot.downstreamTimeline ?? [], targetFilter);

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <Autocomplete
          multiple
          size="small"
          options={routeOptions}
          value={filter.routes}
          onChange={(_, routes) => onFilterChange({ ...filter, routes })}
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
          onChange={(_, targets) => onTargetFilterChange(targets)}
          renderInput={(params) => (
            <TextField {...params} label="Filter by target" placeholder="All targets" />
          )}
          sx={{ minWidth: 240, flex: '1 1 280px', maxWidth: 420 }}
        />
        {isRouteFilterActive(filter) && (
          <Typography variant="caption" sx={{ color: tokens.textSubtlest }}>
            Latency & error charts are scoped to the selected route(s); status, stage and timeline
            charts show all-route traffic per target.
          </Typography>
        )}
      </Box>
      <Box sx={GRID_SX}>
        <Box sx={FULL_WIDTH_SX}>
          <DownstreamTimelineChart
            data={timeline}
            loading={loading}
            bucketIntervalMs={snapshot.bucketIntervalMs}
            deployMarkers={snapshot.deployMarkers}
            utc={utc}
            onZoom={onZoom}
          />
        </Box>
        <DownstreamLatencyChart data={aggregates} loading={loading} />
        <DownstreamStatusChart data={allTargets} loading={loading} />
        <LatencyStageChart data={allTargets} loading={loading} />
        <CacheProviderChart data={snapshot.summary.cacheProviders} loading={loading} />
        <Box sx={FULL_WIDTH_SX}>
          <DependencyMap
            pairs={snapshot.routeDownstream}
            loading={loading}
            onSelectRoute={(routeKey) => onFilterChange({ routes: [routeKey], method: null })}
          />
        </Box>
      </Box>
    </>
  );
};

export default memo(DownstreamTab);
