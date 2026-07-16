import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import axios, { AxiosError, AxiosRequestConfig, GenericAbortSignal } from 'axios';
import { enqueueSnackbar } from 'notistack';

import AppConfig from '@/configs/AppConfig';
import AppMessages from '@/configs/message_configs/AppMessages';
import { ILooseObject } from '@/_types/common.interface';
import LocalStorage from '@/utils/LocalStorage';
import { getTracer } from '@/utils/telemetry';

enum axiosMethodEnum {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
  TRACE = 'TRACE',
}

interface IApiClientInput {
  url: string;
  method?: keyof typeof axiosMethodEnum;
  headers?: ILooseObject;
  body?: ILooseObject;
  signal?: GenericAbortSignal;
  responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';
  isCacheable?: boolean;
}

export interface IApiClientResponse {
  headers?: ILooseObject;
  data: ILooseObject;
  error: {
    code: number;
    message: string;
  };
  errors?: ILooseObject;
}

const processError = (error: any, result: IApiClientResponse) => {
  if (error.response?.status === 401) {
    // Only set error code to check if api call failed
    result.error = {
      code: error.response.status,
      message: '',
    };
    enqueueSnackbar(AppMessages.ERRORS.unauthorized, {
      variant: 'error',
      autoHideDuration: AppConfig.SNACKBAR_AUTO_HIDE_DURATIONS.error,
    });
    // Clearing the localStorage and redirecting to login
    LocalStorage.clearItems();
  } else if (error.response?.status === 403) {
    // Only set error code to check if api call failed
    result.error = {
      code: error.response.status,
      message: '',
    };
    enqueueSnackbar(AppMessages.ERRORS.access_denied, {
      variant: 'error',
      autoHideDuration: AppConfig.SNACKBAR_AUTO_HIDE_DURATIONS.error,
    });
  } else {
    result.error = {
      code: error?.response?.data?.error?.code ?? error?.response?.status,
      message: error?.response?.data?.error?.message ?? error?.message,
    };
    result.errors = error.response.data?.errors;
  }
  return result;
};

const cacheData: ILooseObject = {};

abstract class ApiClient {
  public static async makeRequest({
    url,
    method,
    headers,
    body,
    signal,
    isCacheable,
  }: IApiClientInput): Promise<IApiClientResponse> {
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
      let result: IApiClientResponse = {} as IApiClientResponse;
      try {
        if (!url) {
          throw new Error(AppMessages.ERRORS.missing_url);
        }
        if (!method) {
          throw new Error(AppMessages.ERRORS.missing_method);
        }

        // const userInfo: ILooseObject = LocalStorage.getItem('userInfo');

        const options: AxiosRequestConfig = {
          url,
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          signal,
        };

        // if (userInfo?.token) {
        //   options.headers!.Authorization = `${userInfo.token}`;
        // }

        if (body && body instanceof FormData) {
          options.data = body;
        } else if (body) {
          options.data = JSON.stringify(body);
        }

        let response = null;
        const cacheKey = `${method}-${url}`;
        if (isCacheable) {
          const cache = cacheData[cacheKey];
          const isExpired = Date.now() - cache?.timestamp > AppConfig.CACHE_TTL;
          if (cache && !isExpired) {
            response = cache?.response;
          } else {
            response = await axios(options);
            cacheData[cacheKey] = {
              response,
              timestamp: Date.now(),
            };
          }
          if (response === null) {
            response = await axios(options);
            cacheData[cacheKey] = {
              response,
              timestamp: Date.now(),
            };
          }
        } else {
          response = await axios(options);
        }
        result.data = response.data;
        result.headers = response.headers;
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error: any) {
        span.recordException(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        if (error.response) {
          result.headers = error.response?.headers;
          // handle 401 & 403
          result = processError(error, result);
        } else if (error.code !== AxiosError.ERR_CANCELED) {
          result.error = {
            code: 500,
            message: error.message,
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
