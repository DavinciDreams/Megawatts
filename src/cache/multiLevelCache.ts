import { RedisConnectionManager } from '../storage/database/redis';
import { CacheManager } from '../storage/cache/cacheManager';
import { CacheError, CacheErrorCode } from '../storage/errors';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';

/**
 * Cache layer types for multi-level caching
 */
export enum CacheLayer {
  L1 = 'L1', // In-memory cache (fastest, smallest)
  L2 = 'L2', // Redis cache (fast, medium size)
  L3 = 'L3', // Database cache (slower, largest)
}

/**
 * Cache entry with layer metadata
 */
export interface LayeredCacheEntry<T = any> {
  value: T;
  layer: CacheLayer;
  key: string;
  ttl?: number;
  createdAt: Date;
  accessedAt: Date;
  accessCount: number;
  tags?: string[];
  priority?: number;
}

/**
 * Multi-level cache configuration
 */
export interface MultiLevelCacheConfig {
  l1MaxSize?: number;
  l1Ttl?: number;
  l2Ttl?: number;
  l3Ttl?: number;
  enablePredictivePreloading?: boolean;
  enableDistributedCoordination?: boolean;
  coordinationChannel?: string;
  analyticsEnabled?: boolean;
  analyticsRetentionMs?: number;
}

/**
 * Cache analytics data
 */
export interface CacheAnalytics {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  l3Hits: number;
  l3Misses: number;
  totalRequests: number;
  totalHits: number;
  totalMisses: number;
  overallHitRate: number;
  averageLatency: number;
  keyAccessPatterns: Map<string, { count: number; lastAccessed: Date }>;
  layerUsage: {
    l1: { size: number; maxSize: number };
    l2: { size: number };
    l3: { size: number };
  };
}

/**
 * Cache warming strategy
 */
export interface WarmingStrategy {
  priority: 'low' | 'medium' | 'high';
  batchSize: number;
  delayBetweenBatches: number;
  maxRetries: number;
}

/**
 * Predictive preloading configuration
 */
export interface PredictiveConfig {
  enabled: boolean;
  accessPatternWindow: number; // milliseconds to track patterns
  predictionThreshold: number; // 0-1, probability threshold
  maxPreloadKeys: number;
}

/**
 * Multi-level cache with L1 (in-memory), L2 (Redis), and L3 (database) layers
 * Implements cache warming, predictive preloading, analytics, and distributed coordination
 */
export class MultiLevelCache extends EventEmitter {
  private l1Cache: Map<string, LayeredCacheEntry>;
  private l2Cache: CacheManager;
  private redis: RedisConnectionManager;
  private l3Cache: CacheManager; // Reuse CacheManager for L3 (database-backed)
  private logger: Logger;
  private config: Required<MultiLevelCacheConfig>;
  private analytics: CacheAnalytics;
  private accessPatterns: Map<string, number[]>;
  private coordinationSubscribers: Map<string, () => void>;
  private warmingQueue: Array<{ key: string; priority: number }> = [];
  private isWarming = false;
  private l1AccessOrder: string[] = [];

  constructor(
    redis: RedisConnectionManager,
    config: MultiLevelCacheConfig = {}
  ) {
    super();
    this.redis = redis;
    this.l2Cache = new CacheManager(redis, {
      keyPrefix: 'l2:',
      defaultTtl: config.l2Ttl || 3600,
    });
    this.l3Cache = new CacheManager(redis, {
      keyPrefix: 'l3:',
      defaultTtl: config.l3Ttl || 86400,
    });
    this.logger = new Logger('MultiLevelCache');
    this.l1Cache = new Map();
    this.config = {
      l1MaxSize: config.l1MaxSize || 1000,
      l1Ttl: config.l1Ttl || 300, // 5 minutes
      l2Ttl: config.l2Ttl || 3600, // 1 hour
      l3Ttl: config.l3Ttl || 86400, // 24 hours
      enablePredictivePreloading: config.enablePredictivePreloading ?? true,
      enableDistributedCoordination: config.enableDistributedCoordination ?? true,
      coordinationChannel: config.coordinationChannel || 'cache_coordination',
      analyticsEnabled: config.analyticsEnabled ?? true,
      analyticsRetentionMs: config.analyticsRetentionMs || 3600000, // 1 hour
    };
    this.analytics = this.initializeAnalytics();
    this.accessPatterns = new Map();
    this.coordinationSubscribers = new Map();

    if (this.config.enableDistributedCoordination) {
      this.setupDistributedCoordination();
    }
  }

  /**
   * Get value from cache, checking L1, then L2, then L3
   * @param key - Cache key
   * @param fetchFn - Function to fetch data if not in cache
   * @returns Cached value or result of fetchFn
   */
  async get<T = any>(
    key: string,
    fetchFn?: () => Promise<T>
  ): Promise<T | null> {
    const startTime = Date.now();

    try {
      // Try L1 (in-memory)
      const l1Result = this.getFromL1<T>(key);
      if (l1Result) {
        this.recordAccess(key, CacheLayer.L1, Date.now() - startTime);
        this.trackAccessPattern(key);
        return l1Result;
      }

      // Try L2 (Redis)
      const l2Result = await this.getFromL2<T>(key);
      if (l2Result) {
        // Promote to L1
        this.setToL1(key, l2Result);
        this.recordAccess(key, CacheLayer.L2, Date.now() - startTime);
        this.trackAccessPattern(key);
        return l2Result;
      }

      // Try L3 (database)
      const l3Result = await this.getFromL3<T>(key);
      if (l3Result) {
        // Promote to L2 and L1
        await this.setToL2(key, l3Result);
        this.setToL1(key, l3Result);
        this.recordAccess(key, CacheLayer.L3, Date.now() - startTime);
        this.trackAccessPattern(key);
        return l3Result;
      }

      // Cache miss - fetch from source if fetchFn provided
      this.recordMiss(key, Date.now() - startTime);

      if (fetchFn) {
        const value = await fetchFn();
        await this.set(key, value);
        return value;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to get from multi-level cache:', error);
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        'Failed to get from multi-level cache',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'GET'
      );
    }
  }

  /**
   * Set value in cache, storing in all layers
   * @param key - Cache key
   * @param value - Value to cache
   * @param options - Cache options
   */
  async set<T = any>(
    key: string,
    value: T,
    options: {
      ttl?: number;
      tags?: string[];
      priority?: number;
      layers?: CacheLayer[];
    } = {}
  ): Promise<void> {
    try {
      const layers = options.layers || [CacheLayer.L1, CacheLayer.L2, CacheLayer.L3];

      // Set in specified layers
      const promises: Promise<void>[] = [];

      if (layers.includes(CacheLayer.L1)) {
        this.setToL1(key, value, options);
      }

      if (layers.includes(CacheLayer.L2)) {
        promises.push(this.setToL2(key, value, options));
      }

      if (layers.includes(CacheLayer.L3)) {
        promises.push(this.setToL3(key, value, options));
      }

      await Promise.all(promises);

      // Notify other instances if distributed coordination is enabled
      if (this.config.enableDistributedCoordination) {
        await this.notifyInvalidation(key);
      }

      this.logger.debug(`Set cache key ${key} in layers: ${layers.join(', ')}`);
    } catch (error) {
      this.logger.error('Failed to set in multi-level cache:', error);
      throw new CacheError(
        CacheErrorCode.SET_FAILED,
        'Failed to set in multi-level cache',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'SET'
      );
    }
  }

  /**
   * Delete key from all cache layers
   * @param key - Cache key
   */
  async delete(key: string): Promise<boolean> {
    try {
      // Delete from L1
      this.l1Cache.delete(key);
      this.l1AccessOrder = this.l1AccessOrder.filter(k => k !== key);

      // Delete from L2 and L3
      await Promise.all([
        this.l2Cache.del(key),
        this.l3Cache.del(key),
      ]);

      // Notify other instances
      if (this.config.enableDistributedCoordination) {
        await this.notifyInvalidation(key);
      }

      this.logger.debug(`Deleted cache key ${key} from all layers`);
      return true;
    } catch (error) {
      this.logger.error('Failed to delete from multi-level cache:', error);
      throw new CacheError(
        CacheErrorCode.DELETE_FAILED,
        'Failed to delete from multi-level cache',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'DELETE'
      );
    }
  }

  /**
   * Invalidate cache by tag across all layers
   * @param tag - Tag to invalidate
   */
  async invalidateByTag(tag: string): Promise<number> {
    try {
      // Invalidate L1 entries with tag
      let l1Count = 0;
      for (const [key, entry] of this.l1Cache.entries()) {
        if (entry.tags?.includes(tag)) {
          this.l1Cache.delete(key);
          this.l1AccessOrder = this.l1AccessOrder.filter(k => k !== key);
          l1Count++;
        }
      }

      // Invalidate L2 and L3
      const [l2Count, l3Count] = await Promise.all([
        this.l2Cache.invalidateByTag(tag),
        this.l3Cache.invalidateByTag(tag),
      ]);

      const totalCount = l1Count + l2Count + l3Count;
      this.logger.info(`Invalidated ${totalCount} entries by tag ${tag}`);
      return totalCount;
    } catch (error) {
      this.logger.error('Failed to invalidate by tag:', error);
      throw new CacheError(
        CacheErrorCode.INVALIDATION_FAILED,
        'Failed to invalidate cache by tag',
        { error: error instanceof Error ? error.message : String(error) },
        tag,
        'INVALIDATE_BY_TAG'
      );
    }
  }

  /**
   * Get cache analytics
   * @returns Cache analytics data
   */
  getAnalytics(): CacheAnalytics {
    return {
      ...this.analytics,
      layerUsage: {
        l1: {
          size: this.l1Cache.size,
          maxSize: this.config.l1MaxSize,
        },
        l2: {
          size: this.analytics.l2Hits + this.analytics.l2Misses,
        },
        l3: {
          size: this.analytics.l3Hits + this.analytics.l3Misses,
        },
      },
    };
  }

  /**
   * Clear all cache layers
   */
  async clear(): Promise<void> {
    try {
      this.l1Cache.clear();
      this.l1AccessOrder = [];
      this.accessPatterns.clear();

      await Promise.all([
        this.l2Cache.clear(),
        this.l3Cache.clear(),
      ]);

      this.analytics = this.initializeAnalytics();
      this.logger.info('Cleared all cache layers');
    } catch (error) {
      this.logger.error('Failed to clear multi-level cache:', error);
      throw new CacheError(
        CacheErrorCode.DELETE_FAILED,
        'Failed to clear multi-level cache',
        { error: error instanceof Error ? error.message : String(error) },
        undefined,
        'CLEAR'
      );
    }
  }

  /**
   * Warm up cache with frequently accessed data
   * @param entries - Array of cache entries to warm
   * @param strategy - Warming strategy
   */
  async warmUp<T = any>(
    entries: Array<{ key: string; value: T; options?: any }>,
    strategy: WarmingStrategy = { priority: 'medium', batchSize: 10, delayBetweenBatches: 100, maxRetries: 3 }
  ): Promise<void> {
    if (this.isWarming) {
      this.logger.warn('Cache warming already in progress');
      return;
    }

    this.isWarming = true;
    this.logger.info(`Starting cache warm-up with ${entries.length} entries`);

    try {
      // Sort by priority
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      entries.sort((a, b) => {
        const aPriority = a.options?.priority || 0;
        const bPriority = b.options?.priority || 0;
        return bPriority - aPriority;
      });

      // Process in batches
      for (let i = 0; i < entries.length; i += strategy.batchSize) {
        const batch = entries.slice(i, i + strategy.batchSize);
        await Promise.all(
          batch.map(async (entry) => {
            let retries = 0;
            while (retries < strategy.maxRetries) {
              try {
                await this.set(entry.key, entry.value, entry.options);
                break;
              } catch (error) {
                retries++;
                if (retries >= strategy.maxRetries) {
                  this.logger.error(`Failed to warm up key ${entry.key} after ${retries} retries`, error);
                } else {
                  await new Promise(resolve => setTimeout(resolve, 100 * retries));
                }
              }
            }
          })
        );

        if (i + strategy.batchSize < entries.length) {
          await new Promise(resolve => setTimeout(resolve, strategy.delayBetweenBatches));
        }
      }

      this.logger.info(`Cache warm-up completed for ${entries.length} entries`);
    } catch (error) {
      this.logger.error('Cache warm-up failed:', error);
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Enable predictive preloading based on access patterns
   * @param config - Predictive preloading configuration
   */
  enablePredictivePreloading(config: PredictiveConfig): void {
    this.config.enablePredictivePreloading = true;
    this.logger.info('Predictive preloading enabled', config);

    // Start periodic pattern analysis
    setInterval(() => {
      this.analyzeAccessPatterns();
    }, config.accessPatternWindow);
  }

  /**
   * Disable predictive preloading
   */
  disablePredictivePreloading(): void {
    this.config.enablePredictivePreloading = false;
    this.logger.info('Predictive preloading disabled');
  }

  /**
   * Get value from L1 (in-memory) cache
   */
  private getFromL1<T = any>(key: string): T | null {
    const entry = this.l1Cache.get(key);
    if (!entry) {
      this.analytics.l1Misses++;
      return null;
    }

    // Check TTL
    if (entry.ttl && Date.now() - entry.createdAt.getTime() > entry.ttl * 1000) {
      this.l1Cache.delete(key);
      this.l1AccessOrder = this.l1AccessOrder.filter(k => k !== key);
      this.analytics.l1Misses++;
      return null;
    }

    // Update access stats
    entry.accessedAt = new Date();
    entry.accessCount++;
    this.updateL1AccessOrder(key);

    this.analytics.l1Hits++;
    return entry.value as T;
  }

  /**
   * Set value in L1 (in-memory) cache
   */
  private setToL1<T = any>(
    key: string,
    value: T,
    options: {
      ttl?: number;
      tags?: string[];
      priority?: number;
    } = {}
  ): void {
    // Evict if at capacity
    if (this.l1Cache.size >= this.config.l1MaxSize) {
      this.evictFromL1();
    }

    const entry: LayeredCacheEntry<T> = {
      value,
      layer: CacheLayer.L1,
      key,
      ttl: options.ttl || this.config.l1Ttl,
      createdAt: new Date(),
      accessedAt: new Date(),
      accessCount: 0,
      tags: options.tags,
      priority: options.priority,
    };

    this.l1Cache.set(key, entry);
    this.updateL1AccessOrder(key);
  }

  /**
   * Get value from L2 (Redis) cache
   */
  private async getFromL2<T = any>(key: string): Promise<T | null> {
    try {
      const result = await this.l2Cache.get<T>(key);
      if (result) {
        this.analytics.l2Hits++;
      } else {
        this.analytics.l2Misses++;
      }
      return result;
    } catch (error) {
      this.analytics.l2Misses++;
      return null;
    }
  }

  /**
   * Set value in L2 (Redis) cache
   */
  private async setToL2<T = any>(
    key: string,
    value: T,
    options: {
      ttl?: number;
      tags?: string[];
      priority?: number;
    } = {}
  ): Promise<void> {
    await this.l2Cache.set(key, value, {
      ttl: options.ttl || this.config.l2Ttl,
      tags: options.tags,
      priority: options.priority,
    });
  }

  /**
   * Get value from L3 (database) cache
   */
  private async getFromL3<T = any>(key: string): Promise<T | null> {
    try {
      const result = await this.l3Cache.get<T>(key);
      if (result) {
        this.analytics.l3Hits++;
      } else {
        this.analytics.l3Misses++;
      }
      return result;
    } catch (error) {
      this.analytics.l3Misses++;
      return null;
    }
  }

  /**
   * Set value in L3 (database) cache
   */
  private async setToL3<T = any>(
    key: string,
    value: T,
    options: {
      ttl?: number;
      tags?: string[];
      priority?: number;
    } = {}
  ): Promise<void> {
    await this.l3Cache.set(key, value, {
      ttl: options.ttl || this.config.l3Ttl,
      tags: options.tags,
      priority: options.priority,
    });
  }

  /**
   * Evict entry from L1 using LRU policy
   */
  private evictFromL1(): void {
    if (this.l1AccessOrder.length === 0) return;

    const keyToEvict = this.l1AccessOrder.shift()!;
    this.l1Cache.delete(keyToEvict);
    this.logger.debug(`Evicted key ${keyToEvict} from L1 cache`);
  }

  /**
   * Update L1 access order for LRU tracking
   */
  private updateL1AccessOrder(key: string): void {
    // Remove from current position and add to end
    this.l1AccessOrder = this.l1AccessOrder.filter(k => k !== key);
    this.l1AccessOrder.push(key);
  }

  /**
   * Record cache access for analytics
   */
  private recordAccess(key: string, layer: CacheLayer, latency: number): void {
    this.analytics.totalRequests++;
    this.analytics.totalHits++;

    switch (layer) {
      case CacheLayer.L1:
        this.analytics.l1Hits++;
        break;
      case CacheLayer.L2:
        this.analytics.l2Hits++;
        break;
      case CacheLayer.L3:
        this.analytics.l3Hits++;
        break;
    }

    this.updateAverageLatency(latency);
    this.updateKeyAccessPattern(key);
  }

  /**
   * Record cache miss for analytics
   */
  private recordMiss(key: string, latency: number): void {
    this.analytics.totalRequests++;
    this.analytics.totalMisses++;
    this.updateAverageLatency(latency);
  }

  /**
   * Update average latency
   */
  private updateAverageLatency(latency: number): void {
    const totalLatency = this.analytics.averageLatency * (this.analytics.totalRequests - 1) + latency;
    this.analytics.averageLatency = totalLatency / this.analytics.totalRequests;
    this.analytics.overallHitRate = (this.analytics.totalHits / this.analytics.totalRequests) * 100;
  }

  /**
   * Track access pattern for predictive preloading
   */
  private trackAccessPattern(key: string): void {
    if (!this.config.enablePredictivePreloading) return;

    const now = Date.now();
    const pattern = this.accessPatterns.get(key) || [];
    pattern.push(now);

    // Keep only recent access times
    const cutoff = now - this.config.analyticsRetentionMs;
    const recentPattern = pattern.filter(time => time > cutoff);
    this.accessPatterns.set(key, recentPattern);
  }

  /**
   * Update key access pattern in analytics
   */
  private updateKeyAccessPattern(key: string): void {
    const existing = this.analytics.keyAccessPatterns.get(key);
    if (existing) {
      existing.count++;
      existing.lastAccessed = new Date();
    } else {
      this.analytics.keyAccessPatterns.set(key, {
        count: 1,
        lastAccessed: new Date(),
      });
    }
  }

  /**
   * Analyze access patterns and predict which keys to preload
   */
  private analyzeAccessPatterns(): void {
    if (!this.config.enablePredictivePreloading) return;

    const now = Date.now();
    const predictions: Array<{ key: string; score: number }> = [];

    for (const [key, pattern] of this.accessPatterns.entries()) {
      if (pattern.length < 2) continue;

      // Calculate access frequency and regularity
      const intervals: number[] = [];
      for (let i = 1; i < pattern.length; i++) {
        intervals.push(pattern[i] - pattern[i - 1]);
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const lastAccess = pattern[pattern.length - 1];
      const timeSinceLastAccess = now - lastAccess;

      // Predict if key will be accessed soon
      const probability = Math.max(0, 1 - timeSinceLastAccess / avgInterval);

      if (probability > 0.7) {
        predictions.push({ key, score: probability });
      }
    }

    // Sort by probability and preload top keys
    predictions.sort((a, b) => b.score - a.score);
    const keysToPreload = predictions.slice(0, 10).map(p => p.key);

    if (keysToPreload.length > 0) {
      this.logger.info(`Predictive preloading: ${keysToPreload.length} keys`);
      this.emit('predictive-preload', keysToPreload);
    }
  }

  /**
   * Setup distributed cache coordination
   */
  private setupDistributedCoordination(): void {
    // Subscribe to invalidation channel
    const channel = this.config.coordinationChannel;
    this.logger.info(`Setting up distributed coordination on channel: ${channel}`);

    // Note: This is a simplified implementation
    // In production, you would use Redis pub/sub for real distributed coordination
    this.on('invalidation', (key: string) => {
      this.l1Cache.delete(key);
      this.l1AccessOrder = this.l1AccessOrder.filter(k => k !== key);
      this.logger.debug(`Received invalidation for key: ${key}`);
    });
  }

  /**
   * Notify other instances of cache invalidation
   */
  private async notifyInvalidation(key: string): Promise<void> {
    // Note: This is a simplified implementation
    // In production, you would publish to Redis pub/sub
    this.emit('invalidation', key);
  }

  /**
   * Initialize analytics
   */
  private initializeAnalytics(): CacheAnalytics {
    return {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
      l3Hits: 0,
      l3Misses: 0,
      totalRequests: 0,
      totalHits: 0,
      totalMisses: 0,
      overallHitRate: 0,
      averageLatency: 0,
      keyAccessPatterns: new Map(),
      layerUsage: {
        l1: { size: 0, maxSize: this.config.l1MaxSize },
        l2: { size: 0 },
        l3: { size: 0 },
      },
    };
  }

  /**
   * Get L1 cache size
   */
  getL1Size(): number {
    return this.l1Cache.size;
  }

  /**
   * Check if key exists in any layer
   */
  async exists(key: string): Promise<boolean> {
    if (this.l1Cache.has(key)) return true;
    if (await this.l2Cache.exists(key)) return true;
    if (await this.l3Cache.exists(key)) return true;
    return false;
  }

  /**
   * Get TTL for key in L1 cache
   */
  getL1TTL(key: string): number | null {
    const entry = this.l1Cache.get(key);
    if (!entry || !entry.ttl) return null;

    const elapsed = (Date.now() - entry.createdAt.getTime()) / 1000;
    return Math.max(0, entry.ttl - elapsed);
  }
}
