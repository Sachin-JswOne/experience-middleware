import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProxyService } from './service/proxy.service';
import { ProxyController } from './controller/proxy.controller';

@Module({
  imports: [],
  controllers: [AppController, ProxyController],
  providers: [AppService, ProxyService],
})
export class AppModule {}
