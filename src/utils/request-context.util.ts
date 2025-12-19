import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  sfId?: string | null;
  ctId?: string | null;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getUserIdentifiersFromContext(): RequestContext {
  return requestContext.getStore() ?? {};
}
