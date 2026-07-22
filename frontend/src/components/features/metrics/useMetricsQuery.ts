import { useQuery, keepPreviousData } from '@tanstack/react-query';
import MetricsService from '@/services/MetricsService';
import type { MetricsSnapshot } from '@/_types/metrics.interface';

const POLL_INTERVAL = 10_000;

export type MetricsWindow = '5m' | '15m';

const useMetricsQuery = (window: MetricsWindow, autoRefresh: boolean) =>
  useQuery<MetricsSnapshot>({
    queryKey: ['metrics', window],
    queryFn: async () => {
      const result = await MetricsService.getMetrics(window);
      if (!result.data || result.error?.code) {
        throw new Error(result.error?.message || 'Failed to load metrics');
      }
      return result.data;
    },
    refetchInterval: autoRefresh ? POLL_INTERVAL : false,
    placeholderData: keepPreviousData,
  });

export default useMetricsQuery;
