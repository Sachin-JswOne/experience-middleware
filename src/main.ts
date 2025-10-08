/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('xp-mi'); // Set a global prefix for all routes
  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(
            (origin) => new RegExp(origin),
          )
        : [
            /^https?:\/\/.*\.onejswhomes\.in$/,
            /^https?:\/\/.*jswonehomes\.com$/,
            /^https?:\/\/34\.49\.59\.50$/,
            /^https?:\/\/localhost(?::\d+)?$/,
            /^https?:\/\/jswonehomes\.com$/,
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
    credentials: false,
    optionsSuccessStatus: 204,
  });

  await app.listen(process.env.PORT ?? 5000);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
