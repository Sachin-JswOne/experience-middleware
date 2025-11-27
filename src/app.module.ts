import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { WinstonModule } from 'nest-winston';
import { join } from 'path';
import { AppService } from './app.service';
import { ProxyController } from './controller/proxy.controller';
import { ProxyService } from './service/proxy.service';
import { winstonConfig } from './logger/winston.config';
import { RedisModule } from './redis/redis.module';
import { RequestContextMiddleware } from './utils/request-context.middleware';
// import { PrometheusModule } from '@willsoto/nestjs-prometheus';


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
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/metrics'],
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ...(process.env.enableRedis === 'true' ? [RedisModule] : []),
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
