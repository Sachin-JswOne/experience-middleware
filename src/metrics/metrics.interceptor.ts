import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';
import { MetricsAggregator } from './metrics.aggregator';
import { MetricsPublisher } from './metrics.publisher';
import { MetricsSampleStore } from './metrics.sample-store';
import { CacheServedBy, DownstreamRecord, RequestRecord } from './metrics.types';
import { Request, Response } from 'express';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    private readonly aggregator: MetricsAggregator,
    private readonly publisher: MetricsPublisher,
    private readonly sampleStore: MetricsSampleStore,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<Request>();
    const res = httpCtx.getResponse<Response>();

    req['_metricsStartTime'] = Date.now();

    return next.handle().pipe(
      // Reference only — serialized in finalize, and only for error samples.
      // Handlers using @Res stash their payload themselves; don't overwrite it
      // with the ServerResponse object they return.
      tap((data) => {
        if (req['_metricsResponseBody'] === undefined) {
          req['_metricsResponseBody'] = data;
        }
      }),
      catchError((err: any) => {
        // Keep the error payload so the finalize block can attach it to the
        // route error sample (the exception filter serializes it after us).
        req['_metricsErrorBody'] = err?.response?.data ?? { message: err?.message };
        req['_metricsErrorStatus'] = err?.status ?? err?.statusCode;
        return throwError(() => err);
      }),
      finalize(() => {
        const path = req.path;
        if (path === '/metrics' || path === '/health' || path.includes('/metrics')) {
          return;
        }

        const startTime = (req['_metricsStartTime'] as number) || Date.now();
        const durationMs = Date.now() - startTime;
        const route = (req['_metricsRoute'] as string) || (req as any).route?.path || req.path;
        const method = req.method;

        const rawDownstream = (req['_metricsDownstream'] || []) as DownstreamRecord[];
        // Strip request/response payload references before the record enters
        // the retention buffer — they exist only for error samples below.
        const downstreamTargets: DownstreamRecord[] = rawDownstream.map(
          ({ requestUrl, requestHeaders, requestBody, responseBody, ...slim }) => slim,
        );

        const cacheHit = req['_metricsCacheHit'] === true;
        const cacheServedBy = (req['_metricsCacheServedBy'] as CacheServedBy) || 'none';

        const statusCode = (req['_metricsErrorStatus'] as number) || res.statusCode;

        const record: RequestRecord = {
          timestamp: Date.now(),
          route,
          method,
          statusCode,
          durationMs,
          cacheHit,
          cacheServedBy,
          downstreamTargets,
        };

        this.aggregator.recordRequest(record);
        this.publisher.enqueue(record);

        if (this.sampleStore.isEnabled()) {
          this.sampleStore.record({
            ts: record.timestamp,
            route,
            method,
            statusCode,
            durationMs,
            url: req.originalUrl || req.url,
            requestHeaders: MetricsSampleStore.sanitizeHeaders(req.headers as Record<string, unknown>),
            requestBody: MetricsSampleStore.sanitizeBody(
              method === 'GET' || method === 'HEAD' ? req.query : req.body,
            ),
            responseBody: MetricsSampleStore.sanitizeBody(
              req['_metricsErrorBody'] ?? req['_metricsResponseBody'],
            ),
            downstream: rawDownstream.map((d) => ({
              target: d.target,
              durationMs: d.durationMs,
              statusCode: d.statusCode,
              success: d.success,
              requestUrl: d.requestUrl,
              requestHeaders: MetricsSampleStore.sanitizeHeaders(d.requestHeaders),
              requestBody: MetricsSampleStore.sanitizeBody(d.requestBody),
              responseBody: MetricsSampleStore.sanitizeBody(d.responseBody),
            })),
          });
        }
      }),
    );
  }
}
