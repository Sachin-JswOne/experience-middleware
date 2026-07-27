import { Injectable } from '@nestjs/common';
import { isClusterEnabled } from './metrics.cluster.shared';
import { RouteErrorSample } from './metrics.types';

const DEFAULT_MAX_ERROR_SAMPLES_PER_ROUTE = 20;
const DEFAULT_MAX_SUCCESS_SAMPLES_PER_ROUTE = 10;
const DEFAULT_MAX_SLOW_SAMPLES_PER_ROUTE = 10;
const DEFAULT_SLOW_THRESHOLD_MS = 3000;
const MAX_BODY_CHARS = 4096;
const MASKED = '***masked***';

const SENSITIVE_HEADERS = [
  'authorization',
  'access_token',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
];

/**
 * Matched case-insensitively as substrings (ignoring - and _), so
 * `clientSecret`, `X-PASSWORD` and `refresh_token` are all covered by the
 * short entries below. Exact lowercase matching previously let `Password`
 * and `access_token` through unmasked.
 */
const SENSITIVE_BODY_FIELDS = [
  'password',
  'passwd',
  'token',
  'secret',
  'otp',
  'apikey',
  'authorization',
  'credential',
];

const isSensitiveField = (key: string): boolean => {
  const normalized = key.toLowerCase().replace(/[-_]/g, '');
  return SENSITIVE_BODY_FIELDS.some((field) => normalized.includes(field));
};

/**
 * Masks credentials carried in the query string. The dashboard renders
 * `sample.url` verbatim and offers copy-as-cURL, so a token in the query
 * would otherwise be readable by anyone with dashboard access.
 */
export const maskUrlQuery = (url: string): string => {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  const path = url.slice(0, queryStart);
  const params = url
    .slice(queryStart + 1)
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      const key = pair.slice(0, eq);
      return isSensitiveField(decodeURIComponent(key)) ? `${key}=${MASKED}` : pair;
    });
  return `${path}?${params.join('&')}`;
};

// Cluster copies travel through a shared Valkey ring read on every drawer
// poll — trim bodies harder than the local store does.
const CLUSTER_MAX_BODY_CHARS = 2048;
const CLUSTER_QUEUE_MAX = 100;

/**
 * Keeps the last N request/response samples per route so the dashboard can
 * show what actually flowed through. Errors, slow requests and plain
 * successes are kept in separate quotas so a burst of healthy traffic never
 * evicts the error or slow samples. Bodies truncated, auth masked. In-memory
 * and per-pod, like the aggregator buffer.
 */
@Injectable()
export class MetricsSampleStore {
  private samples = new Map<
    string,
    { errors: RouteErrorSample[]; slows: RouteErrorSample[]; successes: RouteErrorSample[] }
  >();
  private maxErrorsPerRoute: number;
  private maxSuccessesPerRoute: number;
  private maxSlowsPerRoute: number;
  private slowThresholdMs: number;
  private enabled: boolean;

  constructor() {
    this.maxErrorsPerRoute = parseInt(
      process.env.METRICS_MAX_SAMPLES_PER_ROUTE || String(DEFAULT_MAX_ERROR_SAMPLES_PER_ROUTE),
      10,
    );
    this.maxSuccessesPerRoute = parseInt(
      process.env.METRICS_MAX_SUCCESS_SAMPLES_PER_ROUTE ||
        String(DEFAULT_MAX_SUCCESS_SAMPLES_PER_ROUTE),
      10,
    );
    this.maxSlowsPerRoute = parseInt(
      process.env.METRICS_MAX_SLOW_SAMPLES_PER_ROUTE || String(DEFAULT_MAX_SLOW_SAMPLES_PER_ROUTE),
      10,
    );
    this.slowThresholdMs = parseInt(
      process.env.METRICS_SLOW_SAMPLE_THRESHOLD_MS || String(DEFAULT_SLOW_THRESHOLD_MS),
      10,
    );
    this.enabled = process.env.METRICS_SAMPLES_ENABLED !== 'false';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getSlowThresholdMs(): number {
    return this.slowThresholdMs;
  }

  // Error/slow samples wait here until the publisher flush ships them to
  // the cluster-wide ring (successes stay per-pod to bound volume).
  private clusterQueue: RouteErrorSample[] = [];

  record(sample: RouteErrorSample): void {
    if (!this.enabled) return;
    const key = `${sample.method} ${sample.route}`;
    let entry = this.samples.get(key);
    if (!entry) {
      entry = { errors: [], slows: [], successes: [] };
      this.samples.set(key, entry);
    }
    const isError = sample.statusCode >= 400;
    const isSlow = !isError && sample.durationMs >= this.slowThresholdMs;
    const list = isError ? entry.errors : isSlow ? entry.slows : entry.successes;
    const max = isError
      ? this.maxErrorsPerRoute
      : isSlow
        ? this.maxSlowsPerRoute
        : this.maxSuccessesPerRoute;
    list.push(sample);
    if (list.length > max) {
      list.splice(0, list.length - max);
    }

    if ((isError || isSlow) && isClusterEnabled()) {
      this.clusterQueue.push(MetricsSampleStore.slimForCluster(sample));
      if (this.clusterQueue.length > CLUSTER_QUEUE_MAX) {
        this.clusterQueue.splice(0, this.clusterQueue.length - CLUSTER_QUEUE_MAX);
      }
    }
  }

  drainClusterQueue(): RouteErrorSample[] {
    const queue = this.clusterQueue;
    this.clusterQueue = [];
    return queue;
  }

  private static truncate(value: string | undefined): string | undefined {
    if (value === undefined || value.length <= CLUSTER_MAX_BODY_CHARS) return value;
    return `${value.slice(0, CLUSTER_MAX_BODY_CHARS)}… [truncated]`;
  }

  private static slimForCluster(sample: RouteErrorSample): RouteErrorSample {
    return {
      ...sample,
      requestBody: MetricsSampleStore.truncate(sample.requestBody),
      responseBody: MetricsSampleStore.truncate(sample.responseBody),
      downstream: sample.downstream.map((d) => ({
        ...d,
        requestBody: MetricsSampleStore.truncate(d.requestBody),
        responseBody: MetricsSampleStore.truncate(d.responseBody),
      })),
    };
  }

  getSamples(method: string, route: string): RouteErrorSample[] {
    const entry = this.samples.get(`${method} ${route}`);
    if (!entry) return [];
    // Newest first, all kinds interleaved by time.
    return [...entry.errors, ...entry.slows, ...entry.successes].sort((a, b) => b.ts - a.ts);
  }

  // Cross-route query for the latency-heatmap drill-through: every sample in
  // a time window whose duration falls inside a latency band.
  getSamplesInBand(filter: {
    fromTs: number;
    toTs: number;
    minDurationMs?: number;
    maxDurationMs?: number;
    limit?: number;
  }): RouteErrorSample[] {
    const limit = filter.limit ?? 100;
    const out: RouteErrorSample[] = [];
    for (const entry of this.samples.values()) {
      for (const list of [entry.errors, entry.slows, entry.successes]) {
        for (const sample of list) {
          if (sample.ts < filter.fromTs || sample.ts > filter.toTs) continue;
          if (filter.minDurationMs !== undefined && sample.durationMs < filter.minDurationMs)
            continue;
          if (filter.maxDurationMs !== undefined && sample.durationMs > filter.maxDurationMs)
            continue;
          out.push(sample);
        }
      }
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, limit);
  }

  static sanitizeHeaders(headers: Record<string, unknown> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!headers) return out;
    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined || value === null) continue;
      out[key] = SENSITIVE_HEADERS.includes(key.toLowerCase()) ? MASKED : String(value);
    }
    return out;
  }

  static sanitizeBody(body: unknown): string | undefined {
    if (body === undefined || body === null) return undefined;
    // Streams, ServerResponse instances etc. serialize into useless noise —
    // only plain objects/arrays/primitives are worth showing.
    if (typeof body === 'object' && !MetricsSampleStore.isPlain(body)) {
      return '[non-JSON payload omitted]';
    }
    let masked: unknown = body;
    if (typeof body === 'object') {
      masked = MetricsSampleStore.maskFields(body);
    }
    let str: string;
    try {
      str = typeof masked === 'string' ? masked : MetricsSampleStore.safeStringify(masked);
    } catch {
      return '[unserializable]';
    }
    if (str.length > MAX_BODY_CHARS) {
      return `${str.slice(0, MAX_BODY_CHARS)}… [truncated ${str.length} chars]`;
    }
    return str;
  }

  private static isPlain(value: object): boolean {
    if (Array.isArray(value)) return true;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  private static safeStringify(value: unknown): string {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[circular]';
        seen.add(v);
      }
      return v;
    });
  }

  private static maskFields(value: unknown, depth = 0): unknown {
    if (depth > 6 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => MetricsSampleStore.maskFields(v, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveField(key) ? MASKED : MetricsSampleStore.maskFields(v, depth + 1);
    }
    return out;
  }
}
