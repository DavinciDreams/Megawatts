import { RedisConnectionManager } from '../database';
import { CacheError, CacheErrorCode } from '../errors';
import { Logger } from '../../utils/logger';

// Helper function for error logging
const logError = (logger: any, message: string, error: any) => {
  logger.error(message, error instanceof Error ? error : new Error(String(error)));
};

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  priority?: number;
  compress?: boolean;
  serialize?: boolean;
}

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl?: number;
  tags?: string[];
  priority?: number;
  createdAt: Date;
  accessedAt: Date;
  accessCount: number;
}

export interface CacheStats {
  totalKeys: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  memoryUsage: number;
  keyCountByTag: Record<string, number>;
}

export class CacheManager {
  private redis: RedisConnectionManager;
  private logger: Logger;
  private keyPrefix: string;
  private defaultTtl: number;
  private compressionEnabled: boolean;
  private serializationEnabled: boolean;

  constructor(
    redis: RedisConnectionManager,
    options: {
      keyPrefix?: string;
      defaultTtl?: number;
      compressionEnabled?: boolean;
      serializationEnabled?: boolean;
    } = {}
  ) {
    this.redis = redis;
    this.logger = new Logger('CacheManager');
    this.keyPrefix = options.keyPrefix || 'bot_cache:';
    this.defaultTtl = options.defaultTtl || 3600; // 1 hour default
    this.compressionEnabled = options.compressionEnabled !== false;
    this.serializationEnabled = options.serializationEnabled !== false;
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      const fullKey = this.getFullKey(key);
      const result = await this.redis.get(fullKey);

      if (!result) {
        this.logger.debug(`Cache miss for key: ${key}`);
        return null;
      }

      const entry = this.deserialize<CacheEntry<T>>(result);
      
      // Update access statistics
      await this.updateAccessStats(key);
      
      this.logger.debug(`Cache hit for key: ${key}`);
      return entry.value;
    } catch (error) {
      logError(this.logger, 'Failed to get from cache:', error);
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        'Failed to get from cache',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'GET'
      );
    }
  }

  async set<T = any>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      const ttl = options.ttl || this.defaultTtl;
      
      const entry: CacheEntry<T> = {
        key,
        value,
        ttl,
        tags: options.tags || [],
        priority: options.priority || 0,
        createdAt: new Date(),
        accessedAt: new Date(),
        accessCount: 0,
      };

      const serializedValue = this.serialize(entry);
      await this.redis.set(fullKey, serializedValue, ttl);

      // Store metadata in separate hash for advanced operations
      if (options.tags && options.tags.length > 0) {
        await this.storeTags(key, options.tags);
      }

      this.logger.debug(`Cache set for key: ${key}, TTL: ${ttl}`);
    } catch (error) {
      logError(this.logger, 'Failed to set cache:', error);
      throw new CacheError(
        CacheErrorCode.SET_FAILED,
        'Failed to set cache',
        { error: error instanceof Error ? error.message : String(error), ttl: options.ttl },
        key,
        'SET'
      );
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key);
      const result = await this.redis.del(fullKey);
      
      // Remove tags metadata
      await this.removeTags(key);
      
      this.logger.debug(`Cache deleted for key: ${key}, result: ${result}`);
      return result > 0;
    } catch (error) {
      logError(this.logger, 'Failed to delete from cache:', error);
      throw new CacheError(
        CacheErrorCode.DELETE_FAILED,
        'Failed to delete from cache',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'DEL'
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key);
      return await this.redis.exists(fullKey);
    } catch (error) {
      logError(this.logger, 'Failed to check cache existence:', error);
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        'Failed to check cache existence',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'EXISTS'
      );
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key);
      return await this.redis.expire(fullKey, ttl);
    } catch (error) {
      logError(this.logger, 'Failed to set cache expiration:', error);
      throw new CacheError(
        CacheErrorCode.SET_FAILED,
        'Failed to set cache expiration',
        { error: error instanceof Error ? error.message : String(error), ttl },
        key,
        'EXPIRE'
      );
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      const fullKey = this.getFullKey(key);
      return await this.redis.ttl(fullKey);
    } catch (error) {
      logError(this.logger, 'Failed to get cache TTL:', error);
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        'Failed to get cache TTL',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'TTL'
      );
    }
  }

  async invalidateByTag(tag: string): Promise<number> {
    try {
      const tagKey = this.getTagKey(tag);
      const keys = await this.redis.keys(`${tagKey}*`);
      
      if (keys.length === 0) {
        return 0;
      }

      // Get all keys associated with this tag
      const cacheKeys: string[] = [];
      for (const tagKeyEntry of keys) {
        const cacheKey = await this.redis.get(tagKeyEntry);
        if (cacheKey) {
          cacheKeys.push(cacheKey);
        }
      }

      // Delete all cache entries and tag entries
      const fullKeys = cacheKeys.map(key => this.getFullKey(key));
      const allKeys = [...keys, ...fullKeys];
      
      if (allKeys.length > 0) {
        await Promise.all(allKeys.map(key => this.redis.del(key)));
      }

      this.logger.debug(`Invalidated ${cacheKeys.length} keys by tag: ${tag}`);
      return cacheKeys.length;
    } catch (error) {
      logError(this.logger, 'Failed to invalidate by tag:', error);
      throw new CacheError(
        CacheErrorCode.INVALIDATION_FAILED,
        'Failed to invalidate cache by tag',
        { error: error instanceof Error ? error.message : String(error) },
        tag,
        'INVALIDATE_BY_TAG'
      );
    }
  }

  async invalidateByPattern(pattern: string): Promise<number> {
    try {
      const fullPattern = this.getFullKey(pattern);
      const keys = await this.redis.keys(fullPattern);
      
      if (keys.length === 0) {
        return 0;
      }

      // Remove tags for all keys
      await Promise.all(keys.map(key => this.removeTags(this.stripKeyPrefix(key))));

      // Delete all matching keys
      await Promise.all(keys.map(key => this.redis.del(key)));

      this.logger.debug(`Invalidated ${keys.length} keys by pattern: ${pattern}`);
      return keys.length;
    } catch (error) {
      logError(this.logger, 'Failed to invalidate by pattern:', error);
      throw new CacheError(
        CacheErrorCode.INVALIDATION_FAILED,
        'Failed to invalidate cache by pattern',
        { error: error instanceof Error ? error.message : String(error) },
        pattern,
        'INVALIDATE_BY_PATTERN'
      );
    }
  }

  async getStats(): Promise<CacheStats> {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      const tagStats: Record<string, number> = {};
      let totalKeys = 0;
      let hitCount = 0;
      let missCount = 0;
      let memoryUsage = 0;

      for (const key of keys) {
        const entry = await this.redis.get(key);
        if (entry) {
          const cacheEntry = this.deserialize<CacheEntry>(entry);
          totalKeys++;
          memoryUsage += entry.length;
          
          // Count tags
          if (cacheEntry.tags) {
            for (const tag of cacheEntry.tags) {
              tagStats[tag] = (tagStats[tag] || 0) + 1;
            }
          }
        }
      }

      // Get hit/miss stats from Redis info if available
      try {
        const info = await this.redis.getClient().info('stats');
        const statsMatch = info.match(/keyspace_hits:(\d+)/);
        const missesMatch = info.match(/keyspace_misses:(\d+)/);
        
        if (statsMatch) hitCount = parseInt(statsMatch[1]);
        if (missesMatch) missCount = parseInt(missesMatch[1]);
      } catch (e) {
        // Redis info might not be available or different format
      }

      const hitRate = hitCount + missCount > 0 ? (hitCount / (hitCount + missCount)) * 100 : 0;

      return {
        totalKeys,
        hitCount,
        missCount,
        hitRate,
        memoryUsage,
        keyCountByTag: tagStats,
      };
    } catch (error) {
      logError(this.logger, 'Failed to get cache stats:', error);
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        'Failed to get cache stats',
        { error: error instanceof Error ? error.message : String(error) },
        undefined,
        'GET_STATS'
      );
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      
      if (keys.length > 0) {
        await Promise.all(keys.map(key => this.redis.del(key)));
      }

      this.logger.info(`Cleared ${keys.length} keys from cache`);
    } catch (error) {
      logError(this.logger, 'Failed to clear cache:', error);
      throw new CacheError(
        CacheErrorCode.DELETE_FAILED,
        'Failed to clear cache',
        { error: error instanceof Error ? error.message : String(error) },
        undefined,
        'CLEAR'
      );
    }
  }

  async warmUp<T = any>(
    entries: Array<{ key: string; value: T; options?: CacheOptions }>
  ): Promise<void> {
    try {
      this.logger.info(`Warming up cache with ${entries.length} entries`);
      
      await Promise.all(
        entries.map(async ({ key, value, options }) => {
          await this.set(key, value, options);
        })
      );

      this.logger.info(`Cache warm-up completed for ${entries.length} entries`);
    } catch (error) {
      logError(this.logger, 'Failed to warm up cache:', error);
      throw new CacheError(
        CacheErrorCode.SET_FAILED,
        'Failed to warm up cache',
        { error: error instanceof Error ? error.message : String(error) },
        undefined,
        'WARM_UP'
      );
    }
  }

  private getFullKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private stripKeyPrefix(fullKey: string): string {
    return fullKey.replace(this.keyPrefix, '');
  }

  private getTagKey(tag: string): string {
    return `${this.keyPrefix}tag:${tag}:`;
  }

  private async storeTags(key: string, tags: string[]): Promise<void> {
    await Promise.all(
      tags.map(tag => 
        this.redis.set(`${this.getTagKey(tag)}${Date.now()}`, key, this.defaultTtl * 2) // Tags live longer
      )
    );
  }

  private async removeTags(key: string): Promise<void> {
    const tagKeys = await this.redis.keys(`${this.getTagKey('*')}`);
    
    for (const tagKey of tagKeys) {
      const cachedKey = await this.redis.get(tagKey);
      if (cachedKey === key) {
        await this.redis.del(tagKey);
      }
    }
  }

  private async updateAccessStats(key: string): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      const entry = await this.redis.get(fullKey);
      
      if (entry) {
        const cacheEntry = this.deserialize<CacheEntry>(entry);
        cacheEntry.accessedAt = new Date();
        cacheEntry.accessCount++;
        
        await this.redis.set(fullKey, this.serialize(cacheEntry), cacheEntry.ttl);
      }
    } catch (error) {
      // Don't throw error for stats update, just log it
      this.logger.warn('Failed to update access stats:', { key, error });
    }
  }

  private serialize<T = any>(value: T): string {
    if (!this.serializationEnabled) {
      return typeof value === 'string' ? value : JSON.stringify(value);
    }

    try {
      return JSON.stringify(value);
    } catch (error) {
      logError(this.logger, 'Serialization failed:', error);
      throw new CacheError(
        CacheErrorCode.SERIALIZATION_FAILED,
        'Cache serialization failed',
        { error: error instanceof Error ? error.message : String(error) },
        undefined,
        'SERIALIZE'
      );
    }
  }

  private deserialize<T = any>(value: string): T {
    if (!this.serializationEnabled) {
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    }

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      logError(this.logger, 'Deserialization failed:', error);
      throw new CacheError(
        CacheErrorCode.DESERIALIZATION_FAILED,
        'Cache deserialization failed',
        { error: error instanceof Error ? error.message : String(error) },
        undefined,
        'DESERIALIZE'
      );
    }
  }
}