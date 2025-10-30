import { Injectable, Inject, CACHE_MANAGER } from '@nestjs/common';
import { Cache } from 'cache-manager';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private redis: Redis;

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
    // Initialize Redis client for direct operations
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    } as any);
  }

  // Cache Manager Methods
  async get<T>(key: string): Promise<T | undefined> {
    return await this.cacheManager.get<T>(key);
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    return await this.cacheManager.set(key, value, ttl);
  }

  async del(key: string): Promise<void> {
    return await this.cacheManager.del(key);
  }

  async reset(): Promise<void> {
    return await this.cacheManager.reset();
  }

  // Direct Redis Methods
  async getDirect(key: string): Promise<string | null> {
    return await this.redis.get(key);
  }

  async setDirect(key: string, value: string, ttl?: number): Promise<'OK'> {
    if (ttl) {
      return await this.redis.setex(key, ttl, value);
    }
    return await this.redis.set(key, value);
  }

  async delDirect(key: string): Promise<number> {
    return await this.redis.del(key);
  }

  async exists(key: string): Promise<number> {
    return await this.redis.exists(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return await this.redis.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return await this.redis.ttl(key);
  }

  // Hash Operations
  async hget(key: string, field: string): Promise<string | null> {
    return await this.redis.hget(key, field);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return await this.redis.hset(key, field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return await this.redis.hgetall(key);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return await this.redis.hdel(key, ...fields);
  }

  // List Operations
  async lpush(key: string, ...values: string[]): Promise<number> {
    return await this.redis.lpush(key, ...values);
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    return await this.redis.rpush(key, ...values);
  }

  async lpop(key: string): Promise<string | null> {
    return await this.redis.lpop(key);
  }

  async rpop(key: string): Promise<string | null> {
    return await this.redis.rpop(key);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.redis.lrange(key, start, stop);
  }

  async ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    return await this.redis.ltrim(key, start, stop);
  }

  // Set Operations
  async sadd(key: string, ...members: string[]): Promise<number> {
    return await this.redis.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return await this.redis.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return await this.redis.smembers(key);
  }

  async sismember(key: string, member: string): Promise<number> {
    return await this.redis.sismember(key, member);
  }

  // Utility Methods
  async keys(pattern: string): Promise<string[]> {
    return await this.redis.keys(pattern);
  }

  async flushdb(): Promise<'OK'> {
    return await this.redis.flushdb();
  }

  async ping(): Promise<'PONG'> {
    return await this.redis.ping();
  }

  async info(): Promise<string> {
    return await this.redis.info();
  }

  // JSON Operations (if RedisJSON is available)
  async jsonSet(key: string, path: string, value: any): Promise<'OK'> {
    return await this.redis.call('JSON.SET', key, path, JSON.stringify(value)) as Promise<'OK'>;
  }

  async jsonGet(key: string, path: string = '.'): Promise<any> {
    const result = await this.redis.call('JSON.GET', key, path);
    return result ? JSON.parse(result as string) : null;
  }

  // Health Check
  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  // Cache Statistics
  async getCacheStats() {
    const info = await this.redis.info();
    return {
      connected: await this.healthCheck(),
      info: info,
    };
  }

  // Close connection
  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
