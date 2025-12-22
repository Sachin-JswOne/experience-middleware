// src/controller/proxy.controller.ts
import { Controller, All, Req, Res, HttpStatus, Logger } from '@nestjs/common';
import { ProxyService } from '../service/proxy.service';
import { Request, Response } from 'express';
import { CustomError } from 'src/utils/CustomError';
import { AxiosError } from 'axios';

@Controller()
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @All('public/*path')
  async handle(@Req() req: Request, @Res() res: Response) {
    try {
      const data = await this.proxyService.handleRequest(req);
      res.status(HttpStatus.OK).json(data);
    } catch (err: unknown) {
      Logger.error(
        `Error for ${req.url} method: handle ${err instanceof Error ? err.message : 'Something went wrong'}`,
      );
      const statusCode =
        err instanceof CustomError ? err.httpStatusCode : HttpStatus.INTERNAL_SERVER_ERROR;

      if (err instanceof AxiosError) {
        Logger.error(
          `Error for ${req.url} method: handle ${err.response?.data?.error?.message ?? err.message}`,
        );
        return res
          .status(err.response?.status || statusCode)
          .json({ error: err.response?.data?.error?.message ?? err.message });
      }
      const errorMessage = err instanceof Error ? err.message : 'Internal server error';
      res.status(statusCode).json({ error: errorMessage });
    }
  }
}
