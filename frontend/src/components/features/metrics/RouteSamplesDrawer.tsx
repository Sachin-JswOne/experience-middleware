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
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import { useQuery } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import MetricsService from '@/services/MetricsService';
import type { RouteErrorSample } from '@/_types/metrics.interface';
import { tokens } from '@/styles/theme';
import { formatMs, formatTs } from './chartShared';

// What the drawer shows: one route's samples, or every route's samples
// inside a time window + latency band (latency-heatmap drill-through).
export type SamplesQuery =
  | { kind: 'route'; method: string; route: string }
  | {
      kind: 'band';
      fromTs: number;
      toTs: number;
      minMs: number;
      maxMs: number | null;
      label: string;
    };

interface Props {
  query: SamplesQuery | null;
  onClose: () => void;
  utc?: boolean;
}

type SampleKind = 'all' | 'errors' | 'slow';

const tryPretty = (value?: string): string => {
  if (!value) return '—';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

// Rebuild the request as a shell command for local reproduction. Headers the
// backend masked stay masked — the user swaps in a real token.
const buildCurl = (sample: RouteErrorSample): string => {
  const parts = [`curl -X ${sample.method} '${sample.url}'`];
  for (const [key, value] of Object.entries(sample.requestHeaders ?? {})) {
    // Hop-by-hop / auto-computed headers make the command noisier, not more
    // reproducible.
    if (['host', 'connection', 'content-length', 'accept-encoding'].includes(key.toLowerCase())) {
      continue;
    }
    parts.push(`  -H '${key}: ${String(value).replace(/'/g, "'\\''")}'`);
  }
  if (sample.requestBody && sample.method !== 'GET' && sample.method !== 'HEAD') {
    parts.push(`  -d '${sample.requestBody.replace(/'/g, "'\\''")}'`);
  }
  return parts.join(' \\\n');
};

const copyText = async (text: string, okMessage: string) => {
  try {
    await navigator.clipboard.writeText(text);
    enqueueSnackbar(okMessage, { variant: 'success' });
  } catch {
    enqueueSnackbar('Could not copy to clipboard', { variant: 'error' });
  }
};

const exportSamplesCsv = (samples: RouteErrorSample[]) => {
  const header = 'timestamp,method,route,statusCode,durationMs,requestId,url';
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = samples.map((s) =>
    [
      new Date(s.ts).toISOString(),
      s.method,
      escape(s.route),
      s.statusCode,
      Math.round(s.durationMs),
      s.requestId ?? '',
      escape(s.url),
    ].join(','),
  );
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'request-samples.csv';
  a.click();
  URL.revokeObjectURL(url);
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

const SampleAccordion = ({
  sample,
  slow,
  showRoute,
  utc,
}: {
  sample: RouteErrorSample;
  slow: boolean;
  // Band mode mixes routes — identify each sample's route inline.
  showRoute?: boolean;
  utc?: boolean;
}) => (
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
        {slow && (
          <Chip
            label="slow"
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: 10, color: tokens.warning, borderColor: tokens.warning }}
          />
        )}
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
          {formatTs(sample.ts, 'HH:mm:ss', utc)}
        </Typography>
        <Typography
          variant="body2"
          sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {showRoute ? (
            <Typography component="span" variant="body2" sx={{ fontWeight: 600, mr: 0.75 }}>
              {`${sample.method} ${sample.route}`}
            </Typography>
          ) : null}
          {sample.url}
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
          {formatMs(sample.durationMs)}
        </Typography>
        {sample.requestId && (
          <Tooltip title={`Copy request id ${sample.requestId}`}>
            <Chip
              label={sample.requestId.slice(0, 8)}
              size="small"
              variant="outlined"
              onClick={(e) => {
                e.stopPropagation();
                void copyText(sample.requestId!, 'Request id copied');
              }}
              sx={{ height: 18, fontSize: 10, fontFamily: 'monospace', color: tokens.textSubtle }}
            />
          </Tooltip>
        )}
        <Tooltip title="Copy as cURL">
          <IconButton
            size="small"
            aria-label="Copy request as cURL"
            onClick={(e) => {
              e.stopPropagation();
              void copyText(buildCurl(sample), 'cURL copied to clipboard');
            }}
          >
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </AccordionSummary>
    <AccordionDetails>
      {sample.requestId && (
        <Typography variant="body2" sx={{ mb: 1, color: tokens.textSubtle, fontFamily: 'monospace' }}>
          request-id: {sample.requestId}
        </Typography>
      )}
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

const queryTitle = (query: SamplesQuery, utc?: boolean): string => {
  if (query.kind === 'route') return `${query.method} ${query.route}`;
  return `${query.label} · ${formatTs(query.fromTs, 'HH:mm', utc)}–${formatTs(query.toTs, 'HH:mm', utc)}`;
};

const RouteSamplesDrawer = ({ query, onClose, utc }: Props) => {
  const open = query !== null;
  const [kind, setKind] = useState<SampleKind>('all');
  const [lastQuery, setLastQuery] = useState<SamplesQuery | null>(null);
  // Keep the last query while the drawer animates closed.
  if (query && query !== lastQuery) setLastQuery(query);
  const active = query ?? lastQuery;

  const { data, isPending } = useQuery({
    queryKey: ['metrics-samples', active],
    queryFn: async () => {
      const result =
        active!.kind === 'route'
          ? await MetricsService.getRouteSamples(active!.method, active!.route)
          : await MetricsService.getSamplesInBand({
              from: active!.fromTs,
              to: active!.toTs,
              minMs: active!.minMs > 0 ? active!.minMs : undefined,
              maxMs: active!.maxMs ?? undefined,
            });
      if (!result.data || result.error?.code) {
        throw new Error(result.error?.message || 'Failed to load samples');
      }
      return result.data;
    },
    enabled: open && !!active,
    refetchInterval: open ? 15_000 : false,
  });

  const slowThresholdMs = data?.slowThresholdMs ?? 3000;
  const isSlow = (s: RouteErrorSample) => s.statusCode < 400 && s.durationMs >= slowThresholdMs;
  const filtered = (data?.samples ?? []).filter((s) => {
    if (kind === 'errors') return s.statusCode >= 400;
    if (kind === 'slow') return isSlow(s);
    return true;
  });

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: '100vw', md: '50vw' }, p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" sx={{ wordBreak: 'break-all' }}>
              {active ? queryTitle(active, utc) : ''}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.textSubtle, mt: 0.5 }}>
              {active?.kind === 'band'
                ? 'Samples in this latency band across all routes (this pod only)'
                : 'Request samples (last few on this pod, newest first)'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Tooltip title="Export samples as CSV">
              <span>
                <IconButton
                  size="small"
                  aria-label="Export samples as CSV"
                  onClick={() => exportSamplesCsv(filtered)}
                  disabled={filtered.length === 0}
                >
                  <DownloadIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
            <IconButton size="small" onClick={onClose} aria-label="Close samples drawer">
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </Box>
        <ToggleButtonGroup
          value={kind}
          exclusive
          size="small"
          onChange={(_, next: SampleKind | null) => {
            if (next) setKind(next);
          }}
          sx={{ mt: 1.5 }}
          aria-label="Sample filter"
        >
          <ToggleButton value="all" aria-label="All samples">All</ToggleButton>
          <ToggleButton value="errors" aria-label="Error samples only">Errors</ToggleButton>
          <ToggleButton value="slow" aria-label="Slow samples only">
            {`Slow (≥${formatMs(slowThresholdMs)})`}
          </ToggleButton>
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
            if (filtered.length === 0) {
              return (
                <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
                  No {kind === 'errors' ? 'error ' : kind === 'slow' ? 'slow ' : ''}samples
                  captured {active?.kind === 'band' ? 'in this band' : 'for this route'} yet
                  (kept in memory since the pod started).
                </Typography>
              );
            }
            return filtered.map((s, idx) => (
              <SampleAccordion
                key={`${s.ts}-${idx}`}
                sample={s}
                slow={isSlow(s)}
                showRoute={active?.kind === 'band'}
                utc={utc}
              />
            ));
          })()}
        </Box>
      </Box>
    </Drawer>
  );
};

export default RouteSamplesDrawer;
