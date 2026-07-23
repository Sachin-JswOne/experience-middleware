import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';
import type { TimelineBucket } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import ChartCard, { formatNumber } from './chartShared';

dayjs.extend(utcPlugin);

interface Props {
  data: TimelineBucket[];
  loading: boolean;
  bucketIntervalMs?: number;
  // Span of the selected window — the weekly grid needs ≥ ~7 days.
  windowMs: number;
  utc?: boolean;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MIN_WINDOW_MS = 6.5 * 24 * 60 * 60 * 1000;

// Day-of-week × time-of-day traffic grid — weekly seasonality for capacity
// planning. Uses the already-fetched timeline; needs a ≥7d range so every
// weekday appears at least once.
const TrafficPatternPanel = ({ data, loading, bucketIntervalMs, windowMs, utc }: Props) => {
  const tooNarrow = windowMs < MIN_WINDOW_MS;

  const { grid, cols, colHours, maxCount, hasData } = useMemo(() => {
    // Column width follows bucket granularity: 1h buckets → 24 cols,
    // 6h rollups → 4 cols.
    const colHrs = Math.max(1, Math.min(6, Math.round((bucketIntervalMs ?? 3_600_000) / 3_600_000)));
    const colCount = Math.ceil(24 / colHrs);
    const cells: number[][] = Array.from({ length: 7 }, () => Array(colCount).fill(0));
    let max = 0;
    let any = false;
    for (const bucket of data) {
      if (bucket.requestCount === 0) continue;
      const d = utc ? dayjs(bucket.bucketTs).utc() : dayjs(bucket.bucketTs);
      const dow = (d.day() + 6) % 7; // Monday-first
      const col = Math.min(colCount - 1, Math.floor(d.hour() / colHrs));
      const row = cells[dow];
      if (!row) continue;
      const next = (row[col] ?? 0) + bucket.requestCount;
      row[col] = next;
      if (next > max) max = next;
      any = true;
    }
    return { grid: cells, cols: colCount, colHours: colHrs, maxCount: max, hasData: any };
  }, [data, bucketIntervalMs, utc]);

  return (
    <ChartCard
      title="Weekly Traffic Pattern"
      loading={loading}
      empty={tooNarrow || !hasData}
      emptyMessage={
        tooNarrow
          ? 'Select a 7d+ range to see the weekly pattern'
          : 'No traffic in this window'
      }
      height={190}
    >
      <Box sx={{ overflowX: 'auto' }}>
        <Box sx={{ display: 'flex', gap: 0.75, minWidth: 420 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {DAY_LABELS.map((label) => (
              <Typography
                key={label}
                variant="caption"
                sx={{ height: 20, lineHeight: '20px', color: tokens.textSubtlest, fontSize: 10, minWidth: 28 }}
              >
                {label}
              </Typography>
            ))}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridAutoRows: 20,
                gap: '2px',
              }}
            >
              {grid.map((row, dow) =>
                row.map((count, col) => {
                  const intensity =
                    count > 0 ? 0.15 + 0.85 * (Math.log(count + 1) / Math.log(maxCount + 1)) : 0;
                  const startHour = col * colHours;
                  return (
                    <Box
                      key={`${dow}-${col}`}
                      title={
                        count > 0
                          ? `${DAY_LABELS[dow]} ${String(startHour).padStart(2, '0')}:00–${String(Math.min(24, startHour + colHours)).padStart(2, '0')}:00 · ${formatNumber(count)} req`
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
              {Array.from({ length: cols }, (_, col) => (
                <Typography
                  key={col}
                  variant="caption"
                  sx={{ flex: 1, color: tokens.textSubtlest, fontSize: 9 }}
                >
                  {col % Math.max(1, Math.floor(cols / 8)) === 0
                    ? `${String(col * colHours).padStart(2, '0')}h`
                    : ''}
                </Typography>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </ChartCard>
  );
};

export default TrafficPatternPanel;
