/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { getUserIdentifiers } from './common-functions.util';
import { requestContext } from './request-context.util';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const mockConfig = getUserIdentifiers(req.headers);

    const sfId = mockConfig.sfId || null;
    const ctId = mockConfig.ctId || null;

    const context = {
      sfId,
      ctId,
    };

    requestContext.run(context, () => {
      next();
    });
  }
}
