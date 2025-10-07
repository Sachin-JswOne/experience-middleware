import { createAddress } from '../address.transformers';
import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { CustomError } from 'src/utils/CustomError';
import { HttpStatus } from '@nestjs/common';

describe('address.transformer', () => {
  const mockRequest: BaseRequest = {
    url: new URL('https://mock-url.com'),
    headers: {},
    body: {
      accountId: '123',
      projectName: 'Test Project',
      addressLine1: 'Line 1',
      addressLine2: 'Line 2',
      city: 'Mumbai',
      district: 'Mumbai Suburban',
      state: 'Maharashtra',
      pincode: '400001',
    },
  };

  it('should transform request with Salesforce token', () => {
    const mockPrevResponses: AggregatedResponse[] = [
      { target: 'get-sf-tokens', success: true, data: { access_token: 'mockToken123' } },
    ];

    const result = createAddress(mockRequest, mockPrevResponses);

    expect(result.headers?.Authorization).toBe('Bearer mockToken123');
    expect(result.body).toEqual({
      SiteAddressDataList: [
        {
          accountId: '123',
          projectName: 'Test Project',
          addressLine1: 'Line 1',
          addressLine2: 'Line 2',
          city: 'Mumbai',
          district: 'Mumbai Suburban',
          state: 'Maharashtra',
          pincode: '400001',
        },
      ],
    });
  });

  it('should throw CustomError if no access token found', () => {
  try {
    createAddress(mockRequest, []);
    // If no error is thrown, fail the test
    fail('Expected CustomError to be thrown');
  } catch (e: any) {
    expect(e).toBeInstanceOf(CustomError);
    expect(e.message).toBe('Access token not found from Salesforce token API');
    expect(e.httpStatusCode).toBe(HttpStatus.BAD_REQUEST);
  }
});

});
