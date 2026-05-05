import './instrumentation';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TraceContextInterceptor } from './common/trace-context.interceptor';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './logger/winston.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });
  app.useGlobalInterceptors(new TraceContextInterceptor());
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
    allowedHeaders: '*',
    preflightContinue: false,
    credentials: true,
    optionsSuccessStatus: 204,
  });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
