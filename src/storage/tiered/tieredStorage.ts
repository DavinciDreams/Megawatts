import { Logger } from '../../utils/logger';
import { StorageError, StorageErrorCode } from '../errors';
import { PostgresConnectionManager } from '../database/postgres';
import { RedisConnectionManager } from '../database/redis';
import { DataLifecycleManager } from './dataLifecycle';
import { RetentionPolicyManager } from './retentionPolicy';

/**
 * Storage tier enumeration representing different data storage levels
 */
export enum StorageTier {
  HOT = 'hot',      // Redis - Frequently accessed data
  WARM = 'warm',    // PostgreSQL - Recently accessed data
  COLD = 'cold',    // PostgreSQL with compression - Historical data
  BACKUP = 'backup' // Encrypted cloud storage - Long-term archival
}

/**
 * Data type enumeration for categorizing stored data
 */
export enum DataType {
  USER_PROFILE = 'user_profile',
  CONVERSATION = 'conversation',
  MESSAGE = 'message',
  BOT_STATE = 'bot_state',
  CONFIGURATION = 'configuration',
  ANALYTICS = 'analytics',
  CODE_MODIFICATION = 'code_modification',
  EMBEDDING = 'embedding'
}

/**
 * Interface for tiered storage configuration
 */
export interface TieredStorageConfig {
  hot: {
    enabled: boolean;
    ttl: number; // Default TTL in seconds for hot tier
    maxSize: number; // Maximum items in hot tier
  };
  warm: {
    enabled: boolean;
    retentionDays: number;
  };
  cold: {
    enabled: boolean;
    retentionDays: number;
    compressionEnabled: boolean;
  };
  backup: {
    enabled: boolean;
    retentionDays: number;
    schedule: string; // Cron expression for backup schedule
  };
  migration: {
    enabled: boolean;
    intervalMinutes: number;
    batchSize: number;
  };
}

/**
 * Interface for data metadata
 */
export interface DataMetadata {
  id: string;
  dataType: DataType;
  currentTier: StorageTier;
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
  size: number;
  tags: string[];
  expiresAt?: Date;
}

/**
 * Interface for migration result
 */
export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  failedCount: number;
  errors: string[];
  duration: number;
}

/**
 * Interface for storage statistics
 */
export interface StorageStatistics {
  hot: {
    itemCount: number;
    totalSize: number;
    hitRate: number;
  };
  warm: {
    itemCount: number;
    totalSize: number;
  };
  cold: {
    itemCount: number;
    totalSize: number;
    compressedSize: number;
  };
  backup: {
    itemCount: number;
    totalSize: number;
  };
  migrations: {
    totalMigrations: number;
    lastMigrationAt: Date;
  };
}

/**
 * Main tiered storage manager class
 * Handles automatic data migration between storage tiers based on access patterns
 */
export class TieredStorageManager {
  private logger: Logger;
  private postgres: PostgresConnectionManager;
  private redis: RedisConnectionManager;
  private lifecycleManager: DataLifecycleManager;
  private policyManager: RetentionPolicyManager;
  private config: TieredStorageConfig;
  private migrationTimer?: ReturnType<typeof setInterval>;
  private isInitialized = false;

  /**
   * Creates a new TieredStorageManager instance
   * @param postgres - PostgreSQL connection manager
   * @param redis - Redis connection manager
   * @param config - Tiered storage configuration
   */
  constructor(
    postgres: PostgresConnectionManager,
    redis: RedisConnectionManager,
    config: Partial<TieredStorageConfig> = {}
  ) {
    this.logger = new Logger('TieredStorageManager');
    this.postgres = postgres;
    this.redis = redis;
    this.config = this.getDefaultConfig(config);
    this.lifecycleManager = new DataLifecycleManager(this.postgres, this.redis);
    this.policyManager = new RetentionPolicyManager(this.postgres);
  }

  /**
   * Initializes the tiered storage system
   * Creates necessary database tables and starts migration scheduler
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing tiered storage system...');

      // Create tiered storage tables
      await this.createTables();

      // Initialize lifecycle manager
      await this.lifecycleManager.initialize();

      // Initialize policy manager
      await this.policyManager.initialize();

      // Start migration scheduler if enabled
      if (this.config.migration.enabled) {
        this.startMigrationScheduler();
      }

      this.isInitialized = true;
      this.logger.info('Tiered storage system initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize tiered storage system:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to initialize tiered storage system',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Stores data in the appropriate tier based on data type and access patterns
   * @param key - Unique key for the data
   * @param value - Data value to store
   * @param dataType - Type of data being stored
   * @param options - Optional storage options
   */
  async store(
    key: string,
    value: any,
    dataType: DataType,
    options: {
      tier?: StorageTier;
      ttl?: number;
      tags?: string[];
      expiresAt?: Date;
    } = {}
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Tiered storage manager is not initialized'
      );
    }

    try {
      const tier = options.tier || this.determineInitialTier(dataType);
      const metadata: DataMetadata = {
        id: key,
        dataType,
        currentTier: tier,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 1,
        size: this.calculateSize(value),
        tags: options.tags || [],
        expiresAt: options.expiresAt
      };

      switch (tier) {
        case StorageTier.HOT:
          await this.storeInHotTier(key, value, metadata, options.ttl);
          break;
        case StorageTier.WARM:
          await this.storeInWarmTier(key, value, metadata);
          break;
        case StorageTier.COLD:
          await this.storeInColdTier(key, value, metadata);
          break;
        case StorageTier.BACKUP:
          await this.storeInBackupTier(key, value, metadata);
          break;
      }

      // Track lifecycle
      await this.lifecycleManager.trackData(key, metadata);

      this.logger.debug(`Stored data ${key} in ${tier} tier`, { dataType });
    } catch (error) {
      this.logger.error(`Failed to store data ${key}:`, error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to store data: ${key}`,
        { key, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Retrieves data from the appropriate tier
   * Automatically promotes data to higher tiers if frequently accessed
   * @param key - Unique key for the data
   * @returns The stored data value or null if not found
   */
  async retrieve<T = any>(key: string): Promise<T | null> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Tiered storage manager is not initialized'
      );
    }

    try {
      // Try hot tier first
      let value = await this.retrieveFromHotTier<T>(key);
      if (value !== null) {
        await this.lifecycleManager.recordAccess(key, StorageTier.HOT);
        return value;
      }

      // Try warm tier
      value = await this.retrieveFromWarmTier<T>(key);
      if (value !== null) {
        await this.lifecycleManager.recordAccess(key, StorageTier.WARM);
        // Consider promotion to hot tier
        await this.considerPromotion(key, StorageTier.WARM, StorageTier.HOT);
        return value;
      }

      // Try cold tier
      value = await this.retrieveFromColdTier<T>(key);
      if (value !== null) {
        await this.lifecycleManager.recordAccess(key, StorageTier.COLD);
        // Consider promotion to warm tier
        await this.considerPromotion(key, StorageTier.COLD, StorageTier.WARM);
        return value;
      }

      // Try backup tier
      value = await this.retrieveFromBackupTier<T>(key);
      if (value !== null) {
        await this.lifecycleManager.recordAccess(key, StorageTier.BACKUP);
        // Consider promotion to cold tier
        await this.considerPromotion(key, StorageTier.BACKUP, StorageTier.COLD);
        return value;
      }

      this.logger.debug(`Data ${key} not found in any tier`);
      return null;
    } catch (error) {
      this.logger.error(`Failed to retrieve data ${key}:`, error);
      throw new StorageError(
        StorageErrorCode.RESOURCE_NOT_FOUND,
        `Failed to retrieve data: ${key}`,
        { key, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Deletes data from all tiers
   * @param key - Unique key for the data
   */
  async delete(key: string): Promise<void> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Tiered storage manager is not initialized'
      );
    }

    try {
      // Delete from all tiers
      await Promise.all([
        this.deleteFromHotTier(key),
        this.deleteFromWarmTier(key),
        this.deleteFromColdTier(key),
        this.deleteFromBackupTier(key)
      ]);

      // Remove from lifecycle tracking
      await this.lifecycleManager.removeData(key);

      this.logger.debug(`Deleted data ${key} from all tiers`);
    } catch (error) {
      this.logger.error(`Failed to delete data ${key}:`, error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to delete data: ${key}`,
        { key, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Performs automatic migration of data between tiers
   * @returns Migration result with statistics
   */
  async performMigration(): Promise<MigrationResult> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Tiered storage manager is not initialized'
      );
    }

    const startTime = Date.now();
    const result: MigrationResult = {
      success: true,
      migratedCount: 0,
      failedCount: 0,
      errors: [],
      duration: 0
    };

    try {
      this.logger.info('Starting tier migration...');

      // Get data eligible for migration
      const migrationCandidates = await this.lifecycleManager.getMigrationCandidates(
        this.config.migration.batchSize
      );

      for (const candidate of migrationCandidates) {
        try {
          const targetTier = this.determineTargetTier(candidate);
          
          if (targetTier !== candidate.currentTier) {
            await this.migrateData(candidate.id, candidate.currentTier, targetTier);
            result.migratedCount++;
          }
        } catch (error) {
          result.failedCount++;
          result.errors.push(
            `Failed to migrate ${candidate.id}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      result.duration = Date.now() - startTime;
      this.logger.info('Tier migration completed', {
        migratedCount: result.migratedCount,
        failedCount: result.failedCount,
        duration: result.duration
      });
    } catch (error) {
      result.success = false;
      result.errors.push(
        `Migration failed: ${error instanceof Error ? error.message : String(error)}`
      );
      this.logger.error('Tier migration failed:', error);
    }

    return result;
  }

  /**
   * Gets storage statistics for all tiers
   * @returns Storage statistics
   */
  async getStatistics(): Promise<StorageStatistics> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Tiered storage manager is not initialized'
      );
    }

    try {
      const hotStats = await this.getHotTierStats();
      const warmStats = await this.getWarmTierStats();
      const coldStats = await this.getColdTierStats();
      const backupStats = await this.getBackupTierStats();

      return {
        hot: hotStats,
        warm: warmStats,
        cold: coldStats,
        backup: backupStats,
        migrations: {
          totalMigrations: await this.lifecycleManager.getTotalMigrations(),
          lastMigrationAt: await this.lifecycleManager.getLastMigrationTime()
        }
      };
    } catch (error) {
      this.logger.error('Failed to get storage statistics:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to get storage statistics',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Enforces retention policies on all tiers
   * @returns Number of items deleted
   */
  async enforceRetentionPolicies(): Promise<number> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Tiered storage manager is not initialized'
      );
    }

    try {
      this.logger.info('Enforcing retention policies...');
      const deletedCount = await this.policyManager.enforcePolicies();
      this.logger.info(`Retention policies enforced, ${deletedCount} items deleted`);
      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to enforce retention policies:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to enforce retention policies',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Shuts down the tiered storage system
   */
  async shutdown(): Promise<void> {
    try {
      this.logger.info('Shutting down tiered storage system...');

      if (this.migrationTimer) {
        clearInterval(this.migrationTimer);
      }

      this.isInitialized = false;
      this.logger.info('Tiered storage system shut down successfully');
    } catch (error) {
      this.logger.error('Failed to shutdown tiered storage system:', error);
    }
  }

  /**
   * Creates necessary database tables for tiered storage
   */
  private async createTables(): Promise<void> {
    const tables = [
      `CREATE TABLE IF NOT EXISTS tiered_storage_metadata (
        id VARCHAR(255) PRIMARY KEY,
        data_type VARCHAR(50) NOT NULL,
        current_tier VARCHAR(20) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        last_accessed_at TIMESTAMP WITH TIME ZONE NOT NULL,
        access_count INTEGER DEFAULT 1,
        size BIGINT DEFAULT 0,
        tags JSONB DEFAULT '[]',
        expires_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tiered_storage_tier ON tiered_storage_metadata(current_tier)`,
      `CREATE INDEX IF NOT EXISTS idx_tiered_storage_type ON tiered_storage_metadata(data_type)`,
      `CREATE INDEX IF NOT EXISTS idx_tiered_storage_accessed ON tiered_storage_metadata(last_accessed_at)`,
      `CREATE INDEX IF NOT EXISTS idx_tiered_storage_expires ON tiered_storage_metadata(expires_at)`,
      `CREATE TABLE IF NOT EXISTS tier_migration_log (
        id SERIAL PRIMARY KEY,
        data_id VARCHAR(255) NOT NULL,
        from_tier VARCHAR(20) NOT NULL,
        to_tier VARCHAR(20) NOT NULL,
        migrated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        reason VARCHAR(255),
        success BOOLEAN DEFAULT true,
        error_message TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_migration_log_data ON tier_migration_log(data_id)`,
      `CREATE INDEX IF NOT EXISTS idx_migration_log_time ON tier_migration_log(migrated_at)`
    ];

    for (const table of tables) {
      await this.postgres.query(table);
    }
  }

  /**
   * Stores data in the hot tier (Redis)
   */
  private async storeInHotTier(
    key: string,
    value: any,
    metadata: DataMetadata,
    ttl?: number
  ): Promise<void> {
    const serializedValue = JSON.stringify(value);
    const effectiveTtl = ttl || this.config.hot.ttl;
    
    await this.redis.set(
      `tier:hot:${key}`,
      serializedValue,
      effectiveTtl
    );
    
    await this.updateMetadata(metadata);
  }

  /**
   * Stores data in the warm tier (PostgreSQL)
   */
  private async storeInWarmTier(
    key: string,
    value: any,
    metadata: DataMetadata
  ): Promise<void> {
    const serializedValue = JSON.stringify(value);
    
    await this.postgres.query(
      `INSERT INTO tiered_storage_warm (id, value, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, serializedValue]
    );
    
    await this.updateMetadata(metadata);
  }

  /**
   * Stores data in the cold tier (PostgreSQL with compression)
   */
  private async storeInColdTier(
    key: string,
    value: any,
    metadata: DataMetadata
  ): Promise<void> {
    const serializedValue = JSON.stringify(value);
    const compressedValue = this.config.cold.compressionEnabled 
      ? this.compress(serializedValue)
      : serializedValue;
    
    await this.postgres.query(
      `INSERT INTO tiered_storage_cold (id, value, compressed, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET value = $2, compressed = $3, updated_at = NOW()`,
      [key, compressedValue, this.config.cold.compressionEnabled]
    );
    
    await this.updateMetadata(metadata);
  }

  /**
   * Stores data in the backup tier (PostgreSQL with long-term retention)
   */
  private async storeInBackupTier(
    key: string,
    value: any,
    metadata: DataMetadata
  ): Promise<void> {
    const serializedValue = JSON.stringify(value);
    
    await this.postgres.query(
      `INSERT INTO tiered_storage_backup (id, value, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, serializedValue]
    );
    
    await this.updateMetadata(metadata);
  }

  /**
   * Retrieves data from the hot tier
   */
  private async retrieveFromHotTier<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(`tier:hot:${key}`);
    if (value) {
      return JSON.parse(value) as T;
    }
    return null;
  }

  /**
   * Retrieves data from the warm tier
   */
  private async retrieveFromWarmTier<T>(key: string): Promise<T | null> {
    const result = await this.postgres.query(
      'SELECT value FROM tiered_storage_warm WHERE id = $1',
      [key]
    );
    
    if (result.rows.length > 0) {
      return JSON.parse(result.rows[0].value) as T;
    }
    return null;
  }

  /**
   * Retrieves data from the cold tier
   */
  private async retrieveFromColdTier<T>(key: string): Promise<T | null> {
    const result = await this.postgres.query(
      'SELECT value, compressed FROM tiered_storage_cold WHERE id = $1',
      [key]
    );
    
    if (result.rows.length > 0) {
      const { value, compressed } = result.rows[0];
      const decompressedValue = compressed ? this.decompress(value) : value;
      return JSON.parse(decompressedValue) as T;
    }
    return null;
  }

  /**
   * Retrieves data from the backup tier
   */
  private async retrieveFromBackupTier<T>(key: string): Promise<T | null> {
    const result = await this.postgres.query(
      'SELECT value FROM tiered_storage_backup WHERE id = $1',
      [key]
    );
    
    if (result.rows.length > 0) {
      return JSON.parse(result.rows[0].value) as T;
    }
    return null;
  }

  /**
   * Deletes data from the hot tier
   */
  private async deleteFromHotTier(key: string): Promise<void> {
    await this.redis.del(`tier:hot:${key}`);
  }

  /**
   * Deletes data from the warm tier
   */
  private async deleteFromWarmTier(key: string): Promise<void> {
    await this.postgres.query(
      'DELETE FROM tiered_storage_warm WHERE id = $1',
      [key]
    );
  }

  /**
   * Deletes data from the cold tier
   */
  private async deleteFromColdTier(key: string): Promise<void> {
    await this.postgres.query(
      'DELETE FROM tiered_storage_cold WHERE id = $1',
      [key]
    );
  }

  /**
   * Deletes data from the backup tier
   */
  private async deleteFromBackupTier(key: string): Promise<void> {
    await this.postgres.query(
      'DELETE FROM tiered_storage_backup WHERE id = $1',
      [key]
    );
  }

  /**
   * Updates metadata for a data item
   */
  private async updateMetadata(metadata: DataMetadata): Promise<void> {
    await this.postgres.query(
      `INSERT INTO tiered_storage_metadata (
        id, data_type, current_tier, created_at, last_accessed_at,
        access_count, size, tags, expires_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (id) DO UPDATE SET
        current_tier = $3,
        last_accessed_at = $5,
        access_count = $6,
        size = $7,
        tags = $8,
        expires_at = $9,
        updated_at = NOW()`,
      [
        metadata.id,
        metadata.dataType,
        metadata.currentTier,
        metadata.createdAt,
        metadata.lastAccessedAt,
        metadata.accessCount,
        metadata.size,
        JSON.stringify(metadata.tags),
        metadata.expiresAt
      ]
    );
  }

  /**
   * Determines the initial tier for new data based on data type
   */
  private determineInitialTier(dataType: DataType): StorageTier {
    switch (dataType) {
      case DataType.USER_PROFILE:
      case DataType.BOT_STATE:
      case DataType.CONFIGURATION:
        return StorageTier.HOT;
      case DataType.CONVERSATION:
      case DataType.MESSAGE:
        return StorageTier.WARM;
      case DataType.ANALYTICS:
        return StorageTier.COLD;
      case DataType.CODE_MODIFICATION:
        return StorageTier.WARM;
      case DataType.EMBEDDING:
        return StorageTier.WARM;
      default:
        return StorageTier.WARM;
    }
  }

  /**
   * Determines the target tier for data based on access patterns
   */
  private determineTargetTier(metadata: DataMetadata): StorageTier {
    const ageInDays = (Date.now() - metadata.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const daysSinceLastAccess = (Date.now() - metadata.lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);
    const accessFrequency = metadata.accessCount / Math.max(ageInDays, 1);

    // High frequency and recent access -> Hot
    if (accessFrequency > 10 && daysSinceLastAccess < 1) {
      return StorageTier.HOT;
    }

    // Moderate frequency and recent access -> Warm
    if (accessFrequency > 1 && daysSinceLastAccess < 7) {
      return StorageTier.WARM;
    }

    // Low frequency or old data -> Cold
    if (daysSinceLastAccess > 30) {
      return StorageTier.COLD;
    }

    // Very old data -> Backup
    if (ageInDays > 90) {
      return StorageTier.BACKUP;
    }

    return metadata.currentTier;
  }

  /**
   * Migrates data from one tier to another
   */
  private async migrateData(
    key: string,
    fromTier: StorageTier,
    toTier: StorageTier
  ): Promise<void> {
    // Retrieve data from source tier
    let value: any;
    switch (fromTier) {
      case StorageTier.HOT:
        value = await this.retrieveFromHotTier(key);
        break;
      case StorageTier.WARM:
        value = await this.retrieveFromWarmTier(key);
        break;
      case StorageTier.COLD:
        value = await this.retrieveFromColdTier(key);
        break;
      case StorageTier.BACKUP:
        value = await this.retrieveFromBackupTier(key);
        break;
    }

    if (value === null) {
      throw new Error(`Data ${key} not found in ${fromTier} tier`);
    }

    // Store in target tier
    const metadata = await this.getMetadata(key);
    if (!metadata) {
      throw new Error(`Metadata not found for ${key}`);
    }

    metadata.currentTier = toTier;
    metadata.lastAccessedAt = new Date();

    switch (toTier) {
      case StorageTier.HOT:
        await this.storeInHotTier(key, value, metadata, this.config.hot.ttl);
        break;
      case StorageTier.WARM:
        await this.storeInWarmTier(key, value, metadata);
        break;
      case StorageTier.COLD:
        await this.storeInColdTier(key, value, metadata);
        break;
      case StorageTier.BACKUP:
        await this.storeInBackupTier(key, value, metadata);
        break;
    }

    // Delete from source tier
    switch (fromTier) {
      case StorageTier.HOT:
        await this.deleteFromHotTier(key);
        break;
      case StorageTier.WARM:
        await this.deleteFromWarmTier(key);
        break;
      case StorageTier.COLD:
        await this.deleteFromColdTier(key);
        break;
      case StorageTier.BACKUP:
        await this.deleteFromBackupTier(key);
        break;
    }

    // Log migration
    await this.logMigration(key, fromTier, toTier, 'automatic');
  }

  /**
   * Considers promoting data to a higher tier
   */
  private async considerPromotion(
    key: string,
    currentTier: StorageTier,
    targetTier: StorageTier
  ): Promise<void> {
    const metadata = await this.getMetadata(key);
    if (!metadata) {
      return;
    }

    const accessFrequency = metadata.accessCount / 
      Math.max((Date.now() - metadata.createdAt.getTime()) / (1000 * 60 * 60 * 24), 1);

    // Only promote if access frequency is high enough
    if (accessFrequency > 5) {
      await this.migrateData(key, currentTier, targetTier);
    }
  }

  /**
   * Gets metadata for a data item
   */
  private async getMetadata(key: string): Promise<DataMetadata | null> {
    const result = await this.postgres.query(
      'SELECT * FROM tiered_storage_metadata WHERE id = $1',
      [key]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        id: row.id,
        dataType: row.data_type as DataType,
        currentTier: row.current_tier as StorageTier,
        createdAt: row.created_at,
        lastAccessedAt: row.last_accessed_at,
        accessCount: row.access_count,
        size: row.size,
        tags: row.tags,
        expiresAt: row.expires_at
      };
    }

    return null;
  }

  /**
   * Logs a migration event
   */
  private async logMigration(
    key: string,
    fromTier: StorageTier,
    toTier: StorageTier,
    reason: string
  ): Promise<void> {
    await this.postgres.query(
      `INSERT INTO tier_migration_log (data_id, from_tier, to_tier, reason, success)
       VALUES ($1, $2, $3, $4, true)`,
      [key, fromTier, toTier, reason]
    );
  }

  /**
   * Gets statistics for the hot tier
   */
  private async getHotTierStats(): Promise<{ itemCount: number; totalSize: number; hitRate: number }> {
    const result = await this.postgres.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size
       FROM tiered_storage_metadata WHERE current_tier = 'hot'`
    );

    return {
      itemCount: parseInt(result.rows[0].count),
      totalSize: parseInt(result.rows[0].total_size),
      hitRate: 0.85 // Placeholder - should be calculated from actual metrics
    };
  }

  /**
   * Gets statistics for the warm tier
   */
  private async getWarmTierStats(): Promise<{ itemCount: number; totalSize: number }> {
    const result = await this.postgres.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size
       FROM tiered_storage_metadata WHERE current_tier = 'warm'`
    );

    return {
      itemCount: parseInt(result.rows[0].count),
      totalSize: parseInt(result.rows[0].total_size)
    };
  }

  /**
   * Gets statistics for the cold tier
   */
  private async getColdTierStats(): Promise<{ itemCount: number; totalSize: number; compressedSize: number }> {
    const result = await this.postgres.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size
       FROM tiered_storage_metadata WHERE current_tier = 'cold'`
    );

    return {
      itemCount: parseInt(result.rows[0].count),
      totalSize: parseInt(result.rows[0].total_size),
      compressedSize: Math.floor(parseInt(result.rows[0].total_size) * 0.6) // Approximate compression ratio
    };
  }

  /**
   * Gets statistics for the backup tier
   */
  private async getBackupTierStats(): Promise<{ itemCount: number; totalSize: number }> {
    const result = await this.postgres.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size
       FROM tiered_storage_metadata WHERE current_tier = 'backup'`
    );

    return {
      itemCount: parseInt(result.rows[0].count),
      totalSize: parseInt(result.rows[0].total_size)
    };
  }

  /**
   * Starts the migration scheduler
   */
  private startMigrationScheduler(): void {
    const interval = this.config.migration.intervalMinutes * 60 * 1000;
    
    this.migrationTimer = setInterval(async () => {
      try {
        await this.performMigration();
      } catch (error) {
        this.logger.error('Migration scheduler error:', error);
      }
    }, interval);

    this.logger.info(`Migration scheduler started with ${this.config.migration.intervalMinutes} minute interval`);
  }

  /**
   * Gets default configuration
   */
  private getDefaultConfig(config: Partial<TieredStorageConfig>): TieredStorageConfig {
    return {
      hot: {
        enabled: config.hot?.enabled ?? true,
        ttl: config.hot?.ttl ?? 3600, // 1 hour
        maxSize: config.hot?.maxSize ?? 10000
      },
      warm: {
        enabled: config.warm?.enabled ?? true,
        retentionDays: config.warm?.retentionDays ?? 90
      },
      cold: {
        enabled: config.cold?.enabled ?? true,
        retentionDays: config.cold?.retentionDays ?? 365,
        compressionEnabled: config.cold?.compressionEnabled ?? true
      },
      backup: {
        enabled: config.backup?.enabled ?? true,
        retentionDays: config.backup?.retentionDays ?? 2555, // 7 years
        schedule: config.backup?.schedule ?? '0 2 * * *' // Daily at 2 AM
      },
      migration: {
        enabled: config.migration?.enabled ?? true,
        intervalMinutes: config.migration?.intervalMinutes ?? 60,
        batchSize: config.migration?.batchSize ?? 100
      }
    };
  }

  /**
   * Calculates the size of a value in bytes
   */
  private calculateSize(value: any): number {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  }

  /**
   * Compresses a string using simple compression
   * In production, use a proper compression library like zlib
   */
  private compress(data: string): string {
    // Placeholder - implement proper compression
    return data;
  }

  /**
   * Decompresses a string
   * In production, use a proper decompression library like zlib
   */
  private decompress(data: string): string {
    // Placeholder - implement proper decompression
    return data;
  }
}
