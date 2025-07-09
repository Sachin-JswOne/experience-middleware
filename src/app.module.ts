import { Module } from '@nestjs/common';
import { ProxyService } from './service/proxy.service';
import { ProxyController } from './controller/proxy.controller';

@Module({
  imports: [],
  controllers: [ProxyController],
  providers: [ProxyService],
})
export class AppModule {}
