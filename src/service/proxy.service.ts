﻿/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Inject, Injectable, Logger } from '@nestjs/common';
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
import Redis from 'ioredis';
import axios from 'axios';

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
      headersToPass.some((h) => {
        const src = String(h?.source ?? '').toLowerCase();
        const dst = String(h?.destination ?? '').toLowerCase();
        return (
          src === 'authorization' ||
          src === 'access_token' ||
          dst === 'authorization' ||
          dst === 'access_token'
        );
      });

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

  async handleRequest(req: Request) {
    console.log(`Incoming ${req.method} request: ${req.url}`);
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

    if (route.routeHandler !== RouteHandler.CONDITIONAL) {
      const needsAuth = this.routeNeedsClientAuth(route);
      if (needsAuth) {
        const authHeader = req.headers?.authorization || req.headers?.access_token;
        const userState = req.headers?.['x-user-state'];

        if (!authHeader && userState !== 'G') {
          throw new CustomError('Bad Request: Authorization required', 400);
        }
      }
    }

    const isCacheRequired = (route as any).isCacheRequired === true;
    let cacheKey: string | null = null;

    if (isCacheRequired) {
      cacheKey = this.getCacheKey(req);
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          console.log(`**Cache HIT for ${cacheKey}`);
          return JSON.parse(cached);
        }
        console.log(`**Cache MISS for ${cacheKey}`);
      } catch (err) {
        // Don't break the request if Redis is unhappy; just log and continue
        console.error('Redis GET error, bypassing cache:', err);
      }
    } else {
      console.log(`Caching disabled for route ${req.method} ${route.path} (isCacheRequired=false)`);
    }

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

    if (isCacheRequired && cacheKey) {
      try {
        const ttlSeconds = process.env.CACHE_TTL_SECONDS
          ? parseInt(process.env.CACHE_TTL_SECONDS, 10)
          : 30 * 60;

        await this.redis.set(cacheKey, JSON.stringify(data), 'EX', ttlSeconds);
        console.log(`**Cached response for ${cacheKey}`);
      } catch (err) {
        console.error('Redis SET error, continuing without cache:', err);
      }
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

    const needsAuth = this.routeNeedsClientAuth({ target: targetToExecute });
    if (needsAuth) {
      const authHeader = req.headers?.authorization || req.headers?.access_token;
      const userState = req.headers?.['x-user-state'];

      if (!authHeader && userState !== 'G') {
        throw new CustomError('Bad Request: Authorization required', 400);
      }
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
      default:
        throw new Error('Unsupported aggregation type');
    }
  }

  private async handleParallelAggregation(route: AggregateRouteConfig, req: Request) {
    return await this.tracer.startActiveSpan(`aggregate.parallel ${route.path}`, async (span) => {
      span.setAttribute('proxy.route', route.path);
      span.setAttribute('proxy.aggregation_type', 'PARALLEL');
      span.setAttribute('http.method', req.method);
      span.setAttribute('cache.hit', false);

      try {
        console.log(`Processing PARALLEL request for ${req.url}`);
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

        if (unauthorized) {
          const error: any = new CustomError(
            `Authorization error from target: ${unauthorized.target}`,
            500,
          );
          error.httpStatusCode = unauthorized.httpStatus;
          error.downstreamResponse = unauthorized.downstreamResponse;
          throw error;
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
        console.log(`Processing SEQUENTIAL request for ${req.url}`);

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

          maskedHeaders = {
            ...transformedRequestBody.headers,
            authorization: transformedRequestBody.headers?.authorization ? '***masked***' : undefined,
            Authorization: transformedRequestBody.headers?.Authorization ? '***masked***' : undefined,
            access_token: transformedRequestBody.headers?.access_token ? '***masked***' : undefined,
          };

          const downstreamUrl = transformedRequestBody.url.href ?? '';

          this.logger.log(
            `[DOWNSTREAM REQUEST] target=${target.name || target.url} route=${req.path} method=${target.method} url=${downstreamUrl} headers=${inspect(maskedHeaders ?? '')} body=${inspect(transformedRequestBody.body ?? null)}`,
          );
          
          const buildMs = this.nowMs() - buildStart;

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
            error.response = response;
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

          const errorResponse =
            axios.isAxiosError(err) && err.response ? err.response : null;

          this.logger.error(
            `[DOWNSTREAM ERROR] target=${target.name || target.url} route=${req.path} method=${target.method} url=${transformedRequestBody?.url?.href ?? 'NA'} duration_ms=${totalMs} error=${err?.message || String(err)} status=${errorResponse?.status ?? 'NA'} body=${inspect(transformedRequestBody?.body ?? null)} response=${inspect(errorResponse?.data ?? null)}`,
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
                  errorResponse.data?.error ||
                  errorResponse.data?.message ||
                  errorResponse.data?.error_description ||
                  errorResponse.statusText ||
                  'Bad Request';

                const clientError = new CustomError(downstreamMessage, errorResponse.status) as any;
                clientError.httpStatusCode = errorResponse.status;
                clientError.response = errorResponse;
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
}