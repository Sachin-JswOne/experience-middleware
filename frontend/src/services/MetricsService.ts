import ApiClient, { type IApiClientResponse, type IResult } from '@/services/ApiClient';
import { API_ROUTES } from '@/configs/ApiRoutes';
import { authHeaders } from '@/utils/session';
import { parseMetricsHealth, parseMetricsSnapshot } from '@/services/metricsSchema';
import type {
  AlertConfig,
  AlertHistoryRecord,
  MetricsHealth,
  MetricsSnapshot,
  RouteErrorSample,
  RouteTimelinePoint,
} from '@/_types/metrics.interface';

export type IMetricsResult = IResult<MetricsSnapshot>;

export type IRouteSamplesResult = IResult<{
  enabled: boolean;
  slowThresholdMs?: number;
  source?: 'cluster' | 'local';
  samples: RouteErrorSample[];
  // Total matching samples before the limit — drives the "view all" button.
  totalMatched?: number;
}>;

export type IRouteTimelineResult = IResult<{
  points: RouteTimelinePoint[];
  bucketIntervalMs: number;
  source: 'cluster' | 'local';
}>;

export type IAlertConfigResult = IResult<{ shared: boolean; config: AlertConfig | null }>;

export type IMetricsHealthResult = IResult<MetricsHealth>;

export interface IMetricsParams {
  window?: string;
  from?: number;
  to?: number;
}

const rangeQuery = (params: IMetricsParams, query = new URLSearchParams()): URLSearchParams => {
  if (params.from !== undefined && params.to !== undefined) {
    query.set('from', String(params.from));
    query.set('to', String(params.to));
  } else if (params.window) {
    query.set('window', params.window);
  }
  return query;
};

// Payload shape is checked at the boundary: a backend that drifts produces a
// clean error instead of a chart that throws mid-render.
const validated = <T>(
  response: IApiClientResponse<unknown>,
  parse: (raw: unknown) => T | null,
  what: string,
): IResult<T> => {
  if (response.error.code) return { data: null, error: response.error };
  const data = parse(response.data);
  if (!data) {
    return {
      data: null,
      error: { code: 502, message: `Unexpected ${what} payload from the metrics service` },
    };
  }
  return { data, error: response.error };
};

const MetricsService = {
  async getMetrics(params: IMetricsParams = {}): Promise<IMetricsResult> {
    const qs = rangeQuery(params).toString();
    const url = qs ? `${API_ROUTES.METRICS}?${qs}` : API_ROUTES.METRICS;
    const response = await ApiClient.makeRequest({ url, method: 'GET' });
    return validated(response, parseMetricsSnapshot, 'metrics');
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
        // The SSE stream is read via fetch (EventSource can't send headers),
        // so it needs the cookie attached explicitly in cookie mode.
        credentials: 'include',
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
          const snapshot = parseMetricsSnapshot(JSON.parse(dataLines.join('')));
          if (snapshot) onSnapshot(snapshot);
        } catch {
          // Skip malformed frames — the next tick replaces them anyway.
        }
      }
    }
  },

  async getRouteSamples(method: string, route: string, limit?: number): Promise<IRouteSamplesResult> {
    const query = new URLSearchParams({ method, route });
    if (limit !== undefined) query.set('limit', String(limit));
    return ApiClient.makeRequest<NonNullable<IRouteSamplesResult['data']>>({
      url: `${API_ROUTES.METRICS_SAMPLES}?${query.toString()}`,
      method: 'GET',
    });
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
    return ApiClient.makeRequest<NonNullable<IRouteSamplesResult['data']>>({
      url: `${API_ROUTES.METRICS_SAMPLES}?${query.toString()}`,
      method: 'GET',
    });
  },

  async getHealth(): Promise<IMetricsHealthResult> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.METRICS_HEALTH,
      method: 'GET',
    });
    return validated(response, parseMetricsHealth, 'health');
  },

  async getRouteTimeline(
    method: string,
    route: string,
    params: IMetricsParams,
  ): Promise<IRouteTimelineResult> {
    const query = rangeQuery(params, new URLSearchParams({ method, route }));
    return ApiClient.makeRequest<NonNullable<IRouteTimelineResult['data']>>({
      url: `${API_ROUTES.METRICS_ROUTE_TIMELINE}?${query.toString()}`,
      method: 'GET',
    });
  },

  async getAlertConfig(): Promise<IAlertConfigResult> {
    return ApiClient.makeRequest<NonNullable<IAlertConfigResult['data']>>({
      url: API_ROUTES.METRICS_ALERT_CONFIG,
      method: 'GET',
    });
  },

  async saveAlertConfig(config: AlertConfig): Promise<{ error: IApiClientResponse['error'] }> {
    const response = await ApiClient.makeRequest({
      url: API_ROUTES.METRICS_ALERT_CONFIG,
      method: 'PUT',
      body: config,
    });
    return { error: response.error };
  },

  async getAlertHistory(limit = 50): Promise<IResult<AlertHistoryRecord[]>> {
    return ApiClient.makeRequest<AlertHistoryRecord[]>({
      url: `${API_ROUTES.METRICS_ALERT_HISTORY}?limit=${limit}`,
      method: 'GET',
    });
  },
};

export default MetricsService;
