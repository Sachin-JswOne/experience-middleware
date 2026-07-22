import ApiClient, { IApiClientResponse } from '@/services/ApiClient';
import { API_ROUTES } from '@/configs/ApiRoutes';
import type { MetricsSnapshot, RouteErrorSample } from '@/_types/metrics.interface';

export interface IMetricsResult {
  data: MetricsSnapshot | null;
  error: IApiClientResponse['error'];
}

export interface IRouteSamplesResult {
  data: { enabled: boolean; samples: RouteErrorSample[] } | null;
  error: IApiClientResponse['error'];
}

const MetricsService = {
  async getMetrics(window?: string): Promise<IMetricsResult> {
    const url = window ? `${API_ROUTES.METRICS}?window=${window}` : API_ROUTES.METRICS;
    const response = await ApiClient.makeRequest({
      url,
      method: 'GET',
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
    });
    return {
      data: response.data as IRouteSamplesResult['data'],
      error: response.error,
    };
  },
};

export default MetricsService;
