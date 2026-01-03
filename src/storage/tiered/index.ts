/**
 * Tiered Storage Module
 * 
 * This module provides multi-tier storage management for the Megawatts project.
 * It implements automatic data migration between storage tiers based on access patterns,
 * data lifecycle tracking, and configurable retention policies.
 * 
 * Storage Tiers:
 * - Hot: Redis cache for frequently accessed data (<1ms access)
 * - Warm: PostgreSQL for recently accessed data (<50ms access)
 * - Cold: PostgreSQL with compression for historical data (<200ms access)
 * - Backup: Encrypted storage for long-term archival (<500ms access)
 * 
 * @module tiered
 */

export {
  TieredStorageManager,
  StorageTier,
  DataType,
  DataMetadata,
  MigrationResult,
  StorageStatistics,
  type TieredStorageConfig
} from './tieredStorage';

export {
  DataLifecycleManager,
  AccessPattern,
  CostOptimization,
  LifecycleStatistics
} from './dataLifecycle';

export {
  RetentionPolicyManager,
  RetentionPolicy,
  PolicyViolation,
  PolicyEnforcementReport,
  PolicySummary
} from './retentionPolicy';

/**
 * Factory function to create a configured tiered storage manager
 * 
 * @param postgres - PostgreSQL connection manager
 * @param redis - Redis connection manager
 * @param config - Optional tiered storage configuration
 * @returns Configured TieredStorageManager instance
 * 
 * @example
 * ```typescript
 * const postgresManager = new PostgresConnectionManager(postgresConfig);
 * const redisManager = new RedisConnectionManager(redisConfig);
 * 
 * const tieredStorage = createTieredStorageManager(
 *   postgresManager,
 *   redisManager,
 *   {
 *     hot: { enabled: true, ttl: 3600, maxSize: 10000 },
 *     warm: { enabled: true, retentionDays: 90 },
 *     cold: { enabled: true, retentionDays: 365, compressionEnabled: true },
 *     backup: { enabled: true, retentionDays: 2555, schedule: '0 2 * * *' },
 *     migration: { enabled: true, intervalMinutes: 60, batchSize: 100 }
 *   }
 * );
 * 
 * await tieredStorage.initialize();
 * await tieredStorage.store('user:123', userData, DataType.USER_PROFILE);
 * const data = await tieredStorage.retrieve('user:123');
 * ```
 */
export function createTieredStorageManager(
  postgres: import('../database/postgres').PostgresConnectionManager,
  redis: import('../database/redis').RedisConnectionManager,
  config?: Partial<import('./tieredStorage').TieredStorageConfig>
): import('./tieredStorage').TieredStorageManager {
  const { TieredStorageManager } = require('./tieredStorage');
  return new TieredStorageManager(postgres, redis, config);
}

/**
 * Factory function to create a data lifecycle manager
 * 
 * @param postgres - PostgreSQL connection manager
 * @param redis - Redis connection manager
 * @returns Configured DataLifecycleManager instance
 * 
 * @example
 * ```typescript
 * const lifecycleManager = createDataLifecycleManager(
 *   postgresManager,
 *   redisManager
 * );
 * 
 * await lifecycleManager.initialize();
 * await lifecycleManager.trackData('user:123', metadata);
 * const pattern = await lifecycleManager.analyzeAccessPattern('user:123');
 * ```
 */
export function createDataLifecycleManager(
  postgres: import('../database/postgres').PostgresConnectionManager,
  redis: import('../database/redis').RedisConnectionManager
): import('./dataLifecycle').DataLifecycleManager {
  const { DataLifecycleManager } = require('./dataLifecycle');
  return new DataLifecycleManager(postgres, redis);
}

/**
 * Factory function to create a retention policy manager
 * 
 * @param postgres - PostgreSQL connection manager
 * @returns Configured RetentionPolicyManager instance
 * 
 * @example
 * ```typescript
 * const policyManager = createRetentionPolicyManager(postgresManager);
 * 
 * await policyManager.initialize();
 * const policy = await policyManager.createPolicy({
 *   name: 'Custom Policy',
 *   dataType: DataType.CONVERSATION,
 *   tier: StorageTier.WARM,
 *   maxRetentionDays: 30,
 *   enabled: true,
 *   priority: 5,
 *   description: 'Custom retention policy'
 * });
 * ```
 */
export function createRetentionPolicyManager(
  postgres: import('../database/postgres').PostgresConnectionManager
): import('./retentionPolicy').RetentionPolicyManager {
  const { RetentionPolicyManager } = require('./retentionPolicy');
  return new RetentionPolicyManager(postgres);
}

/**
 * Creates all tiered storage managers with shared connections
 * 
 * @param postgres - PostgreSQL connection manager
 * @param redis - Redis connection manager
 * @param config - Optional tiered storage configuration
 * @returns Object containing all managers
 * 
 * @example
 * ```typescript
 * const { tieredStorage, lifecycleManager, policyManager } = 
 *   createTieredStorageSystem(postgresManager, redisManager);
 * 
 * await tieredStorage.initialize();
 * await lifecycleManager.initialize();
 * await policyManager.initialize();
 * ```
 */
export function createTieredStorageSystem(
  postgres: import('../database/postgres').PostgresConnectionManager,
  redis: import('../database/redis').RedisConnectionManager,
  config?: Partial<import('./tieredStorage').TieredStorageConfig>
): {
  tieredStorage: import('./tieredStorage').TieredStorageManager;
  lifecycleManager: import('./dataLifecycle').DataLifecycleManager;
  policyManager: import('./retentionPolicy').RetentionPolicyManager;
} {
  const { TieredStorageManager } = require('./tieredStorage');
  const { DataLifecycleManager } = require('./dataLifecycle');
  const { RetentionPolicyManager } = require('./retentionPolicy');

  const tieredStorage = new TieredStorageManager(postgres, redis, config);
  const lifecycleManager = new DataLifecycleManager(postgres, redis);
  const policyManager = new RetentionPolicyManager(postgres);

  return {
    tieredStorage,
    lifecycleManager,
    policyManager
  };
}

/**
 * Re-exports for convenience
 */
export type {
  TieredStorageConfig,
  DataMetadata,
  MigrationResult,
  StorageStatistics
} from './tieredStorage';

export type {
  AccessPattern,
  CostOptimization,
  LifecycleStatistics
} from './dataLifecycle';

export type {
  RetentionPolicy,
  PolicyViolation,
  PolicyEnforcementReport,
  PolicySummary
} from './retentionPolicy';
