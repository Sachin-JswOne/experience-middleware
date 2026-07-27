import ApiClient, { type IResult } from '@/services/ApiClient';
import { API_ROUTES } from '@/configs/ApiRoutes';
import type {
  ValkeyClients,
  ValkeyClusterNodes,
  ValkeyFlushResult,
  ValkeyInfo,
  ValkeyKeyDetail,
  ValkeyScanResult,
  ValkeyStatus,
} from '@/_types/valkey.interface';

// Cache admin endpoints are guarded in prod; ApiClient attaches the session
// token to every request, so nothing to do here.
const ValkeyAdminService = {
  getStatus(): Promise<IResult<ValkeyStatus>> {
    return ApiClient.makeRequest<ValkeyStatus>({
      url: API_ROUTES.VALKEY_ADMIN.STATUS,
      method: 'GET',
    });
  },

  getInfo(): Promise<IResult<ValkeyInfo>> {
    return ApiClient.makeRequest<ValkeyInfo>({
      url: API_ROUTES.VALKEY_ADMIN.INFO,
      method: 'GET',
    });
  },

  getClusterNodes(): Promise<IResult<ValkeyClusterNodes>> {
    return ApiClient.makeRequest<ValkeyClusterNodes>({
      url: API_ROUTES.VALKEY_ADMIN.CLUSTER_NODES,
      method: 'GET',
    });
  },

  getClients(): Promise<IResult<ValkeyClients>> {
    return ApiClient.makeRequest<ValkeyClients>({
      url: API_ROUTES.VALKEY_ADMIN.CLIENTS,
      method: 'GET',
    });
  },

  scanKeys(pattern: string, cursor?: string, count = 100): Promise<IResult<ValkeyScanResult>> {
    const query = new URLSearchParams({ pattern: pattern || '*', count: String(count) });
    if (cursor) query.set('cursor', cursor);
    return ApiClient.makeRequest<ValkeyScanResult>({
      url: `${API_ROUTES.VALKEY_ADMIN.KEYS}?${query.toString()}`,
      method: 'GET',
    });
  },

  getKeyDetail(key: string): Promise<IResult<ValkeyKeyDetail>> {
    return ApiClient.makeRequest<ValkeyKeyDetail>({
      url: API_ROUTES.VALKEY_ADMIN.KEY_DETAIL(key),
      method: 'GET',
    });
  },

  setKey(key: string, value: string, ttlSeconds?: number): Promise<IResult<{ ok: boolean }>> {
    return ApiClient.makeRequest<{ ok: boolean }>({
      url: API_ROUTES.VALKEY_ADMIN.KEYS,
      method: 'PUT',
      body: { key, value, ...(ttlSeconds && ttlSeconds > 0 ? { ttlSeconds } : {}) },
    });
  },

  deleteKeys(keys: string[]): Promise<IResult<{ deleted: number }>> {
    return ApiClient.makeRequest<{ deleted: number }>({
      url: API_ROUTES.VALKEY_ADMIN.KEYS_DELETE,
      method: 'POST',
      body: { keys },
    });
  },

  flush(scope: 'db' | 'all', confirm: string): Promise<IResult<ValkeyFlushResult>> {
    return ApiClient.makeRequest<ValkeyFlushResult>({
      url: API_ROUTES.VALKEY_ADMIN.FLUSH,
      method: 'POST',
      body: { scope, confirm },
    });
  },
};

export default ValkeyAdminService;
