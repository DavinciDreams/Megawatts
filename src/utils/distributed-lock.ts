import { RedisConnectionManager } from '../storage/database/redis';
import { Logger } from './logger';

/**
 * Distributed Lock Manager using Redis
 * Ensures only one instance processes a given resource/message at a time
 */
export class DistributedLock {
  private logger: Logger;
  private lockPrefix: string = 'bot:lock:';
  private lockValues: Map<string, string> = new Map();
  
  constructor(
    private redis: RedisConnectionManager,
    context: string = 'DistributedLock'
  ) {
    this.logger = new Logger(context);
  }

  /**
   * Acquire a distributed lock with automatic expiration
   * Uses Redis SET with NX (only set if not exists) and EX (expire) options
   *
   * @param key - Lock key (will be prefixed with lockPrefix)
   * @param ttl - Time to live in seconds (auto-releases lock if not released)
   * @returns Promise<boolean> - true if lock acquired, false otherwise
   */
  async acquireLock(key: string, ttl: number = 30): Promise<boolean> {
    const lockKey = this.lockPrefix + key;
    const lockValue = this.generateLockValue();
    
    try {
      // Use SET with NX and EX for atomic lock acquisition
      // NX: Only set if key doesn't exist
      // EX: Set expiration time in seconds
      const result = await this.redis.getClient().set(lockKey, lockValue, {
        NX: true,
        EX: ttl,
      });

      const acquired = result === 'OK';

      if (acquired) {
        // Store lock value for later release
        this.lockValues.set(lockKey, lockValue);
        this.logger.debug(`Lock acquired: ${lockKey}`, { ttl, lockValue });
      } else {
        this.logger.debug(`Lock not acquired (already held): ${lockKey}`);
      }

      return acquired;
    } catch (error) {
      this.logger.error(`Failed to acquire lock: ${lockKey}`, error as Error, { ttl });
      return false;
    }
  }

  /**
   * Release a distributed lock
   Uses a Lua script to ensure only the lock owner can release it
   *
   * @param key - Lock key (will be prefixed with lockPrefix)
   */
  async releaseLock(key: string): Promise<void> {
    const lockKey = this.lockPrefix + key;
    const lockValue = this.lockValues.get(lockKey);
    
    if (!lockValue) {
      this.logger.warn(`Lock release attempted but no stored value for: ${lockKey}`);
      return;
    }

    try {
      // Lua script to safely release the lock
      // Only releases if the lock value matches (we own it)
      const releaseScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redis.getClient().eval(releaseScript, {
        keys: [lockKey],
        arguments: [lockValue],
      });

      if (result === 1) {
        this.logger.debug(`Lock released: ${lockKey}`);
        // Remove stored lock value
        this.lockValues.delete(lockKey);
      } else {
        this.logger.debug(`Lock not released (not owned or expired): ${lockKey}`);
        // Remove stored lock value even if release failed (lock likely expired)
        this.lockValues.delete(lockKey);
      }
    } catch (error) {
      this.logger.error(`Failed to release lock: ${lockKey}`, error as Error);
      // Remove stored lock value on error
      this.lockValues.delete(lockKey);
      // Don't throw - lock will expire via TTL anyway
    }
  }

  /**
   * Execute a function with distributed locking
   Acquires lock, executes function, and releases lock (with proper cleanup)
   *
   * @param key - Lock key
   * @param fn - Function to execute while holding the lock
   * @param ttl - Lock TTL in seconds
   * @returns Promise<T> - Result of the function, or null if lock not acquired
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = 30
  ): Promise<T | null> {
    const lockKey = this.lockPrefix + key;

    // Try to acquire the lock
    const acquired = await this.acquireLock(key, ttl);

    if (!acquired) {
      this.logger.debug(`Skipping execution - lock not acquired: ${lockKey}`);
      return null;
    }

    try {
      // Execute the function while holding the lock
      const result = await fn();
      return result;
    } catch (error) {
      this.logger.error(`Error executing with lock: ${lockKey}`, error as Error);
      throw error;
    } finally {
      // Always release the lock, even if function failed
      await this.releaseLock(key);
    }
  }

  /**
   * Check if a lock is currently held
   *
   * @param key - Lock key
   * @returns Promise<boolean> - true if lock exists
   */
  async isLocked(key: string): Promise<boolean> {
    const lockKey = this.lockPrefix + key;

    try {
      const exists = await this.redis.exists(lockKey);
      return exists;
    } catch (error) {
      this.logger.error(`Failed to check lock status: ${lockKey}`, error as Error);
      return false;
    }
  }

  /**
   * Get remaining TTL for a lock
   *
   * @param key - Lock key
   * @returns Promise<number> - TTL in seconds, -2 if key doesn't exist, -1 if key exists but no expiry
   */
  async getLockTTL(key: string): Promise<number> {
    const lockKey = this.lockPrefix + key;

    try {
      const ttl = await this.redis.ttl(lockKey);
      return ttl;
    } catch (error) {
      this.logger.error(`Failed to get lock TTL: ${lockKey}`, error as Error);
      return -2;
    }
  }

  /**
   * Generate a unique lock value for this instance
   * Combines instance ID and timestamp for uniqueness
   *
   * @returns string - Unique lock value
   */
  private generateLockValue(): string {
    const instanceId = process.env.INSTANCE_ID || `instance-${process.pid}`;
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${instanceId}:${timestamp}:${random}`;
  }

  /**
   * Force release a lock (use with caution - bypasses ownership check)
   * Only use in emergency situations or cleanup scenarios
   *
   * @param key - Lock key
   */
  async forceReleaseLock(key: string): Promise<void> {
    const lockKey = this.lockPrefix + key;

    try {
      await this.redis.del(lockKey);
      this.logger.warn(`Force released lock: ${lockKey}`);
    } catch (error) {
      this.logger.error(`Failed to force release lock: ${lockKey}`, error as Error);
    }
  }
}
