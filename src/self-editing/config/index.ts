/**
 * Self-Editing Configuration System
 * 
 * Main export file for all configuration-related modules.
 * Provides a unified interface for managing base configuration,
 * runtime configuration, feature flags, and validation.
 */

// Base configuration
export {
  BaseConfigManager,
  getBaseConfigManager,
  DEFAULT_BASE_CONFIG,
  BaseConfigSchema,
  SafetyLimitsSchema,
  PermissionMatrixSchema,
  ImmutablePathsSchema,
} from './base-config.js';

export type {
  BaseConfig,
  SafetyLimits,
  PermissionMatrix,
} from './base-config.js';

// Runtime configuration
export {
  RuntimeConfigManager,
  getRuntimeConfigManager,
  DEFAULT_RUNTIME_CONFIG,
  RuntimeConfigSchema,
} from './runtime-config.js';

export type {
  RuntimeConfig,
  PerformanceConfig,
  FeatureFlags,
  ResourceAllocation,
  MonitoringConfig,
  ModificationSettings,
} from './runtime-config.js';

// Feature flags
export {
  FeatureFlagsManager,
  getFeatureFlagsManager,
  DEFAULT_FEATURE_FLAGS,
  FeatureFlagSchema,
  FeatureCategory,
} from './feature-flags.js';

export type {
  FeatureFlag,
} from './feature-flags.js';

export {
  isFeatureEnabled,
  enableFeature,
  disableFeature,
} from './feature-flags.js';

// Configuration validator
export {
  ConfigValidator,
  getConfigValidator,
} from './config-validator.js';

export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './config-validator.js';

// Import types for internal use
import type {
  BaseConfig as BaseConfigType,
  SafetyLimits as SafetyLimitsType,
  PermissionMatrix as PermissionMatrixType,
} from './base-config.js';

import type {
  RuntimeConfig as RuntimeConfigType,
} from './runtime-config.js';

import type {
  FeatureFlag as FeatureFlagType,
} from './feature-flags.js';

import {
  getBaseConfigManager as getBaseConfigManagerFn,
  BaseConfigManager as BaseConfigManagerClass,
} from './base-config.js';

import {
  getRuntimeConfigManager as getRuntimeConfigManagerFn,
  RuntimeConfigManager as RuntimeConfigManagerClass,
} from './runtime-config.js';

import {
  getFeatureFlagsManager as getFeatureFlagsManagerFn,
  FeatureFlagsManager as FeatureFlagsManagerClass,
} from './feature-flags.js';

import {
  getConfigValidator as getConfigValidatorFn,
  ConfigValidator as ConfigValidatorClass,
} from './config-validator.js';

/**
 * Configuration system initialization
 */
export class ConfigurationSystem {
  private static instance: ConfigurationSystem | null = null;

  private constructor() {}

  static getInstance(): ConfigurationSystem {
    if (!ConfigurationSystem.instance) {
      ConfigurationSystem.instance = new ConfigurationSystem();
    }
    return ConfigurationSystem.instance;
  }

  /**
   * Initialize the configuration system
   */
  initialize(
    baseConfig?: Partial<BaseConfigType>,
    runtimeConfig?: Partial<RuntimeConfigType>,
    customFeatureFlags?: Record<string, Partial<FeatureFlagType>>
  ): void {
    // Initialize base configuration
    const baseConfigManager = getBaseConfigManagerFn(baseConfig);

    // Initialize runtime configuration
    getRuntimeConfigManagerFn(runtimeConfig);

    // Initialize feature flags
    if (customFeatureFlags) {
      getFeatureFlagsManagerFn(customFeatureFlags);
    }

    // Validate configurations
    const validator = getConfigValidatorFn();
    const baseValidation = validator.validateBaseConfig(baseConfigManager.getConfig());
    if (!baseValidation.valid) {
      throw new Error(
        `Base configuration validation failed:\n${baseValidation.errors.map((e: { message: string }) => e.message).join('\n')}`
      );
    }

    const runtimeValidation = validator.validateRuntimeConfig(
      getRuntimeConfigManagerFn().getConfig()
    );
    if (!runtimeValidation.valid) {
      throw new Error(
        `Runtime configuration validation failed:\n${runtimeValidation.errors.map((e: { message: string }) => e.message).join('\n')}`
      );
    }

    const consistencyValidation = validator.validateConsistency(
      baseConfigManager.getConfig(),
      getRuntimeConfigManagerFn().getConfig()
    );
    if (!consistencyValidation.valid) {
      throw new Error(
        `Configuration consistency validation failed:\n${consistencyValidation.errors.map((e: { message: string }) => e.message).join('\n')}`
      );
    }
  }

  /**
   * Get base configuration manager
   */
  getBaseConfig(): BaseConfigManagerClass {
    return getBaseConfigManagerFn();
  }

  /**
   * Get runtime configuration manager
   */
  getRuntimeConfig(): RuntimeConfigManagerClass {
    return getRuntimeConfigManagerFn();
  }

  /**
   * Get feature flags manager
   */
  getFeatureFlags(): FeatureFlagsManagerClass {
    return getFeatureFlagsManagerFn();
  }

  /**
   * Get configuration validator
   */
  getValidator(): ConfigValidatorClass {
    return getConfigValidatorFn();
  }

  /**
   * Get complete configuration snapshot
   */
  getConfigurationSnapshot(): {
    base: BaseConfigType;
    runtime: RuntimeConfigType;
    featureFlags: FeatureFlagType[];
  } {
    return {
      base: this.getBaseConfig().getConfig(),
      runtime: this.getRuntimeConfig().getConfig(),
      featureFlags: this.getFeatureFlags().getAllFlags(),
    };
  }
}

/**
 * Get the configuration system instance
 */
export function getConfigurationSystem(): ConfigurationSystem {
  return ConfigurationSystem.getInstance();
}
