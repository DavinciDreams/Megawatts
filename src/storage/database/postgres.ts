import { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';
import { promisify } from 'util';
import * as zlib from 'zlib';
import { Logger } from '../../utils/logger';
import { DatabaseError, DatabaseErrorCode } from '../errors';
import { StorageTier, DataType } from '../tiered/tieredStorage';

const deflate = promisify(zlib.deflate);
const inflate = promisify(zlib.inflate);

export interface PostgresConfig extends PoolConfig {
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  healthCheckInterval?: number;
  tieredStorageEnabled?: boolean;
}

export class PostgresConnectionManager {
  private pool: Pool;
  private logger: Logger;
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private isConnected = false;
  private tieredStorageEnabled: boolean;

  constructor(private config: PostgresConfig) {
    this.logger = new Logger('PostgresConnectionManager');
    this.tieredStorageEnabled = config.tieredStorageEnabled ?? false;
    
    // Set default pool configuration
    const poolConfig: PoolConfig = {
      max: config.maxConnections || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 10000,
      ...config,
    };

    this.pool = new Pool(poolConfig);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.pool.on('connect', (client: PoolClient) => {
      this.logger.debug('New client connected to PostgreSQL');
    });

    this.pool.on('error', (err: Error) => {
      this.logger.error('PostgreSQL pool error:', err);
      this.isConnected = false;
    });

    this.pool.on('acquire', (client: PoolClient) => {
      this.logger.debug('Client acquired from pool');
    });

    this.pool.on('remove', (client: PoolClient) => {
      this.logger.debug('Client removed from pool');
    });
  }

  async connect(): Promise<void> {
    try {
      await this.pool.connect();
      this.isConnected = true;
      this.logger.info('Connected to PostgreSQL database');
      this.startHealthCheck();
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL:', error);
      throw new DatabaseError(DatabaseErrorCode.CONNECTION_FAILED, 'Failed to connect to PostgreSQL', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async disconnect(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    try {
      await this.pool.end();
      this.isConnected = false;
      this.logger.info('Disconnected from PostgreSQL database');
    } catch (error) {
      this.logger.error('Error disconnecting from PostgreSQL:', error);
      throw new DatabaseError(DatabaseErrorCode.DISCONNECTION_FAILED, 'Failed to disconnect from PostgreSQL', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async getClient(): Promise<PoolClient> {
    if (!this.isConnected) {
      throw new DatabaseError(DatabaseErrorCode.CONNECTION_FAILED, 'PostgreSQL is not connected');
    }

    try {
      return await this.pool.connect();
    } catch (error) {
      this.logger.error('Failed to get client from pool:', error);
      throw new DatabaseError(DatabaseErrorCode.CLIENT_ACQUISITION_FAILED, 'Failed to get client from pool', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const client = await this.getClient();
    
    try {
      const start = Date.now();
      const result = await client.query<T>(text, params);
      const duration = Date.now() - start;
      
      this.logger.debug(`Query executed in ${duration}ms`, { query: text, params });
      return result;
    } catch (error) {
      this.logger.error('Query execution failed:', error instanceof Error ? error : new Error(String(error)));
      throw new DatabaseError(DatabaseErrorCode.QUERY_EXECUTION_FAILED, 'Query execution failed', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      client.release();
    }
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Transaction failed:', error);
      throw new DatabaseError(DatabaseErrorCode.TRANSACTION_FAILED, 'Transaction failed', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      client.release();
    }
  }

  private startHealthCheck(): void {
    const interval = this.config.healthCheckInterval || 30000;
    
    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.query('SELECT 1');
        this.isConnected = true;
      } catch (error) {
        this.logger.error('Health check failed:', error);
        this.isConnected = false;
      }
    }, interval);
  }

  isHealthy(): boolean {
    return this.isConnected && this.pool.totalCount > 0;
  }

  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      isConnected: this.isConnected,
    };
  }

  /**
   * Executes a tier-specific query for hot tier data
   * @param key - Data key
   * @returns Query result with value
   */
  async queryHotTier<T = any>(key: string): Promise<T | null> {
    const result = await this.query<T>(
      'SELECT value FROM tiered_storage_warm WHERE id = $1',
      [key]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Executes a tier-specific query for warm tier data
   * @param key - Data key
   * @returns Query result with value
   */
  async queryWarmTier<T = any>(key: string): Promise<T | null> {
    const result = await this.query<T>(
      'SELECT value FROM tiered_storage_warm WHERE id = $1',
      [key]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Executes a tier-specific query for cold tier data
   * @param key - Data key
   * @returns Query result with value and compression flag
   */
  async queryColdTier<T = any>(key: string): Promise<{ value: T; compressed: boolean } | null> {
    const result = await this.query(
      'SELECT value, compressed FROM tiered_storage_cold WHERE id = $1',
      [key]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Executes a tier-specific query for backup tier data
   * @param key - Data key
   * @returns Query result with value
   */
  async queryBackupTier<T = any>(key: string): Promise<T | null> {
    const result = await this.query<T>(
      'SELECT value FROM tiered_storage_backup WHERE id = $1',
      [key]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Stores data in warm tier
   * @param key - Data key
   * @param value - Data value to store
   */
  async storeWarmTier(key: string, value: any): Promise<void> {
    const serializedValue = JSON.stringify(value);
    await this.query(
      `INSERT INTO tiered_storage_warm (id, value, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, serializedValue]
    );
  }

  /**
   * Stores data in cold tier with optional compression
   * @param key - Data key
   * @param value - Data value to store
   * @param compress - Whether to compress the data
   */
  async storeColdTier(key: string, value: any, compress: boolean = true): Promise<void> {
    const serializedValue = JSON.stringify(value);
    const compressedValue = compress ? await this.compressData(serializedValue) : serializedValue;
    
    await this.query(
      `INSERT INTO tiered_storage_cold (id, value, compressed, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET value = $2, compressed = $3, updated_at = NOW()`,
      [key, compressedValue, compress]
    );
  }

  /**
   * Stores data in backup tier
   * @param key - Data key
   * @param value - Data value to store
   */
  async storeBackupTier(key: string, value: any): Promise<void> {
    const serializedValue = JSON.stringify(value);
    await this.query(
      `INSERT INTO tiered_storage_backup (id, value, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, serializedValue]
    );
  }

  /**
   * Deletes data from warm tier
   * @param key - Data key
   */
  async deleteWarmTier(key: string): Promise<void> {
    await this.query('DELETE FROM tiered_storage_warm WHERE id = $1', [key]);
  }

  /**
   * Deletes data from cold tier
   * @param key - Data key
   */
  async deleteColdTier(key: string): Promise<void> {
    await this.query('DELETE FROM tiered_storage_cold WHERE id = $1', [key]);
  }

  /**
   * Deletes data from backup tier
   * @param key - Data key
   */
  async deleteBackupTier(key: string): Promise<void> {
    await this.query('DELETE FROM tiered_storage_backup WHERE id = $1', [key]);
  }

  /**
   * Gets metadata for tiered storage
   * @param key - Data key
   * @returns Metadata or null if not found
   */
  async getTieredMetadata(key: string): Promise<{
    id: string;
    dataType: DataType;
    currentTier: StorageTier;
    createdAt: Date;
    lastAccessedAt: Date;
    accessCount: number;
    size: number;
    tags: string[];
    expiresAt?: Date;
  } | null> {
    const result = await this.query(
      'SELECT * FROM tiered_storage_metadata WHERE id = $1',
      [key]
    );
    
    if (result.rows.length === 0) {
      return null;
    }

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

  /**
   * Updates tiered storage metadata
   * @param key - Data key
   * @param updates - Metadata updates
   */
  async updateTieredMetadata(
    key: string,
    updates: {
      currentTier?: StorageTier;
      lastAccessedAt?: Date;
      accessCount?: number;
      size?: number;
      tags?: string[];
      expiresAt?: Date;
    }
  ): Promise<void> {
    const setClause: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.currentTier !== undefined) {
      setClause.push(`current_tier = $${paramIndex++}`);
      values.push(updates.currentTier);
    }
    if (updates.lastAccessedAt !== undefined) {
      setClause.push(`last_accessed_at = $${paramIndex++}`);
      values.push(updates.lastAccessedAt);
    }
    if (updates.accessCount !== undefined) {
      setClause.push(`access_count = $${paramIndex++}`);
      values.push(updates.accessCount);
    }
    if (updates.size !== undefined) {
      setClause.push(`size = $${paramIndex++}`);
      values.push(updates.size);
    }
    if (updates.tags !== undefined) {
      setClause.push(`tags = $${paramIndex++}`);
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.expiresAt !== undefined) {
      setClause.push(`expires_at = $${paramIndex++}`);
      values.push(updates.expiresAt);
    }

    setClause.push(`updated_at = NOW()`);
    values.push(key);

    await this.query(
      `UPDATE tiered_storage_metadata SET ${setClause.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * Creates tiered storage tables if they don't exist
   */
  async createTieredStorageTables(): Promise<void> {
    const tables = [
      `CREATE TABLE IF NOT EXISTS tiered_storage_warm (
        id VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS tiered_storage_cold (
        id VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        compressed BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS tiered_storage_backup (
        id VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tiered_warm_created ON tiered_storage_warm(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_tiered_cold_created ON tiered_storage_cold(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_tiered_backup_created ON tiered_storage_backup(created_at)`
    ];

    for (const table of tables) {
      await this.query(table);
    }
  }

  /**
   * Gets migration tracking information
   * @param limit - Maximum number of records to return
   * @returns Array of migration records
   */
  async getMigrationLog(limit: number = 100): Promise<Array<{
    id: number;
    dataId: string;
    fromTier: StorageTier;
    toTier: StorageTier;
    migratedAt: Date;
    reason: string;
    success: boolean;
    errorMessage?: string;
  }>> {
    const result = await this.query(
      `SELECT * FROM tier_migration_log
       ORDER BY migrated_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      dataId: row.data_id,
      fromTier: row.from_tier as StorageTier,
      toTier: row.to_tier as StorageTier,
      migratedAt: row.migrated_at,
      reason: row.reason,
      success: row.success,
      errorMessage: row.error_message
    }));
  }

  /**
   * Logs a migration event
   * @param dataId - Data key
   * @param fromTier - Source tier
   * @param toTier - Target tier
   * @param reason - Migration reason
   * @param success - Whether migration succeeded
   * @param errorMessage - Error message if migration failed
   */
  async logMigration(
    dataId: string,
    fromTier: StorageTier,
    toTier: StorageTier,
    reason: string,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    await this.query(
      `INSERT INTO tier_migration_log (data_id, from_tier, to_tier, reason, success, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [dataId, fromTier, toTier, reason, success, errorMessage]
    );
  }

  /**
   * Compresses data using zlib deflate algorithm
   * Handles both string and buffer inputs
   * @param data - Data to compress (string or Buffer)
   * @returns Compressed data as base64-encoded string for storage
   */
  private async compressData(data: string | Buffer): Promise<string> {
    try {
      // Convert string to Buffer if necessary
      const inputBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      
      // Compress using deflate algorithm
      const compressedBuffer = await deflate(inputBuffer);
      
      // Convert to base64 for storage in database
      return compressedBuffer.toString('base64');
    } catch (error) {
      this.logger.error('Failed to compress data:', error);
      throw new DatabaseError(
        DatabaseErrorCode.QUERY_EXECUTION_FAILED,
        'Failed to compress data',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Decompresses data using zlib inflate algorithm
   * Handles base64-encoded compressed data
   * @param data - Compressed data (base64-encoded string)
   * @returns Decompressed data as string
   */
  private async decompressData(data: string): Promise<string> {
    try {
      // Convert base64 string back to Buffer
      const compressedBuffer = Buffer.from(data, 'base64');
      
      // Decompress using inflate algorithm
      const decompressedBuffer = await inflate(compressedBuffer);
      
      // Convert Buffer to string
      return decompressedBuffer.toString('utf8');
    } catch (error) {
      this.logger.error('Failed to decompress data:', error);
      throw new DatabaseError(
        DatabaseErrorCode.QUERY_EXECUTION_FAILED,
        'Failed to decompress data',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }
}