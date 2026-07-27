import ApiClient, { IApiClientResponse } from '@/services/ApiClient';
import { API_ROUTES } from '@/configs/ApiRoutes';
import LocalStorage from '@/utils/LocalStorage';
import type {
  AlertConfig,
  AlertHistoryRecord,
  MetricsHealth,
  MetricsSnapshot,
  RouteErrorSample,
  RouteTimelinePoint,
} from '@/_types/metrics.interface';

export interface IMetricsResult {
  data: MetricsSnapshot | null;
  error: IApiClientResponse['error'];
}

export interface IRouteSamplesResult {
  data: {
    enabled: boolean;
    slowThresholdMs?: number;
    source?: 'cluster' | 'local';
    samples: RouteErrorSample[];
    // Total matching samples before the limit — drives the "view all" button.
    totalMatched?: number;
  } | null;
  error: IApiClientResponse['error'];
}

export interface IRouteTimelineResult {
  data: {
    points: RouteTimelinePoint[];
    bucketIntervalMs: number;
    source: 'cluster' | 'local';
  } | null;
  error: IApiClientResponse['error'];
}

export interface IAlertConfigResult {
  data: { shared: boolean; config: AlertConfig | null } | null;
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

  // Live snapshots over SSE. EventSource can't send an Authorization header,
  // so this reads the stream via fetch and hand-parses the `data:` frames.
  // Resolves when the server closes the stream; rejects on network/auth
  // failure so the caller can fall back to polling.
  async streamMetrics(
    window: string,
    onSnapshot: (snapshot: MetricsSnapshot) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const response = await fetch(
      `${API_ROUTES.METRICS_STREAM}?window=${encodeURIComponent(window)}`,
      {
        headers: { accept: 'text/event-stream', ...authHeaders() },
        signal,
      },
    );
    if (!response.ok || !response.body) {
      throw new Error(`Metrics stream failed (${response.status})`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line; keep the trailing partial.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const dataLines = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim());
        if (dataLines.length === 0) continue;
        try {
          onSnapshot(JSON.parse(dataLines.join('')) as MetricsSnapshot);
        } catch {
          // Skip malformed frames — the next tick replaces them anyway.
        }
      }
    }
  },

  async getRouteSamples(method: string, route: string, limit?: number): Promise<IRouteSamplesResult> {
    let url = `${API_ROUTES.METRICS_SAMPLES}?method=${encodeURIComponent(method)}&route=${encodeURIComponent(route)}`;
    if (limit !== undefined) url += `&limit=${limit}`;
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

  // Heatmap drill-through: samples across all routes inside a time window and
  // latency band.
  async getSamplesInBand(params: {
    from: number;
    to: number;
    minMs?: number;
    maxMs?: number;
    limit?: number;
  }): Promise<IRouteSamplesResult> {
    const query = new URLSearchParams({ from: String(params.from), to: String(params.to) });
    if (params.minMs !== undefined) query.set('minMs', String(params.minMs));
    if (params.maxMs !== undefined) query.set('maxMs', String(params.maxMs));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    const response = await ApiClient.makeRequest({
      url: `${API_ROUTES.METRICS_SAMPLES}?${query.toString()}`,
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

  async getRouteTimeline(
    method: string,
    route: string,
    params: { window?: string; from?: number; to?: number },
  ): Promise<IRouteTimelineResult> {
    const query = new URLSearchParams({ method, route });
    if (params.from !== undefined && params.to !== undefined) {
      query.set('from', String(params.from));
      query.set('to', String(params.to));
    } else if (params.window) {
      query.set('window', params.window);
    }
    const response = await ApiClient.makeRequest({
      url: `${API_ROUTES.METRICS_ROUTE_TIMELINE}?${query.toString()}`,
      method: 'GET',
      headers: authHeaders(),
    });
    return {
      data: response.data as IRouteTimelineResult['data'],
      error: response.error,
    };
  },

  async getAlertConfig(): Promise<IAlertConfigResult> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.METRICS_ALERT_CONFIG,
      method: 'GET',
      headers: authHeaders(),
    });
    return {
      data: response.data as IAlertConfigResult['data'],
      error: response.error,
    };
  },

  async saveAlertConfig(config: AlertConfig): Promise<{ error: IApiClientResponse['error'] }> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.METRICS_ALERT_CONFIG,
      method: 'PUT',
      headers: authHeaders(),
      body: config as unknown as Record<string, unknown>,
    });
    return { error: response.error };
  },

  async getAlertHistory(limit = 50): Promise<{
    data: AlertHistoryRecord[] | null;
    error: IApiClientResponse['error'];
  }> {
    const response = await ApiClient.makeRequest({
      url: `${API_ROUTES.METRICS_ALERT_HISTORY}?limit=${limit}`,
      method: 'GET',
      headers: authHeaders(),
    });
    return {
      data: response.data as AlertHistoryRecord[],
      error: response.error,
    };
  },
};

export default MetricsService;
