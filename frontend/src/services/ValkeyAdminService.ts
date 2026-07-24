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

// ApiClient leaves `error` undefined on success — normalize so callers can
// always read error.code/error.message.
const toResult = <T>(response: IApiClientResponse): IResult<T> => ({
  data: (response.data as T) ?? null,
  error: response.error ?? { code: 0, message: '' },
});

const ValkeyAdminService = {
  async getStatus(): Promise<IResult<ValkeyStatus>> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.VALKEY_ADMIN.STATUS,
      method: 'GET',
      headers: authHeaders(),
    });
    return toResult<ValkeyStatus>(response);
  },

  async getInfo(): Promise<IResult<ValkeyInfo>> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.VALKEY_ADMIN.INFO,
      method: 'GET',
      headers: authHeaders(),
    });
    return toResult<ValkeyInfo>(response);
  },

  async getClusterNodes(): Promise<IResult<ValkeyClusterNodes>> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.VALKEY_ADMIN.CLUSTER_NODES,
      method: 'GET',
      headers: authHeaders(),
    });
    return toResult<ValkeyClusterNodes>(response);
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
    return toResult<ValkeyScanResult>(response);
  },

  async getKeyDetail(key: string): Promise<IResult<ValkeyKeyDetail>> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.VALKEY_ADMIN.KEY_DETAIL(key),
      method: 'GET',
      headers: authHeaders(),
    });
    return toResult<ValkeyKeyDetail>(response);
  },

  async setKey(key: string, value: string, ttlSeconds?: number): Promise<IResult<{ ok: boolean }>> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.VALKEY_ADMIN.KEYS,
      method: 'PUT',
      headers: authHeaders(),
      body: { key, value, ...(ttlSeconds && ttlSeconds > 0 ? { ttlSeconds } : {}) },
    });
    return toResult<{ ok: boolean }>(response);
  },

  async deleteKeys(keys: string[]): Promise<IResult<{ deleted: number }>> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.VALKEY_ADMIN.KEYS_DELETE,
      method: 'POST',
      headers: authHeaders(),
      body: { keys },
    });
    return toResult<{ deleted: number }>(response);
  },

  async flush(scope: 'db' | 'all', confirm: string): Promise<IResult<ValkeyFlushResult>> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.VALKEY_ADMIN.FLUSH,
      method: 'POST',
      headers: authHeaders(),
      body: { scope, confirm },
    });
    return toResult<ValkeyFlushResult>(response);
  },
};

export default ValkeyAdminService;
