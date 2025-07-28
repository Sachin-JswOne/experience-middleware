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
  console.log('Converting authorization to access_token in header');
  const transformedRequest: BaseRequest = {
    ...request,
    body: null,
  };

  const authorization = request.headers?.authorization;
  console.log('Authorization header:', request);
  if (authorization) {
    transformedRequest.headers = {
      ...request.headers,
      access_token:
        'eyJhbGciOiJIUzUxMiJ9.eyJzZkN1c3RvbWVySWQiOiIwMDFJazAwMDAwNThFdWVJQUUiLCJ0b2tlbkNyZWF0ZWRBdCI6IjIwMjUvMDcvMjggMTQ6NTE6MjIiLCJzdG9yZUtleSI6Im1zbWUiLCJ4LWNvcnJlbGF0aW9uLWlkIjoiZmZhMjAxYmYtNzFkYi00YWMwLWI5ODYtNzIxYjE1OWZiZTBkIiwidXNlclR5cGUiOiJSIiwiZXhwIjoxNzY5MjY2MjgyLCJ1c2VySWQiOiI4YTU4YzNkOS0zYWRkLTQ0NmYtYjUxOS0zZjZlNWY0ZDc2MzYiLCJ0b2tlbkV4cGlyZUF0IjoiMjAyNi8wMS8yNCAxNDo1MToyMiIsImlhdCI6MTc1MzY5NDQ4Mn0.6OGQousMAGz1SROBrsPpfCJ9wN3_DCr3rKekWcoPeuYf-eqP_h1O4gUPgvNzj3AOID5bugphon3EXOshdMzK4Q',
      // access_token: authorization,
    };
  }
  // Remove the authorization header
  delete transformedRequest.headers.authorization;

  console.log('Transformed request headers:', transformedRequest);

  return transformedRequest;
}
