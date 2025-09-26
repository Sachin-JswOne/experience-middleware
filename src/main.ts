import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('xp-mi'); // Set a global prefix for all routes
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ["https://jswonehomes.com", "*localhost*", "*.onejswhomes.in", "34.49.59.50"];

  app.enableCors({
  origin: allowedOrigins,
  methods: 'GET,POST,DELETE,OPTIONS,PUT',
  allowedHeaders: '*',
  preflightContinue : true,
  credentials: true,
  optionsSuccessStatus: 204
});

  await app.listen(process.env.PORT ?? 3000);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
