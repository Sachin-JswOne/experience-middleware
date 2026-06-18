import './instrumentation';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TraceContextInterceptor } from './common/trace-context.interceptor';
import { AllExceptionsFilter } from './filters/http-exception.filter';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './logger/winston.config';

async function bootstrap() {
  let app;
  try {
    app = await NestFactory.create(AppModule, {
      logger: WinstonModule.createLogger(winstonConfig),
    });
  } catch (err) {
    console.error('Failed to create NestJS application:', err);
    process.exit(1);
  }

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
            /^https?:\/\/.*\.49\.59\.50$/,
            /^https?:\/\/localhost(?::\d+)?$/,
            /^https?:\/\/jswonehomes\.com$/,
            /^https?:\/\/34\.93\.108\.241$/,
            /^https?:\/\/.*\.jswone\.in$/,
            /^https?:\/\/.*\.jswonemsme\.com$/,
          ];

      if (!origin) return callback(null, true);

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

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  const { startConfigWatcher } = await import('./service/config-watcher.service');
  startConfigWatcher();
}

void bootstrap();