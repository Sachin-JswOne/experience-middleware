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

    try {
      const data = await this.proxyService.handleRequest(req);
      res.status(HttpStatus.OK).json(data);

      this.logger.log(
        `Request completed ${req.method} ${req.path} status=${HttpStatus.OK} trace_id=${req.traceId ?? ''} span_id=${req.spanId ?? ''} duration_ms=${Date.now() - startTime}`,
      );
    } catch (err: unknown) {
      const downstreamResponse =
        err instanceof CustomError ? (err as any).downstreamResponse : null;

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
        `Request failed ${req.method} ${req.path} status=${statusCode} trace_id=${req.traceId ?? ''} span_id=${req.spanId ?? ''} duration_ms=${Date.now() - startTime} error=${errorMessage}`,
      );

      if (downstreamResponse) {
        return res.status(statusCode).json(downstreamResponse);
      }

      return res.status(statusCode).json({ error: errorMessage });
    }
  }
}