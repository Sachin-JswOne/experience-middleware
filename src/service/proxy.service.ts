/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
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

@Injectable()
export class ProxyService {
  async handleRequest(req: Request) {
    const route = ROUTE_CONFIG.find(
      (r) => r.path === req.path && r.method === req.method,
    );
    if (!route) throw new Error('Route config not found');

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
    const results = await Promise.allSettled<AggregatedResponse>(
      route.targets.map(
        async (target: TargetConfig): Promise<AggregatedResponse> => {
          try {
            const responseData = await this.handleTransformRequest(target, req);
            return {
              target: target.name || target.url,
              success: true,
              data: responseData,
            };
          } catch (err) {
            return {
              target: target.name || target.url,
              success: false,
              error: err?.message || err,
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

    return route.resTransform
      ? await applyTransform(route.resTransform, normalizedResults)
      : normalizedResults;
  }

  private async handleSequentialAggregation(
    route: AggregateRouteConfig,
    req: Request,
  ) {
    const results: AggregatedResponse[] = [];

    for (const target of route.targets) {
      try {
        // Pass along previous responses to transformer
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
      } catch (err) {
        results.push({
          target: target.name || target.url,
          success: false,
          error: err?.message || err,
          httpStatus: err?.status || 500,
          downstreamResponse: err?.response?.data || null,
        });

        break;
      }
    }
    return route.resTransform
      ? await applyTransform(route.resTransform, results)
      : results;
  }

  private async handleTransformRequest(
    target: TargetConfig,
    req: Request,
    prevResponses?: AggregatedResponse[],
  ) {
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

    const client = createHttpClient(
      target.timeout?.request || 5000,
      target.timeout?.socket || 1000,
    );

    const response = await client.request({
      url: transformedRequestBody.url.href,
      method: target.method,
      data: transformedRequestBody.body,
      headers: transformedRequestBody.headers,
    });

    return target.resTransform
      ? await applyTransform(target.resTransform, response.data)
      : response.data;
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
