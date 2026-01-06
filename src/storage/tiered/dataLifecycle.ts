import { Logger } from '../../utils/logger';
import { StorageError, StorageErrorCode } from '../errors';
import { PostgresConnectionManager } from '../database/postgres';
import { RedisConnectionManager } from '../database/redis';
import { StorageTier, DataType, DataMetadata } from './tieredStorage';

/**
 * Interface for access pattern analysis
 */
export interface AccessPattern {
  key: string;
  dataType: DataType;
  accessCount: number;
  avgAccessInterval: number; // Average time between accesses in seconds
  lastAccessAt: Date;
  firstAccessAt: Date;
  peakAccessHour: number; // Hour of day with most accesses
  accessTrend: 'increasing' | 'decreasing' | 'stable';
}

/**
 * Interface for cost optimization recommendation
 */
export interface CostOptimization {
  key: string;
  currentTier: StorageTier;
  recommendedTier: StorageTier;
  reason: string;
  estimatedSavings: number; // In percentage
  priority: 'high' | 'medium' | 'low';
}

/**
 * Interface for lifecycle statistics
 */
export interface LifecycleStatistics {
  totalItems: number;
  itemsByTier: Record<StorageTier, number>;
  itemsByDataType: Record<DataType, number>;
  avgAccessCount: number;
  avgAge: number; // In days
  migrationsInProgress: number;
  expiredItems: number;
}

/**
 * Data lifecycle manager class
 * Tracks data lifecycle, analyzes access patterns, and provides cost optimization recommendations
 */
export class DataLifecycleManager {
  private logger: Logger;
  private postgres: PostgresConnectionManager;
  private redis: RedisConnectionManager;
  private isInitialized = false;

  /**
   * Creates a new DataLifecycleManager instance
   * @param postgres - PostgreSQL connection manager
   * @param redis - Redis connection manager
   */
  constructor(
    postgres: PostgresConnectionManager,
    redis: RedisConnectionManager
  ) {
    this.logger = new Logger('DataLifecycleManager');
    this.postgres = postgres;
    this.redis = redis;
  }

  /**
   * Initializes the data lifecycle manager
   * Creates necessary database tables
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing data lifecycle manager...');

      await this.createTables();

      this.isInitialized = true;
      this.logger.info('Data lifecycle manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize data lifecycle manager:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to initialize data lifecycle manager',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Tracks data in the lifecycle system
   * @param key - Unique key for the data
   * @param metadata - Data metadata
   */
  async trackData(key: string, metadata: DataMetadata): Promise<void> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Data lifecycle manager is not initialized'
      );
    }

    // Skip if postgres is not available
    if (!this.postgres) {
      this.logger.debug('PostgreSQL not available, skipping data tracking');
      return;
    }

    try {
      // Store in access tracking table
      await this.postgres.query(
        `INSERT INTO data_lifecycle_tracking (
          key, data_type, initial_tier, first_access_at, last_access_at,
          access_count, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (key) DO UPDATE SET
          last_access_at = $5,
          access_count = data_lifecycle_tracking.access_count + 1,
          updated_at = NOW()`,
        [
          key,
          metadata.dataType,
          metadata.currentTier,
          metadata.createdAt,
          metadata.lastAccessedAt,
          metadata.accessCount
        ]
      );

      this.logger.debug(`Tracked data ${key} in lifecycle system`);
    } catch (error) {
      this.logger.error(`Failed to track data ${key}:`, error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to track data: ${key}`,
        { key, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Records an access event for data
   * @param key - Unique key for the data
   * @param tier - Tier from which data was accessed
   */
  async recordAccess(key: string, tier: StorageTier): Promise<void> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Data lifecycle manager is not initialized'
      );
    }

    // Skip if postgres is not available
    if (!this.postgres) {
      this.logger.debug('PostgreSQL not available, skipping access recording');
      return;
    }

    try {
      // Update access tracking
      await this.postgres.query(
        `UPDATE data_lifecycle_tracking
         SET last_access_at = NOW(),
             access_count = access_count + 1,
             updated_at = NOW()
         WHERE key = $1`,
        [key]
      );

      // Record individual access event
      await this.postgres.query(
        `INSERT INTO data_access_events (key, tier, accessed_at)
         VALUES ($1, $2, NOW())`,
        [key, tier]
      );

      this.logger.debug(`Recorded access for ${key} from ${tier} tier`);
    } catch (error) {
      this.logger.error(`Failed to record access for ${key}:`, error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to record access: ${key}`,
        { key, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Removes data from lifecycle tracking
   * @param key - Unique key for the data
   */
  async removeData(key: string): Promise<void> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Data lifecycle manager is not initialized'
      );
    }

    // Skip if postgres is not available
    if (!this.postgres) {
      this.logger.debug('PostgreSQL not available, skipping data removal');
      return;
    }

    try {
      await this.postgres.query(
        'DELETE FROM data_lifecycle_tracking WHERE key = $1',
        [key]
      );

      await this.postgres.query(
        'DELETE FROM data_access_events WHERE key = $1',
        [key]
      );

      this.logger.debug(`Removed data ${key} from lifecycle tracking`);
    } catch (error) {
      this.logger.error(`Failed to remove data ${key}:`, error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to remove data: ${key}`,
        { key, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Analyzes access patterns for a specific data item
   * @param key - Unique key for the data
   * @returns Access pattern analysis
   */
  async analyzeAccessPattern(key: string): Promise<AccessPattern | null> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Data lifecycle manager is not initialized'
      );
    }

    // Skip if postgres is not available
    if (!this.postgres) {
      this.logger.debug('PostgreSQL not available, skipping access pattern analysis');
      return null;
    }

    try {
      const result = await this.postgres.query(
        `SELECT 
           dlt.key,
           dlt.data_type,
           dlt.access_count,
           EXTRACT(EPOCH FROM (dlt.last_access_at - dlt.first_access_at)) / NULLIF(dlt.access_count - 1, 0) as avg_interval,
           dlt.last_access_at,
           dlt.first_access_at,
           dae.tier,
           COUNT(*) as access_count_by_hour
         FROM data_lifecycle_tracking dlt
         LEFT JOIN data_access_events dae ON dlt.key = dae.key
         WHERE dlt.key = $1
         GROUP BY dlt.key, dlt.data_type, dlt.access_count, dlt.last_access_at, dlt.first_access_at, dae.tier`,
        [key]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const accessEvents = await this.getAccessEvents(key, 100);
      const peakAccessHour = this.calculatePeakAccessHour(accessEvents);
      const accessTrend = this.calculateAccessTrend(accessEvents);

      return {
        key: row.key,
        dataType: row.data_type as DataType,
        accessCount: row.access_count,
        avgAccessInterval: row.avg_interval || 0,
        lastAccessAt: row.last_access_at,
        firstAccessAt: row.first_access_at,
        peakAccessHour,
        accessTrend
      };
    } catch (error) {
      this.logger.error(`Failed to analyze access pattern for ${key}:`, error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        `Failed to analyze access pattern: ${key}`,
        { key, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Gets data eligible for migration
   * @param limit - Maximum number of candidates to return
   * @returns Array of data metadata for migration candidates
   */
  async getMigrationCandidates(limit: number): Promise<DataMetadata[]> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Data lifecycle manager is not initialized'
      );
    }

    // Skip if postgres is not available
    if (!this.postgres) {
      this.logger.debug('PostgreSQL not available, returning empty migration candidates');
      return [];
    }

    try {
      const result = await this.postgres.query(
        `SELECT 
           tsm.id,
           tsm.data_type,
           tsm.current_tier,
           tsm.created_at,
           tsm.last_accessed_at,
           tsm.access_count,
           tsm.size,
           tsm.tags,
           tsm.expires_at
         FROM tiered_storage_metadata tsm
         WHERE tsm.last_accessed_at < NOW() - INTERVAL '1 hour'
         ORDER BY tsm.last_accessed_at ASC
         LIMIT $1`,
        [limit]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        dataType: row.data_type as DataType,
        currentTier: row.current_tier as StorageTier,
        createdAt: row.created_at,
        lastAccessedAt: row.last_accessed_at,
        accessCount: row.access_count,
        size: row.size,
        tags: row.tags,
        expiresAt: row.expires_at
      }));
    } catch (error) {
      this.logger.error('Failed to get migration candidates:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to get migration candidates',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Gets cost optimization recommendations
   * @param limit - Maximum number of recommendations to return
   * @returns Array of cost optimization recommendations
   */
  async getCostOptimizations(limit: number = 50): Promise<CostOptimization[]> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Data lifecycle manager is not initialized'
      );
    }

    // Skip if postgres is not available
    if (!this.postgres) {
      this.logger.debug('PostgreSQL not available, returning empty cost optimizations');
      return [];
    }

    try {
      const recommendations: CostOptimization[] = [];

      // Find data in hot tier with low access frequency
      const hotTierCandidates = await this.postgres.query(
        `SELECT 
           tsm.id,
           tsm.current_tier,
           dlt.access_count,
           EXTRACT(EPOCH FROM (NOW() - tsm.created_at)) / 86400 as age_days
         FROM tiered_storage_metadata tsm
         JOIN data_lifecycle_tracking dlt ON tsm.id = dlt.key
         WHERE tsm.current_tier = 'hot'
           AND dlt.access_count < 5
           AND tsm.created_at < NOW() - INTERVAL '1 hour'
         LIMIT $1`,
        [Math.floor(limit / 3)]
      );

      for (const row of hotTierCandidates.rows) {
        recommendations.push({
          key: row.id,
          currentTier: StorageTier.HOT,
          recommendedTier: StorageTier.WARM,
          reason: 'Low access frequency in hot tier',
          estimatedSavings: 30,
          priority: row.age_days > 1 ? 'high' : 'medium'
        });
      }

      // Find data in warm tier with very old age
      const warmTierCandidates = await this.postgres.query(
        `SELECT 
           tsm.id,
           tsm.current_tier,
           dlt.access_count,
           EXTRACT(EPOCH FROM (NOW() - tsm.created_at)) / 86400 as age_days
         FROM tiered_storage_metadata tsm
         JOIN data_lifecycle_tracking dlt ON tsm.id = dlt.key
         WHERE tsm.current_tier = 'warm'
           AND tsm.created_at < NOW() - INTERVAL '30 days'
         LIMIT $1`,
        [Math.floor(limit / 3)]
      );

      for (const row of warmTierCandidates.rows) {
        recommendations.push({
          key: row.id,
          currentTier: StorageTier.WARM,
          recommendedTier: StorageTier.COLD,
          reason: 'Data older than 30 days in warm tier',
          estimatedSavings: 50,
          priority: row.age_days > 90 ? 'high' : 'medium'
        });
      }

      // Find data in cold tier that should be archived
      const coldTierCandidates = await this.postgres.query(
        `SELECT 
           tsm.id,
           tsm.current_tier,
           dlt.access_count,
           EXTRACT(EPOCH FROM (NOW() - tsm.created_at)) / 86400 as age_days
         FROM tiered_storage_metadata tsm
         JOIN data_lifecycle_tracking dlt ON tsm.id = dlt.key
         WHERE tsm.current_tier = 'cold'
           AND tsm.created_at < NOW() - INTERVAL '90 days'
         LIMIT $1`,
        [Math.floor(limit / 3)]
      );

      for (const row of coldTierCandidates.rows) {
        recommendations.push({
          key: row.id,
          currentTier: StorageTier.COLD,
          recommendedTier: StorageTier.BACKUP,
          reason: 'Data older than 90 days in cold tier',
          estimatedSavings: 70,
          priority: row.age_days > 365 ? 'high' : 'medium'
        });
      }

      // Sort by priority and return
      recommendations.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      return recommendations.slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to get cost optimizations:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to get cost optimizations',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Handles data expiration
   * @returns Number of expired items deleted
   */
  async handleDataExpiration(): Promise<number> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Data lifecycle manager is not initialized'
      );
    }

    try {
      this.logger.info('Handling data expiration...');

      const result = await this.postgres.query(
        `SELECT id, current_tier FROM tiered_storage_metadata
         WHERE expires_at IS NOT NULL AND expires_at < NOW()`
      );

      let deletedCount = 0;

      for (const row of result.rows) {
        // Delete from appropriate tier
        switch (row.current_tier) {
          case StorageTier.HOT:
            await this.redis.del(`tier:hot:${row.id}`);
            break;
          case StorageTier.WARM:
            await this.postgres.query('DELETE FROM tiered_storage_warm WHERE id = $1', [row.id]);
            break;
          case StorageTier.COLD:
            await this.postgres.query('DELETE FROM tiered_storage_cold WHERE id = $1', [row.id]);
            break;
          case StorageTier.BACKUP:
            await this.postgres.query('DELETE FROM tiered_storage_backup WHERE id = $1', [row.id]);
            break;
        }

        // Remove from lifecycle tracking
        await this.removeData(row.id);
        deletedCount++;
      }

      this.logger.info(`Data expiration handled, ${deletedCount} items deleted`);
      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to handle data expiration:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to handle data expiration',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Gets lifecycle statistics
   * @returns Lifecycle statistics
   */
  async getStatistics(): Promise<LifecycleStatistics> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Data lifecycle manager is not initialized'
      );
    }

    try {
      const totalResult = await this.postgres.query(
        'SELECT COUNT(*) as count FROM tiered_storage_metadata'
      );

      const tierResult = await this.postgres.query(
        `SELECT current_tier, COUNT(*) as count
         FROM tiered_storage_metadata
         GROUP BY current_tier`
      );

      const typeResult = await this.postgres.query(
        `SELECT data_type, COUNT(*) as count
         FROM tiered_storage_metadata
         GROUP BY data_type`
      );

      const statsResult = await this.postgres.query(
        `SELECT 
           AVG(access_count) as avg_access_count,
           AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400) as avg_age
         FROM data_lifecycle_tracking`
      );

      const expiredResult = await this.postgres.query(
        `SELECT COUNT(*) as count FROM tiered_storage_metadata
         WHERE expires_at IS NOT NULL AND expires_at < NOW()`
      );

      const itemsByTier: Record<StorageTier, number> = {
        hot: 0,
        warm: 0,
        cold: 0,
        backup: 0
      };

      for (const row of tierResult.rows) {
        itemsByTier[row.current_tier as StorageTier] = parseInt(row.count);
      }

      const itemsByDataType: Record<DataType, number> = {
        user_profile: 0,
        conversation: 0,
        message: 0,
        bot_state: 0,
        configuration: 0,
        analytics: 0,
        code_modification: 0,
        embedding: 0
      };

      for (const row of typeResult.rows) {
        itemsByDataType[row.data_type as DataType] = parseInt(row.count);
      }

      return {
        totalItems: parseInt(totalResult.rows[0].count),
        itemsByTier,
        itemsByDataType,
        avgAccessCount: parseFloat(statsResult.rows[0]?.avg_access_count) || 0,
        avgAge: parseFloat(statsResult.rows[0]?.avg_age) || 0,
        migrationsInProgress: 0,
        expiredItems: parseInt(expiredResult.rows[0].count)
      };
    } catch (error) {
      this.logger.error('Failed to get lifecycle statistics:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to get lifecycle statistics',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Gets total number of migrations performed
   * @returns Total migration count
   */
  async getTotalMigrations(): Promise<number> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Data lifecycle manager is not initialized'
      );
    }

    try {
      const result = await this.postgres.query(
        'SELECT COUNT(*) as count FROM tier_migration_log'
      );

      return parseInt(result.rows[0].count);
    } catch (error) {
      this.logger.error('Failed to get total migrations:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to get total migrations',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Gets the timestamp of the last migration
   * @returns Last migration timestamp or null
   */
  async getLastMigrationTime(): Promise<Date | null> {
    if (!this.isInitialized) {
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Data lifecycle manager is not initialized'
      );
    }

    try {
      const result = await this.postgres.query(
        'SELECT MAX(migrated_at) as last_migration FROM tier_migration_log'
      );

      return result.rows[0].last_migration || null;
    } catch (error) {
      this.logger.error('Failed to get last migration time:', error);
      throw new StorageError(
        StorageErrorCode.OPERATION_FAILED,
        'Failed to get last migration time',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Creates necessary database tables for lifecycle tracking
   */
  private async createTables(): Promise<void> {
    // Skip table creation if postgres is not available
    if (!this.postgres) {
      this.logger.warn('PostgreSQL connection not available, skipping lifecycle tracking table creation. Only hot tier (Redis) will be used.');
      return;
    }

    const tables = [
      `CREATE TABLE IF NOT EXISTS data_lifecycle_tracking (
        key VARCHAR(255) PRIMARY KEY,
        data_type VARCHAR(50) NOT NULL,
        initial_tier VARCHAR(20) NOT NULL,
        first_access_at TIMESTAMP WITH TIME ZONE NOT NULL,
        last_access_at TIMESTAMP WITH TIME ZONE NOT NULL,
        access_count INTEGER DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lifecycle_type ON data_lifecycle_tracking(data_type)`,
      `CREATE INDEX IF NOT EXISTS idx_lifecycle_accessed ON data_lifecycle_tracking(last_access_at)`,
      `CREATE TABLE IF NOT EXISTS data_access_events (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) NOT NULL,
        tier VARCHAR(20) NOT NULL,
        accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_access_events_key ON data_access_events(key)`,
      `CREATE INDEX IF NOT EXISTS idx_access_events_time ON data_access_events(accessed_at)`
    ];

    for (const table of tables) {
      await this.postgres.query(table);
    }
  }

  /**
   * Gets access events for a data item
   * @param key - Unique key for the data
   * @param limit - Maximum number of events to return
   * @returns Array of access events
   */
  private async getAccessEvents(
    key: string,
    limit: number
  ): Promise<{ tier: StorageTier; accessed_at: Date }[]> {
    const result = await this.postgres.query(
      `SELECT tier, accessed_at FROM data_access_events
       WHERE key = $1
       ORDER BY accessed_at DESC
       LIMIT $2`,
      [key, limit]
    );

    return result.rows.map((row: any) => ({
      tier: row.tier as StorageTier,
      accessed_at: row.accessed_at
    }));
  }

  /**
   * Calculates the peak access hour for data
   * @param events - Array of access events
   * @returns Hour of day (0-23) with most accesses
   */
  private calculatePeakAccessHour(
    events: { tier: StorageTier; accessed_at: Date }[]
  ): number {
    if (events.length === 0) {
      return 12; // Default to noon
    }

    const hourCounts: Record<number, number> = {};

    for (const event of events) {
      const hour = event.accessed_at.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

    let peakHour = 12;
    let maxCount = 0;

    for (const [hour, count] of Object.entries(hourCounts)) {
      if (count > maxCount) {
        maxCount = count;
        peakHour = parseInt(hour);
      }
    }

    return peakHour;
  }

  /**
   * Calculates the access trend for data
   * @param events - Array of access events
   * @returns Access trend
   */
  private calculateAccessTrend(
    events: { tier: StorageTier; accessed_at: Date }[]
  ): 'increasing' | 'decreasing' | 'stable' {
    if (events.length < 2) {
      return 'stable';
    }

    // Split events into two halves
    const mid = Math.floor(events.length / 2);
    const firstHalf = events.slice(0, mid);
    const secondHalf = events.slice(mid);

    // Calculate average time between accesses for each half
    const firstAvgInterval = this.calculateAvgInterval(firstHalf);
    const secondAvgInterval = this.calculateAvgInterval(secondHalf);

    // Compare intervals
    if (secondAvgInterval < firstAvgInterval * 0.8) {
      return 'increasing';
    } else if (secondAvgInterval > firstAvgInterval * 1.2) {
      return 'decreasing';
    }

    return 'stable';
  }

  /**
   * Calculates average interval between access events
   * @param events - Array of access events
   * @returns Average interval in seconds
   */
  private calculateAvgInterval(
    events: { tier: StorageTier; accessed_at: Date }[]
  ): number {
    if (events.length < 2) {
      return 0;
    }

    let totalInterval = 0;

    for (let i = 1; i < events.length; i++) {
      const interval = (events[i - 1].accessed_at.getTime() - events[i].accessed_at.getTime()) / 1000;
      totalInterval += interval;
    }

    return totalInterval / (events.length - 1);
  }
}
