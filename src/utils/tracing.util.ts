import { trace, context } from '@opentelemetry/api';
import { inspect } from 'util';
import { getUserIdentifiersFromContext } from './request-context.util';

/**
 * Generic tracing utility to get current span context for logging
 * This eliminates code duplication across transformer files
 */
export function getTracingContext(): { traceId?: string; spanId?: string } {
  const activeSpan = trace.getSpan(context.active());
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  }
  return {};
}

/**
 * Formats trace and span IDs for logging with optional chaining
 * @param tracingContext - The tracing context object
 * @returns Formatted string for trace_id and span_id
 */
export function formatTracingIds(tracingContext: {
  traceId?: string;
  spanId?: string;
}): string {
  const traceId = tracingContext.traceId ? inspect(tracingContext.traceId) : '';
  const spanId = tracingContext.spanId ? inspect(tracingContext.spanId) : '';
  return `trace_id: ${traceId} span_id: ${spanId}`;
}

/**
 * Gets the current tracing context and formats it for logging
 * @returns Formatted tracing string ready for use in log messages
 */
export function getFormattedTracingContext(): string {
  const tracingContext = getTracingContext();
  return formatTracingIds(tracingContext);
}

export function getFormattedUserIdentifiersFromContext(): string {
  const { sfId, ctId } = getUserIdentifiersFromContext();
  const sfIdStr = `sfId: ${sfId ? sfId : '-'}`;
  const ctIdStr = `ctId: ${ctId ? ctId : '-'}`;
  const userContext = [sfIdStr, ctIdStr].filter(Boolean).join(' ');
  return userContext;
}
