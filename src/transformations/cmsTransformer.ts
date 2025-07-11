// do nor convert to default export
import * as qs from 'qs';
import { BaseRequest } from 'src/models/base-request.model';

export function transformAppHomePageRequest(request: BaseRequest): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
    body: null,
  };

  const queryString = qs.stringify(request.body);
  transformedRequest.url.search = queryString;
  return transformedRequest;
}

export function transformAppHomePageGetRequest(
  request: BaseRequest,
): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
  };
  transformedRequest.url.search = request.sourceQueryString || '';
  return transformedRequest;
}

export function transformAppHomePageResponse(response: any): any {
  return response;
}

export function transformGetRequest(request: BaseRequest): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
    body: null,
  };
  return transformedRequest;
}
