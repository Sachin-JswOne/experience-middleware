import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import axios, { AxiosError, AxiosRequestConfig, GenericAbortSignal } from 'axios';
import { enqueueSnackbar } from 'notistack';

import AppConfig from '@/configs/AppConfig';
import AppMessages from '@/configs/message_configs/AppMessages';
import { getTracer } from '@/utils/telemetry';
import { authHeaders, notifyAuthExpired } from '@/utils/session';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type ResponseType = 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';

export interface IApiClientInput {
  url: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: GenericAbortSignal;
  responseType?: ResponseType;
  // Endpoints that must not carry the session token (public auth handshake).
  skipAuth?: boolean;
  // For probes where a 401 is a legitimate answer ("not signed in") rather
  // than an expiry — suppresses the sign-out event and the error toast.
  suppressAuthExpiry?: boolean;
}

export interface IApiError {
  code: number;
  message: string;
}

export interface IApiClientResponse<T = unknown> {
  headers?: Record<string, unknown>;
  data: T | null;
  // Always present. `code === 0` means success, so callers can read
  // `error.code` without optional chaining.
  error: IApiError;
  errors?: Record<string, unknown>;
}

export const NO_ERROR: IApiError = { code: 0, message: '' };

/**
 * What services hand back to callers: the parsed body (null on failure) plus
 * a always-present error. `IApiClientResponse` is assignable to it, so a
 * service method can simply return `ApiClient.makeRequest<T>(…)`.
 */
export interface IResult<T> {
  data: T | null;
  error: IApiError;
}

interface AxiosLikeError {
  message?: string;
  code?: string;
  response?: {
    status?: number;
    headers?: Record<string, unknown>;
    data?: {
      error?: { code?: number; message?: string };
      errors?: Record<string, unknown>;
    };
  };
}

const toAxiosLikeError = (error: unknown): AxiosLikeError =>
  typeof error === 'object' && error !== null ? (error as AxiosLikeError) : {};

const notify = (message: string) =>
  enqueueSnackbar(message, {
    variant: 'error',
    autoHideDuration: AppConfig.SNACKBAR_AUTO_HIDE_DURATIONS.error,
  });

const processError = <T>(
  error: AxiosLikeError,
  result: IApiClientResponse<T>,
  suppressAuthExpiry = false,
) => {
  const status = error.response?.status;

  if (status === 401) {
    result.error = { code: status, message: '' };
    if (!suppressAuthExpiry) {
      notify(AppMessages.ERRORS.unauthorized);
      // Drops the session and lets ProtectedLayout route to /login. Dashboard
      // preferences (saved views, thresholds, SLO config) are preserved.
      notifyAuthExpired();
    }
  } else if (status === 403) {
    result.error = { code: status, message: '' };
    notify(AppMessages.ERRORS.access_denied);
  } else {
    result.error = {
      code: error.response?.data?.error?.code ?? status ?? 500,
      message: error.response?.data?.error?.message ?? error.message ?? 'Request failed',
    };
    result.errors = error.response?.data?.errors;
  }
  return result;
};

abstract class ApiClient {
  public static async makeRequest<T = unknown>({
    url,
    method,
    headers,
    body,
    signal,
    responseType,
    skipAuth,
    suppressAuthExpiry,
  }: IApiClientInput): Promise<IApiClientResponse<T>> {
    const tracer = getTracer('experience-middleware-ui');

    const spanName = `HTTP ${method?.toUpperCase() || 'UNKNOWN'} ${url}`;

    const span = tracer.startSpan(spanName, {
      attributes: {
        'http.url': url,
        'http.method': method || 'UNKNOWN',
        'http.target': url,
        'http.scheme': url.startsWith('https') ? 'https' : 'http',
        'service.name': 'experience-middleware-ui',
      },
    });

    return await context.with(trace.setSpan(context.active(), span), async () => {
      const result: IApiClientResponse<T> = { data: null, error: { ...NO_ERROR } };
      try {
        if (!url) {
          throw new Error(AppMessages.ERRORS.missing_url);
        }
        if (!method) {
          throw new Error(AppMessages.ERRORS.missing_method);
        }

        const options: AxiosRequestConfig = {
          url,
          method,
          headers: {
            'Content-Type': 'application/json',
            // The one place the session token is attached — services no
            // longer hand-roll their own Authorization header.
            ...(skipAuth ? {} : authHeaders()),
            ...headers,
          },
          signal,
          // Carries the httpOnly session cookie when the server runs in
          // cookie mode. Same-origin in practice, but explicit so a split
          // API host keeps working.
          withCredentials: true,
          ...(responseType ? { responseType } : {}),
        };

        if (body instanceof FormData) {
          options.data = body;
        } else if (body !== undefined) {
          options.data = JSON.stringify(body);
        }

        const response = await axios(options);
        result.data = response.data as T;
        result.headers = response.headers as Record<string, unknown>;
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (caught: unknown) {
        const error = toAxiosLikeError(caught);
        span.recordException(caught as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        if (error.response) {
          result.headers = error.response.headers;
          // handles 401 & 403
          processError(error, result, suppressAuthExpiry);
        } else if (error.code !== AxiosError.ERR_CANCELED) {
          result.error = {
            code: 500,
            message: error.message ?? 'Network request failed',
          };
        }
      } finally {
        span.end();
      }
      return result;
    });
  }
}

export default ApiClient;
