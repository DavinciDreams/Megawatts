import { createClient, RedisClientType, RedisModules, RedisFunctions, RedisScripts } from 'redis';
import { Logger } from '../../utils/logger';
import { CacheError, CacheErrorCode } from '../errors';
import { StorageTier, DataType } from '../tiered/tieredStorage';

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
  tieredCachingEnabled?: boolean;
}

export class RedisConnectionManager {
  private client: RedisClientType<RedisModules, RedisFunctions, RedisScripts>;
  private logger: Logger;
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private isConnected = false;
  private tieredCachingEnabled: boolean;

  constructor(private config: RedisConfig) {
    this.logger = new Logger('RedisConnectionManager');
    this.tieredCachingEnabled = config.tieredCachingEnabled ?? false;
    
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

  /**
   * Stores data in hot tier with tier-specific TTL
   * @param key - Data key
   * @param value - Data value to store
   * @param dataType - Type of data for TTL determination
   */
  async setHotTier(key: string, value: any, dataType: DataType): Promise<void> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        key,
        'SET_HOT_TIER'
      );
    }

    try {
      const serializedValue = JSON.stringify(value);
      const ttl = this.getHotTierTTL(dataType);
      const tierKey = `tier:hot:${key}`;
      
      await this.client.setEx(tierKey, ttl, serializedValue);
      this.logger.debug(`SET hot tier ${key} (TTL: ${ttl}s)`, { dataType });
    } catch (error) {
      this.logger.error('Redis hot tier SET operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.SET_FAILED,
        'Redis hot tier SET operation failed',
        { error: error instanceof Error ? error.message : String(error), ttl },
        key,
        'SET_HOT_TIER'
      );
    }
  }

  /**
   * Gets data from hot tier
   * @param key - Data key
   * @returns Data value or null if not found
   */
  async getHotTier<T = any>(key: string): Promise<T | null> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        key,
        'GET_HOT_TIER'
      );
    }

    try {
      const tierKey = `tier:hot:${key}`;
      const result = await this.client.get(tierKey);
      
      if (result) {
        this.logger.debug(`GET hot tier ${key}: HIT`);
        return JSON.parse(result) as T;
      }
      
      this.logger.debug(`GET hot tier ${key}: MISS`);
      return null;
    } catch (error) {
      this.logger.error('Redis hot tier GET operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        'Redis hot tier GET operation failed',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'GET_HOT_TIER'
      );
    }
  }

  /**
   * Deletes data from hot tier
   * @param key - Data key
   */
  async deleteHotTier(key: string): Promise<number> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        key,
        'DEL_HOT_TIER'
      );
    }

    try {
      const tierKey = `tier:hot:${key}`;
      const result = await this.client.del(tierKey);
      this.logger.debug(`DEL hot tier ${key}: ${result} keys deleted`);
      return result;
    } catch (error) {
      this.logger.error('Redis hot tier DEL operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.DELETE_FAILED,
        'Redis hot tier DEL operation failed',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'DEL_HOT_TIER'
      );
    }
  }

  /**
   * Checks if data exists in hot tier
   * @param key - Data key
   * @returns True if key exists
   */
  async existsHotTier(key: string): Promise<boolean> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        key,
        'EXISTS_HOT_TIER'
      );
    }

    try {
      const tierKey = `tier:hot:${key}`;
      const result = await this.client.exists(tierKey);
      return result === 1;
    } catch (error) {
      this.logger.error('Redis hot tier EXISTS operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        'Redis hot tier EXISTS operation failed',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'EXISTS_HOT_TIER'
      );
    }
  }

  /**
   * Gets TTL for hot tier data
   * @param key - Data key
   * @returns TTL in seconds or -2 if key doesn't exist
   */
  async getHotTierTTL(key: string): Promise<number> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        key,
        'TTL_HOT_TIER'
      );
    }

    try {
      const tierKey = `tier:hot:${key}`;
      const result = await this.client.ttl(tierKey);
      return result;
    } catch (error) {
      this.logger.error('Redis hot tier TTL operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        'Redis hot tier TTL operation failed',
        { error: error instanceof Error ? error.message : String(error) },
        key,
        'TTL_HOT_TIER'
      );
    }
  }

  /**
   * Warms up cache by pre-loading frequently accessed data
   * @param keys - Array of data keys to warm up
   * @param dataType - Type of data for TTL determination
   */
  async warmCache(keys: string[], dataType: DataType): Promise<void> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        undefined,
        'WARM_CACHE'
      );
    }

    try {
      const ttl = this.getHotTierTTL(dataType);
      const pipeline = this.client.multi();
      
      for (const key of keys) {
        const tierKey = `tier:hot:${key}`;
        pipeline.setEx(tierKey, ttl, '1'); // Placeholder value
      }
      
      await pipeline.exec();
      this.logger.info(`Warmed up cache for ${keys.length} keys`, { dataType, ttl });
    } catch (error) {
      this.logger.error('Redis warm cache operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.SET_FAILED,
        'Redis warm cache operation failed',
        { error: error instanceof Error ? error.message : String(error), keys },
        undefined,
        'WARM_CACHE'
      );
    }
  }

  /**
   * Gets tier-specific TTL based on data type
   * @param dataType - Type of data
   * @returns TTL in seconds
   */
  private getHotTierTTL(dataType: DataType): number {
    switch (dataType) {
      case DataType.USER_PROFILE:
        return 3600; // 1 hour
      case DataType.CONVERSATION:
        return 86400; // 24 hours
      case DataType.MESSAGE:
        return 43200; // 12 hours
      case DataType.BOT_STATE:
        return 1800; // 30 minutes
      case DataType.CONFIGURATION:
        return 3600; // 1 hour
      case DataType.ANALYTICS:
        return 7200; // 2 hours
      case DataType.CODE_MODIFICATION:
        return 86400; // 24 hours
      case DataType.EMBEDDING:
        return 43200; // 12 hours
      default:
        return 3600; // Default 1 hour
    }
  }

  /**
   * Gets cache hit rate for hot tier
   * @returns Hit rate as percentage (0-100)
   */
  async getHotTierHitRate(): Promise<number> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        undefined,
        'GET_HIT_RATE'
      );
    }

    try {
      // Get total commands and hits using INFO
      const info = await this.client.info('stats');
      const keyspaceHits = this.extractInfoValue(info, 'keyspace_hits');
      const keyspaceMisses = this.extractInfoValue(info, 'keyspace_misses');
      
      if (keyspaceHits === null || keyspaceMisses === null) {
        return 0;
      }

      const total = keyspaceHits + keyspaceMisses;
      return total > 0 ? (keyspaceHits / total) * 100 : 0;
    } catch (error) {
      this.logger.error('Redis get hit rate operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        'Redis get hit rate operation failed',
        { error: error instanceof Error ? error.message : String(error) },
        undefined,
        'GET_HIT_RATE'
      );
    }
  }

  /**
   * Gets memory usage statistics for hot tier
   * @returns Memory usage information
   */
  async getHotTierMemoryUsage(): Promise<{
    usedMemory: number;
    maxMemory: number;
    usedPercentage: number;
  }> {
    if (!this.isConnected) {
      throw new CacheError(
        CacheErrorCode.CONNECTION_FAILED,
        'Redis is not connected',
        {},
        undefined,
        'GET_MEMORY_USAGE'
      );
    }

    try {
      const info = await this.client.info('memory');
      const usedMemory = this.extractInfoValue(info, 'used_memory');
      const maxMemory = this.extractInfoValue(info, 'maxmemory');
      
      return {
        usedMemory: usedMemory || 0,
        maxMemory: maxMemory || 0,
        usedPercentage: maxMemory ? ((usedMemory || 0) / maxMemory) * 100 : 0
      };
    } catch (error) {
      this.logger.error('Redis get memory usage operation failed:', error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        'Redis get memory usage operation failed',
        { error: error instanceof Error ? error.message : String(error) },
        undefined,
        'GET_MEMORY_USAGE'
      );
    }
  }

  /**
   * Extracts a numeric value from Redis INFO output
   * @param info - INFO output string
   * @param key - Key to extract
   * @returns Numeric value or null if not found
   */
  private extractInfoValue(info: string, key: string): number | null {
    const regex = new RegExp(`${key}:(\\d+)`);
    const match = info.match(regex);
    return match ? parseInt(match[1]) : null;
  }
}