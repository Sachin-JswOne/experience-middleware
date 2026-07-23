import { useQuery, keepPreviousData } from '@tanstack/react-query';
import MetricsService from '@/services/MetricsService';
import type { MetricsHealth, MetricsSnapshot } from '@/_types/metrics.interface';

export type MetricsWindow = '5m' | '15m' | '30m' | '1h' | '6h' | '24h' | '7d';

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
};

export const rangeSpanMs = (range: MetricsRange): number =>
  range.type === 'relative' ? WINDOW_MS[range.window] : range.to - range.from;

const useMetricsQuery = (range: MetricsRange, refreshInterval: RefreshInterval) =>
  useQuery<MetricsSnapshot>({
    queryKey: ['metrics', range],
    queryFn: async () => {
      const result = await MetricsService.getMetrics(
        range.type === 'relative'
          ? { window: range.window }
          : { from: range.from, to: range.to },
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
) =>
  useQuery<MetricsSnapshot>({
    queryKey: ['metrics-previous', range],
    queryFn: async () => {
      const span = rangeSpanMs(range);
      const to = range.type === 'relative' ? Date.now() - span : range.from;
      const result = await MetricsService.getMetrics({ from: to - span, to });
      if (!result.data || result.error?.code) {
        throw new Error(result.error?.message || 'Failed to load metrics');
      }
      return result.data;
    },
    refetchInterval: range.type === 'relative' ? refreshInterval : false,
    placeholderData: keepPreviousData,
  });

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
