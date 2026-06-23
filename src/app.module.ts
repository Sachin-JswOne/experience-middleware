import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RequestContextMiddleware } from './utils/request-context.middleware';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule } from '@nestjs/config';
import { ProxyService } from './service/proxy.service';
import { GithubSyncService } from './service/github-sync.service';
import { ProxyController } from './controller/proxy.controller';
import { AdminController } from './controller/admin.controller';
import { AdminUIController } from './controller/admin-ui.controller';
import { join } from 'path';
import { AppService } from './app.service';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './logger/winston.config';
import { CacheService } from './cache/cache.service';
@Module({
  imports: [
    WinstonModule.forRoot(winstonConfig),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/metrics'],
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [ProxyController, AdminController, AdminUIController],
  providers: [AppService, ProxyService, GithubSyncService, CacheService],
  exports: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}