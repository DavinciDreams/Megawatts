import { RedisConnectionManager } from '../storage/database/redis';
import { CacheManager } from '../storage/cache/cacheManager';
import { CacheError, CacheErrorCode } from '../storage/errors';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';

/**
 * Invalidation types
 */
export enum InvalidationType {
  TTL = 'TTL', // Time-based expiration
  EVENT = 'EVENT', // Event-based invalidation
  DEPENDENCY = 'DEPENDENCY', // Dependency-based invalidation
  TAG = 'TAG', // Tag-based invalidation
  MANUAL = 'MANUAL', // Manual invalidation
}

/**
 * Cache dependency relationship
 */
export interface CacheDependency {
  key: string;
  dependsOn: string[]; // Keys this key depends on
  dependents: string[]; // Keys that depend on this key
  cascade: boolean; // Whether to cascade invalidation
}

/**
 * Cache tag relationship
 */
export interface CacheTag {
  name: string;
  keys: Set<string>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Invalidation event
 */
export interface InvalidationEvent {
  type: InvalidationType;
  key: string;
  timestamp: Date;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * TTL configuration
 */
export interface TTLConfig {
  defaultTtl: number;
  keySpecificTTLs: Map<string, number>;
  tagSpecificTTLs: Map<string, number>;
  slidingTTL: boolean; // Reset TTL on access
}

/**
 * Event-based invalidation configuration
 */
export interface EventInvalidationConfig {
  enabled: boolean;
  eventChannel: string;
  propagateToL1: boolean;
  propagateToL2: boolean;
  propagateToL3: boolean;
}

/**
 * Dependency-based invalidation configuration
 */
export interface DependencyInvalidationConfig {
  enabled: boolean;
  cascadeDepth: number; // Maximum depth of dependency traversal
  autoTrack: boolean; // Automatically track dependencies
}

/**
 * Cache invalidation manager
 * Handles time-based, event-based, dependency-based, and tag-based invalidation
 */
export class CacheInvalidationManager extends EventEmitter {
  private cache: CacheManager;
  private redis: RedisConnectionManager;
  private logger: Logger;
  private dependencies: Map<string, CacheDependency>;
  private tags: Map<string, CacheTag>;
  private keyToTags: Map<string, Set<string>>;
  private ttlConfig: TTLConfig;
  private eventConfig: EventInvalidationConfig;
  private dependencyConfig: DependencyInvalidationConfig;
  private invalidationHistory: InvalidationEvent[];
  private maxHistorySize: number;
  private ttlTimers: Map<string, NodeJS.Timeout>;
  private l1Cache: Map<string, { value: any; expiry: number }>;

  constructor(
    redis: RedisConnectionManager,
    config: {
      defaultTtl?: number;
      eventChannel?: string;
      cascadeDepth?: number;
      maxHistorySize?: number;
      slidingTTL?: boolean;
    } = {}
  ) {
    super();
    this.redis = redis;
    this.cache = new CacheManager(redis, {
      keyPrefix: 'invalidation:',
      defaultTtl: config.defaultTtl || 3600,
    });
    this.logger = new Logger('CacheInvalidationManager');
    this.dependencies = new Map();
    this.tags = new Map();
    this.keyToTags = new Map();
    this.ttlConfig = {
      defaultTtl: config.defaultTtl || 3600,
      keySpecificTTLs: new Map(),
      tagSpecificTTLs: new Map(),
      slidingTTL: config.slidingTTL ?? false,
    };
    this.eventConfig = {
      enabled: true,
      eventChannel: config.eventChannel || 'cache_invalidation',
      propagateToL1: true,
      propagateToL2: true,
      propagateToL3: true,
    };
    this.dependencyConfig = {
      enabled: true,
      cascadeDepth: config.cascadeDepth || 5,
      autoTrack: true,
    };
    this.invalidationHistory = [];
    this.maxHistorySize = config.maxHistorySize || 1000;
    this.ttlTimers = new Map();
    this.l1Cache = new Map();

    if (this.eventConfig.enabled) {
      this.setupEventListeners();
    }
  }

  /**
   * Set cache entry with TTL
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in seconds
   * @param tags - Tags for the cache entry
   */
  async setWithTTL<T = any>(
    key: string,
    value: T,
    ttl?: number,
    tags?: string[]
  ): Promise<void> {
    try {
      const effectiveTtl = ttl || this.ttlConfig.defaultTtl;

      // Store in L1 cache with expiry
      this.l1Cache.set(key, {
        value,
        expiry: Date.now() + effectiveTtl * 1000,
      });

      // Set TTL timer
      this.setTTLTimer(key, effectiveTtl);

      // Store in L2 (Redis)
      await this.cache.set(key, value, { ttl: effectiveTtl, tags });

      // Track tags
      if (tags && tags.length > 0) {
        await this.trackTags(key, tags);
      }

      this.logger.debug(`Set cache key ${key} with TTL ${effectiveTtl}s`);
    } catch (error) {
      this.logger.error('Failed to set cache with TTL:', error);
      throw new CacheError(
        CacheErrorCode.SET_FAILED,
        'Failed to set cache with TTL',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'SET_WITH_TTL'
      );
    }
  }

  /**
   * Invalidate cache key by TTL
   * @param key - Cache key
   */
  async invalidateByTTL(key: string): Promise<boolean> {
    try {
      // Clear TTL timer
      this.clearTTLTimer(key);

      // Remove from L1
      this.l1Cache.delete(key);

      // Remove from L2
      await this.cache.del(key);

      // Record event
      this.recordInvalidation({
        type: InvalidationType.TTL,
        key,
        timestamp: new Date(),
        reason: 'TTL expired',
      });

      this.logger.debug(`Invalidated key ${key} by TTL`);
      return true;
    } catch (error) {
      this.logger.error('Failed to invalidate by TTL:', error);
      return false;
    }
  }

  /**
   * Invalidate cache key by event
   * @param key - Cache key
   * @param reason - Reason for invalidation
   * @param metadata - Additional metadata
   */
  async invalidateByEvent(
    key: string,
    reason?: string,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    try {
      // Remove from L1
      this.l1Cache.delete(key);

      // Remove from L2
      await this.cache.del(key);

      // Publish invalidation event
      if (this.eventConfig.enabled) {
        await this.publishInvalidationEvent(key, InvalidationType.EVENT, reason, metadata);
      }

      // Record event
      this.recordInvalidation({
        type: InvalidationType.EVENT,
        key,
        timestamp: new Date(),
        reason,
        metadata,
      });

      this.logger.debug(`Invalidated key ${key} by event: ${reason}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to invalidate by event:', error);
      return false;
    }
  }

  /**
   * Invalidate cache keys by dependency
   * @param key - Cache key that was modified
   * @param cascade - Whether to cascade invalidation
   */
  async invalidateByDependency(key: string, cascade = true): Promise<number> {
    if (!this.dependencyConfig.enabled) {
      return 0;
    }

    try {
      let invalidatedCount = 0;
      const keysToInvalidate: string[] = [];

      // Get dependency
      const dependency = this.dependencies.get(key);
      if (dependency) {
        // Invalidate dependents
        keysToInvalidate.push(...dependency.dependents);
      }

      // Cascade invalidation if enabled
      if (cascade) {
        const visited = new Set<string>();
        const queue = [...keysToInvalidate];

        while (queue.length > 0 && visited.size < this.dependencyConfig.cascadeDepth) {
          const currentKey = queue.shift()!;
          if (visited.has(currentKey)) continue;

          visited.add(currentKey);
          keysToInvalidate.push(currentKey);

          const currentDependency = this.dependencies.get(currentKey);
          if (currentDependency) {
            queue.push(...currentDependency.dependents);
          }
        }
      }

      // Invalidate all affected keys
      for (const invalidKey of keysToInvalidate) {
        await this.invalidateByEvent(invalidKey, `Dependency: ${key}`, { sourceKey: key });
        invalidatedCount++;
      }

      this.logger.info(`Invalidated ${invalidatedCount} keys by dependency: ${key}`);
      return invalidatedCount;
    } catch (error) {
      this.logger.error('Failed to invalidate by dependency:', error);
      return 0;
    }
  }

  /**
   * Invalidate cache keys by tag
   * @param tag - Tag to invalidate
   */
  async invalidateByTag(tag: string): Promise<number> {
    try {
      const tagInfo = this.tags.get(tag);
      if (!tagInfo) {
        this.logger.warn(`Tag ${tag} not found`);
        return 0;
      }

      const keys = Array.from(tagInfo.keys);
      let invalidatedCount = 0;

      for (const key of keys) {
        await this.invalidateByEvent(key, `Tag: ${tag}`, { tag });
        invalidatedCount++;
      }

      // Clear tag
      this.tags.delete(tag);

      this.logger.info(`Invalidated ${invalidatedCount} keys by tag: ${tag}`);
      return invalidatedCount;
    } catch (error) {
      this.logger.error('Failed to invalidate by tag:', error);
      return 0;
    }
  }

  /**
   * Invalidate cache keys by pattern
   * @param pattern - Pattern to match keys
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    try {
      const count = await this.cache.invalidateByPattern(pattern);

      // Record event
      this.recordInvalidation({
        type: InvalidationType.MANUAL,
        key: pattern,
        timestamp: new Date(),
        reason: 'Pattern invalidation',
        metadata: { pattern },
      });

      this.logger.info(`Invalidated ${count} keys by pattern: ${pattern}`);
      return count;
    } catch (error) {
      this.logger.error('Failed to invalidate by pattern:', error);
      return 0;
    }
  }

  /**
   * Register dependency between cache keys
   * @param key - Cache key
   * @param dependsOn - Keys that this key depends on
   */
  registerDependency(key: string, dependsOn: string[]): void {
    try {
      // Remove existing dependency
      const existing = this.dependencies.get(key);
      if (existing) {
        // Remove from old dependents
        for (const depKey of existing.dependsOn) {
          const dep = this.dependencies.get(depKey);
          if (dep) {
            dep.dependents = dep.dependents.filter(k => k !== key);
          }
        }
      }

      // Create new dependency
      const dependency: CacheDependency = {
        key,
        dependsOn,
        dependents: [],
        cascade: true,
      };

      // Update dependents of dependencies
      for (const depKey of dependsOn) {
        const dep = this.dependencies.get(depKey);
        if (dep) {
          if (!dep.dependents.includes(key)) {
            dep.dependents.push(key);
          }
        } else {
          this.dependencies.set(depKey, {
            key: depKey,
            dependsOn: [],
            dependents: [key],
            cascade: true,
          });
        }
      }

      this.dependencies.set(key, dependency);
      this.logger.debug(`Registered dependency for key ${key}:`, dependsOn);
    } catch (error) {
      this.logger.error('Failed to register dependency:', error);
    }
  }

  /**
   * Track tags for a cache key
   * @param key - Cache key
   * @param tags - Tags to track
   */
  async trackTags(key: string, tags: string[]): Promise<void> {
    try {
      const existingTags = this.keyToTags.get(key) || new Set();

      for (const tag of tags) {
        existingTags.add(tag);

        let tagInfo = this.tags.get(tag);
        if (!tagInfo) {
          tagInfo = {
            name: tag,
            keys: new Set(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          this.tags.set(tag, tagInfo);
        }

        tagInfo.keys.add(key);
        tagInfo.updatedAt = new Date();
      }

      this.keyToTags.set(key, existingTags);
      this.logger.debug(`Tracked tags for key ${key}:`, tags);
    } catch (error) {
      this.logger.error('Failed to track tags:', error);
    }
  }

  /**
   * Get key-specific TTL
   * @param key - Cache key
   */
  getKeySpecificTTL(key: string): number | undefined {
    return this.ttlConfig.keySpecificTTLs.get(key);
  }

  /**
   * Set key-specific TTL
   * @param key - Cache key
   * @param ttl - Time to live in seconds
   */
  setKeySpecificTTL(key: string, ttl: number): void {
    this.ttlConfig.keySpecificTTLs.set(key, ttl);
    this.logger.debug(`Set key-specific TTL for ${key}: ${ttl}s`);
  }

  /**
   * Get tag-specific TTL
   * @param tag - Tag name
   */
  getTagSpecificTTL(tag: string): number | undefined {
    return this.ttlConfig.tagSpecificTTLs.get(tag);
  }

  /**
   * Set tag-specific TTL
   * @param tag - Tag name
   * @param ttl - Time to live in seconds
   */
  setTagSpecificTTL(tag: string, ttl: number): void {
    this.ttlConfig.tagSpecificTTLs.set(tag, ttl);
    this.logger.debug(`Set tag-specific TTL for ${tag}: ${ttl}s`);
  }

  /**
   * Enable sliding TTL (reset TTL on access)
   */
  enableSlidingTTL(): void {
    this.ttlConfig.slidingTTL = true;
    this.logger.info('Sliding TTL enabled');
  }

  /**
   * Disable sliding TTL
   */
  disableSlidingTTL(): void {
    this.ttlConfig.slidingTTL = false;
    this.logger.info('Sliding TTL disabled');
  }

  /**
   * Get invalidation history
   * @param limit - Maximum number of events to return
   */
  getInvalidationHistory(limit?: number): InvalidationEvent[] {
    const events = this.invalidationHistory.slice(-limit || this.invalidationHistory.length);
    return events;
  }

  /**
   * Get dependency graph
   */
  getDependencyGraph(): Map<string, CacheDependency> {
    return new Map(this.dependencies);
  }

  /**
   * Get all tags
   */
  getTags(): Map<string, CacheTag> {
    return new Map(this.tags);
  }

  /**
   * Get tags for a specific key
   * @param key - Cache key
   */
  getKeyTags(key: string): Set<string> {
    return this.keyToTags.get(key) || new Set();
  }

  /**
   * Clear all invalidation history
   */
  clearHistory(): void {
    this.invalidationHistory = [];
    this.logger.info('Cleared invalidation history');
  }

  /**
   * Clear all tags
   */
  clearTags(): void {
    this.tags.clear();
    this.keyToTags.clear();
    this.logger.info('Cleared all tags');
  }

  /**
   * Clear all dependencies
   */
  clearDependencies(): void {
    this.dependencies.clear();
    this.logger.info('Cleared all dependencies');
  }

  /**
   * Setup event listeners for distributed invalidation
   */
  private setupEventListeners(): void {
    this.on('invalidation', async (event: InvalidationEvent) => {
      this.logger.debug(`Received invalidation event:`, event);

      // Invalidate in L1
      if (this.eventConfig.propagateToL1) {
        this.l1Cache.delete(event.key);
      }

      // Invalidate in L2
      if (this.eventConfig.propagateToL2) {
        await this.cache.del(event.key);
      }

      // Emit for L3 invalidation
      if (this.eventConfig.propagateToL3) {
        this.emit('l3-invalidation', event);
      }
    });
  }

  /**
   * Publish invalidation event
   */
  private async publishInvalidationEvent(
    key: string,
    type: InvalidationType,
    reason?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const event: InvalidationEvent = {
      type,
      key,
      timestamp: new Date(),
      reason,
      metadata,
    };

    // Emit locally
    this.emit('invalidation', event);

    // In production, you would publish to Redis pub/sub
    // await this.redis.publish(this.eventConfig.eventChannel, JSON.stringify(event));
  }

  /**
   * Record invalidation event in history
   */
  private recordInvalidation(event: InvalidationEvent): void {
    this.invalidationHistory.push(event);

    // Trim history if needed
    if (this.invalidationHistory.length > this.maxHistorySize) {
      this.invalidationHistory.shift();
    }
  }

  /**
   * Set TTL timer for a key
   */
  private setTTLTimer(key: string, ttl: number): void {
    // Clear existing timer
    this.clearTTLTimer(key);

    // Set new timer
    const timer = setTimeout(async () => {
      await this.invalidateByTTL(key);
    }, ttl * 1000);

    this.ttlTimers.set(key, timer);
  }

  /**
   * Clear TTL timer for a key
   */
  private clearTTLTimer(key: string): void {
    const timer = this.ttlTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.ttlTimers.delete(key);
    }
  }

  /**
   * Get value from L1 cache (with TTL check)
   */
  getFromL1<T = any>(key: string): T | null {
    const entry = this.l1Cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() > entry.expiry) {
      this.l1Cache.delete(key);
      return null;
    }

    // Reset TTL if sliding TTL is enabled
    if (this.ttlConfig.slidingTTL) {
      const ttl = this.getKeySpecificTTL(key) || this.ttlConfig.defaultTtl;
      entry.expiry = Date.now() + ttl * 1000;
      this.setTTLTimer(key, ttl);
    }

    return entry.value as T;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Clear all TTL timers
    for (const timer of this.ttlTimers.values()) {
      clearTimeout(timer);
    }
    this.ttlTimers.clear();

    // Clear caches
    this.l1Cache.clear();
    this.tags.clear();
    this.keyToTags.clear();
    this.dependencies.clear();
    this.invalidationHistory = [];

    this.logger.info('Cache invalidation manager cleaned up');
  }
}
