import ApiClient, { IApiClientResponse } from '@/services/ApiClient';
import { API_ROUTES } from '@/configs/ApiRoutes';
import LocalStorage from '@/utils/LocalStorage';
import type { MetricsHealth, MetricsSnapshot, RouteErrorSample } from '@/_types/metrics.interface';

export interface IMetricsResult {
  data: MetricsSnapshot | null;
  error: IApiClientResponse['error'];
}

export interface IRouteSamplesResult {
  data: { enabled: boolean; slowThresholdMs?: number; samples: RouteErrorSample[] } | null;
  error: IApiClientResponse['error'];
}

export interface IMetricsHealthResult {
  data: MetricsHealth | null;
  error: IApiClientResponse['error'];
}

export interface IMetricsParams {
  window?: string;
  from?: number;
  to?: number;
}

// Metrics endpoints are guarded in prod — send the logged-in user's token.
const authHeaders = (): Record<string, string> => {
  const userInfo = LocalStorage.getItem('userInfo');
  return userInfo?.token ? { authorization: `Bearer ${userInfo.token}` } : {};
};

const MetricsService = {
  async getMetrics(params: IMetricsParams = {}): Promise<IMetricsResult> {
    const query = new URLSearchParams();
    if (params.from !== undefined && params.to !== undefined) {
      query.set('from', String(params.from));
      query.set('to', String(params.to));
    } else if (params.window) {
      query.set('window', params.window);
    }
    const qs = query.toString();
    const url = qs ? `${API_ROUTES.METRICS}?${qs}` : API_ROUTES.METRICS;
    const response = await ApiClient.makeRequest({
      url,
      method: 'GET',
      headers: authHeaders(),
    });
    return {
      data: response.data as MetricsSnapshot,
      error: response.error,
    };
  },

  async getRouteSamples(method: string, route: string): Promise<IRouteSamplesResult> {
    const url = `${API_ROUTES.METRICS_SAMPLES}?method=${encodeURIComponent(method)}&route=${encodeURIComponent(route)}`;
    const response = await ApiClient.makeRequest({
      url,
      method: 'GET',
      headers: authHeaders(),
    });
    return {
      data: response.data as IRouteSamplesResult['data'],
      error: response.error,
    };
  },

  async getHealth(): Promise<IMetricsHealthResult> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.METRICS_HEALTH,
      method: 'GET',
      headers: authHeaders(),
    });
    return {
      data: response.data as MetricsHealth,
      error: response.error,
    };
  },
};

export default MetricsService;
