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
  TransformRouteConfig,
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
        return await this.handleTransformRequest(route, req);
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
            const baseRequest: BaseRequest = await this.buildRequestFromSource(
              req,
              target.url,
              target.reqTransform,
              target.headersToPass,
            );
            const client = createHttpClient(
              target.timeout?.request || 5000,
              target.timeout?.socket || 1000,
            );
            const response = await client.request({
              url: baseRequest.url.href,
              method: target.method,
              data: baseRequest.body,
              headers: baseRequest.headers,
            });
            return {
              target: target.name || target.url,
              success: true,
              data: response.data,
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

  private async handleTransformRequest(
    route: TransformRouteConfig,
    req: Request,
  ) {
    const transformedRequestBody: BaseRequest =
      await this.buildRequestFromSource(
        req,
        route.target.url,
        route.target.reqTransform,
        route.target.headersToPass,
      );

    const client = createHttpClient(
      route.target.timeout?.request || 5000,
      route.target.timeout?.socket || 1000,
    );

    const response = await client.request({
      url: transformedRequestBody.url.href,
      method: route.target.method,
      data: transformedRequestBody.body,
      headers: transformedRequestBody.headers,
    });

    return route.resTransform
      ? await applyTransform(route.resTransform, response.data)
      : response.data;
  }

  private async buildRequestFromSource(
    req: Request,
    targetUrl: string,
    requestTransform?: string,
    headersToPass?: string[],
  ) {
    let transformedRequestBody: BaseRequest = {
      url: new URL(targetUrl),
      body: req.body,
      headers: this.getHeadersToPass(req.headers, headersToPass),
      sourceQuery: req.query,
    };
    if (requestTransform) {
      transformedRequestBody = await applyTransform(
        requestTransform,
        transformedRequestBody,
      );
    }
    return transformedRequestBody;
  }

  private getHeadersToPass(
    reqHeaders: IncomingHttpHeaders,
    headersToPass?: string[],
  ): IncomingHttpHeaders {
    if (!headersToPass || headersToPass.length === 0) {
      return {};
    }
    const headers: IncomingHttpHeaders = {};
    for (const header of headersToPass) {
      if (reqHeaders[header]) {
        headers[header] = reqHeaders[header];
      }
    }
    return headers;
  }
}
