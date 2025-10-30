import { Module } from '@nestjs/common';
import { CacheUtilsService } from './cache-utils.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [CacheUtilsService],
  exports: [CacheUtilsService],
})
export class CacheUtilsModule {}
