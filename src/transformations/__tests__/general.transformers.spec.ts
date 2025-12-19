import * as qs from 'qs';
import {
  moveBodyToQueryParams,
  convertToGetRequest,
  convertAuthorizationToAccessTokenInHeader,
  createQueryParams,
} from '../general.transformers';
import { BaseRequest } from 'src/models/base-request.model';

jest.mock('src/config/app.config', () => ({
  SF_QUERY_PARAMS: { envParam: 'valueFromEnv' },
}));

describe('general.transformers', () => {
  let baseRequest: BaseRequest;

  beforeEach(() => {
    baseRequest = {
      url: new URL('https://mock-url.com?existing=1'),
      headers: { authorization: 'Bearer abc123' },
      body: { foo: 'bar' },
    };
  });

  describe('moveBodyToQueryParams', () => {
    it('should move body params into query string', () => {
      const result = moveBodyToQueryParams(baseRequest);
      expect(result.body).toBeNull();
      const parsed = qs.parse(result.url.search.replace(/^\?/, ''));
      expect(parsed).toEqual({ existing: '1', foo: 'bar' });
    });
  });

  describe('convertToGetRequest', () => {
    it('should set body to null', () => {
      const result = convertToGetRequest(baseRequest);
      expect(result.body).toBeNull();
    });
  });

  describe('convertAuthorizationToAccessTokenInHeader', () => {
    it('should move authorization header to access_token', () => {
      const result = convertAuthorizationToAccessTokenInHeader(baseRequest);
      expect(result.headers?.access_token).toBe('Bearer abc123');
      expect(result.headers?.authorization).toBeUndefined();
    });

    it('should leave headers unchanged if no authorization present', () => {
      delete baseRequest.headers.authorization;
      const result = convertAuthorizationToAccessTokenInHeader(baseRequest);
      expect(result.headers?.access_token).toBeUndefined();
    });
  });

  describe('createQueryParams', () => {
    it('should merge existing query params with SF_QUERY_PARAMS', () => {
      const result = createQueryParams(baseRequest);
      const parsed = qs.parse(result.url.search.replace(/^\?/, ''));
      expect(parsed).toMatchObject({ existing: '1', envParam: 'valueFromEnv' });
    });
  });
});
