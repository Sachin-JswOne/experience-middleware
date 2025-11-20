/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { CustomError } from 'src/utils/CustomError';
import { HttpStatus } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

export function createAddress(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[], // new param for sequential
): BaseRequest {
  const requestBody: any = request?.body;

  // Get Salesforce token from first target response
  const tokenResponse = prevResponses?.find(
    (r) => r.target === 'get-sf-tokens',
  );
  const accessToken = tokenResponse?.data?.access_token;
  if (!accessToken) {
    Logger.error(
      `Error for ${request.url} method: createAddress Access token not found from Salesforce token API'`,
    );
    throw new CustomError(
      'Access token not found from Salesforce token API',
      HttpStatus.BAD_REQUEST,
    );
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
  };

  const Body: any = { SiteAddressDataList: [reqBody] };

  const finalTransformedRequest: BaseRequest = {
    ...request,
    headers,
    body: Body,
  };

  return finalTransformedRequest;
}

export function getAddressRequest(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[],
): BaseRequest {
  const tokenResponse = prevResponses?.find(
    (r) => r.target === 'get-sf-tokens',
  );
  const accessToken = tokenResponse?.data?.access_token;
  if (!accessToken) {
    Logger.error(
      `Error for ${request.url} method: getAddressRequest Access token not found from Salesforce token API'`,
    );
    throw new CustomError(
      'Access token not found from Salesforce token API',
      HttpStatus.BAD_REQUEST,
    );
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  const finalTransformedRequest: BaseRequest = {
    ...request,
    headers,
    body: null,
  };
  const sfId = getSfIdFromHeaders(request);
  if (!sfId) {
    Logger.error(
      `Error for ${request.url} method: getAddressRequest SF ID not found in the token'`,
    );
    throw new CustomError(
      'SF ID not found in the token',
      HttpStatus.BAD_REQUEST,
    );
  }

  finalTransformedRequest.url.search = `?accountId=${sfId}`;

  return finalTransformedRequest;
}

export function getSfIdFromHeaders(request) {
  const authHeader = request.headers.authorization;

  if (!authHeader) return null;
  try {
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    const decoded = jwt.decode(token);
    if (!decoded) {
      return null;
    }
    return (decoded as any).sfCustomerId ?? null;
  } catch (err) {
    Logger.error(
      `Error for ${request.url} method: getSfIdFromHeaders Error decoding JWT: ${err}`,
    );
    console.error('Error decoding JWT:', err);
    return null;
  }
}

export function getAddressResponse(response) {
  if (response && response.length > 0) {
    const failedRequest = response.find((item) => item.success === false);
    if (failedRequest) {
      Logger.error(
        `Error for GET Address API method: getAddressResponse  ${failedRequest.error}`,
      );
      throw new CustomError(failedRequest.error, failedRequest.httpStatus);
    }

    const addressResponse = response.find(
      (item) => item.target === 'get-address' && item.success,
    );

    if (
      addressResponse &&
      addressResponse.data &&
      addressResponse.data.addressData
    ) {
      const addressList = JSON.parse(addressResponse.data.addressData);

      const transformedAddress = transformAddress(addressList.AddressList);
      return { AddressList: transformedAddress };
    }
    return { AddressList: [] };
  }
  return { AddressList: [] };
}

export function transformAddress(addressList) {
  const filteredAddressList = addressList.filter(
    (address) => address.approvalStatus !== 'Rejected',
  );

  return filteredAddressList.map((address) => {
    let isUnderApproval = false;
    if (address.approvalStatus === 'Awaiting Approval') {
      isUnderApproval = true;
    }

    if (
      address.approvalStatus === 'Approved' ||
      address.approvalStatus === ''
    ) {
      isUnderApproval = false;
    }
    return {
      state: address.state,
      siteId: address.siteId,
      shiptoAddressTag: address.shiptoAddressTag,
      sfAddressId: address.sfAddressId,
      pincode: address.pincode,
      isShippingAddress: address.isShippingAddress,
      isBillingAddress: address.isBillingAddress,
      district: address.district,
      companyName: address.companyName,
      city: address.city,
      underApproval: isUnderApproval,
      addressLine2: address.addressLine2,
      addressLine1: address.addressLine1,
      contactNumber: address.contactNumber,
    };
  });
}
