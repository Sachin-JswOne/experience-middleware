// src/controller/proxy.controller.ts
import { Controller, All, Req, Res, HttpStatus, Logger } from '@nestjs/common';
import { ProxyService } from '../service/proxy.service';
import { Request, Response } from 'express';
import { CustomError } from 'src/utils/CustomError';
import { AxiosError } from 'axios';

type TracedRequest = Request & {
  traceId?: string;
  spanId?: string;
};

function extractErrorMessage(data: any, fallback = 'Internal server error'): string {
  if (!data) return fallback;

  if (typeof data === 'string') return data;

  if (Array.isArray(data)) {
    return (
      data[0]?.message ||
      data[0]?.error ||
      data[0]?.error_description ||
      fallback
    );
  }

  return (
    data?.error?.message ||
    data?.error ||
    data?.message ||
    data?.error_description ||
    fallback
  );
}

@Controller()
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @All('public/*path')
  async handle(@Req() req: TracedRequest, @Res() res: Response) {
    const startTime = Date.now();
    const startIso = new Date(startTime).toISOString();

    this.logger.log(
      `[REQUEST START] method=${req.method} path=${req.path} timestamp=${startIso} trace_id=${req.traceId ?? ''} span_id=${req.spanId ?? ''}`,
    );

    try {
      const data = await this.proxyService.handleRequest(req);
      const downstreamSetCookie = (req as any).__downstreamSetCookie;

      if (Array.isArray(downstreamSetCookie) && downstreamSetCookie.length > 0) {
        res.setHeader('Set-Cookie', downstreamSetCookie);
      }
      const endTime = Date.now();
      res.status(HttpStatus.OK).json(data);

      this.logger.log(
      `[REQUEST END] method=${req.method} path=${req.path} status=${HttpStatus.OK} start=${startIso} end=${new Date(endTime).toISOString()} duration_ms=${endTime - startTime} trace_id=${req.traceId ?? ''} span_id=${req.spanId ?? ''}`,
      );
    } catch (err: unknown) {

      const endTime = Date.now();
      const statusCode =
        err instanceof AxiosError
          ? err.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          : err instanceof CustomError
            ? err.httpStatusCode
            : HttpStatus.INTERNAL_SERVER_ERROR;

      const errorMessage =
        err instanceof AxiosError
          ? extractErrorMessage(err.response?.data, err.message)
          : err instanceof Error
            ? err.message
            : 'Internal server error';

      this.logger.error(
        `[REQUEST END] method=${req.method} path=${req.path} status=${statusCode} start=${startIso} end=${new Date(endTime).toISOString()} duration_ms=${endTime - startTime} trace_id=${req.traceId ?? ''} span_id=${req.spanId ?? ''} error=${errorMessage}`,
      );

      const downstreamResponse =
        err instanceof CustomError ? (err as any).downstreamResponse : null;

      if (downstreamResponse) {
        return res.status(statusCode).json(downstreamResponse);
      }

      return res.status(statusCode).json({ error: errorMessage });
    }
  }
}