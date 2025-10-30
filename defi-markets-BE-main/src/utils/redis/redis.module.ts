import { Module, CacheModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import { RedisController } from './redis.controller';
import { CacheInterceptor } from './cache.interceptor';
import * as redisStore from 'cache-manager-redis-store';

@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get('REDIS_HOST', 'localhost'),
        port: configService.get('REDIS_PORT', 6379),
        password: configService.get('REDIS_PASSWORD'),
        db: configService.get('REDIS_DB', 0),
        ttl: configService.get('REDIS_TTL', 300), // 5 minutes default
        max: configService.get('REDIS_MAX_ITEMS', 100),
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [RedisController],
  providers: [RedisService, CacheInterceptor],
  exports: [RedisService, CacheModule, CacheInterceptor],
})
export class RedisModule {}
