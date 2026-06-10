import { AxiosRequestConfig } from 'axios';
import * as jwt from 'jsonwebtoken';
import { Logger } from '@nestjs/common';
import { GUEST, GUEST_USER_STATE, JWT_SECRET } from 'src/config/app.config';

const logger = new Logger('AuthInterceptor');

export function decryptAndAddUserDetails(config: AxiosRequestConfig): AxiosRequestConfig {
  config.headers = config.headers ?? {};

  const authHeader = config.headers.authorization as string | undefined;

  if (authHeader) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (token) {
      try {
        if (!JWT_SECRET) {
          throw new Error('Server misconfiguration: JWT_SECRET is not set');
        }
        const decodedPayload = jwt.verify(token, JWT_SECRET) as {
          sfCustomerId?: string;
          userId?: string;
        };

        if (decodedPayload.sfCustomerId) {
          config.headers['SF-ID'] = decodedPayload.sfCustomerId;
        }
        if (decodedPayload.userId) {
          config.headers['CT-ID'] = decodedPayload.userId;
        }
        delete config.headers.authorization;

        return config;
      } catch (error) {
        logger.error('Failed to verify token and add user details to headers', error);
        throw new Error('Token verification failed');
      }
    }
  }

  const userState = config.headers['x-user-state'];

  if (userState && userState === GUEST_USER_STATE) {
    config.headers['SF-ID'] = GUEST;
    config.headers['CT-ID'] = GUEST;
    delete config.headers['x-user-state'];
  }

  return config;
}
/*
we can add the interceptors in route-config.json as an array 
ex: "interceptors": ["auth.interceptors.decryptAndAddUserDetails"],
*/
