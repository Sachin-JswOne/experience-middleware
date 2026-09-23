// src/model/TransformedRequest.ts

import { IncomingHttpHeaders } from 'http';

export interface BaseRequest {
  url: URL;
  headers: IncomingHttpHeaders;
  /**
   * The peer address of the incoming connection, for when no forwarding header carries
   * the client IP — a direct call that did not come through the load balancer.
   */
  clientIp?: string | null;
  body?: any;
  params?: { [key: string]: any };
  responseHeaders?: Record<string, any>;
  skip?: boolean;
}
