/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HttpStatus } from '@nestjs/common';
import { MSME, MSME_ERRORS_MAPPING } from 'src/config/app.config';
import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';

export function transformResetPasswordRequest(
  request: BaseRequest,
): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
    body: null,
  };

  const { emailId } = request.body;
  if (!emailId || emailId === '') {
    throw new CustomError('emailId is required', HttpStatus.BAD_REQUEST);
  }
  transformedRequest.url.search = `?email=${emailId.toLowerCase()}`;
  return transformedRequest;
}

export function transformResetPasswordResponse(response: any) {
  const responseData = response?.data;

  if (!responseData) {
    throw new CustomError(
      'CCP Reset Password API is failing',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  if (!responseData.success && responseData.error) {
    throw new CustomError(
      responseData.error?.message,
      responseData.error?.code,
    );
  }
  const resetPasswordResponse = responseData?.data;
  if (resetPasswordResponse && resetPasswordResponse.statusCode !== 200) {
    throw new CustomError(
      resetPasswordResponse.message,
      resetPasswordResponse.statusCode,
    );
  }
  return {
    success: true,
  };
}

export function transformVerifyMobileNumberRequest(
  request: BaseRequest,
): BaseRequest {
  const { phoneNumber } = request.body;

  if (!phoneNumber || phoneNumber === '') {
    throw new CustomError('PhoneNumber is required', HttpStatus.BAD_REQUEST);
  }
  const transformedRequest: BaseRequest = {
    ...request,
    body: {
      phoneNumber: phoneNumber,
      storeKey: MSME,
    },
  };

  return transformedRequest;
}

export function transformVerifyMobileNumberResponse(response: any) {
  const responseData = response;

  if (!responseData) {
    throw new CustomError(
      'CCP Verify Mobile Number API is failing',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  if (!responseData.success && responseData.error) {
    throw new CustomError(
      responseData.error?.message,
      responseData.error?.code || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  const verifyMobileNumberResponse = responseData?.data;

  if (!verifyMobileNumberResponse.success) {
    throw new CustomError(
      MSME_ERRORS_MAPPING[verifyMobileNumberResponse.message] ||
        verifyMobileNumberResponse.message,
      HttpStatus.BAD_REQUEST,
    );
  }

  return {
    requestId: verifyMobileNumberResponse.requestId,
  };
}
