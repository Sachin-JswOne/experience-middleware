import { AxiosRequestConfig } from 'axios';
import * as jwt from 'jsonwebtoken';
import { GUEST, GUEST_USER_STATE } from 'src/config/app.config';
import { decryptAndAddUserDetails } from '../auth.interceptors';

jest.mock('jsonwebtoken', () => ({
  decode: jest.fn(),
}));

describe('decryptAndAddUserDetails', () => {
  let mockConfig: AxiosRequestConfig;
  const mockJwt = jwt as jest.Mocked<typeof jwt>;

  beforeEach(() => {
    mockConfig = {
      headers: {},
    };
    jest.clearAllMocks();
  });

  it('should add SF-ID and CT-ID from a valid Bearer token and remove authorization header', () => {
    const token = 'valid.token.string';
    const decodedPayload = {
      sfCustomerId: 'sf123',
      userId: 'ct456',
    };
    mockConfig.headers = { authorization: `Bearer ${token}` };
    mockJwt.decode.mockReturnValue(decodedPayload);

    const result = decryptAndAddUserDetails(mockConfig);

    expect(jwt.decode).toHaveBeenCalledWith(token);
    expect(result.headers).toHaveProperty('SF-ID', 'sf123');
    expect(result.headers).toHaveProperty('CT-ID', 'ct456');
    expect(result.headers).not.toHaveProperty('authorization');
  });

  it('should handle token without "Bearer " prefix', () => {
    const token = 'valid.token.string';
    const decodedPayload = {
      sfCustomerId: 'sf123',
      userId: 'ct456',
    };
    mockConfig.headers = { authorization: token };
    mockJwt.decode.mockReturnValue(decodedPayload);

    const result = decryptAndAddUserDetails(mockConfig);

    expect(jwt.decode).toHaveBeenCalledWith(token);
    expect(result.headers).toHaveProperty('SF-ID', 'sf123');
    expect(result.headers).toHaveProperty('CT-ID', 'ct456');
    expect(result.headers).not.toHaveProperty('authorization');
  });

  it('should only add SF-ID if userId is not in payload', () => {
    const token = 'valid.token.string';
    const decodedPayload = { sfCustomerId: 'sf123' };
    mockConfig.headers = { authorization: `Bearer ${token}` };
    mockJwt.decode.mockReturnValue(decodedPayload);

    const result = decryptAndAddUserDetails(mockConfig);

    expect(result.headers).toHaveProperty('SF-ID', 'sf123');
    expect(result.headers).not.toHaveProperty('CT-ID');
    expect(result.headers).not.toHaveProperty('authorization');
  });

  it('should only add CT-ID if sfCustomerId is not in payload', () => {
    const token = 'valid.token.string';
    const decodedPayload = { userId: 'ct456' };
    mockConfig.headers = { authorization: `Bearer ${token}` };
    mockJwt.decode.mockReturnValue(decodedPayload);

    const result = decryptAndAddUserDetails(mockConfig);

    expect(result.headers).not.toHaveProperty('SF-ID');
    expect(result.headers).toHaveProperty('CT-ID', 'ct456');
    expect(result.headers).not.toHaveProperty('authorization');
  });

  it('should throw an error if jwt.decode fails', () => {
    const token = 'invalid.token';
    mockConfig.headers = { authorization: `Bearer ${token}` };
    const decodeError = new Error('Invalid token format');
    mockJwt.decode.mockImplementation(() => {
      throw decodeError;
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => decryptAndAddUserDetails(mockConfig)).toThrow('Token decryption failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to decode/decrypt token and add user details to headers',
      decodeError,
    );

    consoleErrorSpy.mockRestore();
  });

  it('should add guest headers if x-user-state is GUEST_USER_STATE', () => {
    mockConfig.headers = { 'x-user-state': GUEST_USER_STATE };

    const result = decryptAndAddUserDetails(mockConfig);

    expect(result.headers).toHaveProperty('SF-ID', GUEST);
    expect(result.headers).toHaveProperty('CT-ID', GUEST);
  });

  it('should not add guest headers if x-user-state is not GUEST_USER_STATE', () => {
    mockConfig.headers = { 'x-user-state': 'LOGGED_IN' };

    const result = decryptAndAddUserDetails(mockConfig);

    expect(result.headers).not.toHaveProperty('SF-ID');
    expect(result.headers).not.toHaveProperty('CT-ID');
  });

  it('should return config unchanged if no auth headers are present', () => {
    const result = decryptAndAddUserDetails(mockConfig);

    expect(result).toBe(mockConfig);
    expect(result.headers).toEqual({});
    expect(jwt.decode).not.toHaveBeenCalled();
  });

  it('should return config unchanged if authorization header is empty', () => {
    mockConfig.headers = { authorization: '' };
    const result = decryptAndAddUserDetails(mockConfig);

    expect(result.headers).toEqual({ authorization: '' });
    expect(jwt.decode).not.toHaveBeenCalled();
  });

  it('should initialize headers object if it is null or undefined', () => {
    mockConfig.headers = undefined;
    const result = decryptAndAddUserDetails(mockConfig);
    expect(result.headers).toBeDefined();
    expect(result.headers).toEqual({});
  });

  it('should not overwrite existing SF-ID/CT-ID if auth token is present', () => {
    const token = 'valid.token.string';
    const decodedPayload = {
      sfCustomerId: 'sf123',
      userId: 'ct456',
    };
    mockConfig.headers = {
      authorization: `Bearer ${token}`,
      'SF-ID': 'old-sf-id',
      'CT-ID': 'old-ct-id',
    };
    mockJwt.decode.mockReturnValue(decodedPayload);

    const result = decryptAndAddUserDetails(mockConfig);

    expect(result.headers).toHaveProperty('SF-ID', 'sf123');
    expect(result.headers).toHaveProperty('CT-ID', 'ct456');
  });

  it('should not add guest headers if an authorization header is successfully processed', () => {
    const token = 'valid.token.string';
    const decodedPayload = {
      sfCustomerId: 'sf123',
      userId: 'ct456',
    };
    mockConfig.headers = {
      authorization: `Bearer ${token}`,
      'x-user-state': GUEST_USER_STATE,
    };
    mockJwt.decode.mockReturnValue(decodedPayload);

    const result = decryptAndAddUserDetails(mockConfig);

    expect(result.headers).toBeDefined();
    if (result.headers) {
      expect(result.headers['SF-ID']).toBe('sf123');
      expect(result.headers['CT-ID']).toBe('ct456');
      expect(result.headers['x-user-state']).toBe(GUEST_USER_STATE);
    }
  });
});
