import { Module } from '@nestjs/common';
// import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule } from '@nestjs/config';
import { ProxyService } from './service/proxy.service';
import { ProxyController } from './controller/proxy.controller';
import { join } from 'path';
// import { RedisProvider } from './redis.provider';
import { AppService } from './app.service';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './logger/winston.config';

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
  ],
  controllers: [ProxyController],
  // providers: [RedisProvider, AppService, ProxyService],
  providers: [AppService, ProxyService],
  // exports: [RedisProvider, AppService]
  exports: [AppService],
})
export class AppModule {}
