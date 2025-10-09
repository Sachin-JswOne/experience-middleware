/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  createAddress,
  getAddressRequest,
  getAddressResponse,
  getSfIdFromHeaders,
  transformAddress,
} from '../address.transformers';
import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { CustomError } from 'src/utils/CustomError';
import { HttpStatus } from '@nestjs/common';

jest.mock('jsonwebtoken', () => ({
  decode: jest.fn(),
}));
import * as jwt from 'jsonwebtoken';
describe('address.transformers.createAddress', () => {
  const baseBody = {
    accountId: '123',
    projectName: 'Test Project',
    addressLine1: 'Line 1',
    addressLine2: 'Line 2',
    city: 'Mumbai',
    district: 'Mumbai Suburban',
    state: 'Maharashtra',
    pincode: '400001',
  };

  const makeRequest = (overrides?: Partial<BaseRequest>): BaseRequest => ({
    url: new URL('https://mock-url.com'),
    headers: {},
    body: { ...baseBody },
    ...(overrides ?? {}),
  });

  it('should transform request with Salesforce token (happy path)', () => {
    const mockPrevResponses: AggregatedResponse[] = [
      {
        target: 'get-sf-tokens',
        success: true,
        data: { access_token: 'mockToken123' },
      },
    ];

    const req = makeRequest();
    const result = createAddress(req, mockPrevResponses);

    // Authorization header is set
    expect(result.headers?.Authorization).toBe('Bearer mockToken123');

    // Body is wrapped into SiteAddressDataList with the same fields
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

    // URL preserved
    expect(result.url.toString()).toBe('https://mock-url.com/');
  });

  it('should throw CustomError if no access token found (prevResponses = [])', () => {
    const req = makeRequest();

    try {
      createAddress(req, []);
      fail('Expected CustomError to be thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(CustomError);
      expect(e.message).toBe(
        'Access token not found from Salesforce token API',
      );
      expect(e.httpStatusCode).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('should throw CustomError if prevResponses is undefined', () => {
    const req = makeRequest();
    expect(() => createAddress(req, undefined)).toThrow(CustomError);
    try {
      createAddress(req, undefined);
    } catch (e: any) {
      expect(e.message).toBe(
        'Access token not found from Salesforce token API',
      );
      expect(e.httpStatusCode).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('should throw CustomError if access token is empty/falsy', () => {
    const cases: AggregatedResponse[][] = [
      [{ target: 'get-sf-tokens', success: true, data: { access_token: '' } }],
      [
        {
          target: 'get-sf-tokens',
          success: true,
          data: { access_token: null } as any,
        },
      ],
      [
        {
          target: 'get-sf-tokens',
          success: true,
          data: { access_token: undefined } as any,
        },
      ],
    ];

    for (const prev of cases) {
      const req = makeRequest();
      expect(() => createAddress(req, prev)).toThrow(CustomError);
      try {
        createAddress(req, prev);
      } catch (e: any) {
        expect(e.message).toBe(
          'Access token not found from Salesforce token API',
        );
        expect(e.httpStatusCode).toBe(HttpStatus.BAD_REQUEST);
      }
    }
  });

  it('should not mutate the original request object', () => {
    const original: BaseRequest = makeRequest({
      headers: { 'x-static': 'keep' },
    });
    const originalClone = {
      url: original.url.toString(),
      headers: { ...(original.headers as Record<string, unknown>) },
      body: { ...(original.body as Record<string, unknown>) },
    };

    const prev: AggregatedResponse[] = [
      {
        target: 'get-sf-tokens',
        success: true,
        data: { access_token: 'mockToken123' },
      },
    ];

    const result = createAddress(original, prev);

    // original remains unchanged
    expect(original.url.toString()).toBe(originalClone.url);
    expect(original.headers).toEqual(originalClone.headers);
    expect(original.body).toEqual(originalClone.body);

    // result is a different object and has Authorization header
    expect(result).not.toBe(original);
    expect(result.headers?.Authorization).toBe('Bearer mockToken123');
  });

  it('should overwrite headers with only Authorization (current implementation)', () => {
    const req = makeRequest({
      headers: { 'x-tenant': 'foo', 'content-type': 'application/json' },
    });
    const prev: AggregatedResponse[] = [
      {
        target: 'get-sf-tokens',
        success: true,
        data: { access_token: 'tokenABC' },
      },
    ];

    const result = createAddress(req, prev);

    // Current code replaces headers with a new object containing only Authorization
    expect(result.headers).toEqual({ Authorization: 'Bearer tokenABC' });
    // Ensure previous headers are not present on the result
    expect((result.headers as any)['x-tenant']).toBeUndefined();
    expect((result.headers as any)['content-type']).toBeUndefined();
  });

  it('should select token from "get-sf-tokens" when multiple targets exist', () => {
    const prev: AggregatedResponse[] = [
      {
        target: 'some-other-target',
        success: true,
        data: { access_token: 'wrong' },
      },
      {
        target: 'get-sf-tokens',
        success: true,
        data: { access_token: 'rightToken' },
      },
    ];
    const req = makeRequest();
    const result = createAddress(req, prev);

    expect(result.headers?.Authorization).toBe('Bearer rightToken');
  });

  it('should ignore extra fields in request body and still build SiteAddressDataList correctly', () => {
    const req = makeRequest({
      body: {
        ...baseBody,
        extra: 'ignored',
      } as any,
    });
    const prev: AggregatedResponse[] = [
      {
        target: 'get-sf-tokens',
        success: true,
        data: { access_token: 'tokenXYZ' },
      },
    ];

    const result = createAddress(req, prev);

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
});

describe('get address api test cases', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAddressRequest', () => {
    const mockRequest: BaseRequest = {
      url: new URL('http://localhost/api/address'),
      headers: {
        authorization: 'Bearer some-jwt-token',
      },
      body: {},
    };

    const mockPrevResponses: AggregatedResponse[] = [
      {
        target: 'get-sf-tokens',
        data: { access_token: 'sf-access-token' },
        success: true,
        httpStatus: 200,
      },
    ];

    it('should transform the request successfully', () => {
      (jwt.decode as jest.Mock).mockReturnValue({ sfCustomerId: '12345' });

      const transformedRequest = getAddressRequest(
        mockRequest,
        mockPrevResponses,
      );

      expect(transformedRequest.headers.Authorization).toBe(
        'Bearer sf-access-token',
      );
      expect(transformedRequest.body).toBeNull();
      expect(transformedRequest.url.search).toBe('?accountId=12345');
    });

    it('should throw an error if access token is not found', () => {
      const prevResponsesWithoutToken: AggregatedResponse[] = [
        {
          target: 'some-other-target',
          data: {},
          success: true,
          httpStatus: 200,
        },
      ];
      expect(() =>
        getAddressRequest(mockRequest, prevResponsesWithoutToken),
      ).toThrow(
        new CustomError(
          'Access token not found from Salesforce token API',
          HttpStatus.BAD_REQUEST,
        ),
      );
    });

    it('should throw an error if SF ID is not found in headers', () => {
      (jwt.decode as jest.Mock).mockReturnValue(null);
      expect(() => getAddressRequest(mockRequest, mockPrevResponses)).toThrow(
        new CustomError('SF ID not found in the token', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('getSfIdFromHeaders', () => {
    it('should return sfCustomerId from a token with Bearer prefix', () => {
      const mockToken = 'some.jwt.token';
      const headers = { authorization: `Bearer ${mockToken}` };
      (jwt.decode as jest.Mock).mockReturnValue({ sfCustomerId: 'SF123' });

      const sfId = getSfIdFromHeaders(headers);

      expect(jwt.decode).toHaveBeenCalledWith(mockToken);
      expect(sfId).toBe('SF123');
    });

    it('should return sfCustomerId from a token without Bearer prefix', () => {
      const mockToken = 'some.jwt.token';
      const headers = { authorization: mockToken };
      (jwt.decode as jest.Mock).mockReturnValue({ sfCustomerId: 'SF123' });

      const sfId = getSfIdFromHeaders(headers);

      expect(jwt.decode).toHaveBeenCalledWith(mockToken);
      expect(sfId).toBe('SF123');
    });

    it('should return null if authorization header is missing', () => {
      const headers = {};
      const sfId = getSfIdFromHeaders(headers);
      expect(sfId).toBeNull();
    });

    it('should return null if token is malformed or decoding fails', () => {
      const headers = { authorization: 'Bearer invalid-token' };
      (jwt.decode as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const sfId = getSfIdFromHeaders(headers);

      expect(sfId).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error decoding JWT:',
        expect.any(Error),
      );
      consoleErrorSpy.mockRestore();
    });

    it('should return null if decoded token has no sfCustomerId', () => {
      const mockToken = 'some.jwt.token';
      const headers = { authorization: `Bearer ${mockToken}` };
      (jwt.decode as jest.Mock).mockReturnValue({ otherClaim: 'value' });

      const sfId = getSfIdFromHeaders(headers);

      expect(sfId).toBeNull();
    });
  });

  describe('getAddressResponse', () => {
    it('should transform a successful response', () => {
      const mockAddressList = {
        AddressList: [
          {
            state: 'StateA',
            siteId: 'Site1',
            shiptoAddressTag: 'Ship1',
            sfAddressId: 'SF1',
            pincode: '12345',
            isShippingAddress: true,
            isBillingAddress: false,
            district: 'DistrictA',
            companyName: 'CompanyA',
            city: 'CityA',
            approvalStatus: 'Approved',
            addressLine2: 'Line2A',
            addressLine1: 'Line1A',
            contactNumber: '111',
          },
        ],
      };
      const mockResponse = [
        {
          target: 'get-address',
          success: true,
          data: { addressData: JSON.stringify(mockAddressList) },
        },
      ];

      const result = getAddressResponse(mockResponse);

      expect(result.AddressList).toHaveLength(1);
      expect(result.AddressList[0].underApproval).toBe(false);
      expect(result.AddressList[0].sfAddressId).toBe('SF1');
    });

    it('should throw a CustomError if a request failed', () => {
      const mockResponse = [
        {
          target: 'get-address',
          success: false,
          error: 'Something went wrong',
          httpStatus: 500,
        },
      ];

      expect(() => getAddressResponse(mockResponse)).toThrow(
        new CustomError('Something went wrong', 500),
      );
    });

    it('should return an empty AddressList if response is empty', () => {
      const result = getAddressResponse([]);
      expect(result).toEqual({ AddressList: [] });
    });

    it('should return an empty AddressList if no successful get-address response is found', () => {
      const mockResponse = [{ target: 'other-call', success: true, data: {} }];
      const result = getAddressResponse(mockResponse);
      expect(result).toEqual({ AddressList: [] });
    });

    it('should return an empty AddressList if addressData is missing', () => {
      const mockResponse = [
        {
          target: 'get-address',
          success: true,
          data: {},
        },
      ];

      const result = getAddressResponse(mockResponse);
      expect(result).toEqual({ AddressList: [] });
    });
  });

  describe('transformAddress', () => {
    const addressList = [
      {
        state: 'StateA',
        siteId: 'Site1',
        shiptoAddressTag: 'Ship1',
        sfAddressId: 'SF1',
        pincode: '12345',
        isShippingAddress: true,
        isBillingAddress: false,
        district: 'DistrictA',
        companyName: 'CompanyA',
        city: 'CityA',
        approvalStatus: 'Approved',
        addressLine2: 'Line2A',
        addressLine1: 'Line1A',
        contactNumber: '111',
      },
      {
        state: 'StateB',
        siteId: 'Site2',
        shiptoAddressTag: 'Ship2',
        sfAddressId: 'SF2',
        pincode: '67890',
        isShippingAddress: false,
        isBillingAddress: true,
        district: 'DistrictB',
        companyName: 'CompanyB',
        city: 'CityB',
        approvalStatus: 'Awaiting Approval',
        addressLine2: 'Line2B',
        addressLine1: 'Line1B',
        contactNumber: '222',
      },
      {
        state: 'StateC',
        siteId: 'Site3',
        shiptoAddressTag: 'Ship3',
        sfAddressId: 'SF3',
        pincode: '11223',
        isShippingAddress: true,
        isBillingAddress: true,
        district: 'DistrictC',
        companyName: 'CompanyC',
        city: 'CityC',
        approvalStatus: 'Rejected',
        addressLine2: 'Line2C',
        addressLine1: 'Line1C',
        contactNumber: '333',
      },
      {
        state: 'StateD',
        siteId: 'Site4',
        shiptoAddressTag: 'Ship4',
        sfAddressId: 'SF4',
        pincode: '44556',
        isShippingAddress: true,
        isBillingAddress: false,
        district: 'DistrictD',
        companyName: 'CompanyD',
        city: 'CityD',
        approvalStatus: '',
        addressLine2: 'Line2D',
        addressLine1: 'Line1D',
        contactNumber: '444',
      },
    ];

    it('should filter out rejected addresses', () => {
      const result = transformAddress(addressList);
      expect(result).toHaveLength(3);
      expect(result.find((addr) => addr.sfAddressId === 'SF3')).toBeUndefined();
    });

    it('should correctly map underApproval status', () => {
      const result = transformAddress(addressList);
      const approved = result.find((addr) => addr.sfAddressId === 'SF1');
      const awaiting = result.find((addr) => addr.sfAddressId === 'SF2');
      const emptyStatus = result.find((addr) => addr.sfAddressId === 'SF4');

      expect(approved.underApproval).toBe(false);
      expect(awaiting.underApproval).toBe(true);
      expect(emptyStatus.underApproval).toBe(false);
    });

    it('should map all fields correctly', () => {
      const result = transformAddress(addressList);
      const firstAddress = result[0];

      expect(firstAddress).toEqual({
        state: 'StateA',
        siteId: 'Site1',
        shiptoAddressTag: 'Ship1',
        sfAddressId: 'SF1',
        pincode: '12345',
        isShippingAddress: true,
        isBillingAddress: false,
        district: 'DistrictA',
        companyName: 'CompanyA',
        city: 'CityA',
        underApproval: false,
        addressLine2: 'Line2A',
        addressLine1: 'Line1A',
        contactNumber: '111',
      });
    });

    it('should return an empty array if input is empty', () => {
      const result = transformAddress([]);
      expect(result).toEqual([]);
    });
  });
});
