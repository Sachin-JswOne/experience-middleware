// do not convert to default import
import * as qs from 'qs';
import { BaseRequest } from 'src/models/base-request.model';

export function moveBodyToQueryParams(request: BaseRequest): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
    body: null,
  };

  const queryString = qs.stringify(request.body);
  transformedRequest.url.search = queryString;
  return transformedRequest;
}

/* eslint-disable @typescript-eslint/no-unsafe-argument */
export function copySourceQueryToUrlSearch(request: BaseRequest): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
  };

  transformedRequest.url.search = request.sourceQuery
    ? new URLSearchParams(request.sourceQuery).toString()
    : '';
  return transformedRequest;
}
/* eslint-enable @typescript-eslint/no-unsafe-argument */

export function convertToGetRequest(request: BaseRequest): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
    body: null,
  };
  return transformedRequest;
}
