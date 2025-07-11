// src/model/TransformedRequest.ts

export interface BaseRequest {
  url: URL;
  headers: Record<string, string>;
  body?: any;
  sourceQueryString?: string;
}
