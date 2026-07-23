import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { LATENCY_HISTOGRAM_BOUNDS, type TimelineBucket } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import ChartCard, { formatBucketTs } from './chartShared';

interface Props {
  data: TimelineBucket[];
  loading: boolean;
  bucketIntervalMs?: number;
  utc?: boolean;
}

const boundLabel = (bound: number | 'inf'): string => {
  if (bound === 'inf') return '>30s';
  if (bound >= 1000) return `≤${bound / 1000}s`;
  return `≤${bound}ms`;
};

// Slowest row on top, like Kibana/Grafana latency heatmaps.
const ROWS: Array<number | 'inf'> = ['inf', ...[...LATENCY_HISTOGRAM_BOUNDS].reverse()];

const LatencyHeatmap = ({ data, loading, bucketIntervalMs, utc }: Props) => {
  const { cells, maxCount, hasData } = useMemo(() => {
    let max = 0;
    let any = false;
    const grid = data.map((bucket) => {
      const counts = ROWS.map((row) => {
        const count = bucket.histogram?.[String(row)] ?? 0;
        if (count > max) max = count;
        if (count > 0) any = true;
        return count;
      });
      return { bucketTs: bucket.bucketTs, counts };
    });
    return { cells: grid, maxCount: max, hasData: any };
  }, [data]);

  // Label roughly every ~8th column so long ranges stay readable.
  const labelEvery = Math.max(1, Math.ceil(cells.length / 8));

  return (
    <ChartCard
      title="Latency Heatmap"
      loading={loading}
      empty={!hasData}
      emptyMessage="No latency distribution data yet"
    >
      <Box sx={{ overflowX: 'auto' }}>
        <Box sx={{ display: 'flex', gap: 0.75, minWidth: 480 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', pt: 0 }}>
            {ROWS.map((row) => (
              <Typography
                key={String(row)}
                variant="caption"
                sx={{
                  height: 16,
                  lineHeight: '16px',
                  color: tokens.textSubtlest,
                  fontSize: 10,
                  textAlign: 'right',
                  minWidth: 44,
                }}
              >
                {boundLabel(row)}
              </Typography>
            ))}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cells.length}, minmax(4px, 1fr))`,
                gridAutoRows: 16,
                gap: '2px',
              }}
            >
              {ROWS.map((row, rowIdx) =>
                cells.map((col) => {
                  const count = col.counts[rowIdx] ?? 0;
                  const intensity =
                    count > 0 ? 0.15 + 0.85 * (Math.log(count + 1) / Math.log(maxCount + 1)) : 0;
                  return (
                    <Box
                      key={`${String(row)}-${col.bucketTs}`}
                      title={
                        count > 0
                          ? `${formatBucketTs(col.bucketTs, bucketIntervalMs, utc)} · ${boundLabel(row)} · ${count} req`
                          : undefined
                      }
                      sx={{
                        bgcolor: count > 0 ? tokens.brand : tokens.surfaceSunken,
                        opacity: count > 0 ? intensity : 1,
                        borderRadius: '2px',
                      }}
                    />
                  );
                }),
              )}
            </Box>
            <Box sx={{ display: 'flex', mt: 0.5 }}>
              {cells.map((col, idx) => (
                <Typography
                  key={col.bucketTs}
                  variant="caption"
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    color: tokens.textSubtlest,
                    fontSize: 10,
                    whiteSpace: 'nowrap',
                    overflow: 'visible',
                  }}
                >
                  {idx % labelEvery === 0 ? formatBucketTs(col.bucketTs, bucketIntervalMs, utc) : ''}
                </Typography>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </ChartCard>
  );
};

export default LatencyHeatmap;
