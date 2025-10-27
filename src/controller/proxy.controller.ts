/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/controller/proxy.controller.ts
import { Controller, All, Req, Res, HttpStatus } from '@nestjs/common';
import { ProxyService } from '../service/proxy.service';
import { Request, Response } from 'express';
import { CustomError } from 'src/utils/CustomError';

@Controller()
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @All('public/*path')
  async handle(@Req() req: Request, @Res() res: Response) {
    try {
      const data = await this.proxyService.handleRequest(req);
      res.status(HttpStatus.OK).json(data);
    } catch (err: unknown) {
      console.error(err);
      const statusCode =
        err instanceof CustomError
          ? err.httpStatusCode
          : HttpStatus.INTERNAL_SERVER_ERROR;

      const errorMessage =
        err instanceof Error ? err.message : 'Internal server error';
      res.status(statusCode).json({ error: errorMessage });
    }
  }
}
