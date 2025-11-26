import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
 
@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name); 
  
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}   
}