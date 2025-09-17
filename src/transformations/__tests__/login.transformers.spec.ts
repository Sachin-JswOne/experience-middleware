import { HttpStatus } from '@nestjs/common';
import {
  transformResetPasswordRequest,
  transformResetPasswordResponse,
  transformVerifyMobileNumberRequest,
  transformVerifyMobileNumberResponse,
} from '../login.transformers';
import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';
import { MSME } from 'src/config/app.config';

describe('login.transformers', () => {
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
        new CustomError(
          response.data.data.message,
          response.data.data.statusCode,
        ),
      );
    });

    it('should handle empty or unexpected response structures gracefully', () => {
      const response = {};
      expect(() => transformResetPasswordResponse(response)).toThrow();

      const responseWithNullData = { data: null };
      expect(() =>
        transformResetPasswordResponse(responseWithNullData),
      ).toThrow();
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
        new CustomError(
          'Incorrect OTP. Please enter a valid OTP',
          HttpStatus.BAD_REQUEST,
        ),
      );
    });
  });
});
