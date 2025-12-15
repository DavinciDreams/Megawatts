import { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';
import { Logger } from '../../utils/logger';
import { DatabaseError, DatabaseErrorCode } from '../errors';

export interface PostgresConfig extends PoolConfig {
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  healthCheckInterval?: number;
}

export class PostgresConnectionManager {
  private pool: Pool;
  private logger: Logger;
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private isConnected = false;

  constructor(private config: PostgresConfig) {
    this.logger = new Logger('PostgresConnectionManager');
    
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
      this.logger.error('Query execution failed:', { query: text, params, error });
      throw new DatabaseError(DatabaseErrorCode.QUERY_EXECUTION_FAILED, 'Query execution failed', { error: error instanceof Error ? error.message : String(error) }, text, params);
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
}