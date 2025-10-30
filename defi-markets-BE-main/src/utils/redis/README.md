# Redis Cache Setup

This module provides a comprehensive Redis caching solution for your NestJS application.

## Features

- 🚀 **Cache Manager Integration**: Built-in NestJS cache manager support
- 🔧 **Direct Redis Operations**: Full Redis client functionality (admin-restricted)
- 🎯 **Decorator-based Caching**: Easy-to-use cache decorators
- 🔄 **Automatic Cache Interceptor**: Automatic caching with interceptors
- 📊 **Health Monitoring**: Built-in health checks and monitoring
- 🗂️ **Multiple Data Types**: Support for strings, hashes, lists, sets, and JSON
- ⚡ **Performance Optimized**: Efficient caching strategies
- 🔒 **Security Focused**: Write operations restricted to admin users only

## Installation

The required dependencies are already installed:

```bash
npm install redis ioredis @nestjs/cache-manager@2.1.1 cache-manager@4.1.0 cache-manager-redis-store@2.0.0
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password  # Optional
REDIS_DB=0
REDIS_TTL=300  # 5 minutes default
REDIS_MAX_ITEMS=100
```

### Docker Setup

Redis is already configured in `docker-compose.yml`. To start Redis:

```bash
docker-compose up redis
```

## Usage

### 1. Import Redis Module

In your main app module or any feature module:

```typescript
import { Module } from '@nestjs/common';
import { RedisModule } from './utils/redis';

@Module({
  imports: [RedisModule],
  // ...
})
export class AppModule {}
```

### 2. Using Cache Decorators

```typescript
import { Injectable } from '@nestjs/common';
import { CacheKey, CacheTTL } from './utils/redis';

@Injectable()
export class UserService {
  @CacheKey('user:profile')
  @CacheTTL(600) // 10 minutes
  async getUserProfile(userId: string) {
    // This method will be automatically cached
    return await this.userRepository.findById(userId);
  }
}
```

### 3. Using Cache Interceptor

```typescript
import { Controller, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor } from './utils/redis';

@Controller('users')
@UseInterceptors(CacheInterceptor)
export class UserController {
  // All methods in this controller will use caching
}
```

### 4. Manual Caching with RedisService

```typescript
import { Injectable } from '@nestjs/common';
import { RedisService } from './utils/redis';

@Injectable()
export class DataService {
  constructor(private readonly redisService: RedisService) {}

  async getData(key: string) {
    // Try to get from cache
    const cached = await this.redisService.get(key);
    if (cached) {
      return cached;
    }

    // Fetch from source
    const data = await this.fetchFromSource();
    
    // Store in cache
    await this.redisService.set(key, data, 300); // 5 minutes
    return data;
  }
}
```

### 5. Hash Operations

```typescript
// Store user session data
await this.redisService.hset('user:session:123', 'loginTime', new Date().toISOString());
await this.redisService.hset('user:session:123', 'ip', '192.168.1.1');

// Get all session data
const session = await this.redisService.hgetall('user:session:123');
```

### 6. List Operations

```typescript
// Add activity to user feed
await this.redisService.lpush('user:activity:123', JSON.stringify({
  action: 'login',
  timestamp: new Date().toISOString()
}));

// Get recent activities
const activities = await this.redisService.lrange('user:activity:123', 0, 9);
```

### 7. Set Operations

```typescript
// Add user to online set
await this.redisService.sadd('online:users', 'user123');

// Check if user is online
const isOnline = await this.redisService.sismember('online:users', 'user123');

// Get all online users
const onlineUsers = await this.redisService.smembers('online:users');
```

### 8. JSON Operations (if RedisJSON is available)

```typescript
// Store complex data
await this.redisService.jsonSet('user:data:123', '.', {
  profile: { name: 'John', age: 30 },
  preferences: { theme: 'dark' }
});

// Retrieve data
const userData = await this.redisService.jsonGet('user:data:123');
```

## Cache Key Patterns

Use these patterns for consistent cache key naming:

- `user:profile:{userId}` - User profile data
- `user:session:{userId}` - User session data
- `user:activity:{userId}` - User activity feed
- `data:{type}:{id}` - Generic data by type and ID
- `list:{type}:{page}:{limit}` - Paginated lists
- `search:{query}:{filters}` - Search results

## Cache Invalidation

```typescript
// Invalidate specific keys
await this.redisService.del('user:profile:123');

// Invalidate multiple keys
const keys = ['user:profile:123', 'user:session:123'];
for (const key of keys) {
  await this.redisService.del(key);
}

// Invalidate by pattern (use with caution)
const keys = await this.redisService.keys('user:profile:*');
for (const key of keys) {
  await this.redisService.del(key);
}
```

## Health Monitoring

```typescript
// Check Redis connection
const isHealthy = await this.redisService.healthCheck();

// Get Redis info
const info = await this.redisService.info();
```

## Best Practices

1. **Set Appropriate TTL**: Don't cache data indefinitely
2. **Use Meaningful Keys**: Make cache keys descriptive and consistent
3. **Invalidate Cache**: Clear cache when data is updated
4. **Monitor Memory Usage**: Keep an eye on Redis memory consumption
5. **Use Compression**: For large objects, consider compression
6. **Handle Failures**: Always handle Redis connection failures gracefully

## Error Handling

```typescript
try {
  const data = await this.redisService.get('key');
  return data;
} catch (error) {
  console.error('Redis error:', error);
  // Fallback to database or return default value
  return await this.fetchFromDatabase();
}
```

## Performance Tips

1. **Batch Operations**: Use pipeline for multiple operations
2. **Connection Pooling**: Redis client handles connection pooling automatically
3. **Memory Management**: Monitor and set appropriate memory limits
4. **Key Expiration**: Always set TTL to prevent memory leaks
5. **Data Serialization**: Use efficient serialization for complex objects

## Troubleshooting

### Common Issues

1. **Connection Refused**: Check if Redis is running and accessible
2. **Memory Issues**: Monitor Redis memory usage and set limits
3. **Performance**: Use Redis MONITOR to debug slow queries
4. **Data Loss**: Ensure Redis persistence is configured properly

### Debug Commands

```bash
# Connect to Redis CLI
redis-cli

# Monitor Redis commands
MONITOR

# Check memory usage
INFO memory

# List all keys
KEYS *

# Check key expiration
TTL key_name
```

## Security Considerations

### ⚠️ IMPORTANT: Admin-Only Access Required

**All write operations in the Redis controller are currently disabled for security reasons.** This includes:
- Setting cache values (`POST /redis/cache/:key`)
- Deleting cache values (`DELETE /redis/cache/:key`)
- Setting hash data (`POST /redis/hash/:key`)
- Adding to lists (`POST /redis/list/:key`)
- Adding to sets (`POST /redis/set/:key`)

### Why This Restriction?

Direct Redis access via HTTP endpoints is a significant security risk:
- **Data Manipulation**: Attackers could read/write sensitive cached data
- **Denial of Service**: Malicious users could fill Redis memory
- **Data Injection**: Arbitrary data could be injected into the cache
- **Privilege Escalation**: Cache poisoning could affect application behavior

### Safe Endpoints

The following endpoints are safe for general access:
- `GET /redis/health` - Health check
- `GET /redis/ping` - Connection test
- `GET /redis/stats` - Cache statistics
- `GET /redis/cache/:key` - Read cached data
- `GET /redis/hash/:key` - Read hash data
- `GET /redis/list/:key` - Read list data
- `GET /redis/set/:key` - Read set data

### Enabling Admin Operations

To enable write operations, implement proper role-based access control:

```typescript
// TODO: Implement admin role guard
@Post('cache/:key')
@UseGuards(AdminRoleGuard) // Add this guard
async setCachedData(@Param('key') key: string, @Body() body: any) {
  // Implementation here
}
```

### Alternative Approaches

Instead of exposing Redis operations via HTTP:
1. **Use the RedisService directly** in your application code
2. **Implement specific business logic endpoints** rather than generic Redis operations
3. **Use cache decorators** for automatic caching
4. **Implement proper cache invalidation** in your services

## Example Implementation

See `example.service.ts` for comprehensive usage examples.
