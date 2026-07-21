import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MetricsAggregator } from './metrics.aggregator';
import { RequestRecord } from './metrics.types';
import { Request, Response } from 'express';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly aggregator: MetricsAggregator) {}

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
        const route = (req as any).route?.path || req.path;
        const method = req.method;

        const downstreamTargets = (req['_metricsDownstream'] || []) as Array<{
          target: string;
          durationMs: number;
          success: boolean;
        }>;

        const cacheHit = req['_metricsCacheHit'] === true;

        const record: RequestRecord = {
          timestamp: Date.now(),
          route,
          method,
          statusCode: res.statusCode,
          durationMs,
          cacheHit,
          downstreamTargets,
        };

        this.aggregator.recordRequest(record);
      }),
    );
  }
}
