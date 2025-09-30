/* eslint-disable no-prototype-builtins */
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

export function transformVerifyMobileNumberWithOtpRequest(
  request: BaseRequest,
): BaseRequest {
  const validationResult = validateVerifyMobileNumberWithOtpData(request.body);

  if (!validationResult.isValid) {
    throw new CustomError(
      validationResult.errorMessage || '',
      HttpStatus.BAD_REQUEST,
    );
  }
  const transformedRequest: BaseRequest = {
    ...request,
    body: {
      ...request.body,
      storeKey: MSME,
    },
  };

  return transformedRequest;
}

export function validateVerifyMobileNumberWithOtpData(data) {
  const requiredFields = ['requestId', 'otp', 'phoneNumber'];

  for (const field of requiredFields) {
    if (
      !data.hasOwnProperty(field) ||
      data[field] === undefined ||
      data[field] === null ||
      data[field] === ''
    ) {
      return {
        isValid: false,
        errorMessage: `Field ${field} is missing or empty.`,
      };
    }
  }
  return { isValid: true };
}

export function transformVerifyMobileNumberOtpResponse(response: any) {
  const responseData = response;

  if (!responseData) {
    throw new CustomError(
      'CCP Verify Mobile Number With OTP API is failing',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  if (!responseData.success && responseData.error) {
    throw new CustomError(
      responseData.error?.message,
      responseData.error?.code || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  const verifyMobileNumberWithOtpResponse = responseData?.data;

  if (!verifyMobileNumberWithOtpResponse.success) {
    throw new CustomError(
      MSME_ERRORS_MAPPING[verifyMobileNumberWithOtpResponse.message] ||
        verifyMobileNumberWithOtpResponse.message,
      HttpStatus.BAD_REQUEST,
    );
  }

  return {
    success: true,
  };
}
