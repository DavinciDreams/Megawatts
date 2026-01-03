/**
 * Graceful Degradation Module
 *
 * Implements graceful degradation strategies for handling system overload:
 * - Feature flag management
 * - Service level adjustment
 * - Request throttling
 * - Queue management
 * - Resource reallocation
 */

import { Logger } from '../utils/logger';
import { BotError } from '../utils/errors';
import { HealthStatus } from '../core/health/types';

/**
 * Service level
 */
export enum ServiceLevel {
  FULL = 'full',
  REDUCED = 'reduced',
  MINIMAL = 'minimal',
  EMERGENCY = 'emergency'
}

/**
 * Feature flag state
 */
export enum FeatureFlagState {
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  DEGRADED = 'degraded'
}

/**
 * Feature flag configuration
 */
export interface FeatureFlag {
  name: string;
  state: FeatureFlagState;
  reason?: string;
  timestamp: Date;
  priority: number;
}

/**
 * Throttle configuration
 */
export interface ThrottleConfig {
  enabled: boolean;
  maxRequestsPerSecond: number;
  maxConcurrentRequests: number;
  burstAllowance: number;
  queueTimeout: number;
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  enabled: boolean;
  maxSize: number;
  priorityLevels: number;
  processingTimeout: number;
  retryPolicy: 'drop' | 'retry' | 'queue';
}

/**
 * Resource allocation
 */
export interface ResourceAllocation {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  timestamp: Date;
}

/**
 * Degradation state
 */
export interface DegradationState {
  currentLevel: ServiceLevel;
  activeFeatures: Map<string, FeatureFlagState>;
  throttleConfig: ThrottleConfig;
  queueConfig: QueueConfig;
  resourceAllocation: ResourceAllocation;
  timestamp: Date;
}

/**
 * Graceful degradation configuration
 */
export interface GracefulDegradationConfig {
  enabled: boolean;
  autoDegradationEnabled: boolean;
  degradationThreshold: {
    cpuUsage: number;
    memoryUsage: number;
    errorRate: number;
  };
  recoveryThreshold: {
    cpuUsage: number;
    memoryUsage: number;
    errorRate: number;
  };
  featureFlags: Map<string, FeatureFlagState>;
  throttleConfig: ThrottleConfig;
  queueConfig: QueueConfig;
}

/**
 * Default configuration
 */
const defaultConfig: GracefulDegradationConfig = {
  enabled: true,
  autoDegradationEnabled: true,
  degradationThreshold: {
    cpuUsage: 80,
    memoryUsage: 85,
    errorRate: 0.1
  },
  recoveryThreshold: {
    cpuUsage: 60,
    memoryUsage: 70,
    errorRate: 0.05
  },
  featureFlags: new Map(),
  throttleConfig: {
    enabled: true,
    maxRequestsPerSecond: 100,
    maxConcurrentRequests: 50,
    burstAllowance: 10,
    queueTimeout: 30000
  },
  queueConfig: {
    enabled: true,
    maxSize: 1000,
    priorityLevels: 3,
    processingTimeout: 60000,
    retryPolicy: 'queue'
  }
};

/**
 * Graceful Degradation Manager
 *
 * Manages graceful degradation of system services
 */
export class GracefulDegradationManager {
  private logger: Logger;
  private config: GracefulDegradationConfig;

  // State
  private currentState: DegradationState;
  private featureFlags: Map<string, FeatureFlag> = new Map();
  private throttleQueue: Array<{ timestamp: number; priority: number }> = [];
  private requestQueue: Array<{ id: string; timestamp: number; priority: number }> = [];
  private activeRequests: number = 0;

  // Resource tracking
  private currentResourceAllocation: ResourceAllocation = {
    cpu: 100,
    memory: 100,
    disk: 100,
    network: 100,
    timestamp: new Date()
  };

  // Event listeners
  private eventListeners: Map<string, Set<Function>> = new Map();

  constructor(config: Partial<GracefulDegradationConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.logger = new Logger('GracefulDegradation');

    // Initialize feature flags from config
    this.config.featureFlags.forEach((state, name) => {
      this.featureFlags.set(name, {
        name,
        state,
        timestamp: new Date(),
        priority: 0
      });
    });

    // Initialize state
    this.currentState = {
      currentLevel: ServiceLevel.FULL,
      activeFeatures: new Map(this.config.featureFlags),
      throttleConfig: { ...this.config.throttleConfig },
      queueConfig: { ...this.config.queueConfig },
      resourceAllocation: { ...this.currentResourceAllocation },
      timestamp: new Date()
    };

    this.logger.info('Graceful degradation manager initialized', {
      config: this.config
    });
  }

  /**
   * Manage feature flags
   */
  async setFeatureFlag(
    name: string,
    state: FeatureFlagState,
    reason?: string
  ): Promise<void> {
    this.logger.info(`Setting feature flag: ${name} to ${state}`, { reason });

    const flag: FeatureFlag = {
      name,
      state,
      reason,
      timestamp: new Date(),
      priority: this.getFeaturePriority(name)
    };

    this.featureFlags.set(name, flag);
    this.currentState.activeFeatures.set(name, state);

    // Emit event
    await this.emitEvent('featureFlagChanged', {
      name,
      state,
      reason
    });

    // Check if degradation level needs adjustment
    await this.evaluateDegradationLevel();
  }

  /**
   * Get feature flag state
   */
  getFeatureFlag(name: string): FeatureFlag | undefined {
    return this.featureFlags.get(name);
  }

  /**
   * Get all feature flags
   */
  getAllFeatureFlags(): Map<string, FeatureFlag> {
    return new Map(this.featureFlags);
  }

  /**
   * Adjust service level
   */
  async setServiceLevel(level: ServiceLevel, reason?: string): Promise<void> {
    this.logger.info(`Setting service level to: ${level}`, { reason });

    this.currentState.currentLevel = level;

    // Apply level-specific changes
    await this.applyServiceLevel(level);

    // Emit event
    await this.emitEvent('serviceLevelChanged', {
      level,
      reason
    });
  }

  /**
   * Get current service level
   */
  getServiceLevel(): ServiceLevel {
    return this.currentState.currentLevel;
  }

  /**
   * Get current degradation state
   */
  getDegradationState(): DegradationState {
    return { ...this.currentState };
  }

  /**
   * Apply service level
   */
  private async applyServiceLevel(level: ServiceLevel): Promise<void> {
    switch (level) {
      case ServiceLevel.FULL:
        // Enable all features
        await this.enableAllFeatures();
        this.currentState.throttleConfig.enabled = false;
        this.currentState.queueConfig.enabled = false;
        this.currentResourceAllocation = {
          cpu: 100,
          memory: 100,
          disk: 100,
          network: 100,
          timestamp: new Date()
        };
        break;

      case ServiceLevel.REDUCED:
        // Disable non-essential features
        await this.disableNonEssentialFeatures();
        this.currentState.throttleConfig.enabled = true;
        this.currentState.queueConfig.enabled = true;
        this.currentResourceAllocation = {
          cpu: 75,
          memory: 75,
          disk: 75,
          network: 75,
          timestamp: new Date()
        };
        break;

      case ServiceLevel.MINIMAL:
        // Enable only essential features
        await this.enableEssentialFeaturesOnly();
        this.currentState.throttleConfig.enabled = true;
        this.currentState.queueConfig.enabled = true;
        this.currentResourceAllocation = {
          cpu: 50,
          memory: 50,
          disk: 50,
          network: 50,
          timestamp: new Date()
        };
        break;

      case ServiceLevel.EMERGENCY:
        // Enable emergency features only
        await this.enableEmergencyFeaturesOnly();
        this.currentState.throttleConfig.enabled = true;
        this.currentState.queueConfig.enabled = true;
        this.currentResourceAllocation = {
          cpu: 25,
          memory: 25,
          disk: 25,
          network: 25,
          timestamp: new Date()
        };
        break;
    }

    this.currentState.timestamp = new Date();
  }

  /**
   * Enable all features
   */
  private async enableAllFeatures(): Promise<void> {
    this.logger.debug('Enabling all features');

    for (const [name, flag] of this.featureFlags) {
      if (flag.state !== FeatureFlagState.ENABLED) {
        await this.setFeatureFlag(name, FeatureFlagState.ENABLED, 'Full service level');
      }
    }
  }

  /**
   * Disable non-essential features
   */
  private async disableNonEssentialFeatures(): Promise<void> {
    this.logger.debug('Disabling non-essential features');

    const essentialFeatures = this.getEssentialFeatures();

    for (const [name, flag] of this.featureFlags) {
      if (!essentialFeatures.has(name) && flag.state === FeatureFlagState.ENABLED) {
        await this.setFeatureFlag(name, FeatureFlagState.DISABLED, 'Reduced service level');
      }
    }
  }

  /**
   * Enable essential features only
   */
  private async enableEssentialFeaturesOnly(): Promise<void> {
    this.logger.debug('Enabling essential features only');

    const essentialFeatures = this.getEssentialFeatures();

    for (const [name, flag] of this.featureFlags) {
      if (essentialFeatures.has(name) && flag.state !== FeatureFlagState.ENABLED) {
        await this.setFeatureFlag(name, FeatureFlagState.ENABLED, 'Minimal service level');
      } else if (!essentialFeatures.has(name) && flag.state === FeatureFlagState.ENABLED) {
        await this.setFeatureFlag(name, FeatureFlagState.DISABLED, 'Minimal service level');
      }
    }
  }

  /**
   * Enable emergency features only
   */
  private async enableEmergencyFeaturesOnly(): Promise<void> {
    this.logger.debug('Enabling emergency features only');

    const emergencyFeatures = this.getEmergencyFeatures();

    for (const [name, flag] of this.featureFlags) {
      if (emergencyFeatures.has(name) && flag.state !== FeatureFlagState.ENABLED) {
        await this.setFeatureFlag(name, FeatureFlagState.ENABLED, 'Emergency service level');
      } else if (!emergencyFeatures.has(name) && flag.state === FeatureFlagState.ENABLED) {
        await this.setFeatureFlag(name, FeatureFlagState.DISABLED, 'Emergency service level');
      }
    }
  }

  /**
   * Get essential features
   */
  private getEssentialFeatures(): Set<string> {
    return new Set([
      'health_check',
      'basic_commands',
      'error_handling',
      'logging'
    ]);
  }

  /**
   * Get emergency features
   */
  private getEmergencyFeatures(): Set<string> {
    return new Set([
      'health_check',
      'emergency_commands'
    ]);
  }

  /**
   * Get feature priority
   */
  private getFeaturePriority(name: string): number {
    const priorities: Record<string, number> = {
      health_check: 100,
      basic_commands: 90,
      error_handling: 95,
      logging: 80,
      emergency_commands: 100,
      ai_features: 70,
      database_operations: 80,
      cache_operations: 60,
      api_calls: 75
    };

    return priorities[name] || 50;
  }

  /**
   * Evaluate if degradation level should be adjusted
   */
  async evaluateDegradationLevel(): Promise<void> {
    const currentLevel = this.currentState.currentLevel;

    // Check if we should degrade
    if (currentLevel === ServiceLevel.FULL) {
      const shouldDegrade = await this.shouldDegrade();

      if (shouldDegrade) {
        await this.setServiceLevel(ServiceLevel.REDUCED, 'System degradation triggered');
      }
    }

    // Check if we should recover
    if (currentLevel !== ServiceLevel.FULL) {
      const shouldRecover = await this.shouldRecover();

      if (shouldRecover) {
        await this.setServiceLevel(ServiceLevel.FULL, 'System recovered');
      }
    }
  }

  /**
   * Check if system should be degraded
   */
  private async shouldDegrade(): Promise<boolean> {
    // In production, this would check actual system metrics
    // For now, return false
    return false;
  }

  /**
   * Check if system should recover
   */
  private async shouldRecover(): Promise<boolean> {
    // In production, this would check actual system metrics
    // For now, return false
    return false;
  }

  /**
   * Throttle requests
   */
  async throttleRequest<T>(
    requestFn: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    const requestId = this.generateRequestId();
    const timestamp = Date.now();

    // Check if throttling is enabled
    if (!this.currentState.throttleConfig.enabled) {
      return requestFn();
    }

    // Check concurrent request limit
    if (this.activeRequests >= this.currentState.throttleConfig.maxConcurrentRequests) {
      this.logger.debug('Request throttled due to concurrent limit', {
        activeRequests: this.activeRequests,
        max: this.currentState.throttleConfig.maxConcurrentRequests
      });

      // Queue the request
      if (this.currentState.queueConfig.enabled) {
        return this.queueRequest(requestFn, priority);
      }

      // Drop the request
      throw new Error('Request throttled: maximum concurrent requests reached');
    }

    // Check rate limit
    const recentRequests = this.throttleQueue.filter(
      r => timestamp > Date.now() - 1000
    );

    if (recentRequests.length >= this.currentState.throttleConfig.maxRequestsPerSecond) {
      this.logger.debug('Request throttled due to rate limit', {
        recentRequests: recentRequests.length,
        max: this.currentState.throttleConfig.maxRequestsPerSecond
      });

      // Queue the request
      if (this.currentState.queueConfig.enabled) {
        return this.queueRequest(requestFn, priority);
      }

      // Drop the request
      throw new Error('Request throttled: rate limit exceeded');
    }

    // Execute the request
    this.activeRequests++;
    this.throttleQueue.push({ timestamp, priority });

    try {
      const result = await requestFn();

      // Emit success event
      await this.emitEvent('requestCompleted', {
        requestId,
        timestamp: Date.now()
      });

      return result;
    } finally {
      this.activeRequests--;
      // Clean up throttle queue
      this.throttleQueue = this.throttleQueue.filter(
        r => r.timestamp !== timestamp
      );
    }
  }

  /**
   * Queue a request
   */
  private async queueRequest<T>(
    requestFn: () => Promise<T>,
    priority: number
  ): Promise<T> {
    const requestId = this.generateRequestId();
    const timestamp = Date.now();

    // Check if queue is enabled
    if (!this.currentState.queueConfig.enabled) {
      return requestFn();
    }

    // Check queue size
    if (this.requestQueue.length >= this.currentState.queueConfig.maxSize) {
      this.logger.warn('Request queue is full', {
        size: this.requestQueue.length,
        max: this.currentState.queueConfig.maxSize
      });

      // Apply retry policy
      if (this.currentState.queueConfig.retryPolicy === 'drop') {
        throw new Error('Request queue is full');
      }

      // Remove oldest request
      this.requestQueue.shift();
    }

    // Add to queue
    this.requestQueue.push({ id: requestId, timestamp, priority });

    this.logger.debug('Request queued', {
      requestId,
      queueSize: this.requestQueue.length,
      priority
    });

    // Emit queued event
    await this.emitEvent('requestQueued', {
      requestId,
      queueSize: this.requestQueue.length
    });

    // Process queue
    await this.processQueue();

    // Wait for this request to be processed
    return new Promise<T>((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const queuedRequest = this.requestQueue.find(r => r.id === requestId);
        if (!queuedRequest) {
          // Request was processed or removed
          clearInterval(checkInterval);
          reject(new Error('Request was not processed'));
        }
      }, 100);
    });
  }

  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    if (this.requestQueue.length === 0) {
      return;
    }

    // Sort by priority
    this.requestQueue.sort((a, b) => b.priority - a.priority);

    // Process next request
    const nextRequest = this.requestQueue.shift();
    if (!nextRequest) {
      return;
    }

    // Execute the request
    try {
      // This would execute the actual queued request
      this.logger.debug('Processing queued request', {
        requestId: nextRequest.id
      });

      // Emit processed event
      await this.emitEvent('requestProcessed', {
        requestId: nextRequest.id
      });
    } catch (error) {
      this.logger.error('Failed to process queued request', error as Error);

      // Emit failed event
      await this.emitEvent('requestFailed', {
        requestId: nextRequest.id,
        error: error as Error
      });
    }

    // Continue processing
    await this.processQueue();
  }

  /**
   * Reallocate resources
   */
  async reallocateResources(allocation: Partial<ResourceAllocation>): Promise<void> {
    this.logger.info('Reallocating resources', allocation);

    this.currentResourceAllocation = {
      ...this.currentResourceAllocation,
      ...allocation,
      timestamp: new Date()
    };

    // Emit event
    await this.emitEvent('resourcesReallocated', {
      previousAllocation: this.currentResourceAllocation,
      newAllocation: this.currentResourceAllocation
    });

    // Apply resource limits
    await this.applyResourceLimits();
  }

  /**
   * Get current resource allocation
   */
  getResourceAllocation(): ResourceAllocation {
    return { ...this.currentResourceAllocation };
  }

  /**
   * Apply resource limits
   */
  private async applyResourceLimits(): Promise<void> {
    // In production, this would apply actual resource limits
    this.logger.debug('Applying resource limits', {
      allocation: this.currentResourceAllocation
    });

    await this.sleep(100);
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add event listener
   */
  addEventListener(event: string, listener: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(event: string, listener: Function): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  /**
   * Emit event
   */
  private async emitEvent(event: string, data: any): Promise<void> {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      await Promise.all(
        Array.from(listeners).map(listener =>
          Promise.resolve(listener(data)).catch(error =>
            this.logger.error(`Event listener error for ${event}`, error as Error)
          )
        )
      );
    }
  }

  /**
   * Get configuration
   */
  getConfig(): GracefulDegradationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GracefulDegradationConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Configuration updated', { config });
  }

  /**
   * Reset to full service level
   */
  async resetToFull(): Promise<void> {
    this.logger.info('Resetting to full service level');
    await this.setServiceLevel(ServiceLevel.FULL, 'Manual reset');
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    currentLevel: ServiceLevel;
    activeFeatures: number;
    enabledFeatures: number;
    disabledFeatures: number;
    activeRequests: number;
    queuedRequests: number;
    resourceAllocation: ResourceAllocation;
  } {
    let enabledCount = 0;
    let disabledCount = 0;

    for (const flag of this.featureFlags.values()) {
      if (flag.state === FeatureFlagState.ENABLED) {
        enabledCount++;
      } else {
        disabledCount++;
      }
    }

    return {
      currentLevel: this.currentState.currentLevel,
      activeFeatures: enabledCount,
      enabledFeatures: enabledCount,
      disabledFeatures: disabledCount,
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length,
      resourceAllocation: { ...this.currentResourceAllocation }
    };
  }

  /**
   * Sleep helper
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.eventListeners.clear();
    this.featureFlags.clear();
    this.throttleQueue = [];
    this.requestQueue = [];
    this.logger.info('Graceful degradation manager cleaned up');
  }
}

/**
 * Graceful Degradation Factory
 */
export class GracefulDegradationFactory {
  private managers: Map<string, GracefulDegradationManager> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('GracefulDegradationFactory');
  }

  /**
   * Create or get degradation manager for a service
   */
  getOrCreate(
    name: string,
    config?: Partial<GracefulDegradationConfig>
  ): GracefulDegradationManager {
    let manager = this.managers.get(name);

    if (!manager) {
      manager = new GracefulDegradationManager(config);
      this.managers.set(name, manager);
      this.logger.debug(`Created degradation manager for: ${name}`);
    }

    return manager;
  }

  /**
   * Get degradation manager by name
   */
  get(name: string): GracefulDegradationManager | undefined {
    return this.managers.get(name);
  }

  /**
   * Get all managers
   */
  getAll(): GracefulDegradationManager[] {
    return Array.from(this.managers.values());
  }

  /**
   * Remove degradation manager
   */
  remove(name: string): void {
    this.managers.delete(name);
    this.logger.debug(`Removed degradation manager for: ${name}`);
  }

  /**
   * Reset all managers
   */
  async resetAll(): Promise<void> {
    await Promise.all(
      Array.from(this.managers.values()).map(manager =>
        manager.resetToFull()
      )
    );
    this.logger.info('All degradation managers reset');
  }

  /**
   * Get all statistics
   */
  getAllStatistics(): Map<string, ReturnType<GracefulDegradationManager['getStatistics']>> {
    const stats = new Map();

    this.managers.forEach((manager, name) => {
      stats.set(name, manager.getStatistics());
    });

    return stats;
  }
}
