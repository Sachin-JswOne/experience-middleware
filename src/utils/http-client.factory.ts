import * as http from 'http';
import * as https from 'https';
import { getInterceptor } from './transformer.util';
import axios from 'axios';

export async function createHttpClient(
  requestTimeout: number,
  socketTimeout: number,
  interceptors?: string[],
) {
  const client = axios.create({
    timeout: requestTimeout,
    httpAgent: new http.Agent({ keepAlive: true, timeout: socketTimeout }),
    httpsAgent: new https.Agent({ keepAlive: true, timeout: socketTimeout }),
  });

  if (interceptors && interceptors.length > 0) {
    for (const interceptorName of interceptors) {
      const interceptorFn = await getInterceptor(interceptorName);
      if (interceptorFn) {
        client.interceptors.request.use(interceptorFn);
      }
    }
  }

  return client;
}
