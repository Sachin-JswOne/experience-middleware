import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  sfId?: string | null;
  ctId?: string | null;
  /** The inbound request's parsed query string, for transformers that run without the request. */
  query?: Record<string, any>;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getUserIdentifiersFromContext(): RequestContext {
  return requestContext.getStore() ?? {};
}

/**
 * The inbound query string. Response transformers are handed only the downstream
 * responses, so this is how they read caller-supplied params. Empty when there is
 * no active request context (e.g. unit tests).
 */
export function getQueryFromContext(): Record<string, any> {
  return requestContext.getStore()?.query ?? {};
}
