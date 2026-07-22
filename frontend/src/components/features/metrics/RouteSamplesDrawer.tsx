import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Drawer,
  IconButton,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import MetricsService from '@/services/MetricsService';
import type { RouteBreakdown, RouteErrorSample } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import { formatMs } from './chartShared';

interface Props {
  route: RouteBreakdown | null;
  onClose: () => void;
}

const tryPretty = (value?: string): string => {
  if (!value) return '—';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

const CodeBlock = ({ label, value }: { label: string; value?: string }) => (
  <Box sx={{ mb: 1.5 }}>
    <Typography variant="body2" sx={{ color: tokens.textSubtle, mb: 0.5, fontWeight: 600 }}>
      {label}
    </Typography>
    <Box
      component="pre"
      sx={{
        m: 0,
        p: 1.25,
        bgcolor: tokens.surfaceSunken,
        border: `1px solid ${tokens.border}`,
        borderRadius: `${tokens.radiusSmall}px`,
        fontSize: 11,
        lineHeight: 1.5,
        overflow: 'auto',
        maxHeight: 240,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {tryPretty(value)}
    </Box>
  </Box>
);

const SampleAccordion = ({ sample }: { sample: RouteErrorSample }) => (
  <Accordion disableGutters elevation={0} sx={{ border: `1px solid ${tokens.border}`, borderRadius: 1, '&:before': { display: 'none' }, mb: 1 }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
        <Chip
          label={sample.statusCode}
          size="small"
          sx={{
            height: 20,
            fontSize: 11,
            fontWeight: 600,
            color: tokens.textInverse,
            bgcolor:
              sample.statusCode >= 500
                ? tokens.danger
                : sample.statusCode >= 400
                  ? tokens.warning
                  : tokens.success,
          }}
        />
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
          {dayjs(sample.ts).format('HH:mm:ss')}
        </Typography>
        <Typography
          variant="body2"
          sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {sample.url}
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
          {formatMs(sample.durationMs)}
        </Typography>
      </Box>
    </AccordionSummary>
    <AccordionDetails>
      <CodeBlock label="Request headers" value={JSON.stringify(sample.requestHeaders)} />
      <CodeBlock label={sample.method === 'GET' ? 'Query params' : 'Request body'} value={sample.requestBody} />
      <CodeBlock label="Response body" value={sample.responseBody} />
      {sample.downstream.length > 0 && (
        <Box>
          <Typography variant="body2" sx={{ color: tokens.textSubtle, mb: 0.5, fontWeight: 600 }}>
            Downstream calls
          </Typography>
          {sample.downstream.map((d, idx) => (
            <Accordion
              key={idx}
              disableGutters
              elevation={0}
              sx={{ border: `1px solid ${tokens.border}`, borderRadius: 1, '&:before': { display: 'none' }, mb: 0.5 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                  <Chip
                    label={d.statusCode ?? 'network error'}
                    size="small"
                    variant="outlined"
                    sx={{
                      height: 18,
                      fontSize: 10,
                      color: d.success ? tokens.success : tokens.danger,
                      borderColor: d.success ? tokens.success : tokens.danger,
                    }}
                  />
                  <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.target}
                  </Typography>
                  <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
                    {formatMs(d.durationMs)}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {d.requestUrl && (
                  <Typography variant="body2" sx={{ mb: 1, wordBreak: 'break-all', color: tokens.textSubtle }}>
                    {d.requestUrl}
                  </Typography>
                )}
                <CodeBlock label="Request headers" value={JSON.stringify(d.requestHeaders ?? {})} />
                <CodeBlock label="Request body" value={d.requestBody} />
                <CodeBlock label="Response body" value={d.responseBody} />
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}
    </AccordionDetails>
  </Accordion>
);

const RouteSamplesDrawer = ({ route, onClose }: Props) => {
  const open = route !== null;
  const [kind, setKind] = useState<'all' | 'errors'>('all');
  const [lastRoute, setLastRoute] = useState<RouteBreakdown | null>(null);
  // Keep the last route while the drawer animates closed.
  if (route && route !== lastRoute) setLastRoute(route);
  const active = route ?? lastRoute;

  const { data, isPending } = useQuery({
    queryKey: ['metrics-samples', active?.method, active?.route],
    queryFn: async () => {
      const result = await MetricsService.getRouteSamples(active!.method, active!.route);
      if (!result.data || result.error?.code) {
        throw new Error(result.error?.message || 'Failed to load samples');
      }
      return result.data;
    },
    enabled: open && !!active,
    refetchInterval: open ? 15_000 : false,
  });

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: '100vw', md: '50vw' }, p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" sx={{ wordBreak: 'break-all' }}>
              {active ? `${active.method} ${active.route}` : ''}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.textSubtle, mt: 0.5 }}>
              Request samples (last few on this pod, newest first)
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label="Close samples drawer">
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
        <ToggleButtonGroup
          value={kind}
          exclusive
          size="small"
          onChange={(_, next: 'all' | 'errors' | null) => {
            if (next) setKind(next);
          }}
          sx={{ mt: 1.5 }}
          aria-label="Sample filter"
        >
          <ToggleButton value="all" aria-label="All samples">All</ToggleButton>
          <ToggleButton value="errors" aria-label="Error samples only">Errors only</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ mt: 2 }}>
          {(() => {
            if (isPending) return <Skeleton variant="rounded" height={160} />;
            if (data && !data.enabled) {
              return (
                <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
                  Sample capture is disabled (METRICS_SAMPLES_ENABLED=false).
                </Typography>
              );
            }
            const samples = (data?.samples ?? []).filter(
              (s) => kind === 'all' || s.statusCode >= 400,
            );
            if (samples.length === 0) {
              return (
                <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
                  No {kind === 'errors' ? 'error ' : ''}samples captured for this
                  route yet (kept in memory since the pod started).
                </Typography>
              );
            }
            return samples.map((s, idx) => (
              <SampleAccordion key={`${s.ts}-${idx}`} sample={s} />
            ));
          })()}
        </Box>
      </Box>
    </Drawer>
  );
};

export default RouteSamplesDrawer;
