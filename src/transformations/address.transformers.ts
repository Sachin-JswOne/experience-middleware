import { BaseRequest } from 'src/models/base-request.model';
import { safeDebug } from 'src/utils/common-functions.util';
import { HttpStatus, Logger } from '@nestjs/common';
import { country } from 'src/config/app.config';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { CustomError } from 'src/utils/CustomError';
import * as jwt from 'jsonwebtoken';

export function transformCreateAddressRequest(request: BaseRequest): BaseRequest {
  const reqBody = request.body;
  const requestBody = {
    company: reqBody.company,
    firstName: reqBody.firstName || '',
    lastName: reqBody.lastName || '',
    postalCode: reqBody.postalCode || reqBody.pincode,
    city: reqBody.city,
    state: reqBody.state,
    country: country,
    email: reqBody.email || '',
    mobile: reqBody.mobile || null,
    streetLine1: reqBody.streetLine1 || reqBody.addressLine1,
    streetLine2: reqBody.streetLine2 || reqBody.addressLine2 || '',
    isPrimaryAddress: false,
    region: reqBody.region || reqBody.district,
  };

  const transformedRequest: BaseRequest = {
    ...request,
    body: requestBody,
  };
  return transformedRequest;
}

export function transformCreateAddressResponse(response: any) {
  safeDebug(
    Logger,
    () =>
      ` Create Address Api response from method: transformCreateAddressResponse : ${JSON.stringify(response)}`,
  );

  if (response && response.addresses && response.addresses.length > 0) {
    return { success: true };
  }

  throw new Error(`Address Creation failed`);
}

export function transformGetAddressResponse(response: any) {
  safeDebug(
    Logger,
    () =>
      ` Create Address Api response from method: transformAddressResponse : ${JSON.stringify(response)}`,
  );
  const { defaultShippingAddressId, defaultBillingAddressId } = response;
  const responseData = response.addresses.map((address: any) => {
    return {
      id: address.id,
      state: address.state,
      pincode: address.postalCode,
      isShippingAddress: address.id === defaultShippingAddressId,
      isBillingAddress: address.id === defaultBillingAddressId,
      district: address.region,
      companyName: address.company,
      city: address.city,
      addressLine1: address?.custom?.fields?.streetLine1,
      contactNumber: address.mobile,
      defaultShippingAddressId: defaultShippingAddressId ?? '',
      defaultBillingAddressId: defaultBillingAddressId ?? '',
    };
  });

  return { AddressList: responseData };
}

export function createAddress(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[], // new param for sequential
): BaseRequest {
  const requestBody: any = request?.body;

  // Get Salesforce token from first target response
  const tokenResponse = prevResponses?.find((r) => r.target === 'get-sf-tokens');
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
    shiptoAddressTag: requestBody?.shiptoAddressTag,
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
  const tokenResponse = prevResponses?.find((r) => r.target === 'get-sf-tokens');
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
    throw new CustomError('SF ID not found in the token', HttpStatus.BAD_REQUEST);
  }

  finalTransformedRequest.url.search = `?accountId=${sfId}`;

  return finalTransformedRequest;
}

export function getSfIdFromHeaders(request) {
  const authHeader = request.headers.authorization;

  if (!authHeader) return null;
  try {
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

    const decoded = jwt.decode(token);
    if (!decoded) {
      return null;
    }
    return (decoded as any).sfCustomerId ?? null;
  } catch (err) {
    Logger.error(`Error for ${request.url} method: getSfIdFromHeaders Error decoding JWT: ${err}`);
    return null;
  }
}

export function getAddressResponse(response) {
  safeDebug(
    Logger,
    () => `GET Address Api response from method: getAddressResponse : ${JSON.stringify(response)}`,
  );
  if (response && response.length > 0) {
    const failedRequest = response.find((item) => item.success === false);
    if (failedRequest) {
      Logger.error(`Error for GET Address API method: getAddressResponse  ${failedRequest.error}`);
      throw new CustomError(failedRequest.error, failedRequest.httpStatus);
    }

    const addressResponse = response.find((item) => item.target === 'get-address' && item.success);

    if (addressResponse && addressResponse.data && addressResponse.data.addressData) {
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
    let isUnderApproval = true;
    if (address.approvalStatus === 'Approved' || address.approvalStatus === 'Active') {
      isUnderApproval = false;
    }
    return {
      state: address.state,
      id: address.siteId,
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
      ctAddressId: address.ctAddressId,
    };
  });
}

export function selectGetAddressTarget(request): string {
  const isPbUser = request?.query?.isPbUser;
  if (isPbUser === 'true') {
    return 'sf-address';
  }
  return 'ct-address';
}
