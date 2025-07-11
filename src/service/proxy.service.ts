/* eslint-disable @typescript-eslint/no-unsafe-call */
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
              target.targetUrl,
              target.requestTransform,
            );
            const client = createHttpClient(
              target.timeout?.request || 5000,
              target.timeout?.socket || 1000,
            );
            const response = await client.request({
              url: baseRequest.url.href,
              method: target.targetMethod,
              data: baseRequest.body,
            });
            return {
              target: target.name || target.targetUrl,
              success: true,
              data: response.data,
            };
          } catch (err) {
            return {
              target: target.name || target.targetUrl,
              success: false,
              error: err?.message || err,
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

    return route.transform
      ? await applyTransform(route.transform, normalizedResults)
      : normalizedResults;
  }

  private async handleTransformRequest(
    route: TransformRouteConfig,
    req: Request,
  ) {
    const transformedRequestBody: BaseRequest =
      await this.buildRequestFromSource(
        req,
        route.targetUrl,
        route.requestTransform,
      );

    const client = createHttpClient(
      route.timeout?.request || 5000,
      route.timeout?.socket || 1000,
    );

    const response = await client.request({
      url: transformedRequestBody.url.href,
      method: route.targetMethod,
      data: transformedRequestBody.body,
    });

    return route.transform
      ? await applyTransform(route.transform, response.data)
      : response.data;
  }

  private async buildRequestFromSource(
    req: Request,
    targetUrl: string,
    requestTransform?: string,
  ) {
    let transformedRequestBody: BaseRequest = {
      url: new URL(targetUrl),
      body: req.body,
      headers: {},
      sourceQueryString: req.query
        ? new URLSearchParams(req.query as any).toString()
        : '',
    };
    if (requestTransform) {
      transformedRequestBody = await applyTransform(
        requestTransform,
        transformedRequestBody,
      );
    }
    return transformedRequestBody;
  }
}
