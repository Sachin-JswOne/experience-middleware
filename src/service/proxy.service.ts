import { Inject, Injectable, Logger } from '@nestjs/common';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { createHttpClient } from '../utils/http-client.factory';
import * as Sentry from '@sentry/nestjs';
import { applyTransform } from '../utils/transformer.util';
import { ROUTE_CONFIG } from '../config/route.config';
import { BaseRequest } from '../models/base-request.model';
import {
  AggregateRouteConfig,
  ConditionalRouteConfig,
  TargetConfig,
} from 'src/models/route-config.model';
import { Request } from 'express';
import { RouteHandler } from 'src/enum/route-handler.enum';
import { AggregatorType } from 'src/enum/aggregation-type.enum';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { IncomingHttpHeaders } from 'http';
import { inspect } from 'util';
import { CustomError } from 'src/utils/CustomError';
import { match } from 'path-to-regexp';
import Redis from 'ioredis';

@Injectable()
export class ProxyService {
  private readonly tracer = trace.getTracer('experience-middleware');
  private readonly logger = new Logger(ProxyService.name);
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) { }
  // constructor() { }

  private getCacheKey(req: Request): string {
    const explicitKey =
      (req.headers['x-cache-key'] as string | undefined) ??
      (req.headers['x-cachekey'] as string | undefined);

    if (explicitKey && explicitKey.trim().length > 0) {
      return `:${explicitKey.trim()}`;
    }

    const methodPart = req.method;
    const pathPart = req.path;

    const query = (req.query ?? {}) as Record<string, unknown>;
    const queryEntries = Object.entries(query).sort(([a], [b]) =>
      String(a).localeCompare(String(b)),
    );

    const queryString = queryEntries
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          // sort array values for stability
          return value
            .slice()
            .sort()
            .map((v) => `${key}=${v}`)
            .join('&');
        }
        return `${key}=${value}`;
      })
      .join('&');

    const queryPart = queryString ? `q:${queryString}` : 'q:';

    return `:m:${methodPart}|p:${pathPart}|${queryPart}`;
  }

  private routeNeedsClientAuth(route: any): boolean {
    const hasAuthHeaderPassThrough = (headersToPass?: any[]) =>
      Array.isArray(headersToPass) &&
      headersToPass.some(
        (h) => String(h?.source).toLowerCase() === 'authorization' || 'access_token',
      );

    // TRANSFORM routes
    if (route?.target && hasAuthHeaderPassThrough(route.target.headersToPass)) {
      return true;
    }

    // AGGREGATE / CONDITIONAL routes
    if (Array.isArray(route?.targets)) {
      return route.targets.some((t: any) => hasAuthHeaderPassThrough(t?.headersToPass));
    }

    return false;
  }

  public result: any = '';
  async handleRequest(req: Request) {
    return await Sentry.startSpan(
      {
        name: 'proxy.handleRequest',
        op: 'proxy.request',
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
          'http.path': req.path,
        },
      },
      async () => {
        console.log(`Incoming ${req.method} request: ${req.url}`);
        const route = await this.findRouteWithTracing(req);

        if (!route) {
          const activeSpan = trace.getSpan(context.active());
          activeSpan?.setStatus({
            code: SpanStatusCode.ERROR,
            message: `Route config not found for ${req.method} ${req.path}`,
          });
          const spanContext = activeSpan?.spanContext();
          this.result = spanContext
            ? {
              traceId: spanContext.traceId,
              spanId: spanContext.spanId,
            }
            : {};
          this.logger.error(
            `Route config not found for ${req.method} ${req.path} trace_id: ${inspect(this.result.traceId)} span_id: ${inspect(this.result.spanId)} `,
          );

          // Capture in Sentry
          Sentry.captureException(new Error('Route config not found'), {
            tags: {
              route_method: req.method,
              route_path: req.path,
            },
          });

          throw new Error('Route config not found');
        }

        const needsAuth = this.routeNeedsClientAuth(route);
        if (needsAuth) {
          const authHeader = req.headers?.authorization || req.headers?.access_token;
          const userState = req.headers?.['x-user-state'];

          if (!authHeader && userState !== 'G') {
            const authError = new CustomError('Bad Request: Authorization required', 400);
            Sentry.captureException(authError, {
              tags: {
                error_type: 'auth_required',
                route_path: req.path,
              },
            });
            throw authError;
          }
        }

        const isCacheRequired = (route as any).isCacheRequired === true;
        let cacheKey: string | null = null;

        if (isCacheRequired) {
          cacheKey = this.getCacheKey(req);
          await Sentry.startSpan(
            { name: 'cache.get', op: 'cache.get', attributes: { cache_key: cacheKey } },
            async () => {
              try {
                const cached = await this.redis.get(cacheKey!);
                if (cached) {
                  console.log(`**Cache HIT for ${cacheKey}`);
                  Sentry.addBreadcrumb({
                    category: 'cache',
                    message: 'Cache hit',
                    level: 'info',
                    data: { cache_key: cacheKey },
                  });
                  return JSON.parse(cached);
                }
                console.log(`**Cache MISS for ${cacheKey}`);
                Sentry.addBreadcrumb({
                  category: 'cache',
                  message: 'Cache miss',
                  level: 'info',
                  data: { cache_key: cacheKey },
                });
              } catch (err) {
                // Don't break the request if Redis is unhappy; just log and continue
                console.error('Redis GET error, bypassing cache:', err);
                Sentry.captureException(err as Error, {
                  tags: { error_type: 'redis_get_error' },
                });
              }
            },
          );
        } else {
          console.log(
            `Caching disabled for route ${req.method} ${route.path} (isCacheRequired=false)`,
          );
        }

        const activeSpan = trace.getSpan(context.active());
        if (activeSpan) {
          activeSpan.setAttribute('proxy.route', route.path);
          activeSpan.setAttribute('proxy.method', route.method);
          activeSpan.setAttribute('proxy.handler', RouteHandler[route.routeHandler]);
          this.result = activeSpan.spanContext();
          this.logger.log(
            `Handling request for route: ${req.method} ${req.path} trace_id: ${inspect(this.result.traceId)} span_id: ${inspect(this.result.spanId)} `,
          );
        }

        // Set Sentry tags for better filtering
        Sentry.setTag('route.path', route.path);
        Sentry.setTag('route.method', route.method);
        Sentry.setTag('route.handler', RouteHandler[route.routeHandler]);

        let data: any;

        switch (route.routeHandler) {
          case RouteHandler.TRANSFORM:
            data = await this.handleTransformRequest(route.target, req);
            break;
          case RouteHandler.AGGREGATE:
            data = await this.handleAggregateRequest(route, req);
            break;
          case RouteHandler.CONDITIONAL:
            data = await this.handleConditionalRequest(route, req);
            break;
          default:
            const unsupportedError: Error = new Error('Unsupported route handler');
            Sentry.captureException(unsupportedError, {
              tags: { route_handler: (route as any).routeHandler },
            });
            throw unsupportedError;
        }

        if (isCacheRequired && cacheKey) {
          await Sentry.startSpan(
            { name: 'cache.set', op: 'cache.set', attributes: { cache_key: cacheKey } },
            async () => {
              try {
                const ttlSeconds = process.env.CACHE_TTL_SECONDS
                  ? parseInt(process.env.CACHE_TTL_SECONDS, 10)
                  : 30 * 60;

                await this.redis.set(cacheKey!, JSON.stringify(data), 'EX', ttlSeconds);
                console.log(`**Cached response for ${cacheKey}`);
                Sentry.addBreadcrumb({
                  category: 'cache',
                  message: 'Cache set',
                  level: 'info',
                  data: { cache_key: cacheKey, ttl: ttlSeconds },
                });
              } catch (err) {
                console.error('Redis SET error, continuing without cache:', err);
                Sentry.captureException(err as Error, {
                  tags: { error_type: 'redis_set_error' },
                });
              }
            },
          );
        }

        return data;
      },
    );
  }

  private async findRouteWithTracing(req: Request) {
    return await Sentry.startSpan(
      { name: 'proxy.findRoute', op: 'proxy.route_matching' },
      async () => {
        return this.findRoute(req);
      },
    );
  }

  private findRoute(req: Request) {
    for (const route of ROUTE_CONFIG) {
      if (route.method !== req.method) {
        continue;
      }

      const routeMatcher = match(route.path, { decode: decodeURIComponent });
      const result = routeMatcher(req.path);

      if (result) {
        req.params = { ...req.params, ...(result.params as any) };
        return route;
      }
    }
    return undefined;
  }
  private async handleConditionalRequest(route: ConditionalRouteConfig, req: Request) {
    return await Sentry.startSpan(
      {
        name: 'proxy.conditional',
        op: 'proxy.conditional',
        attributes: { route_path: route.path },
      },
      async () => {
        const activeSpan = trace.getSpan(context.active());
        activeSpan?.setAttribute('proxy.route_handler', RouteHandler.CONDITIONAL);

        const targetName = await applyTransform(route.conditionTransform, req);
        const targetToExecute = route.targets.find((t) => t.name === targetName);

        if (!targetToExecute) {
          const error = new Error(
            `Conditional target '${targetName}' not found in route config for path '${route.path}'`,
          );
          Sentry.captureException(error, {
            tags: {
              route_path: route.path,
              target_name: targetName,
            },
          });
          throw error;
        }

        activeSpan?.setAttribute('proxy.conditional.selected_target', targetName);
        Sentry.setTag('conditional.target', targetName);
        Sentry.addBreadcrumb({
          category: 'proxy.conditional',
          message: `Selected target: ${targetName}`,
          level: 'info',
        });

        return this.handleTransformRequest(targetToExecute, req);
      },
    );
  }

  private async handleAggregateRequest(route: AggregateRouteConfig, req: Request) {
    return await Sentry.startSpan(
      {
        name: 'proxy.aggregate',
        op: 'proxy.aggregate',
        attributes: {
          route_path: route.path,
          aggregation_type: AggregatorType[route.aggregationType],
        },
      },
      async () => {
        const activeSpan = trace.getSpan(context.active());
        activeSpan?.setAttribute('proxy.aggregation_type', AggregatorType[route.aggregationType]);

        Sentry.setTag('aggregation.type', AggregatorType[route.aggregationType]);

        switch (route?.aggregationType) {
          case AggregatorType.PARALLEL:
            return await this.handleParallelAggregation(route, req);
          case AggregatorType.SEQUENTIAL:
            return await this.handleSequentialAggregation(route, req);
          default:
            const error = new Error('Unsupported aggregation type');
            Sentry.captureException(error, {
              tags: { aggregation_type: route.aggregationType },
            });
            throw error;
        }
      },
    );
  }

  private async handleParallelAggregation(route: AggregateRouteConfig, req: Request) {
    return await this.tracer.startActiveSpan(`aggregate.parallel ${route.path}`, async (span) => {
      span.setAttribute('proxy.route', route.path);
      span.setAttribute('proxy.aggregation_type', 'PARALLEL');
      span.setAttribute('http.method', req.method);
      span.setAttribute('cache.hit', false);

      // Add Sentry span for parallel aggregation
      return await Sentry.startSpan(
        {
          name: 'aggregate.parallel',
          op: 'aggregate.parallel',
          attributes: {
            route_path: route.path,
            target_count: route.targets.length,
          },
        },
        async () => {
          try {
            console.log(`Processing PARALLEL request for ${req.url}`);
            Sentry.addBreadcrumb({
              category: 'aggregate.parallel',
              message: `Processing ${route.targets.length} targets in parallel`,
              level: 'info',
            });

            const results = await Promise.allSettled<AggregatedResponse>(
              route.targets.map(async (target: TargetConfig): Promise<AggregatedResponse> => {
                try {
                  const responseData = await this.handleTransformRequest(target, req);
                  return {
                    target: target.name || target.url,
                    success: true,
                    data: responseData,
                  };
                } catch (err: any) {
                  // Capture individual target failure
                  Sentry.addBreadcrumb({
                    category: 'aggregate.parallel.target_error',
                    message: `Target ${target.name || target.url} failed`,
                    level: 'error',
                    data: {
                      target: target.name || target.url,
                      error: err?.message,
                    },
                  });

                  return {
                    target: target.name || target.url,
                    success: false,
                    error: err?.message || String(err),
                    httpStatus: err?.status || 500,
                    downstreamResponse: err?.response?.data || null,
                    customError: err instanceof CustomError ? err : null,
                  };
                }
              }),
            );

            const normalizedResults = results.map((res) =>
              res.status === 'fulfilled'
                ? res.value
                : {
                  success: false,
                  error: 'Unexpected failure',
                },
            );
            const isAggregatedResponse = (r: any): r is AggregatedResponse =>
              'target' in r && 'success' in r;

            const unauthorized = normalizedResults.find(
              (r): r is AggregatedResponse =>
                isAggregatedResponse(r) && (r.httpStatus === 401 || r.httpStatus === 403),
            );

            if (unauthorized) {
              const error: any = new CustomError(
                `Authorization error from target: ${unauthorized.target}`,
                500,
              );
              error.httpStatusCode = unauthorized.httpStatus;
              error.downstreamResponse = unauthorized.downstreamResponse;

              Sentry.captureException(error, {
                tags: {
                  error_type: 'authorization_error',
                  target: unauthorized.target,
                  status_code: unauthorized.httpStatus,
                },
              });

              throw error;
            }

            span.setAttribute('proxy.parallel.results', normalizedResults.length);
            const successCount = normalizedResults.filter((r: any) => r.success).length;
            const failureCount = normalizedResults.length - successCount;

            span.setAttribute('parallel.success_count', successCount);
            span.setAttribute('parallel.failure_count', failureCount);

            const finalResult = route.resTransform
              ? await applyTransform(route.resTransform, normalizedResults)
              : normalizedResults;

            return finalResult;
          } catch (err) {
            span.recordException(err as Error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err instanceof Error ? err.message : String(err),
            });
            throw err;
          }
        },
      );
    });
  }

  private async handleSequentialAggregation(route: AggregateRouteConfig, req: Request) {
    return await this.tracer.startActiveSpan(`aggregate.sequential ${route.path}`, async (span) => {
      span.setAttribute('proxy.route', route.path);
      span.setAttribute('proxy.aggregation_type', 'SEQUENTIAL');
      span.setAttribute('http.method', req.method);
      span.setAttribute('cache.hit', false);

      return await Sentry.startSpan(
        {
          name: 'aggregate.sequential',
          op: 'aggregate.sequential',
          attributes: {
            route_path: route.path,
            target_count: route.targets.length,
          },
        },
        async () => {
          const results: AggregatedResponse[] = [];

          try {
            console.log(`Processing SEQUENTIAL request for ${req.url}`);
            Sentry.addBreadcrumb({
              category: 'aggregate.sequential',
              message: `Processing ${route.targets.length} targets sequentially`,
              level: 'info',
            });

            for (const target of route.targets) {
              try {
                const responseData = await this.handleTransformRequest(target, req, results);

                results.push({
                  target: target.name || target.url,
                  success: true,
                  data: responseData,
                });

                Sentry.addBreadcrumb({
                  category: 'aggregate.sequential.target_success',
                  message: `Target ${target.name || target.url} succeeded`,
                  level: 'info',
                });
              } catch (err: any) {
                results.push({
                  target: target.name || target.url,
                  success: false,
                  error: err?.message || String(err),
                  httpStatus: err?.status || 500,
                  downstreamResponse: err?.response?.data || null,
                });
                span.addEvent('sequential.target.failed', {
                  'proxy.target': target.name || target.url,
                  'proxy.error': err?.message || String(err),
                });

                Sentry.addBreadcrumb({
                  category: 'aggregate.sequential.target_error',
                  message: `Target ${target.name || target.url} failed`,
                  level: 'error',
                  data: {
                    target: target.name || target.url,
                    error: err?.message,
                  },
                });
              }
            }

            span.setAttribute('proxy.sequential.results', results.length);
            const successCount = results.filter((r) => r.success).length;
            const failureCount = results.length - successCount;

            span.setAttribute('sequential.success_count', successCount);
            span.setAttribute('sequential.failure_count', failureCount);

            const finalResult = route.resTransform
              ? await applyTransform(route.resTransform, results)
              : results;

            return finalResult;
          } catch (err) {
            span.recordException(err as Error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err instanceof Error ? err.message : String(err),
            });
            throw err;
          }
        },
      );
    });
  }

  private async handleTransformRequest(
    target: TargetConfig,
    req: Request,
    prevResponses?: AggregatedResponse[],
  ) {
    return await this.tracer.startActiveSpan(
      `proxy.transform ${target.name || target.url}`,
      async (span) => {
        span.setAttribute('proxy.route', req.path);
        span.setAttribute('proxy.target', target.name || target.url);
        span.setAttribute('http.method', target.method);
        span.setAttribute('cache.hit', false);

        return await Sentry.startSpan(
          {
            name: `http.request ${target.name || target.url}`,
            op: 'http.client',
            attributes: {
              'http.method': target.method,
              'http.url': target.url,
              target_name: target.name || target.url,
            },
          },
          async () => {
            try {
              Sentry.addBreadcrumb({
                category: 'http.request',
                message: `Making request to ${target.name || target.url}`,
                level: 'info',
                data: {
                  method: target.method,
                  url: target.url,
                },
              });

              const transformedRequestBody: BaseRequest = await this.buildRequestFromSource(
                req,
                target.url,
                target.reqTransform,
                target.headersToPass,
                target.staticHeaders,
                target.requiredParams,
                prevResponses,
              );

              const client = await createHttpClient(
                target.timeout?.request || 5000,
                target.timeout?.socket || 1000,
                target.interceptors,
              );

              const response = await client.request({
                url: transformedRequestBody.url.href,
                method: target.method,
                data: transformedRequestBody.body,
                headers: transformedRequestBody.headers,
              });

              span.setAttribute('http.status_code', response.status);

              // Add response data to span for Coroot visibility (works for both success and error responses)
              const responseData = target.resTransform
                ? await applyTransform(target.resTransform, response.data)
                : response.data;

              // Add response data as span attributes
              if (responseData) {
                const responseStr = JSON.stringify(responseData);
                span.setAttribute('api.response.size', responseStr.length);

                if (responseStr.length > 1000) {
                  span.setAttribute('api.response.preview', responseStr.substring(0, 1000) + '...');
                  span.setAttribute('api.response.truncated', true);
                } else {
                  span.setAttribute('api.response.data', responseStr);
                }
              }

              if (response.status === 401 || response.status === 403) {
                const error = new CustomError(
                  `Downstream service (${target.name || target.url}) returned ${response.status}`,
                  500,
                ) as any;
                error.status = response.status;
                error.response = response;

                Sentry.captureException(error, {
                  tags: {
                    error_type: 'downstream_auth_error',
                    target: target.name || target.url,
                    status_code: response.status,
                  },
                });

                throw error;
              }

              // Handle error status codes (4xx, 5xx) but still return the response data
              if (response.status >= 400) {
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: `HTTP ${response.status}: ${response.statusText || 'Error'}`,
                });
                // Add error-specific attributes
                span.setAttribute('http.error', true);
                span.setAttribute('http.error.status', response.status);
                span.setAttribute('http.error.message', response.statusText || 'Unknown error');

                Sentry.addBreadcrumb({
                  category: 'http.error',
                  message: `HTTP ${response.status} from ${target.name || target.url}`,
                  level: 'warning',
                  data: {
                    status: response.status,
                    statusText: response.statusText,
                  },
                });
              } else {
                Sentry.addBreadcrumb({
                  category: 'http.response',
                  message: `Successful response from ${target.name || target.url}`,
                  level: 'info',
                  data: {
                    status: response.status,
                  },
                });
              }

              return responseData;
            } catch (err) {
              span.recordException(err as Error);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err instanceof Error ? err.message : String(err),
              });

              // Add error response data if available (for network errors, timeouts, etc.)
              if (err && typeof err === 'object' && 'response' in err) {
                const errorResponse = err.response;
                if (errorResponse) {
                  span.setAttribute('http.status_code', errorResponse.status);
                  span.setAttribute('http.error', true);
                  span.setAttribute('http.error.status', errorResponse.status);
                  span.setAttribute('http.error.message', errorResponse.statusText || 'Network Error');

                  // Capture error response body if available
                  if (errorResponse.data) {
                    const errorDataStr = JSON.stringify(errorResponse.data);
                    span.setAttribute('api.error.response.size', errorDataStr.length);

                    if (errorDataStr.length > 1000) {
                      span.setAttribute(
                        'api.error.response.preview',
                        errorDataStr.substring(0, 1000) + '...',
                      );
                      span.setAttribute('api.error.response.truncated', true);
                    } else {
                      span.setAttribute('api.error.response.data', errorDataStr);
                    }
                  }

                  if (errorResponse.status === 401 || errorResponse.status === 403) {
                    const authError = new CustomError(
                      `Authorization error from target: ${target.name || target.url}`,
                      500,
                    ) as any;
                    authError.httpStatusCode = errorResponse.status;
                    authError.response = errorResponse;

                    Sentry.captureException(authError, {
                      tags: {
                        error_type: 'downstream_auth_error',
                        target: target.name || target.url,
                        status_code: errorResponse.status,
                      },
                    });

                    throw authError;
                  }

                  // Capture HTTP error
                  Sentry.captureException(err as Error, {
                    tags: {
                      error_type: 'http_error',
                      target: target.name || target.url,
                      status_code: errorResponse.status,
                    },
                    contexts: {
                      response: {
                        status: errorResponse.status,
                        data: errorResponse.data,
                      },
                    },
                  });
                }
              } else {
                // Capture non-HTTP errors (network, timeout, etc.)
                Sentry.captureException(err as Error, {
                  tags: {
                    error_type: 'network_error',
                    target: target.name || target.url,
                  },
                });
              }

              throw err;
            }
          },
        );
      },
    );
  }

  private async buildRequestFromSource(
    req: Request,
    targetUrl: string,
    requestTransform?: string,
    headersToPass?: { source: string; destination: string }[],
    staticHeaders?: { [key: string]: string },
    requiredParams?: string[],
    prevResponses?: AggregatedResponse[],
  ) {
    const url: URL = new URL(targetUrl);
    url.search = this.requiredQuery(req.query, requiredParams);
    let transformedRequestBody: BaseRequest = {
      url: url,
      body: req.body,
      headers: this.getHeadersToPass(req.headers, headersToPass, staticHeaders),
      params: req.params,
    };

    if (requestTransform) {
      transformedRequestBody = await applyTransform(
        requestTransform,
        transformedRequestBody,
        prevResponses,
      );
    }
    return transformedRequestBody;
  }
  private requiredQuery(query: any, requiredParams: string[] | undefined): string {
    if (!requiredParams || requiredParams.length === 0) {
      return '';
    }
    if (requiredParams[0] === '*') {
      return new URLSearchParams(query).toString();
    }
    const allParams = new URLSearchParams(query);
    const filteredParams = new URLSearchParams();

    requiredParams.forEach((key) => {
      allParams.getAll(key).forEach((val) => {
        filteredParams.append(key, val);
      });
    });

    return filteredParams.toString();
  }

  private getHeadersToPass(
    reqHeaders: IncomingHttpHeaders,
    headersToPass?: { source: string; destination: string }[],
    staticHeaders?: { [key: string]: string },
  ): IncomingHttpHeaders {
    let headers: IncomingHttpHeaders = {};
    if (headersToPass && headersToPass.length > 0) {
      for (const header of headersToPass) {
        if (reqHeaders[header.source]) {
          headers[header.destination] = reqHeaders[header.source];
        }
      }
    }
    if (staticHeaders) {
      headers = { ...headers, ...staticHeaders };
    }

    return headers;
  }
}
