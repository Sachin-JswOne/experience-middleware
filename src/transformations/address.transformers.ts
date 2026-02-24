import { BaseRequest } from 'src/models/base-request.model';
import { safeDebug } from 'src/utils/common-functions.util';
import { Logger } from '@nestjs/common';
import { country, shop, site } from 'src/config/app.config';

export function transformcreateAddressRequest(request: BaseRequest): BaseRequest {
  const reqBody = request.body;
  const requestBody = {
    company: reqBody.company,
    firstName: reqBody.firstName || '',
    lastName: reqBody.lastName || '',
    postalCode: reqBody.postalCode,
    city: reqBody.city,
    state: reqBody.state,
    country: country,
    email: reqBody.email || '',
    mobile: reqBody.mobile || null,
    streetLine1: reqBody.streetLine1,
    streetLine2: reqBody.streetLine2 || '',
    isPrimaryAddress: false,
    region: reqBody.region,
  };

  const transformedRequest: BaseRequest = {
    ...request,
    body: requestBody,
  };
  return transformedRequest;
}

export function transformcreateAddressResponse(response: any) {
  safeDebug(
    Logger,
    () =>
      ` Create Address Api response from method: transformAddressResponse : ${JSON.stringify(response)}`,
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

  const responseData = response.addresses.map((address: any, index: number) => {
    return {
      state: address.state,
      shiptoAddressTag: index === 0 ? site : shop,
      pincode: address.postalCode,
      isShippingAddress: address.id === defaultShippingAddressId,
      isBillingAddress: address.id === defaultBillingAddressId,
      district: address.region,
      companyName: address.company,
      city: address.city,
      underApproval: true,
      addressLine1: address?.custom?.fields?.streetLine1,
      contactNumber: address.mobile,
    };
  });

  return { AddressList: responseData };
}
