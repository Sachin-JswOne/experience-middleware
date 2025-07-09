/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/controller/proxy.controller.ts
import { Controller, All, Req, Res, HttpStatus } from '@nestjs/common';
import { ProxyService } from '../service/proxy.service';
import { Request, Response } from 'express';

@Controller()
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @All('*')
  async handle(@Req() req: Request, @Res() res: Response) {
    try {
      const data = await this.proxyService.handleRequest(
        req.path,
        req.method,
        req.body,
        req.query,
      );
      res.status(HttpStatus.OK).json(data);
    } catch (err: unknown) {
      console.error(err);
      const errorMessage =
        err instanceof Error ? err.message : 'Internal server error';
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: errorMessage });
    }
  }
}
