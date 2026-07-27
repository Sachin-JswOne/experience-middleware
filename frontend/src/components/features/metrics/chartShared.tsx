import { useRef, useState, type ReactNode } from 'react';
import { Box, Card, IconButton, Skeleton, Tooltip, Typography } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import { LATENCY_HISTOGRAM_BOUNDS } from '@/_types/metrics.interface';
import { formatTs } from '@/utils/format';
import { tokens } from '@/styles/theme';

// Tooltips of the Overview timeline charts move together when they share
// this id (they render the same buckets).
export const OVERVIEW_SYNC_ID = 'metrics-overview';

// Deep link from a request id to the log store (Kibana etc.). Set
// VITE_LOG_URL_TEMPLATE to e.g.
//   https://kibana.example.com/app/discover#/?_a=(query:(query:'{requestId}'))
// — '{requestId}' is replaced. Unset → chips copy instead of linking.
export const logUrlFor = (requestId: string): string | null => {
  const template = import.meta.env.VITE_LOG_URL_TEMPLATE as string | undefined;
  if (!template) return null;
  return template.replace('{requestId}', encodeURIComponent(requestId));
};

// Single categorical palette for all metrics charts (DESIGN.md chart-categorical-1..8).
export const CHART_COLORS = [
  '#357DE8',
  '#82B536',
  '#BF63F3',
  '#F68909',
  '#1558BC',
  '#964AC0',
  '#42B2D7',
  '#BD5B00',
] as const;

// Single-hue semantic chart colors (DESIGN.md §4 Chart colors) for series that
// need a distinct hue outside the categorical palette above.
export const CHART_BRAND = '#357DE8'; // chart-brand
export const CHART_PURPLE = '#BF63F3'; // chart-purple-bold
export const CHART_WARNING = '#F68909'; // chart-warning
export const CHART_DANGER = '#E2483D'; // chart-danger

// Colors for HTTP status classes, shared by every status-class chart.
export const STATUS_CLASS_COLORS = {
  c2xx: '#82B536', // chart-success
  c3xx: '#357DE8', // chart-information
  c4xx: '#F68909', // chart-warning
  c5xx: '#E2483D', // chart-danger
} as const;

export const STATUS_CLASS_LABELS = {
  c2xx: '2xx',
  c3xx: '3xx',
  c4xx: '4xx',
  c5xx: '5xx',
} as const;

// Estimate a percentile from a bucket's latency histogram ('25'…'30000',
// 'inf') via linear interpolation — mirrors the backend estimator so
// client-derived percentiles (p50 per bucket) line up with server ones.
export const estimatePercentileFromHistogram = (
  histogram: Record<string, number>,
  p: number,
): number | undefined => {
  const total = Object.values(histogram).reduce((a, b) => a + b, 0);
  if (total === 0) return undefined;
  const targetRank = Math.ceil((p / 100) * total);
  let cumulative = 0;
  let prevBound = 0;
  for (const bound of LATENCY_HISTOGRAM_BOUNDS) {
    const count = histogram[String(bound)] || 0;
    if (count > 0 && cumulative + count >= targetRank) {
      const positionInBucket = targetRank - cumulative;
      return prevBound + ((bound - prevBound) * positionInBucket) / count;
    }
    cumulative += count;
    prevBound = bound;
  }
  return prevBound;
};

// Rasterize the first SVG inside a container to a downloaded PNG. Recharts
// renders pure inline SVG, so serialize → draw on canvas → toBlob.
export const exportChartPng = (container: HTMLElement | null, filename: string): void => {
  const svg = container?.querySelector('svg');
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(rect.width));
  clone.setAttribute('height', String(rect.height));
  const source = new XMLSerializer().serializeToString(clone);
  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  img.onload = () => {
    const scale = 2; // crisp on retina / slide decks
    const canvas = document.createElement('canvas');
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return URL.revokeObjectURL(blobUrl);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(blobUrl);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${filename}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };
  img.onerror = () => URL.revokeObjectURL(blobUrl);
  img.src = blobUrl;
};

// Recharts tooltips render light by default; align chart tooltip chrome to
// the app's dark inverted MuiTooltip style (see theme.ts) across every chart.
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: tokens.backgroundNeutralBold,
  border: 'none',
  borderRadius: tokens.radiusSmall,
  color: tokens.textInverse,
  fontSize: 12,
};

export const CHART_TOOLTIP_LABEL_STYLE = { color: tokens.textInverse };

// Hour-or-coarser buckets span days — include the date in the axis label.
export const formatBucketTs = (ts: number, bucketIntervalMs?: number, utc = false): string =>
  formatTs(ts, (bucketIntervalMs ?? 0) >= 3_600_000 ? 'DD MMM HH:mm' : 'HH:mm', utc);

// Recharts category axes take string labels — map each deploy marker to the
// label of the bucket it falls into so ReferenceLine can anchor to it.
export const deployMarkerPositions = (
  markers: Array<{ ts: number; version: string }> | undefined,
  buckets: Array<{ bucketTs: number }>,
  bucketIntervalMs: number | undefined,
  utc = false,
): Array<{ x: string; version: string }> => {
  if (!markers || markers.length === 0 || buckets.length === 0) return [];
  const interval = bucketIntervalMs ?? 60_000;
  const out: Array<{ x: string; version: string }> = [];
  for (const marker of markers) {
    const bucket = buckets.find(
      (b) => marker.ts >= b.bucketTs && marker.ts < b.bucketTs + interval,
    );
    if (bucket) {
      out.push({
        x: formatBucketTs(bucket.bucketTs, bucketIntervalMs, utc),
        version: marker.version,
      });
    }
  }
  return out;
};

// --- Drag-to-zoom ------------------------------------------------------
// Charts pass Recharts' mouse state here; rows must carry a `bucketTs`
// field. Releasing the drag reports [from, to) in epoch ms so the page can
// switch to an absolute range — Kibana-style zoom.

interface RechartsMouseState {
  activeLabel?: string | number;
  activePayload?: Array<{ payload?: { bucketTs?: number } }>;
}

interface DragPoint {
  label: string;
  ts: number;
}

export const useDragZoom = (
  onZoom: ((fromTs: number, toTs: number) => void) | undefined,
  bucketIntervalMs: number | undefined,
) => {
  const [start, setStart] = useState<DragPoint | null>(null);
  const [end, setEnd] = useState<DragPoint | null>(null);

  const pointOf = (state: RechartsMouseState | null): DragPoint | null => {
    const ts = state?.activePayload?.[0]?.payload?.bucketTs;
    if (ts === undefined || state?.activeLabel === undefined) return null;
    return { label: String(state.activeLabel), ts };
  };

  const onMouseDown = (state: RechartsMouseState | null) => {
    if (!onZoom) return;
    const point = pointOf(state);
    if (point) {
      setStart(point);
      setEnd(point);
    }
  };

  const onMouseMove = (state: RechartsMouseState | null) => {
    if (!start) return;
    const point = pointOf(state);
    if (point) setEnd(point);
  };

  const onMouseUp = () => {
    if (start && end && start.ts !== end.ts && onZoom) {
      const from = Math.min(start.ts, end.ts);
      const to = Math.max(start.ts, end.ts) + (bucketIntervalMs ?? 60_000);
      onZoom(from, to);
    }
    setStart(null);
    setEnd(null);
  };

  // ReferenceArea props while a drag is live (labels for the category axis).
  const refArea =
    start && end && start.label !== end.label ? { x1: start.label, x2: end.label } : null;

  return { onMouseDown, onMouseMove, onMouseUp, refArea, zoomEnabled: Boolean(onZoom) };
};

// Tiny inline trend line for table cells (System tab). Pure SVG — no
// recharts overhead per row.
export const Sparkline = ({
  values,
  width = 72,
  height = 18,
  color = tokens.brand,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) => {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map(
      (v, i) =>
        `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }} aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
};

interface ChartCardProps {
  title: string;
  loading: boolean;
  empty: boolean;
  emptyMessage?: string;
  height?: number;
  action?: ReactNode;
  children: ReactNode;
}

const ChartCard = ({
  title,
  loading,
  empty,
  emptyMessage = 'No data for this time range. Try a wider range or clear filters.',
  height = 240,
  action,
  children,
}: ChartCardProps) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void cardRef.current?.requestFullscreen?.();
  };

  return (
    <Card ref={cardRef} sx={{ p: 2, height: '100%', '&:fullscreen': { overflow: 'auto' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="h5">{title}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {action}
          {!loading && !empty && (
            <>
              <Tooltip title="Download as PNG">
                <IconButton
                  size="small"
                  aria-label={`Download ${title} as PNG`}
                  onClick={() => exportChartPng(cardRef.current, slug)}
                >
                  <DownloadIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Fullscreen">
                <IconButton
                  size="small"
                  aria-label={`View ${title} fullscreen`}
                  onClick={toggleFullscreen}
                >
                  <FullscreenIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      </Box>
      {loading ? (
        <Skeleton variant="rounded" height={height} />
      ) : empty ? (
        <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
            {emptyMessage}
          </Typography>
        </Box>
      ) : (
        children
      )}
    </Card>
  );
};

export default ChartCard;
