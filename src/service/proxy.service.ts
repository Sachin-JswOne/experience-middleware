/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/service/proxy.service.ts
import { Injectable } from '@nestjs/common';
import { createHttpClient } from '../utils/http-client.factory';
import { applyTransform } from '../utils/transformer.util';
import { ROUTE_CONFIG } from '../config/route.config';
import { BaseRequest } from '../models/BaseRequest';

@Injectable()
export class ProxyService {
  async handleRequest(
    path: string,
    method: string,
    incomingBody: any,
    query: any,
  ) {
    const route = ROUTE_CONFIG.find(
      (r) => r.path === path && r.method === method,
    );
    if (!route) throw new Error('Route config not found');

    // 🔹 Transform the request body if needed
    let transformedRequestBody: BaseRequest = {
      url: new URL(route.targetUrl),
      body: incomingBody,
      headers: {},
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      sourceQueryString: query ? new URLSearchParams(query).toString() : '',
    };
    if (route.requestTransform) {
      transformedRequestBody = await applyTransform(
        route.requestTransform,
        transformedRequestBody,
      );
    }

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
}
