export { CacheManager } from './cacheManager';

export type { CacheOptions, CacheEntry, CacheStats } from './cacheManager';

// Re-export advanced caching system
export {
  AdvancedCacheSystem,
  MultiLevelCache,
  CacheLayer,
  CacheInvalidationManager,
  InvalidationType,
  LRUPolicy,
  LFUPolicy,
  FIFOPolicy,
  CachePolicyManager,
  PriorityCachePolicy,
  EvictionPolicy,
  CacheWarmer,
  WarmUpStrategy,
  WarmUpEntryBuilder,
  createCacheSystem,
  createDefaultCacheSystem,
} from '../../cache';

// Re-export advanced cache types
export type {
  LayeredCacheEntry,
  MultiLevelCacheConfig,
  CacheAnalytics,
  WarmingStrategy as MLWarmingStrategy,
  PredictiveConfig,
  CacheDependency,
  CacheTag,
  InvalidationEvent,
  TTLConfig,
  EventInvalidationConfig,
  DependencyInvalidationConfig,
  PolicyEntry,
  CustomPolicy,
  WarmUpEntry,
  WarmUpConfig,
  WarmUpSchedule,
  WarmUpStats,
  AdvancedCacheSystemConfig,
} from '../../cache';