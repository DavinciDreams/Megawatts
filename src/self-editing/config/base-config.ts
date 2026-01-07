/**
 * Base Configuration System
 * 
 * Provides system defaults, safety limits, and permission matrix for self-editing operations.
 * This configuration is immutable at runtime and defines core safety boundaries.
 */

import Joi from 'joi';

/**
 * Safety limits for self-modification operations
 */
export const SafetyLimitsSchema = Joi.object({
  // Rate limits
  maxModificationsPerHour: Joi.number().min(1).max(100).default(10),
  maxModificationsPerDay: Joi.number().min(1).max(500).default(50),
  
  // Resource limits
  maxMemoryUsageMB: Joi.number().min(128).max(4096).default(512),
  maxCpuUsagePercent: Joi.number().min(10).max(100).default(50),
  maxExecutionTimeSeconds: Joi.number().min(1).max(300).default(30),
  
  // Complexity limits
  maxCyclomaticComplexity: Joi.number().min(5).max(50).default(15),
  maxLinesPerModification: Joi.number().min(10).max(1000).default(200),
  maxFilesPerModification: Joi.number().min(1).max(50).default(5),
  
  // Test coverage requirements
  minTestCoveragePercent: Joi.number().min(50).max(100).default(90),
  requireIntegrationTests: Joi.boolean().default(true),
  requireE2ETests: Joi.boolean().default(false),
});

/**
 * Permission matrix for different operation types
 */
export const PermissionMatrixSchema = Joi.object({
  // Tier 1: Safe operations (auto-approved)
  tier1: Joi.object({
    responseStyle: Joi.boolean().default(true),
    configuration: Joi.boolean().default(true),
    toolParameters: Joi.boolean().default(true),
  }),
  
  // Tier 2: Validated operations (require AI validation)
  tier2: Joi.object({
    behaviorPatterns: Joi.boolean().default(true),
    moduleUpdates: Joi.boolean().default(true),
    featureToggles: Joi.boolean().default(true),
  }),
  
  // Tier 3: Critical operations (require system analysis)
  tier3: Joi.object({
    coreLogic: Joi.boolean().default(false),
    securitySettings: Joi.boolean().default(false),
    infrastructure: Joi.boolean().default(false),
  }),
  
  // Tier 4: Emergency operations (require emergency conditions)
  tier4: Joi.object({
    emergencyStop: Joi.boolean().default(true),
    forcedRollback: Joi.boolean().default(true),
    adminOverride: Joi.boolean().default(false),
  }),
});

/**
 * Immutable core paths that cannot be modified
 */
export const ImmutablePathsSchema = Joi.array().items(Joi.string()).default([
  // Core Discord API handlers
  '/src/discord/handlers/auth.ts',
  '/src/discord/handlers/permission.ts',
  '/src/discord/handlers/message-routing.ts',
  
  // Essential safety validators
  '/src/self-editing/safety/safety-validator.ts',
  '/src/self-editing/safety/security-sandbox.ts',
  
  // Core system files
  '/src/index.ts',
  '/package.json',
  '/tsconfig.json',
]);

/**
 * Base configuration schema
 */
export const BaseConfigSchema = Joi.object({
  safetyLimits: SafetyLimitsSchema,
  permissionMatrix: PermissionMatrixSchema,
  immutablePaths: ImmutablePathsSchema,
  
  // System defaults
  defaults: Joi.object({
    modificationTimeout: Joi.number().default(30000),
    validationTimeout: Joi.number().default(10000),
    rollbackTimeout: Joi.number().default(5000),
    monitoringInterval: Joi.number().default(5000),
  }),
  
  // Environment settings
  environment: Joi.object({
    development: Joi.boolean().default(false),
    staging: Joi.boolean().default(false),
    production: Joi.boolean().default(true),
  }),
});

export interface SafetyLimits {
  maxModificationsPerHour: number;
  maxModificationsPerDay: number;
  maxMemoryUsageMB: number;
  maxCpuUsagePercent: number;
  maxExecutionTimeSeconds: number;
  maxCyclomaticComplexity: number;
  maxLinesPerModification: number;
  maxFilesPerModification: number;
  minTestCoveragePercent: number;
  requireIntegrationTests: boolean;
  requireE2ETests: boolean;
}

export interface PermissionMatrix {
  tier1: {
    responseStyle: boolean;
    configuration: boolean;
    toolParameters: boolean;
  };
  tier2: {
    behaviorPatterns: boolean;
    moduleUpdates: boolean;
    featureToggles: boolean;
  };
  tier3: {
    coreLogic: boolean;
    securitySettings: boolean;
    infrastructure: boolean;
  };
  tier4: {
    emergencyStop: boolean;
    forcedRollback: boolean;
    adminOverride: boolean;
  };
}

export interface BaseConfig {
  safetyLimits: SafetyLimits;
  permissionMatrix: PermissionMatrix;
  immutablePaths: string[];
  defaults: {
    modificationTimeout: number;
    validationTimeout: number;
    rollbackTimeout: number;
    monitoringInterval: number;
  };
  environment: {
    development: boolean;
    staging: boolean;
    production: boolean;
  };
}

/**
 * Default base configuration
 */
export const DEFAULT_BASE_CONFIG: BaseConfig = {
  safetyLimits: {
    maxModificationsPerHour: 10,
    maxModificationsPerDay: 50,
    maxMemoryUsageMB: 512,
    maxCpuUsagePercent: 50,
    maxExecutionTimeSeconds: 30,
    maxCyclomaticComplexity: 15,
    maxLinesPerModification: 200,
    maxFilesPerModification: 5,
    minTestCoveragePercent: 90,
    requireIntegrationTests: true,
    requireE2ETests: false,
  },
  permissionMatrix: {
    tier1: {
      responseStyle: true,
      configuration: true,
      toolParameters: true,
    },
    tier2: {
      behaviorPatterns: true,
      moduleUpdates: true,
      featureToggles: true,
    },
    tier3: {
      coreLogic: false,
      securitySettings: false,
      infrastructure: false,
    },
    tier4: {
      emergencyStop: true,
      forcedRollback: true,
      adminOverride: false,
    },
  },
  immutablePaths: [
    '/src/discord/handlers/auth.ts',
    '/src/discord/handlers/permission.ts',
    '/src/discord/handlers/message-routing.ts',
    '/src/self-editing/safety/safety-validator.ts',
    '/src/self-editing/safety/security-sandbox.ts',
    '/src/index.ts',
    '/package.json',
    '/tsconfig.json',
  ],
  defaults: {
    modificationTimeout: 30000,
    validationTimeout: 10000,
    rollbackTimeout: 5000,
    monitoringInterval: 5000,
  },
  environment: {
    development: false,
    staging: false,
    production: true,
  },
};

/**
 * Base configuration manager
 */
export class BaseConfigManager {
  private config: BaseConfig;

  constructor(config: Partial<BaseConfig> = {}) {
    const merged = { ...DEFAULT_BASE_CONFIG, ...config };
    const { error, value } = BaseConfigSchema.validate(merged);
    if (error) {
      throw new Error(`Invalid base configuration: ${error.message}`);
    }
    this.config = value;
  }

  getConfig(): BaseConfig {
    return { ...this.config };
  }

  getSafetyLimits(): SafetyLimits {
    return { ...this.config.safetyLimits };
  }

  getPermissionMatrix(): PermissionMatrix {
    return { ...this.config.permissionMatrix };
  }

  getImmutablePaths(): string[] {
    return [...this.config.immutablePaths];
  }

  isPathImmutable(path: string): boolean {
    return this.config.immutablePaths.some((immutablePath: string) => 
      path.startsWith(immutablePath) || immutablePath.startsWith(path)
    );
  }

  isOperationAllowed(tier: keyof PermissionMatrix, operation: string): boolean {
    return this.config.permissionMatrix[tier]?.[operation as keyof PermissionMatrix[typeof tier]] ?? false;
  }

  // Base config is immutable at runtime
  updateConfig(newConfig: Partial<BaseConfig>): never {
    throw new Error('Base configuration is immutable at runtime. Use runtime configuration for dynamic changes.');
  }
}

// Singleton instance
let baseConfigInstance: BaseConfigManager | null = null;

export function getBaseConfigManager(config?: Partial<BaseConfig>): BaseConfigManager {
  if (!baseConfigInstance) {
    baseConfigInstance = new BaseConfigManager(config);
  }
  return baseConfigInstance;
}
