import { Logger } from '../utils/logger';
import { CacheError, CacheErrorCode } from '../storage/errors';

/**
 * Cache eviction policies
 */
export enum EvictionPolicy {
  LRU = 'LRU', // Least Recently Used
  LFU = 'LFU', // Least Frequently Used
  FIFO = 'FIFO', // First In First Out
  CUSTOM = 'CUSTOM', // Custom policy
}

/**
 * Cache entry metadata for policy tracking
 */
export interface PolicyEntry<T = any> {
  key: string;
  value: T;
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
  accessOrder: number;
  insertOrder: number;
  priority?: number;
}

/**
 * LRU (Least Recently Used) policy
 * Evicts the least recently used items first
 */
export class LRUPolicy<T = any> {
  private cache: Map<string, PolicyEntry<T>>;
  private accessOrder: string[];
  private maxSize: number;
  private logger: Logger;
  private currentOrder: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.accessOrder = [];
    this.maxSize = maxSize;
    this.logger = new Logger('LRUPolicy');
    this.currentOrder = 0;
  }

  /**
   * Get value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Update access order
    entry.lastAccessed = new Date();
    entry.accessCount++;
    this.updateAccessOrder(key);

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, priority?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evict();
    }

    const entry: PolicyEntry<T> = {
      key,
      value,
      createdAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 0,
      accessOrder: this.currentOrder++,
      insertOrder: this.currentOrder++,
      priority,
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
  }

  /**
   * Delete key from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    return deleted;
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.currentOrder = 0;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values
   */
  values(): T[] {
    return Array.from(this.cache.values()).map(entry => entry.value);
  }

  /**
   * Get cache entries
   */
  entries(): Array<[string, T]> {
    return Array.from(this.cache.entries()).map(([key, entry]) => [key, entry.value]);
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    // Remove from current position and add to end
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
  }

  /**
   * Evict least recently used item
   */
  private evict(): void {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder.shift()!;
    const evicted = this.cache.delete(lruKey);
    this.logger.debug(`Evicted LRU key: ${lruKey}`);
    return evicted;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    accessCount: number;
  } {
    let totalAccessCount = 0;
    for (const entry of this.cache.values()) {
      totalAccessCount += entry.accessCount;
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.cache.size > 0 ? totalAccessCount / this.cache.size : 0,
      accessCount: totalAccessCount,
    };
  }
}

/**
 * LFU (Least Frequently Used) policy
 * Evicts the least frequently used items first
 */
export class LFUPolicy<T = any> {
  private cache: Map<string, PolicyEntry<T>>;
  private frequencyMap: Map<number, Set<string>>;
  private minFrequency: number;
  private maxSize: number;
  private logger: Logger;
  private currentOrder: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.frequencyMap = new Map();
    this.minFrequency = 0;
    this.maxSize = maxSize;
    this.logger = new Logger('LFUPolicy');
    this.currentOrder = 0;
  }

  /**
   * Get value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const oldFrequency = entry.accessCount;
    const newFrequency = oldFrequency + 1;

    // Update frequency map
    this.updateFrequency(key, oldFrequency, newFrequency);

    // Update entry
    entry.accessCount = newFrequency;
    entry.lastAccessed = new Date();

    // Update min frequency if needed
    if (this.frequencyMap.get(oldFrequency)?.size === 0) {
      this.minFrequency = newFrequency;
    }

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, priority?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evict();
    }

    const entry: PolicyEntry<T> = {
      key,
      value,
      createdAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 1,
      accessOrder: this.currentOrder++,
      insertOrder: this.currentOrder++,
      priority,
    };

    this.cache.set(key, entry);

    // Add to frequency map
    let freqSet = this.frequencyMap.get(1);
    if (!freqSet) {
      freqSet = new Set();
      this.frequencyMap.set(1, freqSet);
    }
    freqSet.add(key);

    this.minFrequency = 1;
  }

  /**
   * Delete key from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const frequency = entry.accessCount;
    const freqSet = this.frequencyMap.get(frequency);
    if (freqSet) {
      freqSet.delete(key);
      if (freqSet.size === 0) {
        this.frequencyMap.delete(frequency);
      }
    }

    return this.cache.delete(key);
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.frequencyMap.clear();
    this.minFrequency = 0;
    this.currentOrder = 0;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values
   */
  values(): T[] {
    return Array.from(this.cache.values()).map(entry => entry.value);
  }

  /**
   * Get cache entries
   */
  entries(): Array<[string, T]> {
    return Array.from(this.cache.entries()).map(([key, entry]) => [key, entry.value]);
  }

  /**
   * Update frequency in frequency map
   */
  private updateFrequency(key: string, oldFreq: number, newFreq: number): void {
    // Remove from old frequency set
    const oldFreqSet = this.frequencyMap.get(oldFreq);
    if (oldFreqSet) {
      oldFreqSet.delete(key);
      if (oldFreqSet.size === 0) {
        this.frequencyMap.delete(oldFreq);
      }
    }

    // Add to new frequency set
    let newFreqSet = this.frequencyMap.get(newFreq);
    if (!newFreqSet) {
      newFreqSet = new Set();
      this.frequencyMap.set(newFreq, newFreqSet);
    }
    newFreqSet.add(key);
  }

  /**
   * Evict least frequently used item
   */
  private evict(): void {
    const minFreqSet = this.frequencyMap.get(this.minFrequency);
    if (!minFreqSet || minFreqSet.size === 0) return;

    const lfuKey = minFreqSet.values().next().value;
    this.delete(lfuKey);
    this.logger.debug(`Evicted LFU key: ${lfuKey}`);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    minFrequency: number;
    maxFrequency: number;
    averageFrequency: number;
  } {
    let maxFrequency = 0;
    let totalFrequency = 0;

    for (const entry of this.cache.values()) {
      if (entry.accessCount > maxFrequency) {
        maxFrequency = entry.accessCount;
      }
      totalFrequency += entry.accessCount;
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      minFrequency: this.minFrequency,
      maxFrequency,
      averageFrequency: this.cache.size > 0 ? totalFrequency / this.cache.size : 0,
    };
  }
}

/**
 * FIFO (First In First Out) policy
 * Evicts the oldest items first
 */
export class FIFOPolicy<T = any> {
  private cache: Map<string, PolicyEntry<T>>;
  private insertionOrder: string[];
  private maxSize: number;
  private logger: Logger;
  private currentOrder: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.insertionOrder = [];
    this.maxSize = maxSize;
    this.logger = new Logger('FIFOPolicy');
    this.currentOrder = 0;
  }

  /**
   * Get value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    entry.lastAccessed = new Date();
    entry.accessCount++;
    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, priority?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evict();
    }

    const entry: PolicyEntry<T> = {
      key,
      value,
      createdAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 0,
      accessOrder: this.currentOrder++,
      insertOrder: this.currentOrder++,
      priority,
    };

    this.cache.set(key, entry);
    this.insertionOrder.push(key);
  }

  /**
   * Delete key from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    this.insertionOrder = this.insertionOrder.filter(k => k !== key);
    return deleted;
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.insertionOrder = [];
    this.currentOrder = 0;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values
   */
  values(): T[] {
    return Array.from(this.cache.values()).map(entry => entry.value);
  }

  /**
   * Get cache entries
   */
  entries(): Array<[string, T]> {
    return Array.from(this.cache.entries()).map(([key, entry]) => [key, entry.value]);
  }

  /**
   * Evict oldest item (FIFO)
   */
  private evict(): void {
    if (this.insertionOrder.length === 0) return;

    const fifoKey = this.insertionOrder.shift()!;
    this.cache.delete(fifoKey);
    this.logger.debug(`Evicted FIFO key: ${fifoKey}`);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  } {
    let oldestEntry: Date | null = null;
    let newestEntry: Date | null = null;

    for (const entry of this.cache.values()) {
      if (!oldestEntry || entry.createdAt < oldestEntry) {
        oldestEntry = entry.createdAt;
      }
      if (!newestEntry || entry.createdAt > newestEntry) {
        newestEntry = entry.createdAt;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      oldestEntry,
      newestEntry,
    };
  }
}

/**
 * Custom policy interface
 */
export interface CustomPolicy<T = any> {
  get(key: string): T | null;
  set(key: string, value: T, priority?: number): void;
  delete(key: string): boolean;
  has(key: string): boolean;
  size(): number;
  clear(): void;
  keys(): string[];
  values(): T[];
  entries(): Array<[string, T]>;
  shouldEvict(key: string): boolean;
  evict(): string | null;
}

/**
 * Cache policy manager
 * Manages different eviction policies and allows switching between them
 */
export class CachePolicyManager<T = any> {
  private currentPolicy: EvictionPolicy;
  private policies: Map<EvictionPolicy, LRUPolicy<T> | LFUPolicy<T> | FIFOPolicy<T> | CustomPolicy<T>>;
  private customPolicies: Map<string, CustomPolicy<T>>;
  private maxSize: number;
  private logger: Logger;

  constructor(maxSize: number, defaultPolicy: EvictionPolicy = EvictionPolicy.LRU) {
    this.maxSize = maxSize;
    this.currentPolicy = defaultPolicy;
    this.policies = new Map();
    this.customPolicies = new Map();
    this.logger = new Logger('CachePolicyManager');

    // Initialize default policies
    this.policies.set(EvictionPolicy.LRU, new LRUPolicy<T>(maxSize));
    this.policies.set(EvictionPolicy.LFU, new LFUPolicy<T>(maxSize));
    this.policies.set(EvictionPolicy.FIFO, new FIFOPolicy<T>(maxSize));
  }

  /**
   * Get value from cache using current policy
   */
  get(key: string): T | null {
    const policy = this.policies.get(this.currentPolicy);
    if (!policy) {
      throw new CacheError(
        CacheErrorCode.GET_FAILED,
        `Policy ${this.currentPolicy} not found`,
        { policy: this.currentPolicy }
      );
    }
    return policy.get(key);
  }

  /**
   * Set value in cache using current policy
   */
  set(key: string, value: T, priority?: number): void {
    const policy = this.policies.get(this.currentPolicy);
    if (!policy) {
      throw new CacheError(
        CacheErrorCode.SET_FAILED,
        `Policy ${this.currentPolicy} not found`,
        { policy: this.currentPolicy }
      );
    }
    policy.set(key, value, priority);
  }

  /**
   * Delete key from cache
   */
  delete(key: string): boolean {
    const policy = this.policies.get(this.currentPolicy);
    if (!policy) return false;
    return policy.delete(key);
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    const policy = this.policies.get(this.currentPolicy);
    if (!policy) return false;
    return policy.has(key);
  }

  /**
   * Get cache size
   */
  size(): number {
    const policy = this.policies.get(this.currentPolicy);
    if (!policy) return 0;
    return policy.size();
  }

  /**
   * Clear cache
   */
  clear(): void {
    for (const policy of this.policies.values()) {
      policy.clear();
    }
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    const policy = this.policies.get(this.currentPolicy);
    if (!policy) return [];
    return policy.keys();
  }

  /**
   * Get all values
   */
  values(): T[] {
    const policy = this.policies.get(this.currentPolicy);
    if (!policy) return [];
    return policy.values();
  }

  /**
   * Get cache entries
   */
  entries(): Array<[string, T]> {
    const policy = this.policies.get(this.currentPolicy);
    if (!policy) return [];
    return policy.entries();
  }

  /**
   * Switch to a different eviction policy
   */
  switchPolicy(policy: EvictionPolicy | string): void {
    const newPolicy = policy as EvictionPolicy;

    // Check if policy exists
    if (!this.policies.has(newPolicy) && !this.customPolicies.has(policy)) {
      throw new CacheError(
        CacheErrorCode.SET_FAILED,
        `Policy ${policy} not found`,
        { policy }
      );
    }

    // Transfer data from old policy to new policy
    const oldPolicy = this.policies.get(this.currentPolicy);
    const newPolicyInstance = this.policies.get(newPolicy) || this.customPolicies.get(policy);

    if (oldPolicy && newPolicyInstance) {
      const entries = oldPolicy.entries();
      newPolicyInstance.clear();

      for (const [key, value] of entries) {
        newPolicyInstance.set(key, value);
      }
    }

    this.currentPolicy = newPolicy;
    this.logger.info(`Switched to policy: ${policy}`);
  }

  /**
   * Register a custom policy
   */
  registerCustomPolicy(name: string, policy: CustomPolicy<T>): void {
    this.customPolicies.set(name, policy);
    this.logger.info(`Registered custom policy: ${name}`);
  }

  /**
   * Unregister a custom policy
   */
  unregisterCustomPolicy(name: string): boolean {
    const deleted = this.customPolicies.delete(name);
    if (deleted) {
      this.logger.info(`Unregistered custom policy: ${name}`);
    }
    return deleted;
  }

  /**
   * Get current policy
   */
  getCurrentPolicy(): EvictionPolicy | string {
    return this.currentPolicy;
  }

  /**
   * Get policy statistics
   */
  getPolicyStats(): any {
    const policy = this.policies.get(this.currentPolicy);
    if (!policy) return null;
    return policy.getStats();
  }

  /**
   * Get all available policies
   */
  getAvailablePolicies(): string[] {
    return [
      ...Array.from(this.policies.keys()),
      ...Array.from(this.customPolicies.keys()),
    ];
  }

  /**
   * Resize cache
   */
  resize(newSize: number): void {
    this.maxSize = newSize;

    // Resize all policies
    for (const policy of this.policies.values()) {
      // Clear and recreate with new size
      const entries = policy.entries();
      policy.clear();
      for (const [key, value] of entries) {
        policy.set(key, value);
      }
    }

    this.logger.info(`Resized cache to ${newSize}`);
  }

  /**
   * Get max size
   */
  getMaxSize(): number {
    return this.maxSize;
  }
}

/**
 * Priority-based cache policy
 * Evicts based on priority first, then uses specified fallback policy
 */
export class PriorityCachePolicy<T = any> {
  private cache: Map<string, PolicyEntry<T>>;
  private priorities: Map<number, Set<string>>;
  private fallbackPolicy: EvictionPolicy;
  private maxSize: number;
  private logger: Logger;
  private currentOrder: number;

  constructor(maxSize: number, fallbackPolicy: EvictionPolicy = EvictionPolicy.LRU) {
    this.cache = new Map();
    this.priorities = new Map();
    this.fallbackPolicy = fallbackPolicy;
    this.maxSize = maxSize;
    this.logger = new Logger('PriorityCachePolicy');
    this.currentOrder = 0;
  }

  /**
   * Get value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    entry.lastAccessed = new Date();
    entry.accessCount++;
    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, priority: number = 0): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evict();
    }

    const entry: PolicyEntry<T> = {
      key,
      value,
      createdAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 0,
      accessOrder: this.currentOrder++,
      insertOrder: this.currentOrder++,
      priority,
    };

    this.cache.set(key, entry);

    // Add to priority map
    let prioritySet = this.priorities.get(priority);
    if (!prioritySet) {
      prioritySet = new Set();
      this.priorities.set(priority, prioritySet);
    }
    prioritySet.add(key);
  }

  /**
   * Delete key from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const priority = entry.priority || 0;
    const prioritySet = this.priorities.get(priority);
    if (prioritySet) {
      prioritySet.delete(key);
      if (prioritySet.size === 0) {
        this.priorities.delete(priority);
      }
    }

    return this.cache.delete(key);
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.priorities.clear();
    this.currentOrder = 0;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values
   */
  values(): T[] {
    return Array.from(this.cache.values()).map(entry => entry.value);
  }

  /**
   * Get cache entries
   */
  entries(): Array<[string, T]> {
    return Array.from(this.cache.entries()).map(([key, entry]) => [key, entry.value]);
  }

  /**
   * Evict based on priority
   */
  private evict(): void {
    // Find lowest priority
    let lowestPriority = Infinity;
    for (const priority of this.priorities.keys()) {
      if (priority < lowestPriority) {
        lowestPriority = priority;
      }
    }

    if (lowestPriority === Infinity) return;

    // Get keys with lowest priority
    const prioritySet = this.priorities.get(lowestPriority);
    if (!prioritySet || prioritySet.size === 0) return;

    // Use fallback policy to select which key to evict
    const keys = Array.from(prioritySet);
    let keyToEvict: string | null = null;

    switch (this.fallbackPolicy) {
      case EvictionPolicy.LRU:
        // Find least recently used
        let oldestAccess: Date | null = null;
        for (const key of keys) {
          const entry = this.cache.get(key);
          if (entry && (!oldestAccess || entry.lastAccessed < oldestAccess)) {
            oldestAccess = entry.lastAccessed;
            keyToEvict = key;
          }
        }
        break;

      case EvictionPolicy.LFU:
        // Find least frequently used
        let minAccessCount = Infinity;
        for (const key of keys) {
          const entry = this.cache.get(key);
          if (entry && entry.accessCount < minAccessCount) {
            minAccessCount = entry.accessCount;
            keyToEvict = key;
          }
        }
        break;

      case EvictionPolicy.FIFO:
        // Find oldest inserted
        let oldestInsert: Date | null = null;
        for (const key of keys) {
          const entry = this.cache.get(key);
          if (entry && (!oldestInsert || entry.createdAt < oldestInsert)) {
            oldestInsert = entry.createdAt;
            keyToEvict = key;
          }
        }
        break;
    }

    if (keyToEvict) {
      this.delete(keyToEvict);
      this.logger.debug(`Evicted priority key: ${keyToEvict} (priority: ${lowestPriority})`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    priorityDistribution: Record<number, number>;
  } {
    const priorityDistribution: Record<number, number> = {};

    for (const [priority, keys] of this.priorities.entries()) {
      priorityDistribution[priority] = keys.size;
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      priorityDistribution,
    };
  }
}
