/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { createHttpClient } from '../utils/http-client.factory';
import { applyTransform } from '../utils/transformer.util';
import { ROUTE_CONFIG } from '../config/route.config';
import { BaseRequest } from '../models/base-request.model';
import {
  AggregateRouteConfig,
  TargetConfig,
} from 'src/models/route-config.model';
import { Request } from 'express';
import { RouteHandler } from 'src/enum/route-handler.enum';
import { AggregatorType } from 'src/enum/aggregation-type.enum';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { IncomingHttpHeaders } from 'http';
import { inspect } from 'util';
// import Redis from 'ioredis';

@Injectable()
export class ProxyService {
  private readonly tracer = trace.getTracer('experience-middleware');
  private readonly logger = new Logger(ProxyService.name);
  // private readonly redisClient = new Redis({ host: 'localhost', port: 6379 });
  public result: any = '';
  async handleRequest(req: Request) {
    console.log(`Incoming ${req.method} request: ${req.url}`);
    const route = ROUTE_CONFIG.find(
      (r) => r.path === req.path && r.method === req.method,
    );

    if (!route) {
      const activeSpan = trace.getSpan(context.active());
      activeSpan?.setStatus({
        code: SpanStatusCode.ERROR,
        message: `Route config not found for ${req.method} ${req.path}`,
      });
      this.result = JSON.stringify(activeSpan);
      console.log('result', activeSpan);
      this.logger.error(
        `Handling request for route: ${req.method} ${req.path} trace_id: ${inspect(this.result.traceId)} span_id: ${inspect(this.result.spanId)} `,
      );
      throw new Error('Route config not found');
    }

    const activeSpan = trace.getSpan(context.active());
    if (activeSpan) {
      activeSpan.setAttribute('proxy.route', route.path);
      activeSpan.setAttribute('proxy.method', route.method);
      activeSpan.setAttribute(
        'proxy.handler',
        RouteHandler[route.routeHandler],
      );
      this.result = activeSpan.spanContext();
      this.logger.log(
        `Handling request for route: ${req.method} ${req.path} trace_id: ${inspect(this.result.traceId)} span_id: ${inspect(this.result.spanId)} `,
      );
    }

    switch (route.routeHandler) {
      case RouteHandler.TRANSFORM:
        return await this.handleTransformRequest(route.target, req);
      case RouteHandler.AGGREGATE:
        return await this.handleAggregateRequest(route, req);
      default:
        throw new Error('Unsupported route handler');
    }
  }

  private async handleAggregateRequest(
    route: AggregateRouteConfig,
    req: Request,
  ) {
    const activeSpan = trace.getSpan(context.active());
    activeSpan?.setAttribute(
      'proxy.aggregation_type',
      AggregatorType[route.aggregationType],
    );

    switch (route?.aggregationType) {
      case AggregatorType.PARALLEL:
        return await this.handleParallelAggregation(route, req);
      case AggregatorType.SEQUENTIAL:
        return await this.handleSequentialAggregation(route, req);
      default:
        throw new Error('Unsupported aggregation type');
    }
  }

  private async handleParallelAggregation(
    route: AggregateRouteConfig,
    req: Request,
  ) {
    return await this.tracer.startActiveSpan(
      `aggregate.parallel ${route.path}`,
      async (span) => {
        span.setAttribute('proxy.route', route.path);
        span.setAttribute('proxy.aggregation_type', 'PARALLEL');
        span.setAttribute('http.method', req.method);
        span.setAttribute('cache.hit', false);

        try {
          console.log(`Processing PARALLEL request for ${req.url}`);
          // Check for cached data first
          // try {
          //   // const cached = await this.redisClient.get(`${req.url}`);
          //   // if (cached) {
          //   //   console.log(`Returning Cached Response for ${req.url}`);

          //     // Create span for cached response to maintain visibility in Coroot
          //     return await this.tracer.startActiveSpan(
          //       `aggregate.parallel.cached ${route.path}`,
          //       async (span) => {
          //         span.setAttribute('proxy.route', route.path);
          //         span.setAttribute('proxy.aggregation_type', 'PARALLEL');
          //         span.setAttribute('http.method', req.method);
          //         span.setAttribute('cache.hit', true);
          //         span.setAttribute('api.response.data', cached);
          //         span.setAttribute('api.response.size', cached.length);
          //         span.setAttribute('http.status_code', 200); // Cached responses are treated as successful

          //         return JSON.parse(cached);
          //       },
          //     );
          //   }
          // } catch (cacheGetError) {
          //   console.error('Cache Get Error:', cacheGetError);
          // }
          const results = await Promise.allSettled<AggregatedResponse>(
            route.targets.map(
              async (target: TargetConfig): Promise<AggregatedResponse> => {
                try {
                  const responseData = await this.handleTransformRequest(
                    target,
                    req,
                  );
                  return {
                    target: target.name || target.url,
                    success: true,
                    data: responseData,
                  };
                } catch (err: any) {
                  return {
                    target: target.name || target.url,
                    success: false,
                    error: err?.message || String(err),
                    httpStatus: err?.status || 500,
                    downstreamResponse: err?.response?.data || null,
                  };
                }
              },
            ),
          );

          const normalizedResults = results.map((res) =>
            res.status === 'fulfilled'
              ? res.value
              : {
                  success: false,
                  error: 'Unexpected failure',
                },
          );

          span.setAttribute('proxy.parallel.results', normalizedResults.length);
          const finalResult = route.resTransform
            ? await applyTransform(route.resTransform, normalizedResults)
            : normalizedResults;

          // Cache the final result using direct Redis
          // try {
          //   await this.redisClient.setex(
          //     `${req.url}`,
          //     process.env.REDIS_TTL_SECONDS
          //       ? parseInt(process.env.REDIS_TTL_SECONDS)
          //       : 300,
          //     JSON.stringify(finalResult),
          //   );
          //   console.log(`Caching Data for ${req.url}`);
          // } catch (cacheError) {
          //   console.error('Cache Storage Error:', cacheError);
          // }

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
  }

  private async handleSequentialAggregation(
    route: AggregateRouteConfig,
    req: Request,
  ) {
    return await this.tracer.startActiveSpan(
      `aggregate.sequential ${route.path}`,
      async (span) => {
        span.setAttribute('proxy.route', route.path);
        span.setAttribute('proxy.aggregation_type', 'SEQUENTIAL');
        span.setAttribute('http.method', req.method);
        span.setAttribute('cache.hit', false);

        const results: AggregatedResponse[] = [];

        try {
          console.log(`Processing SEQUENTIAL request for ${req.url}`);
          // Check for cached data first
          // try {
          //   const cached = await this.redisClient.get(`${req.url}`);
          //   if (cached) {
          //     console.log(`Returning Cached Response for ${req.url}`);

          //     // Create span for cached response to maintain visibility in Coroot
          //     return await this.tracer.startActiveSpan(
          //       `aggregate.sequential.cached ${route.path}`,
          //       async (span) => {
          //         span.setAttribute('proxy.route', route.path);
          //         span.setAttribute('proxy.aggregation_type', 'SEQUENTIAL');
          //         span.setAttribute('http.method', req.method);
          //         span.setAttribute('cache.hit', true);
          //         span.setAttribute('api.response.data', cached);
          //         span.setAttribute('api.response.size', cached.length);
          //         span.setAttribute('http.status_code', 200); // Cached responses are treated as successful

          //         return JSON.parse(cached);
          //       },
          //     );
          //   }
          // } catch (cacheGetError) {
          //   console.error('Cache Get Error:', cacheGetError);
          // }

          for (const target of route.targets) {
            try {
              const responseData = await this.handleTransformRequest(
                target,
                req,
                results,
              );

              results.push({
                target: target.name || target.url,
                success: true,
                data: responseData,
              });
            } catch (err: any) {
              results.push({
                target: target.name || target.url,
                success: false,
                error: err?.message || String(err),
                httpStatus: err?.status || 500,
                downstreamResponse: err?.response?.data || null,
              });
              span.addEvent('sequential.stop', {
                'proxy.target': target.name || target.url,
              });
              break;
            }
          }

          span.setAttribute('proxy.sequential.results', results.length);
          const finalResult = route.resTransform
            ? await applyTransform(route.resTransform, results)
            : results;

          // Cache the final result using direct Redis
          // try {
          //   await this.redisClient.setex(
          //     `${req.url}`,
          //     process.env.REDIS_TTL_SECONDS
          //       ? parseInt(process.env.REDIS_TTL_SECONDS)
          //       : 300,
          //     JSON.stringify(finalResult),
          //   );
          //   console.log(`Caching Data for ${req.url}`);
          // } catch (cacheError) {
          //   console.error('Cache Storage Error:', cacheError);
          // }

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
  }

  private async handleTransformRequest(
    target: TargetConfig,
    req: Request,
    prevResponses?: AggregatedResponse[],
  ) {
    // Check for cached data first
    // try {
    //   const cached = await this.redisClient.get(`${req.url}`);
    //   if (cached) {
    //     console.log(`Returning Cached Response for ${req.url}`);

    //     // Create span for cached response to maintain visibility in Coroot
    //     return await this.tracer.startActiveSpan(
    //       `proxy.transform.cached ${target.name || target.url}`,
    //       async (span) => {
    //         span.setAttribute('proxy.route', req.path);
    //         span.setAttribute('proxy.target', target.name || target.url);
    //         span.setAttribute('http.method', target.method);
    //         span.setAttribute('cache.hit', true);
    //         span.setAttribute('api.response.data', cached);
    //         span.setAttribute('api.response.size', cached.length);
    //         span.setAttribute('http.status_code', 200); // Cached responses are treated as successful

    //         return JSON.parse(cached);
    //       },
    //     );
    //   }
    // } catch (cacheGetError) {
    //   console.error('Cache Get Error:', cacheGetError);
    // }

    return await this.tracer.startActiveSpan(
      `proxy.transform ${target.name || target.url}`,
      async (span) => {
        span.setAttribute('proxy.route', req.path);
        span.setAttribute('proxy.target', target.name || target.url);
        span.setAttribute('http.method', target.method);
        span.setAttribute('cache.hit', false);

        try {
          const transformedRequestBody: BaseRequest =
            await this.buildRequestFromSource(
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
              span.setAttribute(
                'api.response.preview',
                responseStr.substring(0, 1000) + '...',
              );
              span.setAttribute('api.response.truncated', true);
            } else {
              span.setAttribute('api.response.data', responseStr);
            }
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
            span.setAttribute(
              'http.error.message',
              response.statusText || 'Unknown error',
            );
          }
          // Cache the response data using direct Redis
          // try {
          //   await this.redisClient.setex(
          //     `${req.url}`,
          //     process.env.REDIS_TTL_SECONDS
          //       ? parseInt(process.env.REDIS_TTL_SECONDS)
          //       : 300,
          //     JSON.stringify(responseData),
          //   );
          //   console.log(`Caching Data for ${req.url}`);
          // } catch (cacheError) {
          //   console.error('Cache Storage Error:', cacheError);
          // }

          return responseData;
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });

          // Add error response data if available (for network errors, timeouts, etc.)
          if (err && typeof err === 'object' && 'response' in err) {
            const errorResponse = (err as any).response;
            if (errorResponse) {
              span.setAttribute('http.status_code', errorResponse.status);
              span.setAttribute('http.error', true);
              span.setAttribute('http.error.status', errorResponse.status);
              span.setAttribute(
                'http.error.message',
                errorResponse.statusText || 'Network Error',
              );

              // Capture error response body if available
              if (errorResponse.data) {
                const errorDataStr = JSON.stringify(errorResponse.data);
                span.setAttribute(
                  'api.error.response.size',
                  errorDataStr.length,
                );

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
            }
          }

          throw err;
        }
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
  private requiredQuery(
    query: any,
    requiredParams: string[] | undefined,
  ): string {
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