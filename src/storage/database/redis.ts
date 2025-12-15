import { createClient, RedisClientType, RedisModules, RedisFunctions, RedisScripts } from 'redis';
import { Logger } from '../../utils/logger';
import { CacheError, CacheErrorCode } from '../errors';

export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  database?: number;
  connectTimeout?: number;
  lazyConnect?: boolean;
  keepAlive?: number;
  family?: 4 | 6;
  keyPrefix?: string;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  offlineQueue?: boolean;
  healthCheckInterval?: number;
}

export class RedisConnectionManager {
  private client: RedisClientType<RedisModules, RedisFunctions, RedisScripts>;
  private logger: Logger;
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private isConnected = false;

  constructor(private config: RedisConfig) {
    this.logger = new Logger('RedisConnectionManager');
    
    const clientConfig = {
      socket: {
        host: config.host || 'localhost',
        port: config.port || 6379,
        connectTimeout: config.connectTimeout || 10000,
        keepAlive: config.keepAlive || 30000,
        family: config.family || 4,
      },
      password: config.password,
      database: config.database || 0,
      lazyConnect: config.lazyConnect !== false,
      keyPrefix: config.keyPrefix,
      retryDelayOnFailover: config.retryDelayOnFailover || 100,
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      offlineQueue: config.offlineQueue !== false,
    };

    this.client = createClient(clientConfig);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      this.logger.debug('Connected to Redis server');
    });

    this.client.on('ready', () => {
      this.logger.info('Redis client is ready');
      this.isConnected = true;
    });

    this.client.on('error', (error: Error) => {
      this.logger.error('Redis client error:', error);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      this.logger.info('Redis connection ended');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      this.logger.info('Redis client is reconnecting');
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.isConnected = true;
      this.logger.info('Connected to Redis server');
      this.startHealthCheck();
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Failed to connect to Redis',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    try {
      await this.client.disconnect();
      this.isConnected = false;
      this.logger.info('Disconnected from Redis server');
    } catch (error) {
      this.logger.error('Error disconnecting from Redis:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.DISCONNECTION_FAILED,
        'Failed to disconnect from Redis',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        key,
        'GET'
      );
    }

    try {
      const result = await this.client.get(key);
      this.logger.debug(`GET ${key}: ${result ? 'HIT' : 'MISS'}`);
      return result;
    } catch (error) {
      this.logger.error('Redis GET operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        'Redis GET operation failed',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'GET'
      );
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        key,
        'SET'
      );
    }

    try {
      if (ttl) {
        await this.client.setEx(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
      this.logger.debug(`SET ${key}${ttl ? ` (TTL: ${ttl}s)` : ''}`);
    } catch (error) {
      this.logger.error('Redis SET operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.SET_FAILED,
        'Redis SET operation failed',
        { error: error instanceof Error ? error.message : String(error), ttl },
        key,
        'SET'
      );
    }
  }

  async del(key: string): Promise<number> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        key,
        'DEL'
      );
    }

    try {
      const result = await this.client.del(key);
      this.logger.debug(`DEL ${key}: ${result} keys deleted`);
      return result;
    } catch (error) {
      this.logger.error('Redis DEL operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.DELETE_FAILED,
        'Redis DEL operation failed',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'DEL'
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        key,
        'EXISTS'
      );
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error('Redis EXISTS operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        'Redis EXISTS operation failed',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'EXISTS'
      );
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        key,
        'EXPIRE'
      );
    }

    try {
      const result = await this.client.expire(key, ttl);
      this.logger.debug(`EXPIRE ${key}: ${ttl}s`);
      return result;
    } catch (error) {
      this.logger.error('Redis EXPIRE operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.SET_FAILED,
        'Redis EXPIRE operation failed',
        { error: error instanceof Error ? error.message : String(error), ttl },
        key,
        'EXPIRE'
      );
    }
  }

  async ttl(key: string): Promise<number> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        key,
        'TTL'
      );
    }

    try {
      const result = await this.client.ttl(key);
      this.logger.debug(`TTL ${key}: ${result}s`);
      return result;
    } catch (error) {
      this.logger.error('Redis TTL operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        'Redis TTL operation failed',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'TTL'
      );
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        pattern,
        'KEYS'
      );
    }

    try {
      const result = await this.client.keys(pattern);
      this.logger.debug(`KEYS ${pattern}: ${result.length} keys found`);
      return result;
    } catch (error) {
      this.logger.error('Redis KEYS operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        'Redis KEYS operation failed',
        { error: error instanceof Error ? error.message : String(error) },
        pattern,
        'KEYS'
      );
    }
  }

  async flushDb(): Promise<void> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        undefined,
        'FLUSHDB'
      );
    }

    try {
      await this.client.flushDb();
      this.logger.info('Redis database flushed');
    } catch (error) {
      this.logger.error('Redis FLUSHDB operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.DELETE_FAILED,
        'Redis FLUSHDB operation failed',
        { error: error instanceof Error ? error.message : String(error) },
        undefined,
        'FLUSHDB'
      );
    }
  }

  private startHealthCheck(): void {
    const interval = this.config.healthCheckInterval || 30000;
    
    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.client.ping();
        this.isConnected = true;
      } catch (error) {
        this.logger.error('Redis health check failed:', error instanceof Error ? error : new Error(String(error)));
        this.isConnected = false;
      }
    }, interval);
  }

  isHealthy(): boolean {
    return this.isConnected && this.client.isOpen;
  }

  getClient(): RedisClientType<RedisModules, RedisFunctions, RedisScripts> {
    return this.client;
  }

  getConnectionInfo() {
    return {
      host: this.config.host || 'localhost',
      port: this.config.port || 6379,
      database: this.config.database || 0,
      isConnected: this.isConnected,
      isOpen: this.client.isOpen,
    };
  }
}