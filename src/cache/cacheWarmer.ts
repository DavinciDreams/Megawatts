import { MultiLevelCache, CacheLayer } from './multiLevelCache';
import { CacheManager } from '../storage/cache/cacheManager';
import { CacheError, CacheErrorCode } from '../storage/errors';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';

/**
 * Warm-up entry
 */
export interface WarmUpEntry<T = any> {
  key: string;
  value: T;
  fetchFn?: () => Promise<T>;
  priority: number;
  tags?: string[];
  ttl?: number;
  layer?: CacheLayer[];
  retries: number;
  lastAttempt?: Date;
  lastSuccess?: Date;
}

/**
 * Warm-up queue item
 */
interface QueueItem {
  entry: WarmUpEntry;
  scheduledAt: Date;
  priority: number;
}

/**
 * Warm-up strategy
 */
export enum WarmUpStrategy {
  ON_STARTUP = 'ON_STARTUP', // Warm up on application startup
  SCHEDULED = 'SCHEDULED', // Warm up on schedule
  PREDICTIVE = 'PREDICTIVE', // Warm up based on access patterns
  MANUAL = 'MANUAL', // Manual warm-up trigger
}

/**
 * Warm-up configuration
 */
export interface WarmUpConfig {
  strategy: WarmUpStrategy;
  batchSize: number;
  delayBetweenBatches: number;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  parallelism: number;
  enablePredictiveWarming: boolean;
  predictiveThreshold: number; // 0-1, probability threshold
  accessPatternWindow: number; // milliseconds to track patterns
  maxPredictiveKeys: number;
}

/**
 * Warm-up schedule
 */
export interface WarmUpSchedule {
  id: string;
  name: string;
  cronExpression: string;
  entries: WarmUpEntry[];
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

/**
 * Access pattern for predictive warming
 */
interface AccessPattern {
  key: string;
  accessTimes: number[];
  frequency: number;
  lastAccessed: Date;
  predictedNextAccess?: Date;
}

/**
 * Warm-up statistics
 */
export interface WarmUpStats {
  totalEntries: number;
  successfulWarmUps: number;
  failedWarmUps: number;
  pendingWarmUps: number;
  averageWarmUpTime: number;
  lastWarmUpTime: Date;
  predictiveAccuracy: number;
}

/**
 * Cache warmer for pre-populating cache with frequently accessed data
 * Supports startup warming, scheduled warming, and predictive warming
 */
export class CacheWarmer extends EventEmitter {
  private cache: MultiLevelCache | CacheManager;
  private logger: Logger;
  private config: WarmUpConfig;
  private warmUpQueue: QueueItem[];
  private isWarming: boolean;
  private warmUpHistory: Map<string, WarmUpEntry[]>;
  private schedules: Map<string, WarmUpSchedule>;
  private scheduleTimers: Map<string, NodeJS.Timeout>;
  private accessPatterns: Map<string, AccessPattern>;
  private stats: WarmUpStats;
  private warmUpPromises: Map<string, Promise<void>>;

  constructor(
    cache: MultiLevelCache | CacheManager,
    config: Partial<WarmUpConfig> = {}
  ) {
    super();
    this.cache = cache;
    this.logger = new Logger('CacheWarmer');
    this.warmUpQueue = [];
    this.isWarming = false;
    this.warmUpHistory = new Map();
    this.schedules = new Map();
    this.scheduleTimers = new Map();
    this.accessPatterns = new Map();
    this.warmUpPromises = new Map();
    this.config = {
      strategy: config.strategy || WarmUpStrategy.ON_STARTUP,
      batchSize: config.batchSize || 10,
      delayBetweenBatches: config.delayBetweenBatches || 100,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      timeout: config.timeout || 30000,
      parallelism: config.parallelism || 5,
      enablePredictiveWarming: config.enablePredictiveWarming ?? true,
      predictiveThreshold: config.predictiveThreshold || 0.7,
      accessPatternWindow: config.accessPatternWindow || 3600000, // 1 hour
      maxPredictiveKeys: config.maxPredictiveKeys || 20,
    };
    this.stats = this.initializeStats();

    if (this.config.enablePredictiveWarming) {
      this.startPredictiveWarming();
    }
  }

  /**
   * Warm up cache with entries
   * @param entries - Entries to warm up
   * @param strategy - Warm-up strategy
   */
  async warmUp<T = any>(
    entries: WarmUpEntry<T>[],
    strategy: WarmUpStrategy = WarmUpStrategy.MANUAL
  ): Promise<void> {
    if (this.isWarming) {
      this.logger.warn('Cache warming already in progress');
      return;
    }

    this.isWarming = true;
    this.logger.info(`Starting cache warm-up with ${entries.length} entries using ${strategy} strategy`);

    const startTime = Date.now();

    try {
      // Sort entries by priority
      const sortedEntries = [...entries].sort((a, b) => b.priority - a.priority);

      // Process in batches
      for (let i = 0; i < sortedEntries.length; i += this.config.batchSize) {
        const batch = sortedEntries.slice(i, i + this.config.batchSize);
        await this.processBatch(batch);

        if (i + this.config.batchSize < sortedEntries.length) {
          await new Promise(resolve => setTimeout(resolve, this.config.delayBetweenBatches));
        }
      }

      const duration = Date.now() - startTime;
      this.stats.lastWarmUpTime = new Date();
      this.stats.averageWarmUpTime = (this.stats.averageWarmUpTime * this.stats.successfulWarmUps + duration) / (this.stats.successfulWarmUps + 1);

      this.logger.info(`Cache warm-up completed in ${duration}ms`);
      this.emit('warm-up-complete', { entries: sortedEntries.length, duration, strategy });
    } catch (error) {
      this.logger.error('Cache warm-up failed:', error);
      this.emit('warm-up-error', error);
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Warm up on startup
   * @param entries - Entries to warm up on startup
   */
  async warmUpOnStartup<T = any>(entries: WarmUpEntry<T>[]): Promise<void> {
    this.logger.info('Starting startup cache warm-up');
    await this.warmUp(entries, WarmUpStrategy.ON_STARTUP);
  }

  /**
   * Add entry to warm-up queue
   * @param entry - Entry to warm up
   */
  queueWarmUp<T = any>(entry: WarmUpEntry<T>): void {
    const queueItem: QueueItem = {
      entry,
      scheduledAt: new Date(),
      priority: entry.priority,
    };

    // Insert in priority order
    let insertIndex = 0;
    for (let i = 0; i < this.warmUpQueue.length; i++) {
      if (queueItem.priority > this.warmUpQueue[i].priority) {
        insertIndex = i;
        break;
      }
      insertIndex = i + 1;
    }

    this.warmUpQueue.splice(insertIndex, 0, queueItem);
    this.stats.pendingWarmUps++;

    this.logger.debug(`Queued warm-up for key: ${entry.key}`);
    this.emit('warm-up-queued', entry);
  }

  /**
   * Process warm-up queue
   */
  async processQueue(): Promise<void> {
    if (this.isWarming || this.warmUpQueue.length === 0) {
      return;
    }

    const entries = this.warmUpQueue.map(item => item.entry);
    this.warmUpQueue = [];
    this.stats.pendingWarmUps = 0;

    await this.warmUp(entries, WarmUpStrategy.MANUAL);
  }

  /**
   * Schedule warm-up
   * @param schedule - Warm-up schedule
   */
  scheduleWarmUp(schedule: WarmUpSchedule): void {
    const scheduleId = schedule.id;

    // Clear existing schedule
    this.clearSchedule(scheduleId);

    // Store schedule
    this.schedules.set(scheduleId, schedule);

    // Calculate next run time (simplified - in production use cron library)
    const nextRun = this.calculateNextRun(schedule.cronExpression);
    schedule.nextRun = nextRun;

    // Set timer
    const delay = nextRun.getTime() - Date.now();
    const timer = setTimeout(async () => {
      if (schedule.enabled) {
        await this.warmUp(schedule.entries, WarmUpStrategy.SCHEDULED);
        schedule.lastRun = new Date();

        // Reschedule
        this.scheduleWarmUp(schedule);
      }
    }, delay);

    this.scheduleTimers.set(scheduleId, timer);

    this.logger.info(`Scheduled warm-up: ${schedule.name} at ${nextRun.toISOString()}`);
  }

  /**
   * Clear a warm-up schedule
   * @param scheduleId - Schedule ID to clear
   */
  clearSchedule(scheduleId: string): void {
    const timer = this.scheduleTimers.get(scheduleId);
    if (timer) {
      clearTimeout(timer);
      this.scheduleTimers.delete(scheduleId);
    }
    this.schedules.delete(scheduleId);
  }

  /**
   * Get all schedules
   */
  getSchedules(): WarmUpSchedule[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Get schedule by ID
   * @param scheduleId - Schedule ID
   */
  getSchedule(scheduleId: string): WarmUpSchedule | undefined {
    return this.schedules.get(scheduleId);
  }

  /**
   * Enable predictive warming
   */
  enablePredictiveWarming(): void {
    this.config.enablePredictiveWarming = true;
    this.startPredictiveWarming();
    this.logger.info('Predictive warming enabled');
  }

  /**
   * Disable predictive warming
   */
  disablePredictiveWarming(): void {
    this.config.enablePredictiveWarming = false;
    this.logger.info('Predictive warming disabled');
  }

  /**
   * Track access pattern for predictive warming
   * @param key - Cache key
   */
  trackAccess(key: string): void {
    if (!this.config.enablePredictiveWarming) return;

    const now = Date.now();
    const pattern = this.accessPatterns.get(key) || {
      key,
      accessTimes: [],
      frequency: 0,
      lastAccessed: new Date(),
    };

    // Add access time
    pattern.accessTimes.push(now);
    pattern.lastAccessed = new Date();
    pattern.frequency++;

    // Keep only recent access times
    const cutoff = now - this.config.accessPatternWindow;
    pattern.accessTimes = pattern.accessTimes.filter(time => time > cutoff);

    // Calculate predicted next access
    if (pattern.accessTimes.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < pattern.accessTimes.length; i++) {
        intervals.push(pattern.accessTimes[i] - pattern.accessTimes[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      pattern.predictedNextAccess = new Date(now + avgInterval);
    }

    this.accessPatterns.set(key, pattern);
  }

  /**
   * Get warm-up statistics
   */
  getStats(): WarmUpStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = this.initializeStats();
    this.logger.info('Warm-up statistics reset');
  }

  /**
   * Get warm-up history
   * @param limit - Maximum number of entries to return
   */
  getHistory(limit?: number): Map<string, WarmUpEntry[]> {
    const history = new Map<string, WarmUpEntry[]>();

    for (const [key, entries] of this.warmUpHistory.entries()) {
      history.set(key, entries.slice(-limit || entries.length));
    }

    return history;
  }

  /**
   * Clear warm-up history
   */
  clearHistory(): void {
    this.warmUpHistory.clear();
    this.logger.info('Warm-up history cleared');
  }

  /**
   * Stop all warm-up operations
   */
  async stop(): Promise<void> {
    // Wait for current warm-up to complete
    await Promise.all(this.warmUpPromises.values());

    // Clear all schedules
    for (const timer of this.scheduleTimers.values()) {
      clearTimeout(timer);
    }
    this.scheduleTimers.clear();

    this.logger.info('Cache warmer stopped');
  }

  /**
   * Process a batch of warm-up entries
   */
  private async processBatch<T = any>(batch: WarmUpEntry<T>[]): Promise<void> {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < batch.length; i += this.config.parallelism) {
      const chunk = batch.slice(i, i + this.config.parallelism);
      promises.push(...chunk.map(entry => this.warmUpEntry(entry)));
    }

    await Promise.all(promises);
  }

  /**
   * Warm up a single entry
   */
  private async warmUpEntry<T = any>(entry: WarmUpEntry<T>): Promise<void> {
    const promiseId = `${entry.key}-${Date.now()}`;

    const promise = (async () => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
        try {
          // Use timeout
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Warm-up timeout')), this.config.timeout);
          });

          // Get value
          const valuePromise = entry.fetchFn
            ? entry.fetchFn()
            : Promise.resolve(entry.value);

          const value = await Promise.race([valuePromise, timeoutPromise]);

          // Set in cache
          if (this.cache instanceof MultiLevelCache) {
            await this.cache.set(entry.key, value, {
              ttl: entry.ttl,
              tags: entry.tags,
              layers: entry.layer,
            });
          } else {
            await this.cache.set(entry.key, value, {
              ttl: entry.ttl,
            });
          }

          // Update stats
          this.stats.successfulWarmUps++;
          entry.lastSuccess = new Date();
          entry.retries = 0;

          // Record in history
          this.recordHistory(entry);

          this.logger.debug(`Warmed up key: ${entry.key}`);
          this.emit('warm-up-success', entry);
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          entry.retries = attempt + 1;
          entry.lastAttempt = new Date();

          if (attempt < this.config.maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * (attempt + 1)));
          }
        }
      }

      // All retries failed
      this.stats.failedWarmUps++;
      this.logger.error(`Failed to warm up key: ${entry.key} after ${this.config.maxRetries} retries`, lastError);
      this.emit('warm-up-failure', { entry, error: lastError });
    })();

    this.warmUpPromises.set(promiseId, promise);

    try {
      await promise;
    } finally {
      this.warmUpPromises.delete(promiseId);
    }
  }

  /**
   * Record warm-up in history
   */
  private recordHistory<T = any>(entry: WarmUpEntry<T>): void {
    const history = this.warmUpHistory.get(entry.key) || [];
    history.push({ ...entry });

    // Keep only recent history
    if (history.length > 100) {
      history.shift();
    }

    this.warmUpHistory.set(entry.key, history);
  }

  /**
   * Start predictive warming
   */
  private startPredictiveWarming(): void {
    // Analyze access patterns periodically
    setInterval(() => {
      this.analyzeAccessPatterns();
    }, this.config.accessPatternWindow / 2); // Analyze twice per window

    this.logger.info('Predictive warming started');
  }

  /**
   * Analyze access patterns and predict keys to warm up
   */
  private analyzeAccessPatterns(): void {
    if (!this.config.enablePredictiveWarming) return;

    const now = Date.now();
    const predictions: Array<{ key: string; score: number }> = [];

    for (const [key, pattern] of this.accessPatterns.entries()) {
      if (!pattern.predictedNextAccess) continue;

      // Calculate probability of access in near future
      const timeToPrediction = pattern.predictedNextAccess.getTime() - now;
      const avgInterval = this.calculateAverageInterval(pattern.accessTimes);

      if (avgInterval === 0) continue;

      const probability = Math.max(0, 1 - timeToPrediction / avgInterval);

      if (probability >= this.config.predictiveThreshold) {
        predictions.push({ key, score: probability });
      }
    }

    // Sort by probability and warm up top keys
    predictions.sort((a, b) => b.score - a.score);
    const keysToWarm = predictions.slice(0, this.config.maxPredictiveKeys);

    if (keysToWarm.length > 0) {
      this.logger.info(`Predictive warming: ${keysToWarm.length} keys`);
      this.emit('predictive-warm-up', keysToWarm);

      // Queue warm-up for predicted keys
      for (const { key } of keysToWarm) {
        this.queueWarmUp({
          key,
          value: null as any, // Will be fetched by fetchFn
          priority: Math.floor(this.config.predictiveThreshold * 100),
        });
      }
    }
  }

  /**
   * Calculate average interval between accesses
   */
  private calculateAverageInterval(accessTimes: number[]): number {
    if (accessTimes.length < 2) return 0;

    const intervals: number[] = [];
    for (let i = 1; i < accessTimes.length; i++) {
      intervals.push(accessTimes[i] - accessTimes[i - 1]);
    }

    return intervals.reduce((a, b) => a + b, 0) / intervals.length;
  }

  /**
   * Calculate next run time for schedule (simplified)
   * In production, use a cron library like 'node-cron'
   */
  private calculateNextRun(cronExpression: string): Date {
    // Simplified implementation - parse basic cron expressions
    // Format: "*/5 * * * *" (every 5 minutes)
    const parts = cronExpression.split(' ');
    if (parts.length !== 5) {
      return new Date(Date.now() + 3600000); // Default to 1 hour
    }

    const minute = parts[0];
    const now = new Date();
    const nextRun = new Date(now);

    if (minute.startsWith('*/')) {
      const interval = parseInt(minute.slice(2));
      nextRun.setMinutes(now.getMinutes() + (interval - (now.getMinutes() % interval)));
    } else {
      const targetMinute = parseInt(minute);
      if (now.getMinutes() >= targetMinute) {
        nextRun.setHours(now.getHours() + 1);
      }
      nextRun.setMinutes(targetMinute);
    }

    nextRun.setSeconds(0);
    nextRun.setMilliseconds(0);

    return nextRun;
  }

  /**
   * Initialize statistics
   */
  private initializeStats(): WarmUpStats {
    return {
      totalEntries: 0,
      successfulWarmUps: 0,
      failedWarmUps: 0,
      pendingWarmUps: 0,
      averageWarmUpTime: 0,
      lastWarmUpTime: new Date(),
      predictiveAccuracy: 0,
    };
  }
}

/**
 * Warm-up entry builder
 */
export class WarmUpEntryBuilder<T = any> {
  private entry: Partial<WarmUpEntry<T>>;

  constructor(key: string) {
    this.entry = {
      key,
      priority: 0,
      retries: 0,
    };
  }

  withValue(value: T): this {
    this.entry.value = value;
    return this;
  }

  withFetchFn(fetchFn: () => Promise<T>): this {
    this.entry.fetchFn = fetchFn;
    return this;
  }

  withPriority(priority: number): this {
    this.entry.priority = priority;
    return this;
  }

  withTags(tags: string[]): this {
    this.entry.tags = tags;
    return this;
  }

  withTTL(ttl: number): this {
    this.entry.ttl = ttl;
    return this;
  }

  withLayer(layer: CacheLayer[]): this {
    this.entry.layer = layer;
    return this;
  }

  build(): WarmUpEntry<T> {
    if (!this.entry.value && !this.entry.fetchFn) {
      throw new Error('WarmUpEntry must have either value or fetchFn');
    }
    return this.entry as WarmUpEntry<T>;
  }
}
