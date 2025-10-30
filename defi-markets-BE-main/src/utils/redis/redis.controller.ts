import { Controller, Get, Post, Delete, Param, Body, UseInterceptors, UseGuards, ForbiddenException } from '@nestjs/common';
import { RedisService } from './redis.service';
import { CacheInterceptor } from './cache.interceptor';
import { CacheKey, CacheTTL } from './cache.decorator';

/**
 * Redis Controller - Provides Redis operations with security restrictions
 * 
 * SECURITY: This controller exposes Redis operations and should only be accessible
 * to highly privileged users (e.g., system administrators). All write operations
 * are restricted to admin-only access.
 * 
 * @warning Direct Redis access can be dangerous - use with extreme caution
 */
@Controller('redis')
@UseInterceptors(CacheInterceptor)
export class RedisController {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Health check endpoint - safe for general access
   */
  @Get('health')
  async getHealth() {
    return {
      status: 'ok',
      redis: await this.redisService.healthCheck(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Ping endpoint - safe for general access
   */
  @Get('ping')
  async ping() {
    const result = await this.redisService.ping();
    return {
      result,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get cache statistics - safe for general access
   */
  @Get('stats')
  async getStats() {
    return await this.redisService.getCacheStats();
  }

  /**
   * Get cached data by key - safe for general access
   * @param key - Cache key to retrieve
   */
  @Get('cache/:key')
  @CacheKey('cache:get')
  @CacheTTL(60)
  async getCachedData(@Param('key') key: string) {
    const data = await this.redisService.get(key);
    return {
      key,
      data,
      cached: !!data,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * ADMIN ONLY: Set cached data
   * @param key - Cache key to set
   * @param body - Value and optional TTL
   */
  @Post('cache/:key')
  async setCachedData(
    @Param('key') key: string,
    @Body() body: { value: any; ttl?: number },
  ) {
    // TODO: Implement admin role guard here
    // For now, this endpoint is disabled for security
    throw new ForbiddenException('This endpoint requires admin privileges and is currently disabled for security');
    
    // Original implementation (commented out for security):
    // await this.redisService.set(key, body.value, body.ttl);
    // return {
    //   key,
    //   message: 'Data cached successfully',
    //   timestamp: new Date().toISOString(),
    // };
  }

  /**
   * ADMIN ONLY: Delete cached data
   * @param key - Cache key to delete
   */
  @Delete('cache/:key')
  async deleteCachedData(@Param('key') key: string) {
    // TODO: Implement admin role guard here
    // For now, this endpoint is disabled for security
    throw new ForbiddenException('This endpoint requires admin privileges and is currently disabled for security');
    
    // Original implementation (commented out for security):
    // await this.redisService.del(key);
    // return {
    //   key,
    //   message: 'Data deleted from cache',
    //   timestamp: new Date().toISOString(),
    // };
  }

  /**
   * ADMIN ONLY: Set hash data
   * @param key - Hash key
   * @param body - Field and value to set
   */
  @Post('hash/:key')
  async setHashData(
    @Param('key') key: string,
    @Body() body: { field: string; value: string },
  ) {
    // TODO: Implement admin role guard here
    // For now, this endpoint is disabled for security
    throw new ForbiddenException('This endpoint requires admin privileges and is currently disabled for security');
    
    // Original implementation (commented out for security):
    // await this.redisService.hset(key, body.field, body.value);
    // return {
    //   key,
    //   field: body.field,
    //   message: 'Hash data set successfully',
    //   timestamp: new Date().toISOString(),
    // };
  }

  /**
   * Get hash data by key - safe for general access
   * @param key - Hash key to retrieve
   */
  @Get('hash/:key')
  async getHashData(@Param('key') key: string) {
    const data = await this.redisService.hgetall(key);
    return {
      key,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * ADMIN ONLY: Add value to list
   * @param key - List key
   * @param body - Value to add
   */
  @Post('list/:key')
  async addToList(
    @Param('key') key: string,
    @Body() body: { value: string },
  ) {
    // TODO: Implement admin role guard here
    // For now, this endpoint is disabled for security
    throw new ForbiddenException('This endpoint requires admin privileges and is currently disabled for security');
    
    // Original implementation (commented out for security):
    // await this.redisService.lpush(key, body.value);
    // return {
    //   key,
    //   message: 'Value added to list',
    //   timestamp: new Date().toISOString(),
    // };
  }

  /**
   * Get list data by key - safe for general access
   * @param key - List key to retrieve
   */
  @Get('list/:key')
  async getList(@Param('key') key: string) {
    const data = await this.redisService.lrange(key, 0, -1);
    return {
      key,
      data,
      count: data.length,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * ADMIN ONLY: Add value to set
   * @param key - Set key
   * @param body - Value to add
   */
  @Post('set/:key')
  async addToSet(
    @Param('key') key: string,
    @Body() body: { value: string },
  ) {
    // TODO: Implement admin role guard here
    // For now, this endpoint is disabled for security
    throw new ForbiddenException('This endpoint requires admin privileges and is currently disabled for security');
    
    // Original implementation (commented out for security):
    // return {
    //   key,
    //   message: 'Value added to set',
    //   timestamp: new Date().toISOString(),
    // };
  }

  /**
   * Get set data by key - safe for general access
   * @param key - Set key to retrieve
   */
  @Get('set/:key')
  async getSet(@Param('key') key: string) {
    const data = await this.redisService.smembers(key);
    return {
      key,
      data,
      count: data.length,
      timestamp: new Date().toISOString(),
    };
  }
}
