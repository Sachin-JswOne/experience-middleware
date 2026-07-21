// import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule } from '@nestjs/config';
import { ProxyService } from './service/proxy.service';
import { ProxyController } from './controller/proxy.controller';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppService } from './app.service';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './logger/winston.config';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RequestContextMiddleware } from './utils/request-context.middleware';
import { APP_ENV } from './config/app.config';
import { CacheService } from './cache/cache.service';
import { CacheModule } from './cache/cache.module';
import { MetricsModule } from './metrics/metrics.module';

const FRONTEND_DIST_PATH = join(__dirname, '..', 'dist-frontend');
const hasFrontendDist = existsSync(FRONTEND_DIST_PATH);

@Module({
  imports: [
    // PrometheusModule.register({
    //   path: '/metrics',
    // }),
    // PrometheusModule.register({
    //   path: '/metrics',
    // }),
    WinstonModule.forRoot(winstonConfig),
    ...(hasFrontendDist
      ? [
          ServeStaticModule.forRoot({
            rootPath: FRONTEND_DIST_PATH,
            exclude: ['/metrics', '/xp-mi', '/xp-mi/{*path}'],
          }),
        ]
      : []),
    CacheModule,
    MetricsModule,
    ServeStaticModule.forRoot({
      rootPath: APP_ENV === 'prod' ? undefined : join(__dirname, '..', 'public'),
      exclude: ['/metrics'],
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [ProxyController],
  providers: [AppService, ProxyService],
  exports: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
