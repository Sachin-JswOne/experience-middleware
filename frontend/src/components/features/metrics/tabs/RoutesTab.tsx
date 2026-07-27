import { memo } from 'react';
import { Box } from '@mui/material';
import type { RouteBreakdown } from '@/_types/metrics.interface';
import MetricsFilterBar, { type MetricsFilter } from '../MetricsFilterBar';
import RoutesTable from '../RoutesTable';
import RouteBreakdownChart from '../RouteBreakdownChart';
import CacheHitPieChart from '../CacheHitPieChart';
import CacheOpportunitiesPanel from '../CacheOpportunitiesPanel';
import { GRID_SX, FULL_WIDTH_SX } from './layout';

interface Props {
  routes: RouteBreakdown[];
  routeOptions: string[];
  methodOptions: string[];
  filter: MetricsFilter;
  loading: boolean;
  onFilterChange: (filter: MetricsFilter) => void;
  onRouteSelect: (method: string, route: string) => void;
  onDrillToDownstream: (route: RouteBreakdown) => void;
}

const RoutesTab = ({
  routes,
  routeOptions,
  methodOptions,
  filter,
  loading,
  onFilterChange,
  onRouteSelect,
  onDrillToDownstream,
}: Props) => (
  <>
    <MetricsFilterBar
      routeOptions={routeOptions}
      methodOptions={methodOptions}
      filter={filter}
      onChange={onFilterChange}
    />
    <Box sx={GRID_SX}>
      <Box sx={FULL_WIDTH_SX}>
        <RoutesTable
          data={routes}
          loading={loading}
          onRowClick={(r) => onRouteSelect(r.method, r.route)}
          onDrill={onDrillToDownstream}
        />
      </Box>
      <RouteBreakdownChart data={routes} loading={loading} />
      <CacheHitPieChart data={routes} loading={loading} />
      <CacheOpportunitiesPanel data={routes} loading={loading} />
    </Box>
  </>
);

export default memo(RoutesTab);
