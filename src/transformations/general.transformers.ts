/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// do not convert to default import
import * as qs from 'qs';
import { BaseRequest } from 'src/models/base-request.model';

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

  // Hardcoded query parameters
  const hardcodedParams = {
    grant_type: 'password',
    client_id: '3MVG9ZUGg10Hh224GhhTm_qyu2_U9Xs2YK_31FhfHv7csgYVsNYdGKfme3sdrOHBzmkxPi7rbaoix9EQEemfr',
    client_secret: 'D612EF37A28B2CFEAEA2D9A9241C84188174EFBCF09565FFCA4DA2CF479A5058',
    username: 'integration.user@stetig.in.jsw.uat',
    password: 'JSW1@123V5zyNsAkVePDrsIbUw08v10E'
  };

  // Parse existing query params (if any)
  const existingParams = qs.parse(request.url.search?.replace(/^\?/, '') || '');

  // Merge existing params with hardcoded params (hardcoded params will override existing ones)
  const mergedParams = { ...existingParams, ...hardcodedParams };

  // Stringify and set
  transformedRequest.url.search = qs.stringify(mergedParams);

  return transformedRequest;
}
