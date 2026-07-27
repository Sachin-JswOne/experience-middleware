import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import ValkeyAdminService from '@/services/ValkeyAdminService';
import type { IResult } from '@/services/ApiClient';
import type { ValkeyScanResult } from '@/_types/valkey.interface';

/**
 * React Query bindings for the cache-admin endpoints.
 *
 * The panels used to hand-roll loading/error/pagination state in `useState` +
 * `useEffect`, which meant no caching, no dedupe and a race whenever the user
 * re-scanned quickly. Everything goes through the query client now.
 */

export const valkeyKeys = {
  status: ['valkey', 'status'] as const,
  info: ['valkey', 'info'] as const,
  clusterNodes: ['valkey', 'cluster-nodes'] as const,
  clients: ['valkey', 'clients'] as const,
  scan: (pattern: string) => ['valkey', 'scan', pattern] as const,
};

/** Unwraps the service result, turning a non-zero error code into a throw. */
const unwrap = <T>(result: IResult<T>, fallbackMessage: string): T => {
  if (result.error.message || result.error.code || !result.data) {
    throw new Error(result.error.message || fallbackMessage);
  }
  return result.data;
};

export const useValkeyStatus = () =>
  useQuery({
    queryKey: valkeyKeys.status,
    queryFn: async () => unwrap(await ValkeyAdminService.getStatus(), 'Failed to load status'),
  });

export const useValkeyInfo = () =>
  useQuery({
    queryKey: valkeyKeys.info,
    queryFn: async () => unwrap(await ValkeyAdminService.getInfo(), 'Failed to load cluster info'),
  });

export const useValkeyClusterNodes = () =>
  useQuery({
    queryKey: valkeyKeys.clusterNodes,
    queryFn: async () =>
      unwrap(await ValkeyAdminService.getClusterNodes(), 'Failed to load cluster nodes'),
  });

export const useValkeyClients = (enabled: boolean) =>
  useQuery({
    queryKey: valkeyKeys.clients,
    queryFn: async () =>
      unwrap(await ValkeyAdminService.getClients(), 'Failed to load connected clients'),
    enabled,
  });

/**
 * Cursor-paginated SCAN. `fetchNextPage` appends a batch; a cursor of null or
 * '0' means the iteration is complete.
 */
export const useValkeyScan = (pattern: string) =>
  useInfiniteQuery({
    queryKey: valkeyKeys.scan(pattern),
    queryFn: async ({ pageParam }) =>
      unwrap(
        await ValkeyAdminService.scanKeys(pattern, pageParam ?? undefined),
        'Failed to scan keys',
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last: ValkeyScanResult) =>
      last.cursor && last.cursor !== '0' ? last.cursor : undefined,
  });

/** Invalidates every cached view of the keyspace after a write. */
export const useInvalidateKeyspace = () => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['valkey'] });
  };
};

export const useDeleteKey = (onDeleted?: () => void) => {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateKeyspace();

  return useMutation({
    mutationFn: async (key: string) =>
      unwrap(await ValkeyAdminService.deleteKeys([key]), 'Delete failed'),
    onSuccess: (_data, key) => {
      enqueueSnackbar(`Deleted '${key}'`, { variant: 'success' });
      invalidate();
      onDeleted?.();
    },
    onError: (error: Error) => enqueueSnackbar(error.message, { variant: 'error' }),
  });
};

export const useSetKey = (onSaved?: () => void) => {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateKeyspace();

  return useMutation({
    mutationFn: async (input: { key: string; value: string; ttlSeconds?: number }) =>
      unwrap(
        await ValkeyAdminService.setKey(input.key, input.value, input.ttlSeconds),
        'Failed to save key',
      ),
    onSuccess: (_data, input) => {
      enqueueSnackbar(`Key '${input.key}' saved`, { variant: 'success' });
      invalidate();
      onSaved?.();
    },
    onError: (error: Error) => enqueueSnackbar(error.message, { variant: 'error' }),
  });
};

export const useFlush = (onFlushed?: () => void) => {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateKeyspace();

  return useMutation({
    mutationFn: async (input: { scope: 'db' | 'all'; confirm: string }) =>
      unwrap(await ValkeyAdminService.flush(input.scope, input.confirm), 'Flush failed'),
    onSuccess: (data, input) => {
      enqueueSnackbar(
        `Flushed ${input.scope === 'all' ? 'all databases' : 'current database'} on ${data.nodes ?? 0} node(s)`,
        { variant: 'success' },
      );
      invalidate();
      onFlushed?.();
    },
    onError: (error: Error) => enqueueSnackbar(error.message, { variant: 'error' }),
  });
};

/** One-off key lookup — used by the view/edit actions, not cached long. */
export const useKeyDetailFetcher = () => {
  const queryClient = useQueryClient();
  return (key: string) =>
    queryClient.fetchQuery({
      queryKey: ['valkey', 'key', key],
      queryFn: async () =>
        unwrap(await ValkeyAdminService.getKeyDetail(key), `Failed to load key '${key}'`),
      staleTime: 0,
    });
};
