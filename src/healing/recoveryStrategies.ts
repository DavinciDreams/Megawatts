/**
 * Recovery Strategies Module
 *
 * Implements various recovery strategies for self-healing mechanisms including:
 * - Service restart automation
 * - Configuration rollback
 * - Module reload
 * - Cache rebuild
 * - Graceful degradation
 * - Emergency mode activation
 */

import { Logger } from '../utils/logger';
import { BotError, ConfigError, DatabaseError } from '../utils/errors';
import { HealthStatus } from '../core/health/types';

/**
 * Recovery strategy types
 */
export enum RecoveryStrategyType {
  SERVICE_RESTART = 'service_restart',
  CONFIG_ROLLBACK = 'config_rollback',
  MODULE_RELOAD = 'module_reload',
  CACHE_REBUILD = 'cache_rebuild',
  GRACEFUL_DEGRADATION = 'graceful_degradation',
  EMERGENCY_MODE = 'emergency_mode'
}

/**
 * Recovery priority levels
 */
export enum RecoveryPriority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3
}

/**
 * Recovery result
 */
export interface RecoveryResult {
  success: boolean;
  strategy: RecoveryStrategyType;
  timestamp: Date;
  duration: number;
  error?: Error;
  details?: Record<string, any>;
}

/**
 * Recovery strategy configuration
 */
export interface RecoveryStrategyConfig {
  maxAttempts?: number;
  timeout?: number;
  retryDelay?: number;
  priority?: RecoveryPriority;
  enabled?: boolean;
}

/**
 * Service configuration snapshot for rollback
 */
export interface ServiceConfigSnapshot {
  version: string;
  timestamp: Date;
  config: Record<string, any>;
  checksum: string;
}

/**
 * Module reload options
 */
export interface ModuleReloadOptions {
  preserveState: boolean;
  reloadDependencies: boolean;
  validateAfterReload: boolean;
  timeout: number;
}

/**
 * Cache rebuild options
 */
export interface CacheRebuildOptions {
  rebuildType: 'full' | 'incremental' | 'selective';
  keys?: string[];
  validateAfterRebuild: boolean;
  backupExisting: boolean;
}

/**
 * Graceful degradation level
 */
export enum DegradationLevel {
  NONE = 0,
  MINIMAL = 1,
  MODERATE = 2,
  SEVERE = 3
}

/**
 * Emergency mode configuration
 */
export interface EmergencyModeConfig {
  enabled: boolean;
  minimalFeatures: string[];
  disableNonEssential: boolean;
  enableEmergencyLogging: boolean;
}

/**
 * Recovery strategy base class
 */
export abstract class BaseRecoveryStrategy {
  protected logger: Logger;
  protected config: RecoveryStrategyConfig;

  constructor(config: RecoveryStrategyConfig, context: string = 'RecoveryStrategy') {
    this.logger = new Logger(context);
    this.config = config;
  }

  /**
   * Execute recovery strategy
   */
  abstract execute(context: Record<string, any>): Promise<RecoveryResult>;

  /**
   * Check if this strategy can handle given error
   */
  abstract canHandle(error: Error | BotError): boolean;

  /**
   * Get strategy type
   */
  abstract getType(): RecoveryStrategyType;

  /**
   * Calculate duration
   */
  protected measureDuration<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    return fn().then(result => ({
      result,
      duration: Date.now() - start
    }));
  }

  /**
   * Sleep helper
   */
  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Service restart strategy
 */
export class ServiceRestartStrategy extends BaseRecoveryStrategy {
  private restartHistory: Map<string, number[]> = new Map();

  constructor(config: RecoveryStrategyConfig = {}) {
    super(
      {
        maxAttempts: 3,
        timeout: 30000,
        retryDelay: 5000,
        priority: RecoveryPriority.HIGH,
        enabled: true,
        ...config
      } as RecoveryStrategyConfig,
      'ServiceRestart'
    );
  }

  /**
   * Execute service restart
   */
  async execute(context: Record<string, any>): Promise<RecoveryResult> {
    const startTime = Date.now();
    const { serviceName, graceful = true } = context;

    this.logger.info(`Attempting to restart service: ${serviceName}`, {
      graceful,
      maxAttempts: this.config.maxAttempts
    });

    try {
      // Check restart rate limiting
      if (this.isRestartRateLimited(serviceName)) {
        throw new Error(`Service ${serviceName} restart rate limited`);
      }

      // Attempt restart with retries
      for (let attempt = 1; attempt <= (this.config.maxAttempts || 3); attempt++) {
        this.logger.debug(`Restart attempt ${attempt}/${this.config.maxAttempts} for ${serviceName}`);

        try {
          // Simulate restart - in production, this would call actual restart logic
          await this.performRestart(serviceName, graceful);

          // Record successful restart
          this.recordRestart(serviceName);

          const duration = Date.now() - startTime;
          this.logger.info(`Service ${serviceName} restarted successfully`, {
            attempt,
            duration
          });

          return {
            success: true,
            strategy: RecoveryStrategyType.SERVICE_RESTART,
            timestamp: new Date(),
            duration,
            details: { serviceName, attempt, graceful }
          };
        } catch (error) {
          this.logger.error(`Restart attempt ${attempt} failed for ${serviceName}`, error as Error);

          if (attempt < (this.config.maxAttempts || 3)) {
            await this.sleep(this.config.retryDelay || 5000);
          }
        }
      }

      throw new Error(`Failed to restart service ${serviceName} after ${this.config.maxAttempts} attempts`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Service restart failed for ${serviceName}`, error as Error);

      return {
        success: false,
        strategy: RecoveryStrategyType.SERVICE_RESTART,
        timestamp: new Date(),
        duration,
        error: error as Error,
        details: { serviceName, graceful }
      };
    }
  }

  /**
   * Check if strategy can handle the error
   */
  canHandle(error: Error | BotError): boolean {
    const errorCode = (error as any)?.code || '';
    const errorMessage = error.message.toLowerCase();

    return (
      errorCode.includes('SERVICE') ||
      errorCode.includes('PROCESS') ||
      errorMessage.includes('service unavailable') ||
      errorMessage.includes('process crashed') ||
      errorMessage.includes('unresponsive')
    );
  }

  /**
   * Get strategy type
   */
  getType(): RecoveryStrategyType {
    return RecoveryStrategyType.SERVICE_RESTART;
  }

  /**
   * Perform actual restart
   */
  private async performRestart(serviceName: string, graceful: boolean): Promise<void> {
    this.logger.debug(`Performing ${graceful ? 'graceful' : 'forceful'} restart for ${serviceName}`);

    // Simulate restart delay
    await this.sleep(1000);

    // In production, this would:
    // 1. Signal the service to stop gracefully
    // 2. Wait for existing requests to complete
    // 3. Restart the service process
    // 4. Verify the service is running
  }

  /**
   * Check if restart is rate limited
   */
  private isRestartRateLimited(serviceName: string): boolean {
    const history = this.restartHistory.get(serviceName) || [];
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Count restarts in the last minute
    const recentRestarts = history.filter(timestamp => timestamp > oneMinuteAgo);

    if (recentRestarts.length >= 5) {
      this.logger.warn(`Service ${serviceName} restart rate limited`);
      return true;
    }

    return false;
  }

  /**
   * Record restart
   */
  private recordRestart(serviceName: string): void {
    const history = this.restartHistory.get(serviceName) || [];
    history.push(Date.now() as number);

    // Keep only the last 10 restarts
    if (history.length > 10) {
      history.shift();
    }

    this.restartHistory.set(serviceName, history);
  }
}

/**
 * Configuration rollback strategy
 */
export class ConfigRollbackStrategy extends BaseRecoveryStrategy {
  private configSnapshots: Map<string, ServiceConfigSnapshot[]> = new Map();
  private maxSnapshots = 10;

  constructor(config: RecoveryStrategyConfig = {}) {
    super(
      {
        maxAttempts: 1,
        timeout: 10000,
        retryDelay: 0,
        priority: RecoveryPriority.CRITICAL,
        enabled: true,
        ...config
      } as RecoveryStrategyConfig,
      'ConfigRollback'
    );
  }

  /**
   * Execute configuration rollback
   */
  async execute(context: Record<string, any>): Promise<RecoveryResult> {
    const startTime = Date.now();
    const { serviceName, targetVersion } = context;

    this.logger.info(`Attempting configuration rollback for ${serviceName}`, {
      targetVersion
    });

    try {
      const snapshots = this.configSnapshots.get(serviceName);

      if (!snapshots || snapshots.length === 0) {
        throw new Error(`No configuration snapshots available for ${serviceName}`);
      }

      // Find the target version
      let targetSnapshot: ServiceConfigSnapshot | undefined;

      if (targetVersion) {
        targetSnapshot = snapshots.find(s => s.version === targetVersion);
      } else {
        // Use the most recent snapshot
        targetSnapshot = snapshots[snapshots.length - 2]; // Second to last (last is current)
      }

      if (!targetSnapshot) {
        throw new Error(`Target configuration version ${targetVersion} not found`);
      }

      // Verify checksum
      const currentChecksum = this.calculateChecksum(targetSnapshot.config);
      if (currentChecksum !== targetSnapshot.checksum) {
        throw new Error('Configuration checksum mismatch');
      }

      // Apply rollback
      await this.applyConfiguration(serviceName, targetSnapshot.config);

      const duration = Date.now() - startTime;
      this.logger.info(`Configuration rollback successful for ${serviceName}`, {
        version: targetSnapshot.version,
        duration
      });

      return {
        success: true,
        strategy: RecoveryStrategyType.CONFIG_ROLLBACK,
        timestamp: new Date(),
        duration,
        details: {
          serviceName,
          fromVersion: snapshots[snapshots.length - 1].version,
          toVersion: targetSnapshot.version
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Configuration rollback failed for ${serviceName}`, error as Error);

      return {
        success: false,
        strategy: RecoveryStrategyType.CONFIG_ROLLBACK,
        timestamp: new Date(),
        duration,
        error: error as Error,
        details: { serviceName, targetVersion }
      };
    }
  }

  /**
   * Check if strategy can handle the error
   */
  canHandle(error: Error | BotError): boolean {
    return (
      error instanceof ConfigError ||
      (error as any)?.code?.includes('CONFIG') ||
      error.message.toLowerCase().includes('configuration')
    );
  }

  /**
   * Get strategy type
   */
  getType(): RecoveryStrategyType {
    return RecoveryStrategyType.CONFIG_ROLLBACK;
  }

  /**
   * Create a configuration snapshot
   */
  createSnapshot(serviceName: string, config: Record<string, any>): ServiceConfigSnapshot {
    const snapshot: ServiceConfigSnapshot = {
      version: this.generateVersion(),
      timestamp: new Date(),
      config: JSON.parse(JSON.stringify(config)), // Deep clone
      checksum: this.calculateChecksum(config)
    };

    const snapshots = this.configSnapshots.get(serviceName) || [];
    snapshots.push(snapshot);

    // Keep only max snapshots
    if (snapshots.length > this.maxSnapshots) {
      snapshots.shift();
    }

    this.configSnapshots.set(serviceName, snapshots);

    this.logger.debug(`Created configuration snapshot for ${serviceName}`, {
      version: snapshot.version,
      totalSnapshots: snapshots.length
    });

    return snapshot;
  }

  /**
   * Apply configuration
   */
  private async applyConfiguration(serviceName: string, config: Record<string, any>): Promise<void> {
    this.logger.debug(`Applying configuration for ${serviceName}`);

    // Simulate configuration application
    await this.sleep(500);

    // In production, this would:
    // 1. Validate the configuration
    // 2. Apply the configuration to the service
    // 3. Trigger a graceful reload if needed
  }

  /**
   * Generate version string
   */
  private generateVersion(): string {
    return `v${Date.now()}`;
  }

  /**
   * Calculate checksum
   */
  private calculateChecksum(config: Record<string, any>): string {
    const str = JSON.stringify(config);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Module reload strategy
 */
export class ModuleReloadStrategy extends BaseRecoveryStrategy {
  private loadedModules: Map<string, any> = new Map();

  constructor(config: RecoveryStrategyConfig = {}) {
    super(
      {
        maxAttempts: 2,
        timeout: 15000,
        retryDelay: 2000,
        priority: RecoveryPriority.MEDIUM,
        enabled: true,
        ...config
      } as RecoveryStrategyConfig,
      'ModuleReload'
    );
  }

  /**
   * Execute module reload
   */
  async execute(context: Record<string, any>): Promise<RecoveryResult> {
    const startTime = Date.now();
    const { moduleName, options = {} as ModuleReloadOptions } = context;

    this.logger.info(`Attempting to reload module: ${moduleName}`, options);

    try {
      const reloadOptions: ModuleReloadOptions = {
        preserveState: true,
        reloadDependencies: false,
        validateAfterReload: true,
        timeout: this.config.timeout || 15000,
        ...options
      };

      // Check if module is loaded
      if (!this.loadedModules.has(moduleName)) {
        throw new Error(`Module ${moduleName} is not loaded`);
      }

      // Preserve state if requested
      let preservedState: any = null;
      if (reloadOptions.preserveState) {
        preservedState = this.preserveModuleState(moduleName);
      }

      // Unload module
      await this.unloadModule(moduleName);

      // Reload module
      await this.loadModule(moduleName);

      // Restore state if preserved
      if (preservedState !== null) {
        await this.restoreModuleState(moduleName, preservedState);
      }

      // Validate after reload
      if (reloadOptions.validateAfterReload) {
        await this.validateModule(moduleName);
      }

      const duration = Date.now() - startTime;
      this.logger.info(`Module ${moduleName} reloaded successfully`, {
        duration,
        preserveState: reloadOptions.preserveState
      });

      return {
        success: true,
        strategy: RecoveryStrategyType.MODULE_RELOAD,
        timestamp: new Date(),
        duration,
        details: { moduleName, options: reloadOptions }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Module reload failed for ${moduleName}`, error as Error);

      return {
        success: false,
        strategy: RecoveryStrategyType.MODULE_RELOAD,
        timestamp: new Date(),
        duration,
        error: error as Error,
        details: { moduleName, options }
      };
    }
  }

  /**
   * Check if strategy can handle the error
   */
  canHandle(error: Error | BotError): boolean {
    const errorMessage = error.message.toLowerCase();
    return (
      errorMessage.includes('module') ||
      errorMessage.includes('import') ||
      errorMessage.includes('require') ||
      errorMessage.includes('hot reload')
    );
  }

  /**
   * Get strategy type
   */
  getType(): RecoveryStrategyType {
    return RecoveryStrategyType.MODULE_RELOAD;
  }

  /**
   * Load module
   */
  async loadModule(moduleName: string): Promise<void> {
    this.logger.debug(`Loading module: ${moduleName}`);
    await this.sleep(100);
    // In production, this would dynamically load the module
  }

  /**
   * Unload module
   */
  async unloadModule(moduleName: string): Promise<void> {
    this.logger.debug(`Unloading module: ${moduleName}`);
    await this.sleep(100);
    // In production, this would clean up the module
  }

  /**
   * Preserve module state
   */
  private preserveModuleState(moduleName: string): any {
    this.logger.debug(`Preserving state for module: ${moduleName}`);
    const module = this.loadedModules.get(moduleName);
    return module ? { ...module } : null;
  }

  /**
   * Restore module state
   */
  private async restoreModuleState(moduleName: string, state: any): Promise<void> {
    this.logger.debug(`Restoring state for module: ${moduleName}`);
    await this.sleep(50);
    // In production, this would restore the module state
  }

  /**
   * Validate module
   */
  private async validateModule(moduleName: string): Promise<void> {
    this.logger.debug(`Validating module: ${moduleName}`);
    await this.sleep(100);
    // In production, this would validate the module is working correctly
  }
}

/**
 * Cache rebuild strategy
 */
export class CacheRebuildStrategy extends BaseRecoveryStrategy {
  constructor(config: RecoveryStrategyConfig = {}) {
    super(
      {
        maxAttempts: 2,
        timeout: 30000,
        retryDelay: 5000,
        priority: RecoveryPriority.MEDIUM,
        enabled: true,
        ...config
      } as RecoveryStrategyConfig,
      'CacheRebuild'
    );
  }

  /**
   * Execute cache rebuild
   */
  async execute(context: Record<string, any>): Promise<RecoveryResult> {
    const startTime = Date.now();
    const { cacheName, options = {} as CacheRebuildOptions } = context;

    this.logger.info(`Attempting to rebuild cache: ${cacheName}`, options);

    try {
      const rebuildOptions: CacheRebuildOptions = {
        rebuildType: 'full',
        validateAfterRebuild: true,
        backupExisting: true,
        ...options
      };

      // Backup existing cache if requested
      if (rebuildOptions.backupExisting) {
        await this.backupCache(cacheName);
      }

      // Clear existing cache
      await this.clearCache(cacheName);

      // Rebuild cache
      await this.rebuildCache(cacheName, rebuildOptions);

      // Validate after rebuild
      if (rebuildOptions.validateAfterRebuild) {
        await this.validateCache(cacheName);
      }

      const duration = Date.now() - startTime;
      this.logger.info(`Cache ${cacheName} rebuilt successfully`, {
        rebuildType: rebuildOptions.rebuildType,
        duration
      });

      return {
        success: true,
        strategy: RecoveryStrategyType.CACHE_REBUILD,
        timestamp: new Date(),
        duration,
        details: { cacheName, options: rebuildOptions }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Cache rebuild failed for ${cacheName}`, error as Error);

      // Attempt to restore from backup
      if (options.backupExisting) {
        this.logger.info(`Attempting to restore cache ${cacheName} from backup`);
        try {
          await this.restoreCache(cacheName);
          this.logger.info(`Cache ${cacheName} restored from backup`);
        } catch (restoreError) {
          this.logger.error(`Failed to restore cache ${cacheName} from backup`, restoreError as Error);
        }
      }

      return {
        success: false,
        strategy: RecoveryStrategyType.CACHE_REBUILD,
        timestamp: new Date(),
        duration,
        error: error as Error,
        details: { cacheName, options }
      };
    }
  }

  /**
   * Check if strategy can handle the error
   */
  canHandle(error: Error | BotError): boolean {
    const errorMessage = error.message.toLowerCase();
    return (
      errorMessage.includes('cache') ||
      errorMessage.includes('corruption') ||
      errorMessage.includes('invalid cache')
    );
  }

  /**
   * Get strategy type
   */
  getType(): RecoveryStrategyType {
    return RecoveryStrategyType.CACHE_REBUILD;
  }

  /**
   * Backup cache
   */
  private async backupCache(cacheName: string): Promise<void> {
    this.logger.debug(`Backing up cache: ${cacheName}`);
    await this.sleep(200);
    // In production, this would create a backup of the cache
  }

  /**
   * Clear cache
   */
  private async clearCache(cacheName: string): Promise<void> {
    this.logger.debug(`Clearing cache: ${cacheName}`);
    await this.sleep(100);
    // In production, this would clear the cache
  }

  /**
   * Rebuild cache
   */
  private async rebuildCache(cacheName: string, options: CacheRebuildOptions): Promise<void> {
    this.logger.debug(`Rebuilding cache: ${cacheName} with type: ${options.rebuildType}`);

    switch (options.rebuildType) {
      case 'full':
        await this.sleep(2000);
        break;
      case 'incremental':
        await this.sleep(1000);
        break;
      case 'selective':
        await this.sleep(500);
        break;
    }

    // In production, this would rebuild the cache from source data
  }

  /**
   * Validate cache
   */
  private async validateCache(cacheName: string): Promise<void> {
    this.logger.debug(`Validating cache: ${cacheName}`);
    await this.sleep(200);
    // In production, this would validate the cache integrity
  }

  /**
   * Restore cache from backup
   */
  private async restoreCache(cacheName: string): Promise<void> {
    this.logger.debug(`Restoring cache: ${cacheName} from backup`);
    await this.sleep(300);
    // In production, this would restore the cache from backup
  }
}

/**
 * Graceful degradation strategy
 */
export class GracefulDegradationStrategy extends BaseRecoveryStrategy {
  private currentDegradationLevel: DegradationLevel = DegradationLevel.NONE;
  private featureFlags: Map<string, boolean> = new Map();

  constructor(config: RecoveryStrategyConfig = {}) {
    super(
      {
        maxAttempts: 1,
        timeout: 5000,
        retryDelay: 0,
        priority: RecoveryPriority.HIGH,
        enabled: true,
        ...config
      } as RecoveryStrategyConfig,
      'GracefulDegradation'
    );
  }

  /**
   * Execute graceful degradation
   */
  async execute(context: Record<string, any>): Promise<RecoveryResult> {
    const startTime = Date.now();
    const { level, featuresToDisable = [] } = context;

    this.logger.info(`Applying graceful degradation at level: ${level}`, {
      featuresToDisable
    });

    try {
      const degradationLevel = level as DegradationLevel;

      // Apply degradation level
      await this.setDegradationLevel(degradationLevel);

      // Disable specified features
      for (const feature of featuresToDisable) {
        await this.disableFeature(feature);
      }

      const duration = Date.now() - startTime;
      this.logger.info(`Graceful degradation applied successfully`, {
        level: degradationLevel,
        disabledFeatures: featuresToDisable.length,
        duration
      });

      return {
        success: true,
        strategy: RecoveryStrategyType.GRACEFUL_DEGRADATION,
        timestamp: new Date(),
        duration,
        details: { level: degradationLevel, featuresToDisable }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Graceful degradation failed`, error as Error);

      return {
        success: false,
        strategy: RecoveryStrategyType.GRACEFUL_DEGRADATION,
        timestamp: new Date(),
        duration,
        error: error as Error,
        details: { level, featuresToDisable }
      };
    }
  }

  /**
   * Check if strategy can handle the error
   */
  canHandle(error: Error | BotError): boolean {
    const errorMessage = error.message.toLowerCase();
    return (
      errorMessage.includes('overload') ||
      errorMessage.includes('high load') ||
      errorMessage.includes('resource') ||
      errorMessage.includes('degradation')
    );
  }

  /**
   * Get strategy type
   */
  getType(): RecoveryStrategyType {
    return RecoveryStrategyType.GRACEFUL_DEGRADATION;
  }

  /**
   * Set degradation level
   */
  private async setDegradationLevel(level: DegradationLevel): Promise<void> {
    this.logger.debug(`Setting degradation level to: ${level}`);

    this.currentDegradationLevel = level;

    // Apply level-specific changes
    switch (level) {
      case DegradationLevel.MINIMAL:
        // Disable non-essential features
        break;
      case DegradationLevel.MODERATE:
        // Reduce service levels
        break;
      case DegradationLevel.SEVERE:
        // Enable emergency mode features only
        break;
    }

    await this.sleep(100);
  }

  /**
   * Disable feature
   */
  private async disableFeature(feature: string): Promise<void> {
    this.logger.debug(`Disabling feature: ${feature}`);
    this.featureFlags.set(feature, false);
    await this.sleep(50);
    // In production, this would disable the feature
  }

  /**
   * Get current degradation level
   */
  getCurrentDegradationLevel(): DegradationLevel {
    return this.currentDegradationLevel;
  }

  /**
   * Reset degradation
   */
  async resetDegradation(): Promise<void> {
    this.logger.info('Resetting graceful degradation');
    this.currentDegradationLevel = DegradationLevel.NONE;
    this.featureFlags.clear();
    await this.sleep(100);
  }
}

/**
 * Emergency mode activation strategy
 */
export class EmergencyModeStrategy extends BaseRecoveryStrategy {
  private emergencyModeActive = false;
  private emergencyConfig: EmergencyModeConfig = {
    enabled: false,
    minimalFeatures: ['health_check', 'basic_commands'],
    disableNonEssential: true,
    enableEmergencyLogging: true
  };

  constructor(config: RecoveryStrategyConfig = {}) {
    super(
      {
        maxAttempts: 1,
        timeout: 5000,
        retryDelay: 0,
        priority: RecoveryPriority.CRITICAL,
        enabled: true,
        ...config
      } as RecoveryStrategyConfig,
      'EmergencyMode'
    );
  }

  /**
   * Execute emergency mode activation
   */
  async execute(context: Record<string, any>): Promise<RecoveryResult> {
    const startTime = Date.now();
    const { activate = true, config } = context;

    this.logger.info(`${activate ? 'Activating' : 'Deactivating'} emergency mode`);

    try {
      if (activate) {
        await this.activateEmergencyMode(config);
      } else {
        await this.deactivateEmergencyMode();
      }

      const duration = Date.now() - startTime;
      this.logger.info(`Emergency mode ${activate ? 'activated' : 'deactivated'} successfully`, {
        duration
      });

      return {
        success: true,
        strategy: RecoveryStrategyType.EMERGENCY_MODE,
        timestamp: new Date(),
        duration,
        details: { activate, config: this.emergencyConfig }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Emergency mode ${activate ? 'activation' : 'deactivation'} failed`, error as Error);

      return {
        success: false,
        strategy: RecoveryStrategyType.EMERGENCY_MODE,
        timestamp: new Date(),
        duration,
        error: error as Error,
        details: { activate }
      };
    }
  }

  /**
   * Check if strategy can handle the error
   */
  canHandle(error: Error | BotError): boolean {
    if (error instanceof BotError) {
      return error.severity === 'critical';
    }
    const errorMessage = error.message.toLowerCase();
    return (
      errorMessage.includes('critical') ||
      errorMessage.includes('emergency') ||
      errorMessage.includes('severe')
    );
  }

  /**
   * Get strategy type
   */
  getType(): RecoveryStrategyType {
    return RecoveryStrategyType.EMERGENCY_MODE;
  }

  /**
   * Activate emergency mode
   */
  private async activateEmergencyMode(config?: Partial<EmergencyModeConfig>): Promise<void> {
    this.logger.warn('Activating emergency mode');

    this.emergencyConfig = {
      ...this.emergencyConfig,
      ...config,
      enabled: true
    };

    // Disable non-essential features
    if (this.emergencyConfig.disableNonEssential) {
      await this.disableNonEssentialFeatures();
    }

    // Enable emergency logging
    if (this.emergencyConfig.enableEmergencyLogging) {
      await this.enableEmergencyLogging();
    }

    this.emergencyModeActive = true;
    await this.sleep(200);
  }

  /**
   * Deactivate emergency mode
   */
  private async deactivateEmergencyMode(): Promise<void> {
    this.logger.info('Deactivating emergency mode');

    this.emergencyConfig.enabled = false;
    this.emergencyModeActive = false;

    // Restore normal operation
    await this.restoreNormalOperation();

    await this.sleep(200);
  }

  /**
   * Disable non-essential features
   */
  private async disableNonEssentialFeatures(): Promise<void> {
    this.logger.debug('Disabling non-essential features');
    await this.sleep(100);
    // In production, this would disable all non-essential features
  }

  /**
   * Enable emergency logging
   */
  private async enableEmergencyLogging(): Promise<void> {
    this.logger.debug('Enabling emergency logging');
    await this.sleep(50);
    // In production, this would enable enhanced logging
  }

  /**
   * Restore normal operation
   */
  private async restoreNormalOperation(): Promise<void> {
    this.logger.debug('Restoring normal operation');
    await this.sleep(100);
    // In production, this would restore all features
  }

  /**
   * Check if emergency mode is active
   */
  isEmergencyModeActive(): boolean {
    return this.emergencyModeActive;
  }

  /**
   * Get emergency config
   */
  getEmergencyConfig(): EmergencyModeConfig {
    return { ...this.emergencyConfig };
  }
}

/**
 * Recovery strategies factory
 */
export class RecoveryStrategiesFactory {
  private strategies: Map<RecoveryStrategyType, BaseRecoveryStrategy> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('RecoveryStrategiesFactory');
    this.initializeDefaultStrategies();
  }

  /**
   * Initialize default strategies
   */
  private initializeDefaultStrategies(): void {
    this.registerStrategy(new ServiceRestartStrategy());
    this.registerStrategy(new ConfigRollbackStrategy());
    this.registerStrategy(new ModuleReloadStrategy());
    this.registerStrategy(new CacheRebuildStrategy());
    this.registerStrategy(new GracefulDegradationStrategy());
    this.registerStrategy(new EmergencyModeStrategy());

    this.logger.info('Default recovery strategies initialized');
  }

  /**
   * Register a recovery strategy
   */
  registerStrategy(strategy: BaseRecoveryStrategy): void {
    this.strategies.set(strategy.getType(), strategy);
    this.logger.debug(`Registered recovery strategy: ${strategy.getType()}`);
  }

  /**
   * Get strategy by type
   */
  getStrategy(type: RecoveryStrategyType): BaseRecoveryStrategy | undefined {
    return this.strategies.get(type);
  }

  /**
   * Get all strategies
   */
  getAllStrategies(): BaseRecoveryStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Get strategies that can handle an error
   */
  getStrategiesForError(error: Error | BotError): BaseRecoveryStrategy[] {
    return Array.from(this.strategies.values())
      .filter(strategy => strategy.canHandle(error))
      .sort((a, b) => (a['config']?.priority || 0) - (b['config']?.priority || 0));
  }

  /**
   * Remove strategy
   */
  removeStrategy(type: RecoveryStrategyType): void {
    this.strategies.delete(type);
    this.logger.debug(`Removed recovery strategy: ${type}`);
  }
}
