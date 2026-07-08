import { trace, Tracer } from '@opentelemetry/api';

/**
 * Returns a tracer instance with the given name.
 * Uses the global OpenTelemetry tracer provider.
 */
export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}
