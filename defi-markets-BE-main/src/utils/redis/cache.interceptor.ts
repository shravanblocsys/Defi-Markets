import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  CACHE_MANAGER,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Cache } from 'cache-manager';
import { Reflector } from '@nestjs/core';
import { CACHE_KEY_METADATA, CACHE_TTL_METADATA } from './cache.decorator';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const cacheKey = this.getCacheKey(context);
    const ttl = this.getTTL(context);

    if (!cacheKey) {
      return next.handle();
    }

    // Try to get cached data
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      return of(cachedData);
    }


    // If not cached, execute the method and cache the result
    return next.handle().pipe(
      tap(async (data) => {
        await this.cacheManager.set(cacheKey, data, ttl);
      }),
    );
  }

  private getCacheKey(context: ExecutionContext): string | undefined {
    const cacheKey = this.reflector.get<string>(
      CACHE_KEY_METADATA,
      context.getHandler(),
    );

    if (!cacheKey) {
      return undefined;
    }

    const request = context.switchToHttp().getRequest();
    const { params, query, body, method } = request;

    // Replace placeholders in cache key with actual values
    let key = cacheKey;
    
    // Replace :param placeholders
    if (params) {
      Object.keys(params).forEach(param => {
        key = key.replace(`:${param}`, params[param]);
      });
    }

    // Replace query parameters
    if (query && Object.keys(query).length > 0) {
      const queryString = Object.keys(query)
        .sort()
        .map(k => `${k}=${query[k]}`)
        .join('&');
      key += `:${queryString}`;
    }

    // Include request body hash for POST/PUT/PATCH requests to prevent cache collisions
    if (['POST', 'PUT', 'PATCH'].includes(method) && body && Object.keys(body).length > 0) {
      const bodyHash = this.hashObject(body);
      key += `:body:${bodyHash}`;
    }

    // Add user ID if available
    if (request.user?.id) {
      key += `:user:${request.user.id}`;
    }

    // Add wallet address if available (for cases where user data is in request.raw.user)
    if (request.raw?.user?.walletAddress) {
      key += `:wallet:${request.raw.user.walletAddress}`;
    }

    return key;
  }

  /**
   * Create a hash of an object for cache key generation
   * This prevents cache collisions when different request bodies would otherwise use the same key
   */
  private hashObject(obj: any): string {
    try {
      const sortedKeys = Object.keys(obj).sort();
      const sortedObj = sortedKeys.reduce((acc, key) => {
        acc[key] = obj[key];
        return acc;
      }, {} as any);
      
      const jsonString = JSON.stringify(sortedObj);
      let hash = 0;
      
      for (let i = 0; i < jsonString.length; i++) {
        const char = jsonString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      
      return Math.abs(hash).toString(36);
    } catch (error) {
      // Fallback to a simple hash if JSON serialization fails
      return Math.random().toString(36).substring(2, 8);
    }
  }

  private getTTL(context: ExecutionContext): number {
    return (
      this.reflector.get<number>(CACHE_TTL_METADATA, context.getHandler()) ||
      300 // Default 5 minutes
    );
  }
}
