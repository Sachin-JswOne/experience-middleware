// src/controller/proxy.controller.ts
import { Controller, All, Req, Res, HttpStatus, Logger } from '@nestjs/common';
import { ProxyService } from '../service/proxy.service';
import { Request, Response } from 'express';
import { CustomError } from 'src/utils/CustomError';
import { AxiosError } from 'axios';
import * as Sentry from '@sentry/nestjs';

@Controller()
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) { }

  @All('public/*path')
  async handle(@Req() req: Request, @Res() res: Response) {
    return await Sentry.startSpan(
      {
        name: `${req.method} ${req.path}`,
        op: 'http.server',
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
          'http.path': req.path,
          'http.query': JSON.stringify(req.query),
        },
      },
      async () => {
        try {
          // Add breadcrumb for request start
          Sentry.addBreadcrumb({
            category: 'proxy.request',
            message: `Processing ${req.method} ${req.path}`,
            level: 'info',
            data: {
              method: req.method,
              path: req.path,
              query: req.query,
            },
          });

          const data = await this.proxyService.handleRequest(req);

          // Add breadcrumb for successful response
          Sentry.addBreadcrumb({
            category: 'proxy.response',
            message: `Successfully processed ${req.method} ${req.path}`,
            level: 'info',
          });

          res.status(HttpStatus.OK).json(data);
        } catch (err: unknown) {
          Logger.error(
            `Error for ${req.url} method: handle ${err instanceof Error ? err.message : 'Something went wrong'}`,
          );

          // Capture error context in Sentry
          Sentry.setContext('request', {
            method: req.method,
            url: req.url,
            path: req.path,
            query: req.query,
            headers: req.headers,
          });

          const statusCode =
            err instanceof CustomError ? err.httpStatusCode : HttpStatus.INTERNAL_SERVER_ERROR;

          if (err instanceof AxiosError) {
            Logger.error(
              `Error for ${req.url} method: handle ${err.response?.data?.error?.message ?? err.message}`,
            );

            // Capture Axios error with additional context
            Sentry.captureException(err, {
              tags: {
                error_type: 'axios_error',
                status_code: err.response?.status,
              },
              contexts: {
                axios: {
                  response_status: err.response?.status,
                  response_data: err.response?.data,
                },
              },
            });

            return res
              .status(err.response?.status || statusCode)
              .json({ error: err.response?.data?.error?.message ?? err.message });
          }

          // Capture generic error
          Sentry.captureException(err, {
            tags: {
              error_type: err instanceof CustomError ? 'custom_error' : 'generic_error',
              status_code: statusCode,
            },
          });

          const errorMessage = err instanceof Error ? err.message : 'Internal server error';
          res.status(statusCode).json({ error: errorMessage });
        }
      },
    );
  }
}
