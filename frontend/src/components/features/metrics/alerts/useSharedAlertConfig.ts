import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AlertConfig } from '@/_types/metrics.interface';
import MetricsService from '@/services/MetricsService';
import { loadThresholds, mergeServerConfig } from './storage';
import type { AlertThresholds } from './types';

/**
 * Alert rules, backed by localStorage and — in cluster mode — by the shared
 * Valkey config the server-side webhook evaluator reads.
 *
 * Local edits win immediately and are pushed to the server; the server copy is
 * only merged in when its `updatedAt` is one we haven't seen, so a poll landing
 * just after a local edit can't clobber it.
 */
export const useSharedAlertConfig = () => {
  const [thresholds, setThresholds] = useState<AlertThresholds>(loadThresholds);

  const configQuery = useQuery({
    queryKey: ['metrics-alert-config'],
    queryFn: async () => {
      const result = await MetricsService.getAlertConfig();
      if (!result.data || result.error.code) {
        throw new Error(result.error.message || 'Failed to load alert config');
      }
      return result.data;
    },
    staleTime: 60_000,
    retry: 1,
  });

  const shared = configQuery.data?.shared === true;
  const serverConfig = configQuery.data?.config;

  // Hydrate from the server copy once per updatedAt change.
  const hydratedAt = useRef<number>(-1);
  useEffect(() => {
    if (!shared || !serverConfig || serverConfig.updatedAt === hydratedAt.current) return;
    hydratedAt.current = serverConfig.updatedAt;
    setThresholds((prev) => mergeServerConfig(prev, serverConfig));
  }, [shared, serverConfig]);

  const saveMutation = useMutation({
    mutationFn: (config: AlertConfig) => MetricsService.saveAlertConfig(config),
  });

  const persistServer = useCallback(
    (config: AlertConfig) => {
      // Mark our own write as seen so the next poll doesn't clobber the edit.
      hydratedAt.current = Date.now();
      saveMutation.mutate(config);
    },
    [saveMutation],
  );

  const historyQuery = useQuery({
    queryKey: ['metrics-alert-history'],
    queryFn: async () => {
      const result = await MetricsService.getAlertHistory(50);
      if (!result.data || result.error.code) {
        throw new Error(result.error.message || 'Failed to load alert history');
      }
      return result.data;
    },
    enabled: shared,
    refetchInterval: 60_000,
  });

  return {
    thresholds,
    setThresholds,
    shared,
    persistServer,
    serverHistory: historyQuery.data ?? null,
  };
};

export default useSharedAlertConfig;
