import { HttpStatus, Logger } from '@nestjs/common';
import {
  selectLoginTarget,
  transformEmailLoginRequest,
  transformEmailLoginResponse,
  transformOtpLoginResponse,
  transformResetPasswordRequest,
  transformResetPasswordResponse,
  transformVerifyMobileNumberOtpResponse,
  transformVerifyMobileNumberRequest,
  transformVerifyMobileNumberResponse,
  transformVerifyMobileNumberWithOtpRequest,
  validateEmailAndPhoneNumber,
  validateVerifyMobileNumberWithOtpData,
} from '../login.transformers';
import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';
import { MSME, MSME_ERRORS_MAPPING } from 'src/config/app.config';

jest.mock('src/utils/CustomError');
jest.mock('src/utils/tracing.util', () => ({
  getFormattedTracingContext: jest.fn(() => 'test-trace-id'),
}));
jest.mock('@nestjs/common', () => ({
  ...jest.requireActual('@nestjs/common'),
  Logger: {
    error: jest.fn(),
    log: jest.fn(),
  },
}));

describe('login.transformers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('transformResetPasswordRequest', () => {
    it('should transform the request correctly with a valid emailId', () => {
      const request: BaseRequest = {
        body: { emailId: 'TEST@JSW.COM' },
        url: new URL('http://localhost/api'),
        headers: {},
      };
      const transformedRequest = transformResetPasswordRequest(request);
      expect(transformedRequest.body).toBeNull();
      expect(transformedRequest.url.search).toBe('?email=test@jsw.com');
    });

    it('should throw a CustomError if emailId is missing', () => {
      const request: BaseRequest = {
        body: {},
        url: new URL('http://localhost/api'),
        headers: {},
      };
      expect(() => transformResetPasswordRequest(request)).toThrow(
        new CustomError('emailId is required', HttpStatus.BAD_REQUEST),
      );
    });

    it('should throw a CustomError if emailId is an empty string', () => {
      const request: BaseRequest = {
        body: { emailId: '' },
        url: new URL('http://localhost/api'),
        headers: {},
      };
      expect(() => transformResetPasswordRequest(request)).toThrow(
        new CustomError('emailId is required', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('transformResetPasswordResponse', () => {
    it('should return { success: true } for a successful response', () => {
      const response = {
        data: {
          status: 'OK',
          data: {
            status: true,
            message: 'Password reset link email send successfully.',
            statusCode: 200,
          },
          error: null,
          success: true,
        },
      };
      const result = transformResetPasswordResponse(response);
      expect(result).toEqual({ success: true });
    });

    it('should throw a CustomError for a failure response with an error object', () => {
      const response = {
        data: {
          status: 'NOT_FOUND',
          data: null,
          error: {
            code: 404,
            message:
              'Password reset link email not send.No customer found with email id: ankit.kumar3@jsw.',
          },
          success: false,
        },
      };
      expect(() => transformResetPasswordResponse(response)).toThrow(
        new CustomError(response.data.error.message, response.data.error.code),
      );
    });

    it('should throw a CustomError if responseData contains a non-200 statusCode', () => {
      const response = {
        data: {
          data: {
            message: 'Invalid request',
            statusCode: 400,
          },
          success: true,
        },
      };
      expect(() => transformResetPasswordResponse(response)).toThrow(
        new CustomError(response.data.data.message, response.data.data.statusCode),
      );
    });

    it('should handle empty or unexpected response structures gracefully', () => {
      const response = {};
      expect(() => transformResetPasswordResponse(response)).toThrow();

      const responseWithNullData = { data: null };
      expect(() => transformResetPasswordResponse(responseWithNullData)).toThrow();
    });
  });

  describe('transformVerifyMobileNumberRequest', () => {
    it('should transform the request correctly with a valid phoneNumber', () => {
      const request: BaseRequest = {
        body: { phoneNumber: '1234567890' },
        url: new URL('http://localhost/api'),
        headers: {},
      };
      const transformedRequest = transformVerifyMobileNumberRequest(request);
      expect(transformedRequest.body).toEqual({
        phoneNumber: '1234567890',
        storeKey: MSME,
      });
    });

    it('should throw a CustomError if phoneNumber is missing', () => {
      const request: BaseRequest = {
        body: {},
        url: new URL('http://localhost/api'),
        headers: {},
      };
      expect(() => transformVerifyMobileNumberRequest(request)).toThrow(
        new CustomError('PhoneNumber is required', HttpStatus.BAD_REQUEST),
      );
    });

    it('should throw a CustomError if phoneNumber is an empty string', () => {
      const request: BaseRequest = {
        body: { phoneNumber: '' },
        url: new URL('http://localhost/api'),
        headers: {},
      };
      expect(() => transformVerifyMobileNumberRequest(request)).toThrow(
        new CustomError('PhoneNumber is required', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('transformVerifyMobileNumberResponse', () => {
    it('should return the requestId for a successful response', () => {
      const response = {
        success: true,
        data: {
          success: true,
          requestId: 'test-request-id',
        },
      };
      const result = transformVerifyMobileNumberResponse(response);
      expect(result).toEqual({ requestId: 'test-request-id' });
    });

    it('should throw a CustomError if CCP Verify Mobile Number API is failing', () => {
      expect(() => transformVerifyMobileNumberResponse(null)).toThrow(
        new CustomError(
          'CCP Verify Mobile Number API is failing',
          HttpStatus.INTERNAL_SERVER_ERROR,
        ),
      );
    });

    it('should throw a CustomError for a failure response with an error object', () => {
      const response = {
        success: false,
        error: {
          message: 'External service error',
          code: 503,
        },
      };
      expect(() => transformVerifyMobileNumberResponse(response)).toThrow(
        new CustomError('External service error', 503),
      );
    });

    it('should throw a CustomError if the nested data indicates failure', () => {
      const response = {
        success: true,
        data: {
          success: false,
          message: 'Invalid phone number',
        },
      };
      expect(() => transformVerifyMobileNumberResponse(response)).toThrow(
        new CustomError('Invalid phone number', HttpStatus.BAD_REQUEST),
      );
    });

    it('should use MSME_ERRORS_MAPPING for specific error messages', () => {
      const response = {
        success: true,
        data: {
          success: false,
          message: 'Incorrect OTP. Please enter correct OTP',
        },
      };
      expect(() => transformVerifyMobileNumberResponse(response)).toThrow(
        new CustomError('Incorrect OTP. Please enter a valid OTP', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('validateVerifyMobileNumberWithOtpData', () => {
    it('should return isValid: true for valid data', () => {
      const data = {
        requestId: '12345',
        otp: '67890',
        phoneNumber: '9876543210',
      };
      const result = validateVerifyMobileNumberWithOtpData(data);
      expect(result).toEqual({ isValid: true });
    });

    it('should return isValid: false if requestId is missing', () => {
      const data = { otp: '67890', phoneNumber: '9876543210' };
      const result = validateVerifyMobileNumberWithOtpData(data);
      expect(result).toEqual({
        isValid: false,
        errorMessage: 'Field requestId is missing or empty.',
      });
    });

    it('should return isValid: false if otp is an empty string', () => {
      const data = {
        requestId: '12345',
        otp: '',
        phoneNumber: '9876543210',
      };
      const result = validateVerifyMobileNumberWithOtpData(data);
      expect(result).toEqual({
        isValid: false,
        errorMessage: 'Field otp is missing or empty.',
      });
    });

    it('should return isValid: false if phoneNumber is null', () => {
      const data = { requestId: '12345', otp: '67890', phoneNumber: null };
      const result = validateVerifyMobileNumberWithOtpData(data);
      expect(result).toEqual({
        isValid: false,
        errorMessage: 'Field phoneNumber is missing or empty.',
      });
    });

    it('should return isValid: false if a required field is undefined', () => {
      const data = {
        requestId: '12345',
        otp: undefined,
        phoneNumber: '9876543210',
      };
      const result = validateVerifyMobileNumberWithOtpData(data);
      expect(result).toEqual({
        isValid: false,
        errorMessage: 'Field otp is missing or empty.',
      });
    });
  });

  describe('transformVerifyMobileNumberWithOtpRequest', () => {
    const mockBaseRequest: BaseRequest = {
      body: {
        requestId: 'req-123',
        otp: '123456',
        phoneNumber: '9998887776',
      },
      url: new URL('http://localhost/verify'),
      headers: {},
    };

    it('should transform the request correctly with valid data', () => {
      const transformed = transformVerifyMobileNumberWithOtpRequest(mockBaseRequest);
      expect(transformed.body).toEqual({
        ...mockBaseRequest.body,
        storeKey: MSME,
      });
      expect(transformed.url).toBe(mockBaseRequest.url);
    });

    it('should throw a CustomError for invalid data', () => {
      const invalidRequest: BaseRequest = {
        ...mockBaseRequest,
        body: {
          otp: '123456',
          phoneNumber: '9998887776',
        },
      };

      expect(() => transformVerifyMobileNumberWithOtpRequest(invalidRequest)).toThrow(
        new CustomError('Field requestId is missing or empty.', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('transformVerifyMobileNumberOtpResponse', () => {
    it('should return { success: true } for a successful API response', () => {
      const apiResponse = {
        success: true,
        data: {
          success: true,
        },
      };
      const result = transformVerifyMobileNumberOtpResponse(apiResponse);
      expect(result).toEqual({ success: true });
    });

    it('should throw a CustomError if the response is null or undefined', () => {
      expect(() => transformVerifyMobileNumberOtpResponse(null)).toThrow(
        new CustomError(
          'CCP Verify Mobile Number With OTP API is failing',
          HttpStatus.INTERNAL_SERVER_ERROR,
        ),
      );
    });

    it('should throw a CustomError if the top-level response indicates failure', () => {
      const apiResponse = {
        success: false,
        error: {
          message: 'Gateway Timeout',
          code: HttpStatus.GATEWAY_TIMEOUT,
        },
      };
      expect(() => transformVerifyMobileNumberOtpResponse(apiResponse)).toThrow(
        new CustomError('Gateway Timeout', HttpStatus.GATEWAY_TIMEOUT),
      );
    });

    it('should use INTERNAL_SERVER_ERROR if error code is missing', () => {
      const apiResponse = {
        success: false,
        error: {
          message: 'An unknown error occurred',
        },
      };
      expect(() => transformVerifyMobileNumberOtpResponse(apiResponse)).toThrow(
        new CustomError('An unknown error occurred', HttpStatus.INTERNAL_SERVER_ERROR),
      );
    });

    it('should throw a CustomError if the nested data response indicates failure', () => {
      const apiResponse = {
        success: true,
        data: {
          success: false,
          message: 'Some API specific error',
        },
      };
      expect(() => transformVerifyMobileNumberOtpResponse(apiResponse)).toThrow(
        new CustomError('Some API specific error', HttpStatus.BAD_REQUEST),
      );
    });

    it('should use the mapped error message if available', () => {
      const apiResponse = {
        success: true,
        data: {
          success: false,
          message: 'Invalid OTP.',
        },
      };
      const expectedMessage = MSME_ERRORS_MAPPING['Invalid OTP.'] || 'Invalid OTP.';
      expect(() => transformVerifyMobileNumberOtpResponse(apiResponse)).toThrow(
        new CustomError(expectedMessage, HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('selectLoginTarget', () => {
    it('should return "otp-login" when only phoneNumber is provided', () => {
      const request: Partial<BaseRequest> = {
        body: { phoneNumber: '1234567890' },
        url: new URL('http://localhost/login'),
      };
      const result = selectLoginTarget(request as BaseRequest);
      expect(result).toBe('otp-login');
    });

    it('should return "email-login" when only email is provided', () => {
      const request: Partial<BaseRequest> = {
        body: { email: 'test@example.com' },
        url: new URL('http://localhost/login'),
      };
      const result = selectLoginTarget(request as BaseRequest);
      expect(result).toBe('email-login');
    });

    it('should throw CustomError if both email and phoneNumber are provided', () => {
      const request: Partial<BaseRequest> = {
        body: { email: 'test@example.com', phoneNumber: '1234567890' },
        url: new URL('http://localhost/login'),
      };
      expect(() => selectLoginTarget(request as BaseRequest)).toThrow(CustomError);
      expect(CustomError).toHaveBeenCalledWith(
        'Either email or phoneNumber is required',
        HttpStatus.BAD_REQUEST,
      );
    });

    it('should throw CustomError if neither email nor phoneNumber is provided', () => {
      const request: Partial<BaseRequest> = {
        body: {},
        url: new URL('http://localhost/login'),
      };
      expect(() => selectLoginTarget(request as BaseRequest)).toThrow(CustomError);
      expect(CustomError).toHaveBeenCalledWith(
        'Either email or phoneNumber is required',
        HttpStatus.BAD_REQUEST,
      );
    });
  });

  describe('validateEmailAndPhoneNumber', () => {
    it('should return valid when only email is provided', () => {
      const result = validateEmailAndPhoneNumber('test@example.com', '');
      expect(result).toEqual({ isValid: true });
    });

    it('should return valid when only phoneNumber is provided', () => {
      const result = validateEmailAndPhoneNumber('', '1234567890');
      expect(result).toEqual({ isValid: true });
    });

    it('should return invalid when both email and phoneNumber are provided', () => {
      const result = validateEmailAndPhoneNumber('test@example.com', '1234567890');
      expect(result).toEqual({
        isValid: false,
        errorMessage: 'Either email or phoneNumber is required',
      });
    });

    it('should return invalid when both are empty strings', () => {
      const result = validateEmailAndPhoneNumber('', '');
      expect(result).toEqual({
        isValid: false,
        errorMessage: 'Either email or phoneNumber is required',
      });
    });

    it('should return invalid when neither is provided', () => {
      const result = validateEmailAndPhoneNumber('', '');
      expect(result).toEqual({
        isValid: false,
        errorMessage: 'Either email or phoneNumber is required',
      });
    });
  });

  describe('transformOtpLoginResponse', () => {
    it('should return requestId and userExists:true on success', () => {
      const response = {
        data: { success: true, requestId: '12345', existing: true },
      };
      const result = transformOtpLoginResponse(response);
      expect(result).toEqual({ requestId: '12345', userExists: true });
    });

    it('should return undefined values if requestId and existing are not present in the response', () => {
      const response = { data: { success: true } };
      const result = transformOtpLoginResponse(response);
      expect(result).toEqual({ requestId: undefined, userExists: undefined });
    });
  });

  describe('transformEmailLoginRequest', () => {
    it('should transform the request correctly', () => {
      const request = {
        body: { email: 'Test@Example.COM' },
        url: new URL('http://localhost/login'),
      };
      const transformedRequest = transformEmailLoginRequest(request);
      expect(transformedRequest.url.search).toBe('?emailId=test@example.com');
      expect(transformedRequest.body).toBeNull();
    });
  });

  describe('transformEmailLoginResponse', () => {
    it('should return userExists: true when API response data is true', () => {
      const response = { data: true };
      const result = transformEmailLoginResponse(response);
      expect(result).toEqual({ requestId: '', userExists: true });
    });

    it('should return userExists: false when API response data is false', () => {
      const response = { data: false };
      const result = transformEmailLoginResponse(response);
      expect(result).toEqual({ requestId: '', userExists: false });
    });

    it('should throw CustomError if responseData is null or undefined', () => {
      expect(() => transformEmailLoginResponse(null)).toThrow(CustomError);
      expect(Logger.error).toHaveBeenCalledWith(
        'Error for Email Login API method: transformEmailLoginResponse CCP Email Login API is failing',
      );
      expect(CustomError).toHaveBeenCalledWith(
        'CCP Email Login API is failing',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    });
  });
});
