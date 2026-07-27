import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import MetricsService from '@/services/MetricsService';
import type { MetricsHealth, MetricsSnapshot } from '@/_types/metrics.interface';

export type MetricsWindow = '5m' | '15m' | '30m' | '1h' | '6h' | '24h' | '7d' | '14d' | '30d';

export type MetricsRange =
  | { type: 'relative'; window: MetricsWindow }
  | { type: 'absolute'; from: number; to: number };

export type RefreshInterval = number | false;

export const WINDOW_MS: Record<MetricsWindow, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '14d': 14 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export const rangeSpanMs = (range: MetricsRange): number =>
  range.type === 'relative' ? WINDOW_MS[range.window] : range.to - range.from;

const useMetricsQuery = (range: MetricsRange, refreshInterval: RefreshInterval) =>
  useQuery<MetricsSnapshot>({
    queryKey: ['metrics', range],
    queryFn: async () => {
      const result = await MetricsService.getMetrics(
        range.type === 'relative' ? { window: range.window } : { from: range.from, to: range.to },
      );
      if (!result.data || result.error?.code) {
        throw new Error(result.error?.message || 'Failed to load metrics');
      }
      return result.data;
    },
    // Polling a fixed absolute range is pointless — the data can't change.
    refetchInterval: range.type === 'relative' ? refreshInterval : false,
    placeholderData: keepPreviousData,
  });

// The window immediately before the selected one, for delta chips on the
// summary cards. Relative windows recompute from/to at fetch time so the
// comparison slides along with auto-refresh.
export const usePreviousMetricsQuery = (
  range: MetricsRange,
  refreshInterval: RefreshInterval,
  // An extra full snapshot per tick — only fetch it where it is rendered.
  enabled = true,
) =>
  useQuery<MetricsSnapshot>({
    queryKey: ['metrics-previous', range],
    queryFn: async () => {
      const span = rangeSpanMs(range);
      const to = range.type === 'relative' ? Date.now() - span : range.from;
      const result = await MetricsService.getMetrics({ from: to - span, to });
      if (!result.data || result.error.code) {
        throw new Error(result.error.message || 'Failed to load metrics');
      }
      return result.data;
    },
    enabled,
    refetchInterval: range.type === 'relative' ? refreshInterval : false,
    placeholderData: keepPreviousData,
  });

// Live snapshots pushed by the server (SSE) — replaces polling when the
// user picks "Live". Relative windows only; reconnects with backoff and
// reports `connected` so the page can fall back to polling while down.
export const useMetricsStream = (range: MetricsRange, enabled: boolean) => {
  const window = range.type === 'relative' ? range.window : null;
  // Stream identity. Stored alongside the data so switching windows discards
  // the previous stream's snapshot by comparison rather than by a synchronous
  // reset inside the effect (which would cascade an extra render).
  const streamKey = enabled && window ? window : null;

  const [state, setState] = useState<{
    key: string | null;
    snapshot: MetricsSnapshot | null;
    connected: boolean;
  }>({ key: streamKey, snapshot: null, connected: false });

  useEffect(() => {
    if (!enabled || !window) return;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const connect = () => {
      MetricsService.streamMetrics(
        window,
        (next) => {
          attempts = 0;
          setState({ key: window, snapshot: next, connected: true });
        },
        controller.signal,
      )
        .catch(() => undefined)
        .finally(() => {
          if (controller.signal.aborted) return;
          setState((prev) => ({ ...prev, key: window, connected: false }));
          attempts += 1;
          retryTimer = setTimeout(connect, Math.min(30_000, 2_000 * 2 ** attempts));
        });
    };
    connect();

    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [enabled, window]);

  // A snapshot from a previous window (or from before the stream was enabled)
  // must not leak into the current view.
  const current = state.key === streamKey ? state : null;
  return { snapshot: current?.snapshot ?? null, connected: current?.connected ?? false };
};

// Same range shifted back one week — the anomaly baseline on the request
// timeline. Weekly seasonality is the strongest signal for "is this traffic
// level normal for a Tuesday 3pm". Only sensible for spans well under a week.
export const useBaselineMetricsQuery = (
  range: MetricsRange,
  refreshInterval: RefreshInterval,
  enabled: boolean,
) => {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return useQuery<MetricsSnapshot>({
    queryKey: ['metrics-baseline', range],
    queryFn: async () => {
      const span = rangeSpanMs(range);
      const to = (range.type === 'relative' ? Date.now() : range.to) - weekMs;
      const result = await MetricsService.getMetrics({ from: to - span, to });
      if (!result.data || result.error?.code) {
        throw new Error(result.error?.message || 'Failed to load baseline metrics');
      }
      return result.data;
    },
    enabled: enabled && rangeSpanMs(range) <= 24 * 60 * 60 * 1000,
    refetchInterval: range.type === 'relative' ? refreshInterval : false,
    placeholderData: keepPreviousData,
  });
};

export const useMetricsHealthQuery = (enabled: boolean) =>
  useQuery<MetricsHealth>({
    queryKey: ['metrics-health'],
    queryFn: async () => {
      const result = await MetricsService.getHealth();
      if (!result.data || result.error?.code) {
        throw new Error(result.error?.message || 'Failed to load health');
      }
      return result.data;
    },
    enabled,
    refetchInterval: enabled ? 15_000 : false,
    placeholderData: keepPreviousData,
  });

export default useMetricsQuery;
