/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';
import { HttpStatus } from '@nestjs/common';

export function verifyGstin(request: BaseRequest): BaseRequest {
  const { gstin } = request.body;

  const finalTransformedRequest: BaseRequest = {
    ...request,
    body: { gstin },
  };

  return finalTransformedRequest;
}

export function verifyGstinResponse(response: any) {
  const resData = response?.data;
  const error = response?.error;
  const finalResult = {
    gstVerified: false,
    gstDetails: '',
    userAlreadyExists: false,
  } as any;

  if (error) {
    if (error.message?.includes('Account already registered')) {
      finalResult.gstVerified = true;
      finalResult.gstDetails = '';
      finalResult.userAlreadyExists = true;
    } else if (error.message?.includes('Please enter valid')) {
      throw new CustomError(error.message, HttpStatus.BAD_REQUEST);
    }
  } else {
    finalResult.gstVerified = true;
    finalResult.gstDetails = convertToAddress(resData);
    finalResult.userAlreadyExists = false;
  }
  return finalResult;
}

export function convertToAddress(resData: any) {
  const address =
    (resData.companyName ? resData.companyName : '') +
    ' ' +
    (resData.streetLine1 ? resData.streetLine1 : '') +
    ' ' +
    (resData.streetLine2 ? resData.streetLine2 : '') +
    ' ' +
    (resData.region ? resData.region : '') +
    ' ' +
    (resData.city ? resData.city : '') +
    ' ' +
    (resData.state ? resData.state : '') +
    ' ' +
    (resData.pinCode ? resData.pinCode : '') +
    ' ' +
    (resData.country ? resData.country : '');
  return address;
}
