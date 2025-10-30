import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CacheUtilsService {
  private readonly logger = new Logger(CacheUtilsService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Clear cache entries by patterns using production-safe methods
   * @param patterns - Array of cache key patterns to clear
   * @param logPrefix - Optional prefix for logging context
   */
  async clearCacheByPatterns(patterns: string[], logPrefix = 'Cache'): Promise<void> {
    try {
      this.logger.log(`${logPrefix} clearing started with patterns: ${patterns.join(', ')}`);
      
      let totalKeysCleared = 0;
      
      for (const pattern of patterns) {
        try {
          // Use targeted pattern matching instead of keys('*')
          const keys = await this.redisService.keys(pattern);
          if (keys && keys.length > 0) {
            this.logger.log(`${logPrefix}: Found ${keys.length} keys matching pattern: ${pattern}`);
            
            const clearedCount = await this.clearKeysInBatches(keys, logPrefix);
            totalKeysCleared += clearedCount;
          }
        } catch (patternError) {
          this.logger.warn(`${logPrefix}: Error clearing pattern ${pattern}: ${patternError.message}`);
        }
      }

      if (totalKeysCleared > 0) {
        this.logger.log(`${logPrefix}: Successfully cleared ${totalKeysCleared} cache keys`);
      } else {
        this.logger.log(`${logPrefix}: No cache keys found to clear`);
      }
      
    } catch (error) {
      this.logger.error(`${logPrefix}: Error clearing cache: ${error.message}`, error.stack);
    }
  }

  /**
   * Clear fees-related cache entries
   */
  async clearFeesCache(): Promise<void> {
    const feesPatterns = [
      'fees:*',
      'fees*',
      '*fees*',
      '*fee*'
    ];
    
    await this.clearCacheByPatterns(feesPatterns, 'Fees cache');
  }

  /**
   * Clear vault-related cache entries
   */
  async clearVaultCache(): Promise<void> {
    const vaultPatterns = [
      'vault:*',
      'vaults:*',
      '*vault*'
    ];
    
    await this.clearCacheByPatterns(vaultPatterns, 'Vault cache');
  }

  /**
   * Clear profile-related cache entries
   */
  async clearProfileCache(): Promise<void> {
    const profilePatterns = [
      'profile:*',
      'profiles:*',
      '*profile*'
    ];
    
    await this.clearCacheByPatterns(profilePatterns, 'Profile cache');
  }

  /**
   * Clear keys in small batches to avoid overwhelming Redis
   * @param keys - Array of keys to delete
   * @param logPrefix - Logging context
   * @returns Number of successfully cleared keys
   */
  private async clearKeysInBatches(keys: string[], logPrefix: string): Promise<number> {
    const batchSize = 20; // Small batches for production safety
    let successCount = 0;
    
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      
      try {
        // Delete batch with error handling for individual keys
        const deletionPromises = batch.map(key => 
          this.redisService.delDirect(key).catch(err => {
            this.logger.warn(`${logPrefix}: Failed to delete key ${key}: ${err.message}`);
            return false;
          })
        );
        
        const results = await Promise.allSettled(deletionPromises);
        const successfulDeletions = results.filter(result => 
          result.status === 'fulfilled' && result.value !== false
        ).length;
        
        successCount += successfulDeletions;
        
        // Small delay between batches to prevent overwhelming Redis
        if (i + batchSize < keys.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } catch (batchError) {
        this.logger.warn(`${logPrefix}: Failed to delete batch starting at index ${i}: ${batchError.message}`);
      }
    }
    
    return successCount;
  }

  /**
   * Clear all cache entries (use with extreme caution in production)
   * This method is provided for development/testing purposes
   */
  async clearAllCache(): Promise<void> {
    try {
      this.logger.warn('Clearing ALL cache entries - use with caution in production!');
      await this.redisService.flushdb();
      this.logger.log('All cache entries cleared');
    } catch (error) {
      this.logger.error('Error clearing all cache:', error.message, error.stack);
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats(): Promise<any> {
    try {
      // Get basic Redis info
      const info = await this.redisService.info();
      return {
        timestamp: new Date().toISOString(),
        redisInfo: info
      };
    } catch (error) {
      this.logger.error('Error getting cache stats:', error.message);
      return {
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}
