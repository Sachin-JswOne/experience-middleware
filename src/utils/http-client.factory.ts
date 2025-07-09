import axios, { AxiosInstance } from 'axios';
import * as http from 'http';
import * as https from 'https';

export function createHttpClient(
  requestTimeout: number,
  socketTimeout: number,
): AxiosInstance {
  return axios.create({
    timeout: requestTimeout,
    httpAgent: new http.Agent({ keepAlive: true, timeout: socketTimeout }),
    httpsAgent: new https.Agent({ keepAlive: true, timeout: socketTimeout }),
  });
}
