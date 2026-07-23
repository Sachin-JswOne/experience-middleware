import { useQuery, keepPreviousData } from '@tanstack/react-query';
import MetricsService from '@/services/MetricsService';
import type { MetricsSnapshot } from '@/_types/metrics.interface';

export type MetricsWindow = '5m' | '15m' | '30m' | '1h' | '6h' | '24h' | '7d';

export type MetricsRange =
  | { type: 'relative'; window: MetricsWindow }
  | { type: 'absolute'; from: number; to: number };

export type RefreshInterval = number | false;

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

export default useMetricsQuery;
