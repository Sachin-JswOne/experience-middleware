/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { convertAuthorizationToAccessTokenInHeader } from '../general.transformers';
import { BaseRequest } from 'src/models/base-request.model';

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
