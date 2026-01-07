/**
 * Runtime Configuration System
 * 
 * Provides dynamic configuration management for self-editing operations.
 * This configuration can be modified at runtime within safety boundaries.
 */

import Joi from 'joi';
import { getBaseConfigManager, BaseConfig } from './base-config.js';

/**
 * Runtime configuration schema
 */
export const RuntimeConfigSchema = Joi.object({
  // Performance tuning
  performance: Joi.object({
    cacheEnabled: Joi.boolean().default(true),
    cacheTTL: Joi.number().min(1).max(3600).default(300),
    batchSize: Joi.number().min(1).max(100).default(10),
    parallelProcessing: Joi.boolean().default(true),
    maxConcurrentModifications: Joi.number().min(1).max(20).default(3),
  }),
  
  // Feature flags
  features: Joi.object({
    hotReload: Joi.boolean().default(true),
    autoRollback: Joi.boolean().default(true),
    selfHealing: Joi.boolean().default(true),
    performanceOptimization: Joi.boolean().default(true),
    experimentalFeatures: Joi.boolean().default(false),
  }),
  
  // Resource allocation
  resources: Joi.object({
    memoryLimit: Joi.number().min(128).max(4096).default(512),
    cpuLimit: Joi.number().min(10).max(100).default(50),
    diskLimit: Joi.number().min(100).max(10000).default(1000),
    networkBandwidthLimit: Joi.number().min(1).max(1000).default(100),
  }),
  
  // Logging and monitoring
  monitoring: Joi.object({
    logLevel: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
    metricsEnabled: Joi.boolean().default(true),
    traceEnabled: Joi.boolean().default(false),
    performanceProfiling: Joi.boolean().default(true),
  }),
  
  // Modification settings
  modifications: Joi.object({
    requireApproval: Joi.boolean().default(true),
    approvalTimeout: Joi.number().min(1).max(300).default(60),
    maxRetries: Joi.number().min(0).max(10).default(3),
    retryDelay: Joi.number().min(100).max(10000).default(1000),
  }),
});

export interface PerformanceConfig {
  cacheEnabled: boolean;
  cacheTTL: number;
  batchSize: number;
  parallelProcessing: boolean;
  maxConcurrentModifications: number;
}

export interface FeatureFlags {
  hotReload: boolean;
  autoRollback: boolean;
  selfHealing: boolean;
  performanceOptimization: boolean;
  experimentalFeatures: boolean;
}

export interface ResourceAllocation {
  memoryLimit: number;
  cpuLimit: number;
  diskLimit: number;
  networkBandwidthLimit: number;
}

export interface MonitoringConfig {
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  metricsEnabled: boolean;
  traceEnabled: boolean;
  performanceProfiling: boolean;
}

export interface ModificationSettings {
  requireApproval: boolean;
  approvalTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

export interface RuntimeConfig {
  performance: PerformanceConfig;
  features: FeatureFlags;
  resources: ResourceAllocation;
  monitoring: MonitoringConfig;
  modifications: ModificationSettings;
}

/**
 * Default runtime configuration
 */
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  performance: {
    cacheEnabled: true,
    cacheTTL: 300,
    batchSize: 10,
    parallelProcessing: true,
    maxConcurrentModifications: 3,
  },
  features: {
    hotReload: true,
    autoRollback: true,
    selfHealing: true,
    performanceOptimization: true,
    experimentalFeatures: false,
  },
  resources: {
    memoryLimit: 512,
    cpuLimit: 50,
    diskLimit: 1000,
    networkBandwidthLimit: 100,
  },
  monitoring: {
    logLevel: 'info',
    metricsEnabled: true,
    traceEnabled: false,
    performanceProfiling: true,
  },
  modifications: {
    requireApproval: true,
    approvalTimeout: 60,
    maxRetries: 3,
    retryDelay: 1000,
  },
};

/**
 * Runtime configuration manager
 */
export class RuntimeConfigManager {
  private config: RuntimeConfig;
  private baseConfig: BaseConfig;
  private listeners: Set<(config: RuntimeConfig) => void> = new Set();

  constructor(config: Partial<RuntimeConfig> = {}) {
    this.baseConfig = getBaseConfigManager().getConfig();
    const merged = { ...DEFAULT_RUNTIME_CONFIG, ...config };
    const { error, value } = RuntimeConfigSchema.validate(merged);
    if (error) {
      throw new Error(`Invalid runtime configuration: ${error.message}`);
    }
    this.config = value;
  }

  getConfig(): RuntimeConfig {
    return { ...this.config };
  }

  getPerformanceConfig(): PerformanceConfig {
    return { ...this.config.performance };
  }

  getFeatureFlags(): FeatureFlags {
    return { ...this.config.features };
  }

  getResourceAllocation(): ResourceAllocation {
    return { ...this.config.resources };
  }

  getMonitoringConfig(): MonitoringConfig {
    return { ...this.config.monitoring };
  }

  getModificationSettings(): ModificationSettings {
    return { ...this.config.modifications };
  }

  isFeatureEnabled(feature: keyof FeatureFlags): boolean {
    return this.config.features[feature] ?? false;
  }

  updateConfig(newConfig: Partial<RuntimeConfig>): void {
    // Validate against base config safety limits
    if (newConfig.resources) {
      if (newConfig.resources.memoryLimit > this.baseConfig.safetyLimits.maxMemoryUsageMB) {
        throw new Error(`Memory limit exceeds safety limit: ${this.baseConfig.safetyLimits.maxMemoryUsageMB}MB`);
      }
      if (newConfig.resources.cpuLimit > this.baseConfig.safetyLimits.maxCpuUsagePercent) {
        throw new Error(`CPU limit exceeds safety limit: ${this.baseConfig.safetyLimits.maxCpuUsagePercent}%`);
      }
    }

    const merged = { ...this.config, ...newConfig };
    const { error, value } = RuntimeConfigSchema.validate(merged);
    if (error) {
      throw new Error(`Invalid runtime configuration: ${error.message}`);
    }

    this.config = value;
    this.notifyListeners();
  }

  setFeatureFlag(feature: keyof FeatureFlags, value: boolean): void {
    this.config.features[feature] = value;
    this.notifyListeners();
  }

  setLogLevel(level: MonitoringConfig['logLevel']): void {
    this.config.monitoring.logLevel = level;
    this.notifyListeners();
  }

  enableFeature(feature: keyof FeatureFlags): void {
    this.setFeatureFlag(feature, true);
  }

  disableFeature(feature: keyof FeatureFlags): void {
    this.setFeatureFlag(feature, false);
  }

  resetToDefaults(): void {
    this.config = { ...DEFAULT_RUNTIME_CONFIG };
    this.notifyListeners();
  }

  // Event listener system
  onConfigChange(listener: (config: RuntimeConfig) => void): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener({ ...this.config });
      } catch (error) {
        console.error('Error notifying config listener:', error);
      }
    }
  }
}

// Singleton instance
let runtimeConfigInstance: RuntimeConfigManager | null = null;

export function getRuntimeConfigManager(config?: Partial<RuntimeConfig>): RuntimeConfigManager {
  if (!runtimeConfigInstance) {
    runtimeConfigInstance = new RuntimeConfigManager(config);
  }
  return runtimeConfigInstance;
}
