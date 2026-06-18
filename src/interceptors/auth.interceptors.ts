import { AxiosRequestConfig } from 'axios';
import * as jwt from 'jsonwebtoken';
import { Logger } from '@nestjs/common';
import { GUEST, GUEST_USER_STATE, JWT_SECRET } from 'src/config/app.config';

const logger = new Logger('AuthInterceptor');

function getBearerToken(authHeader: string): string {
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
}

function addDecodedUserHeaders(config: AxiosRequestConfig, token: string): AxiosRequestConfig {
  if (!JWT_SECRET) {
    throw new Error('Server misconfiguration: JWT_SECRET is not set');
  }

  const decodedPayload = jwt.verify(token, JWT_SECRET) as {
    sfCustomerId?: string;
    userId?: string;
  };

  if (decodedPayload.sfCustomerId) {
    config.headers!['SF-ID'] = decodedPayload.sfCustomerId;
  }

  if (decodedPayload.userId) {
    config.headers!['CT-ID'] = decodedPayload.userId;
  }

  delete config.headers!.authorization;

  return config;
}

function addGuestUserHeaders(config: AxiosRequestConfig): AxiosRequestConfig {
  if (config.headers?.['x-user-state'] !== GUEST_USER_STATE) {
    return config;
  }

  config.headers['SF-ID'] = GUEST;
  config.headers['CT-ID'] = GUEST;
  delete config.headers['x-user-state'];

  return config;
}

export function decryptAndAddUserDetails(config: AxiosRequestConfig): AxiosRequestConfig {
  config.headers = config.headers ?? {};

  const authHeader = config.headers.authorization as string | undefined;

  if (!authHeader) {
    return addGuestUserHeaders(config);
  }

  const token = getBearerToken(authHeader);

  if (!token) {
    return addGuestUserHeaders(config);
  }

  try {
    return addDecodedUserHeaders(config, token);
  } catch (error) {
    logger.error('Failed to verify token and add user details to headers', error);
    throw new Error('Token verification failed');
  }
}
