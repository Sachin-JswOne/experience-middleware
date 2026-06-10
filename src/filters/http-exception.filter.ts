import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AxiosError } from 'axios';
import { CustomError } from 'src/utils/CustomError';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let errorMessage: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      errorMessage =
        typeof body === 'string'
          ? body
          : (body as Record<string, unknown>)?.message?.toString() ?? exception.message;
    } else if (exception instanceof CustomError) {
      statusCode = exception.httpStatusCode;
      errorMessage = exception.message;
    } else if (exception instanceof AxiosError) {
      statusCode = exception.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
      errorMessage = exception.message;
    } else if (exception instanceof Error) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      errorMessage = exception.message;
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      errorMessage = 'Internal server error';
    }

    this.logger.error(
      `Unhandled exception ${request.method} ${request.path} status=${statusCode} error=${errorMessage}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(statusCode).json({ statusCode, error: errorMessage });
  }
}
