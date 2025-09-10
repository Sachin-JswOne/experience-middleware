/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { convertAuthorizationToAccessTokenInHeader } from '../general.transformers';
import { BaseRequest } from 'src/models/base-request.model';
import { createQueryParams } from '../general.transformers';

describe('convertAuthorizationToAccessTokenInHeader', () => {
  it('should move authorization header to access_token and remove authorization', () => {
    const request: BaseRequest = {
      headers: { authorization: 'Bearer testtoken', other: 'value' },
      body: { foo: 'bar' },
      url: { search: '' },
    } as any;

    const result = convertAuthorizationToAccessTokenInHeader(request);

    expect(result.headers?.authorization).toBeUndefined();
    expect(result.headers?.access_token).toBe('Bearer testtoken');
    expect(result.headers?.other).toBe('value');
    expect(result.body).toBeNull();
  });

  it('should handle missing authorization header gracefully', () => {
    const request: BaseRequest = {
      headers: { other: 'value' },
      body: { foo: 'bar' },
      url: { search: '' },
    } as any;

    const result = convertAuthorizationToAccessTokenInHeader(request);

    expect(result.headers?.authorization).toBeUndefined();
    expect(result.headers?.access_token).toBeUndefined();
    expect(result.headers?.other).toBe('value');
    expect(result.body).toBeNull();
  });

  it('should return original request if an error occurs', () => {
    // Simulate error by passing a request with headers as null
    const request: BaseRequest = {
      headers: null,
      body: { foo: 'bar' },
      url: { search: '' },
    } as any;

    const result = convertAuthorizationToAccessTokenInHeader(request);

    expect(result).toEqual({ headers: null, body: null, url: { search: '' } });
  });
});

describe('createQueryParams', () => {
  it('should add hardcoded query params when no existing query params are present', () => {
    const request: BaseRequest = {
      url: { search: '' },
      headers: {},
      body: null,
    } as any;

    const result = createQueryParams(request);

    const expectedParams = {
      grant_type: 'password',
      client_id: '3MVG9ZUGg10Hh224GhhTm_qyu2_U9Xs2YK_31FhfHv7csgYVsNYdGKfme3sdrOHBzmkxPi7rbaoix9EQEemfr',
      client_secret: 'D612EF37A28B2CFEAEA2D9A9241C84188174EFBCF09565FFCA4DA2CF479A5058',
      username: 'integration.user@stetig.in.jsw.uat',
      password: 'JSW1@123V5zyNsAkVePDrsIbUw08v10E',
    };

    // Parse the search string back to object for easier comparison
    const parsedParams = require('qs').parse(result.url.search);
    console.log(parsedParams)
    expect(parsedParams).toEqual(expectedParams);
    // Also check that other parts of the request remain unchanged
    expect(result.body).toBe(request.body);
    expect(result.headers).toBe(request.headers);
  });

  it('should override existing query params with hardcoded ones', () => {
    const existingParams = {
      grant_type: 'someOtherGrant',
      extra_param: 'shouldRemain',
    };

    const request: BaseRequest = {
      url: { search: `?${require('qs').stringify(existingParams)}` },
      headers: {},
      body: null,
    } as any;

    const result = createQueryParams(request);

    const parsedParams = require('qs').parse(result.url.search);

    // Hardcoded values override grant_type
    expect(parsedParams.grant_type).toBe('password');

    // Extra param remains
    expect(parsedParams.extra_param).toBe('shouldRemain');

    // Hardcoded params exist
    expect(parsedParams.client_id).toBeDefined();
    expect(parsedParams.client_secret).toBeDefined();
    expect(parsedParams.username).toBeDefined();
    expect(parsedParams.password).toBeDefined();
  });

  it('should handle when url.search is undefined or null gracefully', () => {
    const requestUndefined: BaseRequest = {
      url: { search: undefined },
      headers: {},
      body: null,
    } as any;

    const resultUndefined = createQueryParams(requestUndefined);
    const parsedParamsUndefined = require('qs').parse(resultUndefined.url.search);

    expect(parsedParamsUndefined.grant_type).toBe('password');

    const requestNull: BaseRequest = {
      url: { search: null },
      headers: {},
      body: null,
    } as any;

    const resultNull = createQueryParams(requestNull);
    const parsedParamsNull = require('qs').parse(resultNull.url.search);

    expect(parsedParamsNull.grant_type).toBe('password');
  });
});
