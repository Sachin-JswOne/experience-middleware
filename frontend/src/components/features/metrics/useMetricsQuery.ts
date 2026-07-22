import { useQuery, keepPreviousData } from '@tanstack/react-query';
import MetricsService from '@/services/MetricsService';
import type { MetricsSnapshot } from '@/_types/metrics.interface';

export type MetricsWindow = '5m' | '15m' | '30m' | '1h';

export type RefreshInterval = number | false;

const useMetricsQuery = (window: MetricsWindow, refreshInterval: RefreshInterval) =>
  useQuery<MetricsSnapshot>({
    queryKey: ['metrics', window],
    queryFn: async () => {
      const result = await MetricsService.getMetrics(window);
      if (!result.data || result.error?.code) {
        throw new Error(result.error?.message || 'Failed to load metrics');
      }
      return result.data;
    },
    refetchInterval: refreshInterval,
    placeholderData: keepPreviousData,
  });

export default useMetricsQuery;
