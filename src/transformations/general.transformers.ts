// do not convert to default import
import * as qs from 'qs';
import { BaseRequest } from 'src/models/base-request.model';
import { SF_QUERY_PARAMS } from 'src/config/app.config';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';

export function moveBodyToQueryParams(request: BaseRequest): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
    body: null,
  };

  // Parse existing query params (if any)
  const existingParams = qs.parse(request.url.search?.replace(/^\?/, '') || '');

  // Merge with body params
  const bodyParams = request.body || {};
  const mergedParams = { ...existingParams, ...bodyParams };

  // Stringify and set
  transformedRequest.url.search = qs.stringify(mergedParams);

  return transformedRequest;
}

export function convertToGetRequest(request: BaseRequest): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
    body: null,
  };
  return transformedRequest;
}

export function convertAuthorizationToAccessTokenInHeader(request: BaseRequest): BaseRequest {
  try {
    const transformedRequest: BaseRequest = {
      ...request,
      body: null,
    };

    const authorization = request.headers?.authorization;
    if (authorization) {
      transformedRequest.headers = {
        ...request.headers,
        access_token: authorization,
      };
      // Remove the authorization header
      delete transformedRequest.headers.authorization;
    }
    return transformedRequest;
  } catch (error) {
    Logger.error(
      `Error for ${request.url} method: convertAuthorizationToAccessTokenInHeader ${error}`,
    );
    return request;
  }
}

export function createQueryParams(request: BaseRequest): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
  };

  // Parse existing query params (if any)
  const existingParams = qs.parse(request.url.search?.replace(/^\?/, '') || '');

  // Merge existing params with hardcoded params (hardcoded params will override existing ones)
  const mergedParams = { ...existingParams, ...SF_QUERY_PARAMS };

  // Stringify and set
  transformedRequest.url.search = qs.stringify(mergedParams);

  return transformedRequest;
}

export function successOnly(results: AggregatedResponse[]): any {
  const failed = results.find((r) => !r.success);

  if (failed) {
    Logger.error(
      `Error for Aggregated Response method: successOnly ${failed.error ?? 'Something went wrong'}`,
    );
    return {
      error: failed.error ?? 'Something went wrong',
    };
  }

  // If all targets succeeded
  return { success: true };
}
export function unwrapParallelResponse(results: AggregatedResponse[]): any {
  return Array.isArray(results) && results.length === 1 ? results[0] : results;
}


export function transformAppHomePageRequest(request: BaseRequest): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
  };
  addChannelFilter(transformedRequest.body);
  return moveBodyToQueryParams(transformedRequest);
}

const addChannelFilter = (query) => {
  if (Array.isArray(query)) {
    query.forEach(addChannelFilter);
    return;
  }

  if (typeof query === 'object' && query !== null) {
    // Check if this object has $and array
    if (query.$and && Array.isArray(query.$and)) {
      const hasCustomerType = query.$and.some(
        (item) =>
          item?.customer_types ||
          item?.app_customer_types ||
          (item?.$or && checkForOrArray(item.$or, ['customer_types', 'app_customer_types'])),
      );

      const hasChannelFilter = query.$and.some(
        (item) => item?.channel || (item?.$or && checkForOrArray(item.$or, ['channel'])),
      );

      if (hasCustomerType && !hasChannelFilter) {
        query.$and.push({
          channels: { name: { $eqi: 'App' } },
        });
      }
    }

    // Recurse deeper
    Object.values(query).forEach(addChannelFilter);
  }
};
const checkForOrArray = (item: any[], keys: string[]): boolean => {
  return item.some((item) => keys.some((key) => item[key]));
};
