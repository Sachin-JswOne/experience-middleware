import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { CustomError } from 'src/utils/CustomError';
import { HttpStatus } from '@nestjs/common';

export function createAddress(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[],   // new param for sequential
): BaseRequest {
  const requestBody: any = request?.body;

  // Get Salesforce token from first target response
  const tokenResponse = prevResponses?.find(r => r.target === 'get-sf-tokens');
  const accessToken = tokenResponse?.data?.access_token;

  if (!accessToken) {
    throw new CustomError('Access token not found in previous responses', HttpStatus.NOT_FOUND);

  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  const reqBody = {
    accountId: requestBody?.accountId,
    projectName: requestBody?.projectName,
    addressLine1: requestBody?.addressLine1,
    addressLine2: requestBody?.addressLine2,
    city: requestBody?.city,
    district: requestBody?.district,
    state: requestBody?.state,
    pincode: requestBody?.pincode,
  }

  const Body: any = { SiteAddressDataList: [reqBody] };

  const finalTransformedRequest: BaseRequest = {
    ...request,
    headers,
    body: Body,
  };

  return finalTransformedRequest
}
