import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MetricsAggregator } from './metrics.aggregator';
import { MetricsPublisher } from './metrics.publisher';
import { CacheServedBy, DownstreamRecord, RequestRecord } from './metrics.types';
import { Request, Response } from 'express';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    private readonly aggregator: MetricsAggregator,
    private readonly publisher: MetricsPublisher,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<Request>();
    const res = httpCtx.getResponse<Response>();

    req['_metricsStartTime'] = Date.now();

    return next.handle().pipe(
      finalize(() => {
        const path = req.path;
        if (path === '/metrics' || path === '/health' || path.includes('/metrics')) {
          return;
        }

        const startTime = (req['_metricsStartTime'] as number) || Date.now();
        const durationMs = Date.now() - startTime;
        const route = (req['_metricsRoute'] as string) || (req as any).route?.path || req.path;
        const method = req.method;

        const downstreamTargets = (req['_metricsDownstream'] || []) as DownstreamRecord[];

        const cacheHit = req['_metricsCacheHit'] === true;
        const cacheServedBy = (req['_metricsCacheServedBy'] as CacheServedBy) || 'none';

        const record: RequestRecord = {
          timestamp: Date.now(),
          route,
          method,
          statusCode: res.statusCode,
          durationMs,
          cacheHit,
          cacheServedBy,
          downstreamTargets,
        };

        this.aggregator.recordRequest(record);
        this.publisher.enqueue(record);
      }),
    );
  }
}
