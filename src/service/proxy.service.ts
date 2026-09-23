/* eslint-disable no-useless-catch */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { createHttpClient } from '../utils/http-client.factory';
import { applyTransform } from '../utils/transformer.util';
import { ROUTE_CONFIG } from '../config/route.config';
import { BaseRequest } from '../models/base-request.model';
import { safeToLog } from 'src/utils/common-functions.util';
import {
  AggregateRouteConfig,
  ConditionalRouteConfig,
  PassThroughRouteConfig,
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
import { CacheService } from '../cache/cache.service';
import { CacheProvider } from 'src/cache/cache-provider.type';
import { isTargetMocked, loadMockResponse } from '../utils/mock.util';
import axios from 'axios';
import { createHash } from 'crypto';

@Injectable()
export class ProxyService {
  private readonly tracer = trace.getTracer('experience-middleware');
  private readonly logger = new Logger(ProxyService.name);
  constructor(private readonly cacheService: CacheService) {}
  // constructor() { }

  private getCacheUserIdentifier(req: Request): string {
    const authorization = this.getHeaderValue(req.headers.authorization);
    const accessToken = this.getHeaderValue(req.headers.access_token);
    const rawToken = accessToken || authorization;

    if (rawToken) {
      const token = rawToken.replace(/^Bearer\s+/i, '').trim();
      if (token) {
        // Use a short, collision-resistant hash instead of a suffix
        return createHash('sha256').update(token).digest('hex').slice(0, 16);
      }
    }

    const directSessionId = this.getHeaderValue(req.headers['jsw_session_id']);
    if (directSessionId) {
      return createHash('sha256').update(directSessionId).digest('hex').slice(0, 16);
    }

    const cookieSessionId = this.extractCookie(req.headers.cookie, 'jsw_session_id');
    if (cookieSessionId) {
      return createHash('sha256').update(cookieSessionId).digest('hex').slice(0, 16);
    }
    // NOTE: 'anonymous' cache partition is shared across ALL unauthenticated
    // requests. Only use VALKEY/AUTO caching for endpoints that return
    // identical responses for all unauthenticated users.
    return 'anonymous';
  }

  private getCacheKey(req: Request): string {
    const env =
      process.env.CACHE_PROFILE || process.env.VALKEY_PROFILE || process.env.NODE_ENV || 'local';

    const apiEndpoint = req.path.replace(/^\/xp-mi\/public\//, '').replace(/\//g, ':');

    const userIdentifier = this.getCacheUserIdentifier(req);

    return `${env}:experience-middleware:${apiEndpoint}:${userIdentifier}`;
  }

  private getHeaderValue(value: string | string[] | undefined): string | null {
    if (Array.isArray(value)) {
      return value[0]?.trim() || null;
    }

    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private lastCharacters(value: string, length: number): string {
    return value.length <= length ? value : value.slice(-length);
  }

  private extractCookie(
    cookieHeader: string | string[] | undefined,
    cookieName: string,
  ): string | null {
    const rawCookie = this.getHeaderValue(cookieHeader);

    if (!rawCookie) {
      return null;
    }

    const cookies = rawCookie.split(';');

    for (const cookie of cookies) {
      const separatorIndex = cookie.indexOf('=');

      if (separatorIndex === -1) {
        continue;
      }

      const name = cookie.slice(0, separatorIndex).trim();
      const value = cookie.slice(separatorIndex + 1).trim();

      if (name === cookieName) {
        return value || null;
      }
    }

    return null;
  }

  async handleRequest(req: Request) {
    this.logger.debug(`Incoming ${req.method} request: ${req.url}`);
    const route = this.findRoute(req);

    if (!route) {
      const activeSpan = trace.getSpan(context.active());
      activeSpan?.setStatus({
        code: SpanStatusCode.ERROR,
        message: `Route config not found for ${req.method} ${req.path}`,
      });

      const spanContext = activeSpan?.spanContext();
      const traceId = (req as any).traceId || spanContext?.traceId || '';
      const spanId = (req as any).spanId || spanContext?.spanId || '';

      this.logger.error(
        `Route config not found for ${req.method} ${req.path} trace_id: ${inspect(traceId)} span_id: ${inspect(spanId)}`,
      );

      throw new Error('Route config not found');
    }

    const cacheTtlSeconds = Number(
      (route as any).cache?.ttlSeconds ?? process.env.CACHE_TTL_SECONDS ?? 1800,
    );

    const activeSpan = trace.getSpan(context.active());
    const spanContext = activeSpan?.spanContext();
    const traceId = (req as any).traceId || spanContext?.traceId || '';
    const spanId = (req as any).spanId || spanContext?.spanId || '';

    if (activeSpan) {
      activeSpan.setAttribute('proxy.route', route.path);
      activeSpan.setAttribute('proxy.method', route.method);
      activeSpan.setAttribute('proxy.handler', RouteHandler[route.routeHandler]);
    }

    this.logger.log(
      `Handling request for route: ${req.method} ${req.path} trace_id: ${inspect(traceId)} span_id: ${inspect(spanId)}`,
    );

    const isCacheRequired = (route as any).isCacheRequired === true;

    const cacheProvider = ((route as any).cacheProvider ||
      process.env.CACHE_PROVIDER ||
      'AUTO') as CacheProvider;

    const ttlSeconds = Number(
      (route as any).cacheTTLSeconds || process.env.CACHE_TTL_SECONDS || 300,
    );

    let cacheKey: string | null = null;

    if (isCacheRequired && cacheProvider !== 'NONE' && process.env.CACHE_ENABLED === 'true') {
      cacheKey = this.getCacheKey(req);

      const cached = await this.cacheService.get(cacheKey, cacheProvider);

      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          await this.cacheService.del(cacheKey);
          this.logger.warn(`Corrupt cache value evicted key=${cacheKey}`);
        }
      }
      this.logger.log(`Cache MISS key=${cacheKey} provider=${cacheProvider}`);
    }

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
      case RouteHandler.PASS_THROUGH:
        data = await this.handlePassThroughRequest(route, req);
        break;
      default:
        throw new Error('Unsupported route handler');
    }

    if (
      isCacheRequired &&
      cacheKey &&
      cacheProvider !== 'NONE' &&
      process.env.CACHE_ENABLED === 'true'
    ) {
      await this.cacheService.set(cacheKey, JSON.stringify(data), ttlSeconds, cacheProvider);
    }

    return data;
  }
  handlePassThroughRequest(route: PassThroughRouteConfig, req: Request): any {
    return route.response;
  }

  private findRoute(req: Request) {
    for (const route of ROUTE_CONFIG) {
      if (route.method !== req.method) {
        continue;
      }

      const normalized = this.normalizePathTemplate(route.path);
      const routeMatcher = match(normalized, { decode: decodeURIComponent });
      const result = routeMatcher(req.path);

      if (result) {
        req.params = { ...req.params, ...(result.params as any) };
        return route;
      }
    }
    return undefined;
  }
  private async handleConditionalRequest(route: ConditionalRouteConfig, req: Request) {
    const activeSpan = trace.getSpan(context.active());
    activeSpan?.setAttribute('proxy.route_handler', RouteHandler.CONDITIONAL);

    const targetName = await applyTransform(route.conditionTransform, req);
    const targetToExecute = route.targets.find((t) => t.name === targetName);

    if (!targetToExecute) {
      throw new Error(
        `Conditional target '${targetName}' not found in route config for path '${route.path}'`,
      );
    }

    activeSpan?.setAttribute('proxy.conditional.selected_target', targetName);
    return this.handleTransformRequest(targetToExecute, req);
  }

  private async handleAggregateRequest(route: AggregateRouteConfig, req: Request) {
    const activeSpan = trace.getSpan(context.active());
    activeSpan?.setAttribute('proxy.aggregation_type', AggregatorType[route.aggregationType]);

    switch (route?.aggregationType) {
      case AggregatorType.PARALLEL:
        return await this.handleParallelAggregation(route, req);
      case AggregatorType.SEQUENTIAL:
        return await this.handleSequentialAggregation(route, req);
      case AggregatorType.SEQUENTIAL_THEN_PARALLEL:
        return await this.handleSequentialThenParallelAggregation(route, req);
      default:
        throw new Error('Unsupported aggregation type');
    }
  }

  private async handleSequentialThenParallelAggregation(route: AggregateRouteConfig, req: Request) {
    return await this.tracer.startActiveSpan(
      `aggregate.sequential-then-parallel ${route.path}`,
      async (span) => {
        span.setAttribute('proxy.route', route.path);
        span.setAttribute('proxy.aggregation_type', 'SEQUENTIAL_THEN_PARALLEL');
        span.setAttribute('http.method', req.method);
        span.setAttribute('cache.hit', false);
        const results: AggregatedResponse[] = [];
        this.logger.log(`Processing SEQUENTIAL_THEN_PARALLEL request for ${req.url}`);

        // First target executes alone
        const firstTarget = route.targets[0];

        const firstResponse = await this.handleTransformRequest(firstTarget, req, []);

        results.push({
          target: firstTarget.name || firstTarget.url,
          success: true,
          data: firstResponse,
        });

        // All remaining targets get CMS response
        const previousResponses = [...results];

        const parallelResults = await Promise.allSettled(
          route.targets.slice(1).map(async (target) => {
            try {
              const responseData = await this.handleTransformRequest(
                target,
                req,
                previousResponses,
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
                httpStatus: err?.httpStatusCode || err?.status || 500,
                downstreamResponse: err?.response?.data || null,
              };
            }
          }),
        );

        const normalizedResults: AggregatedResponse[] = parallelResults.map((r, index) =>
          r.status === 'fulfilled'
            ? r.value
            : {
                target: route.targets[index + 1].name || route.targets[index + 1].url,
                success: false,
                error: 'Unexpected failure',
                httpStatus: 500,
              },
        );
        results.push(...normalizedResults);

        return route.resTransform ? await applyTransform(route.resTransform, results) : results;
      },
    );
  }

  private async handleParallelAggregation(route: AggregateRouteConfig, req: Request) {
    return await this.tracer.startActiveSpan(`aggregate.parallel ${route.path}`, async (span) => {
      span.setAttribute('proxy.route', route.path);
      span.setAttribute('proxy.aggregation_type', 'PARALLEL');
      span.setAttribute('http.method', req.method);
      span.setAttribute('cache.hit', false);

      try {
        this.logger.log(`Processing PARALLEL request for ${req.url}`);
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
              return {
                target: target.name || target.url,
                success: false,
                error: err?.message || String(err),
                httpStatus: err?.httpStatusCode || err?.status || 500,
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

        if (unauthorized && !route.continueOnUnauthorized) {
          const error: any = new CustomError(
            `Authorization error from target: ${unauthorized.target}`,
            500,
          );
          error.httpStatusCode = unauthorized.httpStatus;
          error.downstreamResponse = unauthorized.downstreamResponse;
          throw error;
        }

        if (unauthorized) {
          this.logger.warn(
            `[AGGREGATE] target=${unauthorized.target} route=${route.path} returned ${unauthorized.httpStatus}; continuing with remaining targets`,
          );
        }

        span.setAttribute('proxy.parallel.results', normalizedResults.length);
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
    });
  }

  private async handleSequentialAggregation(route: AggregateRouteConfig, req: Request) {
    return await this.tracer.startActiveSpan(`aggregate.sequential ${route.path}`, async (span) => {
      span.setAttribute('proxy.route', route.path);
      span.setAttribute('proxy.aggregation_type', 'SEQUENTIAL');
      span.setAttribute('http.method', req.method);
      span.setAttribute('cache.hit', false);

      const results: AggregatedResponse[] = [];

      try {
        this.logger.log(`Processing SEQUENTIAL request for ${req.url}`);

        for (const target of route.targets) {
          try {
            const responseData = await this.handleTransformRequest(target, req, results);

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
              httpStatus: err?.httpStatusCode || err?.status || 500,
              downstreamResponse: err?.response?.data || null,
            });
            span.addEvent('sequential.target.failed', {
              'proxy.target': target.name || target.url,
              'proxy.error': err?.message || String(err),
            });
            // Stop executing further targets on failure, introducing stopOnError flag in target config to decide this behavior
            if (target.stopOnError) {
              throw err;
            }
          }
        }

        span.setAttribute('proxy.sequential.results', results.length);
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

        const totalStart = this.nowMs();
        let transformedRequestBody: BaseRequest | undefined;
        let maskedHeaders: Record<string, any> | undefined;

        try {
          const buildStart = this.nowMs();
          transformedRequestBody = await this.buildRequestFromSource(
            req,
            target.url,
            target.reqTransform,
            target.headersToPass,
            target.staticHeaders,
            target.requiredParams,
            (target as any).requiredPathParams,
            prevResponses,
          );

          if (transformedRequestBody?.skip) {
            this.logger.log(
              `[DOWNSTREAM REQUEST SKIPPED] target=${target.name || target.url} route=${req.path}`,
            );
            return null;
          }

          maskedHeaders = {
            ...transformedRequestBody.headers,
            authorization: transformedRequestBody.headers?.authorization
              ? '***masked***'
              : undefined,
            Authorization: transformedRequestBody.headers?.Authorization
              ? '***masked***'
              : undefined,
            access_token: transformedRequestBody.headers?.access_token ? '***masked***' : undefined,
          };

          this.logger.log(
            `[DOWNSTREAM REQUEST] target=${target.name || target.url} route=${req.path} method=${target.method} url=${transformedRequestBody.url.href} headers=${JSON.stringify(maskedHeaders)} body=${JSON.stringify(transformedRequestBody.body ?? null)}`,
          );

          const buildMs = this.nowMs() - buildStart;

          // Mocked targets stop here: the request was still built and validated by the
          // reqTransform above, so only the network call is replaced.
          if (isTargetMocked(target)) {
            span.setAttribute('proxy.target.mocked', true);
            const mockResult = await loadMockResponse(target);

            const mockedData = target.resTransform
              ? await applyTransform(target.resTransform, mockResult.data)
              : mockResult.data;

            span.setAttribute('http.status_code', mockResult.status);

            return mockedData;
          }

          const clientCreateStart = this.nowMs();
          const client = await createHttpClient(
            target.timeout?.request || 5000,
            target.timeout?.socket || 1000,
            target.interceptors,
          );
          const clientCreateMs = this.nowMs() - clientCreateStart;

          const downstreamStart = this.nowMs();
          const response = await client.request({
            url: transformedRequestBody.url.href,
            method: target.method,
            data: transformedRequestBody.body,
            headers: transformedRequestBody.headers,
          });

          const downstreamSetCookie = response.headers?.['set-cookie'];

          if (downstreamSetCookie) {
            const cookies = Array.isArray(downstreamSetCookie)
              ? downstreamSetCookie
              : [downstreamSetCookie];

            const sanitizedCookies = cookies
              .map((cookie) => this.sanitizeSetCookieForBff(cookie))
              .filter(Boolean) as string[];

            if (sanitizedCookies.length > 0) {
              (req as any).__downstreamSetCookie = [
                ...((req as any).__downstreamSetCookie ?? []),
                ...sanitizedCookies,
              ];
            }
          }
          const downstreamMs = this.nowMs() - downstreamStart;

          span.setAttribute('http.status_code', response.status);

          const resTransformStart = this.nowMs();
          const responseData = target.resTransform
            ? await applyTransform(target.resTransform, response.data)
            : response.data;
          const resTransformMs = this.nowMs() - resTransformStart;

          const totalMs = this.nowMs() - totalStart;

          span.setAttribute('proxy.target.duration_ms', totalMs);
          span.setAttribute('proxy.target.build_request_ms', buildMs);
          span.setAttribute('proxy.target.create_client_ms', clientCreateMs);
          span.setAttribute('proxy.target.downstream_ms', downstreamMs);
          span.setAttribute('proxy.target.res_transform_ms', resTransformMs);

          this.logger.log(
            `[DOWNSTREAM RESPONSE] target=${target.name || target.url} route=${req.path} status=${response.status} duration_ms=${totalMs} build_ms=${buildMs} client_ms=${clientCreateMs} downstream_ms=${downstreamMs} res_transform_ms=${resTransformMs} `,
          );

          if (responseData) {
            const responseStr = inspect(responseData);
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
            // Only attach data to avoid circular structures from the native Axios response
            error.response = { data: response.data };
            throw error;
          }

          if (response.status >= 400) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${response.status}: ${response.statusText || 'Error'}`,
            });
            span.setAttribute('http.error', true);
            span.setAttribute('http.error.status', response.status);
            span.setAttribute('http.error.message', response.statusText || 'Unknown error');
          }

          return responseData;
        } catch (err: any) {
          const totalMs = this.nowMs() - totalStart;

          span.setAttribute('proxy.target.duration_ms', totalMs);

          const errorResponse = axios.isAxiosError(err) && err.response ? err.response : null;

          this.logger.error(
            `[DOWNSTREAM ERROR] target=${target.name || target.url} route=${req.path} method=${target.method} url=${transformedRequestBody?.url?.href ?? 'NA'} duration_ms=${totalMs} error=${err?.message || String(err)} status=${errorResponse?.status ?? 'NA'} body=${JSON.stringify(transformedRequestBody?.body ?? null)} response=${JSON.stringify(errorResponse?.data ?? null)}`,
          );

          span.recordException(err as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });

          // Add error response data if available (for network errors, timeouts, etc.)
          if (axios.isAxiosError(err) && err.response) {
            const errorResponse = err.response;
            if (errorResponse) {
              span.setAttribute('http.status_code', errorResponse.status);
              span.setAttribute('http.error', true);
              span.setAttribute('http.error.status', errorResponse.status);
              span.setAttribute('http.error.message', errorResponse.statusText || 'Network Error');

              if (errorResponse.data) {
                let errorDataStr: string;

                try {
                  errorDataStr = JSON.stringify(errorResponse.data);
                } catch {
                  errorDataStr = safeToLog(errorResponse.data);
                }

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

              if (errorResponse.status >= 400 && errorResponse.status < 500) {
                const downstreamMessage = Array.isArray(errorResponse.data)
                  ? errorResponse.data[0]?.message ||
                    errorResponse.data[0]?.error ||
                    errorResponse.data[0]?.error_description ||
                    errorResponse.statusText ||
                    'Bad Request'
                  : errorResponse.data?.error?.message ||
                    errorResponse.data?.message ||
                    errorResponse.data?.error_description ||
                    errorResponse.statusText ||
                    'Bad Request';

                const clientError = new CustomError(
                  typeof downstreamMessage === 'string'
                    ? downstreamMessage
                    : JSON.stringify(downstreamMessage),
                  errorResponse.status,
                ) as any;

                clientError.httpStatusCode = errorResponse.status;
                clientError.downstreamResponse = errorResponse.data; // plain JSON only

                throw clientError;
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
    requiredPathParams?: string[],
    prevResponses?: AggregatedResponse[],
  ) {
    const allowedParams = this.requiredPathParams(req.params as any, requiredPathParams);

    const interpolatedTargetUrl = this.interpolateTemplate(targetUrl, allowedParams);

    const url: URL = new URL(interpolatedTargetUrl);
    url.search = this.requiredQuery(req.query, requiredParams);

    let transformedRequestBody: BaseRequest = {
      url,
      body: req.body,
      headers: this.getHeadersToPass(req.headers, headersToPass, staticHeaders),
      params: allowedParams,
      // Not a header, so `headersToPass` cannot filter it away: transformers that must
      // record a caller IP have something to fall back on when the request did not arrive
      // through a proxy.
      clientIp: req.ip || req.socket?.remoteAddress || null,
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

    if (Array.isArray(headersToPass) && headersToPass.length > 0) {
      // Express lowercases header keys in req.headers
      for (const header of headersToPass) {
        const src = String(header.source ?? '').toLowerCase();
        if (reqHeaders[src]) {
          headers[header.destination] = reqHeaders[src];
        }
      }
    }

    const incomingCookie = reqHeaders.cookie;

    if (incomingCookie && !headers.cookie) {
      headers.cookie = incomingCookie;
    }
    if (staticHeaders) {
      headers = { ...headers, ...staticHeaders };
    }

    return headers;
  }

  private normalizePathTemplate(path: string): string {
    return String(path ?? '').replace(/\{(\w+)\}/g, ':$1');
  }

  private requiredPathParams(
    params: Record<string, any> | undefined,
    required: string[] | undefined,
  ): Record<string, any> {
    const safeParams: Record<string, any> = params ?? {};

    // Default behaviour: allow all extracted params (no config changes required for existing routes)
    if (!required || required.length === 0) {
      return safeParams;
    }

    if (required[0] === '*') {
      return safeParams;
    }

    const filtered: Record<string, any> = {};
    for (const key of required) {
      const val = safeParams[key];
      if (val === undefined || val === null || String(val).length === 0) {
        throw new CustomError(`Bad Request: Missing required path param '${key}'`, 400);
      }
      filtered[key] = val;
    }

    return filtered;
  }

  /**
   * Interpolates path placeholders in strings using provided params.
   * Supports `:id`, `{id}`, and `${id}` in target URLs.
   */
  private interpolateTemplate(template: string, params: Record<string, any>): string {
    const getEncoded = (key: string) => {
      const val = params?.[key];
      if (val === undefined || val === null) return '';

      if (Array.isArray(val)) {
        return val.map((v) => encodeURIComponent(String(v))).join('/');
      }

      return encodeURIComponent(String(val));
    };

    const getRawPath = (key: string) => {
      const val = params?.[key];
      if (val === undefined || val === null) return '';

      if (Array.isArray(val)) {
        return val.map((v) => String(v)).join('/');
      }

      return String(val);
    };

    let out = String(template ?? '');

    // wildcard splat support: *slugId
    out = out.replace(/\*(\w+)/g, (_, key) => getRawPath(key));

    // existing placeholder styles
    out = out.replace(/\{(\w+)\}/g, (_, key) => getEncoded(key));
    out = out.replace(/\$\{(\w+)\}/g, (_, key) => getEncoded(key));
    out = out.replace(/(^|\/):(\w+)(?=\/|$)/g, (_, prefix, key) => `${prefix}${getEncoded(key)}`);

    return out;
  }

  private nowMs(): number {
    return Number(process.hrtime.bigint() / 1000000n);
  }

  private sanitizeSetCookieForBff(cookie: string): string | null {
    const lowerCookie = cookie.toLowerCase();

    if (!lowerCookie.startsWith('jsw_session_id=')) {
      return null;
    }

    const isLocal = process.env.NODE_ENV === 'local';

    let sanitizedCookie = cookie
      .replace(/;\s*Domain=[^;]*/gi, '')
      .replace(/;\s*Path=[^;]*/gi, '; Path=/')
      .replace(/;\s*SameSite=[^;]*/gi, '')
      .replace(/;\s*Secure/gi, '');

    if (isLocal) {
      sanitizedCookie += '; SameSite=Lax';
    } else {
      sanitizedCookie += '; SameSite=None; Secure';
    }

    return sanitizedCookie;
  }
}
