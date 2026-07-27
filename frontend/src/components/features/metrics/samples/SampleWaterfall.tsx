import { memo } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import type { RouteErrorSample, SampleDownstream } from '@/_types/metrics.interface';
import { formatMs } from '@/utils/format';
import { tokens } from '@/styles/theme';
import { CHART_COLORS, CHART_BRAND, CHART_DANGER, CHART_WARNING } from '../chartShared';

/**
 * One row per downstream call: a horizontal bar split into the four proxy
 * stages, scaled against the whole request's duration — "where did 2s go" at a
 * glance. Calls without stage data render a single solid segment.
 */
const STAGE_META: Array<{
  key: keyof NonNullable<SampleDownstream['stages']>;
  label: string;
  color: string;
}> = [
  { key: 'buildRequestMs', label: 'build request', color: CHART_COLORS[6] },
  { key: 'createClientMs', label: 'create client', color: CHART_COLORS[2] },
  { key: 'downstreamMs', label: 'downstream', color: CHART_COLORS[0] },
  { key: 'resTransformMs', label: 'transform', color: CHART_COLORS[1] },
];

interface Segment {
  ms: number;
  color: string;
  title: string;
}

const WaterfallRow = ({
  label,
  durationMs,
  maxMs,
  segments,
}: {
  label: string;
  durationMs: number;
  maxMs: number;
  segments: Segment[];
}) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
    <Typography
      variant="caption"
      sx={{
        width: 180,
        flexShrink: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: tokens.textSubtle,
      }}
    >
      {label}
    </Typography>
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        height: 10,
        bgcolor: tokens.surfaceSunken,
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      {segments.map((seg, i) => (
        <Tooltip key={i} title={`${seg.title}: ${formatMs(seg.ms)}`}>
          <Box
            sx={{
              width: `${(seg.ms / maxMs) * 100}%`,
              bgcolor: seg.color,
              minWidth: seg.ms > 0 ? 2 : 0,
            }}
          />
        </Tooltip>
      ))}
    </Box>
    <Typography variant="caption" sx={{ width: 56, textAlign: 'right', color: tokens.textSubtle }}>
      {formatMs(durationMs)}
    </Typography>
  </Box>
);

const SampleWaterfall = ({ sample }: { sample: RouteErrorSample }) => {
  if (sample.downstream.length === 0) return null;

  const maxMs = Math.max(sample.durationMs, ...sample.downstream.map((d) => d.durationMs)) || 1;
  // Whatever the gateway spent that wasn't a downstream call: auth, routing,
  // serialization.
  const gatewayOverheadMs = Math.max(
    0,
    sample.durationMs - sample.downstream.reduce((sum, d) => sum + d.durationMs, 0),
  );

  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography
        variant="body2"
        sx={{ color: tokens.textSubtle, mb: 0.5, fontWeight: tokens.weightBold }}
      >
        Time breakdown
      </Typography>

      <WaterfallRow
        label="total request"
        durationMs={sample.durationMs}
        maxMs={maxMs}
        segments={[{ ms: sample.durationMs, color: tokens.textSubtlest, title: 'total' }]}
      />

      {sample.downstream.map((d, idx) => (
        <WaterfallRow
          key={`${d.target}-${idx}`}
          label={d.target}
          durationMs={d.durationMs}
          maxMs={maxMs}
          segments={
            d.stages
              ? STAGE_META.map((s) => ({
                  ms: d.stages?.[s.key] ?? 0,
                  color: s.color,
                  title: s.label,
                }))
              : [
                  {
                    ms: d.durationMs,
                    color: d.success ? CHART_BRAND : CHART_DANGER,
                    title: 'downstream call',
                  },
                ]
          }
        />
      ))}

      {gatewayOverheadMs > 0 && (
        <WaterfallRow
          label="gateway overhead"
          durationMs={gatewayOverheadMs}
          maxMs={maxMs}
          segments={[
            {
              ms: gatewayOverheadMs,
              color: CHART_WARNING,
              title: 'gateway (auth, routing, serialization)',
            },
          ]}
        />
      )}

      <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, flexWrap: 'wrap' }}>
        {STAGE_META.map((s) => (
          <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: s.color }} />
            <Typography variant="caption" sx={{ color: tokens.textSubtlest }}>
              {s.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default memo(SampleWaterfall);
