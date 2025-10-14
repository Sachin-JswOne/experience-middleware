/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { AxiosRequestConfig } from 'axios';
import * as jwt from 'jsonwebtoken';
import { GUEST, GUEST_USER_STATE } from 'src/config/app.config';

export function decryptAndAddUserDetails(
  config: AxiosRequestConfig,
): AxiosRequestConfig {
  config.headers = config.headers ?? {};

  const authHeader = config.headers.authorization as string | undefined;

  if (authHeader) {
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (token) {
      try {
        const decodedPayload: any = jwt.decode(token);

        if (decodedPayload && decodedPayload.sfCustomerId) {
          config.headers['SF-ID'] = decodedPayload.sfCustomerId;
        }
        if (decodedPayload && decodedPayload.userId) {
          config.headers['CT-ID'] = decodedPayload.userId;
        }
        delete config.headers.authorization;

        return config;
      } catch (error) {
        console.error(
          'Failed to decode/decrypt token and add user details to headers',
          error,
        );
        throw new Error('Token decryption failed');
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
