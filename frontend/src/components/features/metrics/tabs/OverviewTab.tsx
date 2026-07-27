import { memo } from 'react';
import { Box } from '@mui/material';
import type { MetricsSnapshot, RecentError } from '@/_types/metrics.interface';
import SummaryCards from '../SummaryCards';
import RequestTimelineChart from '../RequestTimelineChart';
import LatencyPercentileChart from '../LatencyPercentileChart';
import LatencyHeatmap from '../LatencyHeatmap';
import StatusClassTimelineChart from '../StatusClassTimelineChart';
import RecentErrorsPanel from '../RecentErrorsPanel';
import TopMoversPanel from '../TopMoversPanel';
import SloCard, { type SloConfig } from '../SloCard';
import TrafficPatternPanel from '../TrafficPatternPanel';
import { requestsPerSecond } from '../aggregate';
import { GRID_SX, FULL_WIDTH_SX } from './layout';

export interface HeatmapBand {
  fromTs: number;
  toTs: number;
  minMs: number;
  maxMs: number | null;
}

interface Props {
  snapshot: MetricsSnapshot;
  previous?: MetricsSnapshot;
  baseline?: MetricsSnapshot;
  loading: boolean;
  utc: boolean;
  rangeSpanMs: number;
  sloConfig: SloConfig;
  onSloConfigChange: (config: SloConfig) => void;
  onZoom: (fromTs: number, toTs: number) => void;
  onHeatmapCell: (band: HeatmapBand) => void;
  onErrorSelect: (error: RecentError) => void;
  onRouteSelect: (method: string, route: string) => void;
}

// Weekly seasonality only reads as a pattern once the range covers ~a week.
const WEEKLY_PATTERN_MIN_MS = 6.5 * 24 * 60 * 60 * 1000;

const OverviewTab = ({
  snapshot,
  previous,
  baseline,
  loading,
  utc,
  rangeSpanMs,
  sloConfig,
  onSloConfigChange,
  onZoom,
  onHeatmapCell,
  onErrorSelect,
  onRouteSelect,
}: Props) => (
  <>
    <SummaryCards
      summary={snapshot.summary}
      loading={loading}
      previous={previous?.summary}
      rps={requestsPerSecond(snapshot)}
    />
    <Box sx={GRID_SX}>
      <Box sx={FULL_WIDTH_SX}>
        <RequestTimelineChart
          data={snapshot.timeline}
          loading={loading}
          bucketIntervalMs={snapshot.bucketIntervalMs}
          deployMarkers={snapshot.deployMarkers}
          utc={utc}
          onZoom={onZoom}
          previousData={previous?.timeline}
          baselineData={baseline?.timeline}
        />
      </Box>
      <Box sx={FULL_WIDTH_SX}>
        <LatencyPercentileChart
          data={snapshot.timeline}
          loading={loading}
          bucketIntervalMs={snapshot.bucketIntervalMs}
          utc={utc}
          onZoom={onZoom}
        />
      </Box>
      <Box sx={FULL_WIDTH_SX}>
        <LatencyHeatmap
          data={snapshot.timeline}
          loading={loading}
          bucketIntervalMs={snapshot.bucketIntervalMs}
          utc={utc}
          onCellClick={onHeatmapCell}
        />
      </Box>
      <StatusClassTimelineChart
        data={snapshot.timeline}
        loading={loading}
        bucketIntervalMs={snapshot.bucketIntervalMs}
        deployMarkers={snapshot.deployMarkers}
        utc={utc}
        onZoom={onZoom}
      />
      <RecentErrorsPanel
        data={snapshot.recentErrors}
        loading={loading}
        utc={utc}
        onSelect={onErrorSelect}
      />
      <TopMoversPanel
        current={snapshot.routeBreakdown}
        previous={previous?.routeBreakdown}
        loading={loading}
        onSelect={(route) => onRouteSelect(route.method, route.route)}
      />
      <SloCard
        summary={snapshot.summary}
        timeline={snapshot.timeline}
        loading={loading}
        config={sloConfig}
        onConfigChange={onSloConfigChange}
      />
      {rangeSpanMs >= WEEKLY_PATTERN_MIN_MS && (
        <Box sx={FULL_WIDTH_SX}>
          <TrafficPatternPanel
            data={snapshot.timeline}
            loading={loading}
            bucketIntervalMs={snapshot.bucketIntervalMs}
            windowMs={rangeSpanMs}
            utc={utc}
          />
        </Box>
      )}
    </Box>
  </>
);

export default memo(OverviewTab);
