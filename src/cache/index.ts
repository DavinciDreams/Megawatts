/**
 * Advanced Caching System
 * 
 * This module provides comprehensive caching capabilities including:
 * - Multi-level caching (L1/L2/L3)
 * - Cache invalidation strategies (TTL, event-based, dependency-based, tag-based)
 * - Cache eviction policies (LRU, LFU, FIFO, custom)
 * - Cache warming (startup, scheduled, predictive)
 * - Cache analytics and monitoring
 * - Distributed cache coordination
 */

// Multi-level cache
export {
  MultiLevelCache,
  CacheLayer,
  type LayeredCacheEntry,
  type MultiLevelCacheConfig,
  type CacheAnalytics,
  type WarmingStrategy,
  type PredictiveConfig,
} from './multiLevelCache';

// Cache invalidation
export {
  CacheInvalidationManager,
  InvalidationType,
  type CacheDependency,
  type CacheTag,
  type InvalidationEvent,
  type TTLConfig,
  type EventInvalidationConfig,
  type DependencyInvalidationConfig,
} from './cacheInvalidation';

// Cache policies
export {
  LRUPolicy,
  LFUPolicy,
  FIFOPolicy,
  CachePolicyManager,
  PriorityCachePolicy,
  EvictionPolicy,
  type PolicyEntry,
  type CustomPolicy,
} from './cachePolicies';

// Cache warmer
export {
  CacheWarmer,
  WarmUpStrategy,
  type WarmUpEntry,
  type WarmUpConfig,
  type WarmUpSchedule,
  type WarmUpStats,
  WarmUpEntryBuilder,
} from './cacheWarmer';

import { RedisConnectionManager } from '../storage/database/redis';
import { MultiLevelCache, CacheLayer, type MultiLevelCacheConfig } from './multiLevelCache';
import { CacheInvalidationManager, type TTLConfig, type EventInvalidationConfig, type DependencyInvalidationConfig } from './cacheInvalidation';
import { CachePolicyManager, EvictionPolicy } from './cachePolicies';
import { CacheWarmer, WarmUpStrategy, type WarmUpConfig } from './cacheWarmer';

/**
 * Advanced cache system configuration
 */
export interface AdvancedCacheSystemConfig {
  // Multi-level cache config
  multiLevel?: MultiLevelCacheConfig;

  // Invalidation config
  ttl?: {
    defaultTtl?: number;
    slidingTTL?: boolean;
  };
  eventInvalidation?: {
    enabled?: boolean;
    eventChannel?: string;
  };
  dependencyInvalidation?: {
    enabled?: boolean;
    cascadeDepth?: number;
  };

  // Policy config
  defaultPolicy?: EvictionPolicy;
  l1MaxSize?: number;
  l2MaxSize?: number;
  l3MaxSize?: number;

  // Warmer config
  warming?: {
    strategy?: WarmUpStrategy;
    batchSize?: number;
    delayBetweenBatches?: number;
    maxRetries?: number;
    retryDelay?: number;
    timeout?: number;
    parallelism?: number;
    enablePredictiveWarming?: boolean;
    predictiveThreshold?: number;
  };
}

/**
 * Advanced cache system
 * Combines multi-level caching, invalidation, policies, and warming
 */
export class AdvancedCacheSystem {
  public readonly multiLevelCache: MultiLevelCache;
  public readonly invalidationManager: CacheInvalidationManager;
  public readonly policyManager: CachePolicyManager;
  public readonly warmer: CacheWarmer;

  private constructor(
    multiLevelCache: MultiLevelCache,
    invalidationManager: CacheInvalidationManager,
    policyManager: CachePolicyManager,
    warmer: CacheWarmer
  ) {
    this.multiLevelCache = multiLevelCache;
    this.invalidationManager = invalidationManager;
    this.policyManager = policyManager;
    this.warmer = warmer;
  }

  /**
   * Create advanced cache system with default configuration
   * @param redis - Redis connection manager
   * @param config - Configuration options
   * @returns Advanced cache system instance
   */
  static async create(
    redis: RedisConnectionManager,
    config: AdvancedCacheSystemConfig = {}
  ): Promise<AdvancedCacheSystem> {
    // Create multi-level cache
    const multiLevelCache = new MultiLevelCache(redis, config.multiLevel);

    // Create invalidation manager
    const invalidationManager = new CacheInvalidationManager(redis, {
      defaultTtl: config.ttl?.defaultTtl,
      slidingTTL: config.ttl?.slidingTTL,
      eventChannel: config.eventInvalidation?.eventChannel,
      cascadeDepth: config.dependencyInvalidation?.cascadeDepth,
    });

    // Create policy manager
    const l1MaxSize = config.l1MaxSize || 1000;
    const policyManager = new CachePolicyManager(l1MaxSize, config.defaultPolicy);

    // Create warmer
    const warmer = new CacheWarmer(multiLevelCache, config.warming);

    return new AdvancedCacheSystem(
      multiLevelCache,
      invalidationManager,
      policyManager,
      warmer
    );
  }

  /**
   * Create advanced cache system with minimal configuration
   * @param redis - Redis connection manager
   * @returns Advanced cache system instance with sensible defaults
   */
  static async createDefault(redis: RedisConnectionManager): Promise<AdvancedCacheSystem> {
    return AdvancedCacheSystem.create(redis, {
      multiLevel: {
        l1MaxSize: 1000,
        l1Ttl: 300, // 5 minutes
        l2Ttl: 3600, // 1 hour
        l3Ttl: 86400, // 24 hours
        enablePredictivePreloading: true,
        enableDistributedCoordination: true,
        analyticsEnabled: true,
      },
      ttl: {
        defaultTtl: 3600,
        slidingTTL: false,
      },
      eventInvalidation: {
        enabled: true,
        eventChannel: 'cache_invalidation',
      },
      dependencyInvalidation: {
        enabled: true,
        cascadeDepth: 5,
      },
      defaultPolicy: EvictionPolicy.LRU,
      l1MaxSize: 1000,
      warming: {
        strategy: WarmUpStrategy.ON_STARTUP,
        batchSize: 10,
        delayBetweenBatches: 100,
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 30000,
        parallelism: 5,
        enablePredictiveWarming: true,
        predictiveThreshold: 0.7,
      },
    });
  }

  /**
   * Get value from cache
   * @param key - Cache key
   * @param fetchFn - Function to fetch data if not in cache
   * @returns Cached value or result of fetchFn
   */
  async get<T = any>(
    key: string,
    fetchFn?: () => Promise<T>
  ): Promise<T | null> {
    return this.multiLevelCache.get(key, fetchFn);
  }

  /**
   * Set value in cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param options - Cache options
   */
  async set<T = any>(
    key: string,
    value: T,
    options?: {
      ttl?: number;
      tags?: string[];
      priority?: number;
      layers?: CacheLayer[];
    }
  ): Promise<void> {
    await this.multiLevelCache.set(key, value, options);
  }

  /**
   * Delete key from cache
   * @param key - Cache key
   */
  async delete(key: string): Promise<boolean> {
    return this.multiLevelCache.delete(key);
  }

  /**
   * Invalidate cache by tag
   * @param tag - Tag to invalidate
   */
  async invalidateByTag(tag: string): Promise<number> {
    return this.multiLevelCache.invalidateByTag(tag);
  }

  /**
   * Get cache analytics
   */
  getAnalytics() {
    return this.multiLevelCache.getAnalytics();
  }

  /**
   * Get warm-up statistics
   */
  getWarmUpStats() {
    return this.warmer.getStats();
  }

  /**
   * Warm up cache with entries
   * @param entries - Entries to warm up
   */
  async warmUp<T = any>(
    entries: Array<{
      key: string;
      value: T;
      fetchFn?: () => Promise<T>;
      options?: any;
    }>
  ): Promise<void> {
    await this.multiLevelCache.warmUp(entries);
  }

  /**
   * Switch cache eviction policy
   * @param policy - Policy to switch to
   */
  switchPolicy(policy: EvictionPolicy | string): void {
    this.policyManager.switchPolicy(policy);
  }

  /**
   * Get current eviction policy
   */
  getCurrentPolicy(): EvictionPolicy | string {
    return this.policyManager.getCurrentPolicy();
  }

  /**
   * Clear all cache layers
   */
  async clear(): Promise<void> {
    await this.multiLevelCache.clear();
  }

  /**
   * Shutdown cache system
   */
  async shutdown(): Promise<void> {
    await this.warmer.stop();
    await this.invalidationManager.cleanup();
    await this.multiLevelCache.clear();
  }
}

/**
 * Factory function to create cache system
 * @param redis - Redis connection manager
 * @param config - Configuration options
 * @returns Advanced cache system instance
 */
export function createCacheSystem(
  redis: RedisConnectionManager,
  config?: AdvancedCacheSystemConfig
): Promise<AdvancedCacheSystem> {
  return AdvancedCacheSystem.create(redis, config);
}

/**
 * Factory function to create cache system with defaults
 * @param redis - Redis connection manager
 * @returns Advanced cache system instance with sensible defaults
 */
export function createDefaultCacheSystem(
  redis: RedisConnectionManager
): Promise<AdvancedCacheSystem> {
  return AdvancedCacheSystem.createDefault(redis);
}
