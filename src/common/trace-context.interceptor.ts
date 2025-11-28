import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { Observable } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';

// Helper function to safely stringify objects with circular references
function safeStringify(obj: any): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
}

@Injectable()
export class TraceContextInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = ctx.switchToHttp();
    const req = httpCtx.getRequest<Record<string, unknown>>();
    const res = httpCtx.getResponse();

    // Reuse the span created automatically by @opentelemetry/instrumentation-http
    const activeSpan = trace.getSpan(context.active());

    if (activeSpan) {
      const spanContext = activeSpan.spanContext();

      // Expose trace/span IDs in response headers for debugging or correlation
      res.setHeader('trace-id', spanContext.traceId);
      res.setHeader('span-id', spanContext.spanId);

      // Optional: attach IDs to request object (for downstream services, logs, etc.)
      (req as Record<string, unknown>)['traceId'] = spanContext.traceId;
      (req as Record<string, unknown>)['spanId'] = spanContext.spanId;

      // Add route/method info as span attributes
      activeSpan.setAttribute('http.method', req.method as string);
      activeSpan.setAttribute('http.route', req.url as string);

      // normalize span name to route pattern for better Coroot matching
      const method = req.method ?? '';
      const route =
        (req as any)?.route?.path ??
        (req as any)?.originalUrl ??
        (req.url as string);
      if (route) {
        activeSpan.updateName(`${method} ${route}`);
      }
    }


    return next.handle().pipe(
      tap({
        next: (response) => {
          if (activeSpan && response) {
            // Add response data as span attributes
            const responseStr = safeStringify(response);
            activeSpan.setAttribute('http.response.size', responseStr.length);

            // Add response status if available
            if (typeof response === 'object' && response !== null) {
              // For large responses, you might want to truncate or sample
              if (responseStr.length > 1000) {
                activeSpan.setAttribute('http.response.preview', responseStr.substring(0, 1000) + '...');
                activeSpan.setAttribute('http.response.truncated', true);
              } else {
                activeSpan.setAttribute('http.response.data', responseStr);
              }
            }
          }
        },
        error: (err) => {
          if (activeSpan) {
            activeSpan.recordException(err as Error);
            activeSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: err instanceof Error ? err.message : String(err),
            });
          }
        },
      }),
      finalize(() => {
        // Add response status code if available
        if (activeSpan && res.statusCode) {
          activeSpan.setAttribute('http.status_code', res.statusCode);
        }
      }),
    );
  }
}
