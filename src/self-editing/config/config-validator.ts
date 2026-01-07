/**
 * Configuration Validator
 * 
 * Provides comprehensive validation for all configuration types including
 * schema validation, consistency checks, and security validation.
 */

import Joi from 'joi';
import { BaseConfig, BaseConfigSchema } from './base-config.js';
import { RuntimeConfig, RuntimeConfigSchema } from './runtime-config.js';
import { FeatureFlag, FeatureFlagSchema } from './feature-flags.js';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'critical';
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

/**
 * Configuration validator
 */
export class ConfigValidator {
  /**
   * Validate base configuration
   */
  validateBaseConfig(config: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Schema validation
    const { error, value } = BaseConfigSchema.validate(config, {
      abortEarly: false,
      allowUnknown: false,
    });

    if (error) {
      for (const detail of error.details) {
        errors.push({
          path: detail.path.join('.'),
          message: detail.message,
          severity: 'error',
        });
      }
    }

    // Consistency checks
    if (value) {
      warnings.push(...this.checkBaseConfigConsistency(value));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate runtime configuration
   */
  validateRuntimeConfig(config: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Schema validation
    const { error, value } = RuntimeConfigSchema.validate(config, {
      abortEarly: false,
      allowUnknown: false,
    });

    if (error) {
      for (const detail of error.details) {
        errors.push({
          path: detail.path.join('.'),
          message: detail.message,
          severity: 'error',
        });
      }
    }

    // Consistency checks
    if (value) {
      warnings.push(...this.checkRuntimeConfigConsistency(value));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate feature flag
   */
  validateFeatureFlag(flag: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Schema validation
    const { error, value } = FeatureFlagSchema.validate(flag, {
      abortEarly: false,
      allowUnknown: false,
    });

    if (error) {
      for (const detail of error.details) {
        errors.push({
          path: detail.path.join('.'),
          message: detail.message,
          severity: 'error',
        });
      }
    }

    // Consistency checks
    if (value) {
      warnings.push(...this.checkFeatureFlagConsistency(value));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate configuration against security constraints
   */
  validateSecurity(config: BaseConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check immutable paths
    for (const path of config.immutablePaths) {
      if (!path.startsWith('/')) {
        errors.push({
          path: 'immutablePaths',
          message: `Immutable path must be absolute: ${path}`,
          severity: 'critical',
        });
      }
    }

    // Check permission matrix
    if (config.permissionMatrix.tier3.coreLogic) {
      warnings.push({
        path: 'permissionMatrix.tier3.coreLogic',
        message: 'Core logic modification is enabled',
        suggestion: 'Consider disabling for production safety',
      });
    }

    if (config.permissionMatrix.tier3.securitySettings) {
      warnings.push({
        path: 'permissionMatrix.tier3.securitySettings',
        message: 'Security settings modification is enabled',
        suggestion: 'Consider disabling for production safety',
      });
    }

    // Check safety limits
    if (config.safetyLimits.maxModificationsPerHour > 50) {
      warnings.push({
        path: 'safetyLimits.maxModificationsPerHour',
        message: 'High modification rate limit',
        suggestion: 'Consider reducing to prevent abuse',
      });
    }

    if (config.safetyLimits.minTestCoveragePercent < 80) {
      warnings.push({
        path: 'safetyLimits.minTestCoveragePercent',
        message: 'Low test coverage requirement',
        suggestion: 'Consider increasing to 80% or higher',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate configuration consistency
   */
  validateConsistency(
    baseConfig: BaseConfig,
    runtimeConfig: RuntimeConfig
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check resource limits
    if (runtimeConfig.resources.memoryLimit > baseConfig.safetyLimits.maxMemoryUsageMB) {
      errors.push({
        path: 'runtimeConfig.resources.memoryLimit',
        message: `Runtime memory limit exceeds base safety limit: ${baseConfig.safetyLimits.maxMemoryUsageMB}MB`,
        severity: 'error',
      });
    }

    if (runtimeConfig.resources.cpuLimit > baseConfig.safetyLimits.maxCpuUsagePercent) {
      errors.push({
        path: 'runtimeConfig.resources.cpuLimit',
        message: `Runtime CPU limit exceeds base safety limit: ${baseConfig.safetyLimits.maxCpuUsagePercent}%`,
        severity: 'error',
      });
    }

    // Check feature flags consistency
    if (runtimeConfig.features.experimentalFeatures) {
      warnings.push({
        path: 'runtimeConfig.features.experimentalFeatures',
        message: 'Experimental features are enabled',
        suggestion: 'Disable for production environments',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check base configuration consistency
   */
  private checkBaseConfigConsistency(config: BaseConfig): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Check environment flags
    const envFlags = [
      config.environment.development,
      config.environment.staging,
      config.environment.production,
    ];
    const enabledEnvironments = envFlags.filter(Boolean).length;

    if (enabledEnvironments === 0) {
      warnings.push({
        path: 'environment',
        message: 'No environment flag is enabled',
        suggestion: 'Enable at least one environment flag',
      });
    } else if (enabledEnvironments > 1) {
      warnings.push({
        path: 'environment',
        message: 'Multiple environment flags are enabled',
        suggestion: 'Enable only one environment flag',
      });
    }

    return warnings;
  }

  /**
   * Check runtime configuration consistency
   */
  private checkRuntimeConfigConsistency(config: RuntimeConfig): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Check performance settings
    if (config.performance.parallelProcessing && !config.performance.cacheEnabled) {
      warnings.push({
        path: 'performance',
        message: 'Parallel processing enabled without caching',
        suggestion: 'Enable caching for better performance',
      });
    }

    // Check feature dependencies
    if (config.features.hotReload && !config.features.autoRollback) {
      warnings.push({
        path: 'features',
        message: 'Hot reload enabled without auto rollback',
        suggestion: 'Enable auto rollback for safety',
      });
    }

    return warnings;
  }

  /**
   * Check feature flag consistency
   */
  private checkFeatureFlagConsistency(flag: FeatureFlag): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Check if experimental flag is enabled without approval
    if (flag.category === 'experimental' && flag.enabled && !flag.requiresApproval) {
      warnings.push({
        path: 'requiresApproval',
        message: 'Experimental feature enabled without approval requirement',
        suggestion: 'Set requiresApproval to true for experimental features',
      });
    }

    return warnings;
  }

  /**
   * Validate and throw if invalid
   */
  validateOrThrow<T>(
    config: T,
    validator: (config: T) => ValidationResult
  ): asserts config is T {
    const result = validator(config);
    if (!result.valid) {
      const errorMessages = result.errors.map(e => `[${e.severity.toUpperCase()}] ${e.path}: ${e.message}`).join('\n');
      throw new Error(`Configuration validation failed:\n${errorMessages}`);
    }
  }
}

// Singleton instance
let validatorInstance: ConfigValidator | null = null;

export function getConfigValidator(): ConfigValidator {
  if (!validatorInstance) {
    validatorInstance = new ConfigValidator();
  }
  return validatorInstance;
}
