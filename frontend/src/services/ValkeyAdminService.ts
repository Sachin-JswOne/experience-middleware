import ApiClient, { IApiClientResponse } from '@/services/ApiClient';
import { API_ROUTES } from '@/configs/ApiRoutes';
import LocalStorage from '@/utils/LocalStorage';
import type {
  ValkeyClusterNodes,
  ValkeyFlushResult,
  ValkeyInfo,
  ValkeyKeyDetail,
  ValkeyScanResult,
  ValkeyStatus,
} from '@/_types/valkey.interface';

interface IResult<T> {
  data: T | null;
  error: IApiClientResponse['error'];
}

// Cache admin endpoints are guarded in prod — send the logged-in user's token.
const authHeaders = (): Record<string, string> => {
  const userInfo = LocalStorage.getItem('userInfo');
  return userInfo?.token ? { authorization: `Bearer ${userInfo.token}` } : {};
};

const ValkeyAdminService = {
  async getStatus(): Promise<IResult<ValkeyStatus>> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.VALKEY_ADMIN.STATUS,
      method: 'GET',
      headers: authHeaders(),
    });
    return { data: response.data as ValkeyStatus, error: response.error };
  },

  async getInfo(): Promise<IResult<ValkeyInfo>> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.VALKEY_ADMIN.INFO,
      method: 'GET',
      headers: authHeaders(),
    });
    return { data: response.data as ValkeyInfo, error: response.error };
  },

  async getClusterNodes(): Promise<IResult<ValkeyClusterNodes>> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.VALKEY_ADMIN.CLUSTER_NODES,
      method: 'GET',
      headers: authHeaders(),
    });
    return { data: response.data as ValkeyClusterNodes, error: response.error };
  },

  async scanKeys(
    pattern: string,
    cursor?: string,
    count = 100,
  ): Promise<IResult<ValkeyScanResult>> {
    const query = new URLSearchParams({ pattern: pattern || '*', count: String(count) });
    if (cursor) query.set('cursor', cursor);
    const response = await ApiClient.makeRequest({
      url: `${API_ROUTES.VALKEY_ADMIN.KEYS}?${query.toString()}`,
      method: 'GET',
      headers: authHeaders(),
    });
    return { data: response.data as ValkeyScanResult, error: response.error };
  },

  async getKeyDetail(key: string): Promise<IResult<ValkeyKeyDetail>> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.VALKEY_ADMIN.KEY_DETAIL(key),
      method: 'GET',
      headers: authHeaders(),
    });
    return { data: response.data as ValkeyKeyDetail, error: response.error };
  },

  async setKey(key: string, value: string, ttlSeconds?: number): Promise<IResult<{ ok: boolean }>> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.VALKEY_ADMIN.KEYS,
      method: 'PUT',
      headers: authHeaders(),
      body: { key, value, ...(ttlSeconds && ttlSeconds > 0 ? { ttlSeconds } : {}) },
    });
    return { data: response.data as { ok: boolean }, error: response.error };
  },

  async deleteKeys(keys: string[]): Promise<IResult<{ deleted: number }>> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.VALKEY_ADMIN.KEYS_DELETE,
      method: 'POST',
      headers: authHeaders(),
      body: { keys },
    });
    return { data: response.data as { deleted: number }, error: response.error };
  },

  async flush(scope: 'db' | 'all', confirm: string): Promise<IResult<ValkeyFlushResult>> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.VALKEY_ADMIN.FLUSH,
      method: 'POST',
      headers: authHeaders(),
      body: { scope, confirm },
    });
    return { data: response.data as ValkeyFlushResult, error: response.error };
  },
};

export default ValkeyAdminService;
