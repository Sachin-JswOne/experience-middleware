// src/model/TransformedRequest.ts

import { IncomingHttpHeaders } from 'http';

export interface BaseRequest {
  url: URL;
  headers: IncomingHttpHeaders;
  body?: any;
}
