import { enqueueSnackbar } from 'notistack';
import type { RouteErrorSample } from '@/_types/metrics.interface';

// Hop-by-hop / auto-computed headers make a cURL noisier, not more reproducible.
const SKIP_HEADERS = new Set(['host', 'connection', 'content-length', 'accept-encoding']);

const shellQuote = (value: string) => value.replace(/'/g, "'\\''");

/**
 * Rebuilds the request as a shell command for local reproduction. Headers the
 * backend masked stay masked — the user swaps in a real token.
 */
export const buildCurl = (sample: RouteErrorSample): string => {
  const parts = [`curl -X ${sample.method} '${sample.url}'`];
  for (const [key, value] of Object.entries(sample.requestHeaders ?? {})) {
    if (SKIP_HEADERS.has(key.toLowerCase())) continue;
    parts.push(`  -H '${key}: ${shellQuote(String(value))}'`);
  }
  if (sample.requestBody && sample.method !== 'GET' && sample.method !== 'HEAD') {
    parts.push(`  -d '${shellQuote(sample.requestBody)}'`);
  }
  return parts.join(' \\\n');
};

const CSV_HEADER = 'timestamp,method,route,statusCode,durationMs,requestId,url';

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

export const toCsv = (samples: RouteErrorSample[]): string => {
  const lines = samples.map((s) =>
    [
      new Date(s.ts).toISOString(),
      s.method,
      csvEscape(s.route),
      s.statusCode,
      Math.round(s.durationMs),
      s.requestId ?? '',
      csvEscape(s.url),
    ].join(','),
  );
  return [CSV_HEADER, ...lines].join('\n');
};

export const exportSamplesCsv = (samples: RouteErrorSample[]): void => {
  const blob = new Blob([toCsv(samples)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'request-samples.csv';
  a.click();
  URL.revokeObjectURL(url);
};

export const copyText = async (text: string, okMessage: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
    enqueueSnackbar(okMessage, { variant: 'success' });
  } catch {
    enqueueSnackbar('Could not copy to clipboard', { variant: 'error' });
  }
};

/** Pretty-prints JSON payloads, leaving anything else untouched. */
export const tryPretty = (value?: string): string => {
  if (!value) return '—';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};
