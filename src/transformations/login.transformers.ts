/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable no-prototype-builtins */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HttpStatus } from '@nestjs/common';
import { MSME, MSME_ERRORS_MAPPING } from 'src/config/app.config';
import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';
import { Logger } from '@nestjs/common';
import { getFormattedTracingContext } from 'src/utils/tracing.util';

export function transformResetPasswordRequest(
  request: BaseRequest,
): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
    body: null,
  };

  const { emailId } = request.body;
  if (!emailId || emailId === '') {
    Logger.error(
      `Error for ${request.url} method: transformResetPasswordRequest ${getFormattedTracingContext()} Email ID is required`,
    );
    throw new CustomError('emailId is required', HttpStatus.BAD_REQUEST);
  }
  transformedRequest.url.search = `?email=${emailId.toLowerCase()}`;
  Logger.log(
    `Transforming Reset Password Request ${getFormattedTracingContext()}`,
  );
  return transformedRequest;
}

export function transformResetPasswordResponse(response: any) {
  const responseData = response?.data;

  if (!responseData) {
    Logger.error(
      `Error for Reset Password API method: transformResetPasswordResponse ${getFormattedTracingContext()} CCP Reset Password API is failing`,
    );
    throw new CustomError(
      'CCP Reset Password API is failing',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  if (!responseData.success && responseData.error) {
    Logger.error(
      `Error for Reset Password API method: transformResetPasswordResponse ${getFormattedTracingContext()} ${responseData.error?.message || 'CCP Reset Password API is failing'}`,
    );
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
    Logger.error(
      `Error for ${request.url} method: transformVerifyMobileNumberRequest ${getFormattedTracingContext()} PhoneNumber is required`,
    );
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
    Logger.error(
      `Error for Verify Mobile Number API method: transformVerifyMobileNumberResponse ${getFormattedTracingContext()} CCP Verify Mobile Number API is failing`,
    );
    throw new CustomError(
      'CCP Verify Mobile Number API is failing',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  if (!responseData.success && responseData.error) {
    Logger.error(
      `Error for Verify Mobile Number API method: transformVerifyMobileNumberResponse ${getFormattedTracingContext()} ${responseData.error?.message || 'CCP Verify Mobile Number API is failing'}`,
    );
    throw new CustomError(
      responseData.error?.message,
      responseData.error?.code || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  const verifyMobileNumberResponse = responseData?.data;

  if (!verifyMobileNumberResponse.success) {
    const errorMessage =
      MSME_ERRORS_MAPPING[verifyMobileNumberResponse.message] ||
      verifyMobileNumberResponse.message;
    Logger.error(
      `Error for Verify Mobile Number API method: transformVerifyMobileNumberResponse ${getFormattedTracingContext()} ${errorMessage}`,
    );
    throw new CustomError(errorMessage, HttpStatus.BAD_REQUEST);
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
    Logger.error(
      `Error for ${request.url} method: transformVerifyMobileNumberWithOtpRequest ${getFormattedTracingContext()} ${validationResult.errorMessage || 'Validation failed'}`,
    );
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
    Logger.error(
      `Error for Verify Mobile Number With OTP API method: transformVerifyMobileNumberOtpResponse ${getFormattedTracingContext()} CCP Verify Mobile Number With OTP API is failing`,
    );
    throw new CustomError(
      'CCP Verify Mobile Number With OTP API is failing',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  if (!responseData.success && responseData.error) {
    Logger.error(
      `Error for Verify Mobile Number With OTP API method: transformVerifyMobileNumberOtpResponse ${getFormattedTracingContext()} ${responseData.error?.message || 'CCP Verify Mobile Number With OTP API is failing'}`,
    );
    throw new CustomError(
      responseData.error?.message,
      responseData.error?.code || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  const verifyMobileNumberWithOtpResponse = responseData?.data;

  if (!verifyMobileNumberWithOtpResponse.success) {
    const errorMessage =
      MSME_ERRORS_MAPPING[verifyMobileNumberWithOtpResponse.message] ||
      verifyMobileNumberWithOtpResponse.message;
    Logger.error(
      `Error for Verify Mobile Number With OTP API method: transformVerifyMobileNumberOtpResponse ${getFormattedTracingContext()} ${errorMessage}`,
    );
    throw new CustomError(errorMessage, HttpStatus.BAD_REQUEST);
  }

  return {
    success: true,
  };
}

export function selectLoginTarget(request: BaseRequest) {
  const { email, phoneNumber } = request.body;

  const validationResult = validateEmailAndPhoneNumber(email, phoneNumber);

  if (!validationResult.isValid) {
    Logger.error(
      `Error for ${request.url} method: selectLoginTarget ${getFormattedTracingContext()} ${validationResult.errorMessage || 'Validation failed'}`,
    );
    throw new CustomError(
      validationResult.errorMessage || '',
      HttpStatus.BAD_REQUEST,
    );
  }

  if (phoneNumber && phoneNumber !== '') {
    return 'generate-otp-login';
  } else {
    return 'email-login';
  }
}

export function validateEmailAndPhoneNumber(
  email: string,
  phoneNumber: string,
) {
  if (
    (email === '' && phoneNumber === '') ||
    (email && phoneNumber) ||
    (!email && !phoneNumber)
  ) {
    return {
      isValid: false,
      errorMessage: 'Either email or phoneNumber is required',
    };
  }
  return { isValid: true };
}

export function transformOtpLoginResponse(response: any) {
  const result = transformVerifyMobileNumberResponse(response);
  if (result && result.requestId) {
    return {
      requestId: result.requestId,
      userExists: true,
    };
  }
}

export function transformEmailLoginRequest(request) {
  const { email } = request.body;

  request.url.search = `?emailId=${email.toLowerCase()}`;
  request.body = null;

  return request;
}

export function transformEmailLoginResponse(response) {
  const responseData = response;

  if (!responseData) {
    Logger.error(
      `Error for Email Login API method: transformEmailLoginResponse ${getFormattedTracingContext()} CCP Email Login API is failing`,
    );
    throw new CustomError(
      'CCP Email Login API is failing',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  const isEmailExists = responseData?.data;

  return (response = {
    requestId: '',
    userExists: isEmailExists,
  });
}
