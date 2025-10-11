/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// do not convert to default import
import * as qs from 'qs';
import { BaseRequest } from 'src/models/base-request.model';
import { SF_QUERY_PARAMS } from 'src/config/app.config';
import { AggregatedResponse } from 'src/models/aggregated-response.model';

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

export function convertAuthorizationToAccessTokenInHeader(
  request: BaseRequest,
): BaseRequest {
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
    console.error('Error in convertAuthorizationToAccessTokenInHeader:', error);
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
    return {
      error: failed.error ?? 'Something went wrong',
    };
  }

  // If all targets succeeded
  return { success: true };
}
