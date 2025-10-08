import { createAddress } from '../address.transformers';
import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { CustomError } from 'src/utils/CustomError';
import { HttpStatus } from '@nestjs/common';

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
      { target: 'get-sf-tokens', success: true, data: { access_token: 'mockToken123' } },
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
      expect(e.message).toBe('Access token not found from Salesforce token API');
      expect(e.httpStatusCode).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('should throw CustomError if prevResponses is undefined', () => {
    const req = makeRequest();
    expect(() => createAddress(req, undefined)).toThrow(CustomError);
    try {
      createAddress(req, undefined);
    } catch (e: any) {
      expect(e.message).toBe('Access token not found from Salesforce token API');
      expect(e.httpStatusCode).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('should throw CustomError if access token is empty/falsy', () => {
    const cases: AggregatedResponse[][] = [
      [{ target: 'get-sf-tokens', success: true, data: { access_token: '' } }],
      [{ target: 'get-sf-tokens', success: true, data: { access_token: null } as any }],
      [{ target: 'get-sf-tokens', success: true, data: { access_token: undefined } as any }],
    ];

    for (const prev of cases) {
      const req = makeRequest();
      expect(() => createAddress(req, prev)).toThrow(CustomError);
      try {
        createAddress(req, prev);
      } catch (e: any) {
        expect(e.message).toBe('Access token not found from Salesforce token API');
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
      body: { ...original.body as Record<string, unknown> },
    };

    const prev: AggregatedResponse[] = [
      { target: 'get-sf-tokens', success: true, data: { access_token: 'mockToken123' } },
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
      { target: 'get-sf-tokens', success: true, data: { access_token: 'tokenABC' } },
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
      { target: 'some-other-target', success: true, data: { access_token: 'wrong' } },
      { target: 'get-sf-tokens', success: true, data: { access_token: 'rightToken' } },
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
      { target: 'get-sf-tokens', success: true, data: { access_token: 'tokenXYZ' } },
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
