import './instrumentation';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TraceContextInterceptor } from './common/trace-context.interceptor';
import { AllExceptionsFilter } from './filters/http-exception.filter';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './logger/winston.config';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
    bodyParser: false,
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.useGlobalInterceptors(new TraceContextInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('xp-mi');
  app.enableShutdownHooks();
  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => new RegExp(origin))
        : [
            /^https?:\/\/.*\.onejswhomes\.in$/,
            /^https?:\/\/.*jswonehomes\.com$/,
            /^https?:\/\/34\.49\.59\.50$/,
            /^https?:\/\/localhost(?::\d+)?$/,
            /^https?:\/\/jswonehomes\.com$/,
            /^https?:\/\/34\.93\.108\.241$/,
            /^https?:\/\/.*\.jswone\.in$/,
            /^https?:\/\/.*\.jswonemsme\.com$/,
          ];

      if (!origin) return callback(null, true); // Allow server-to-server or curl requests

      const isAllowed = allowedOrigins.some((regex) => regex.test(origin));
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    methods: 'GET,POST,DELETE,OPTIONS,PUT',
    allowedHeaders: '*, authorization, content-type',
    preflightContinue: false,
    credentials: true,
    optionsSuccessStatus: 204,
  });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
