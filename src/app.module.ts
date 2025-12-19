// import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule } from '@nestjs/config';
import { ProxyService } from './service/proxy.service';
import { ProxyController } from './controller/proxy.controller';
import { join } from 'path';
import { AppService } from './app.service';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './logger/winston.config';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RequestContextMiddleware } from './utils/request-context.middleware';
import { RedisModule } from './redis/redis.module';
import { APP_ENV } from './config/app.config';


@Module({
  imports: [
    // PrometheusModule.register({
    //   path: '/metrics',
    // }),
    // PrometheusModule.register({
    //   path: '/metrics',
    // }),
    WinstonModule.forRoot(winstonConfig),
    ServeStaticModule.forRoot({
      rootPath: APP_ENV === 'prod' ? undefined : join(__dirname, '..', 'public'),
      exclude: ['/metrics'],
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    RedisModule,
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
