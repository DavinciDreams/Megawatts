/**
 * Feature Flags System
 * 
 * Provides granular control over self-editing capabilities and features.
 * Allows safe testing of new features and emergency feature disabling.
 */

import Joi from 'joi';
import { getRuntimeConfigManager } from './runtime-config.js';

/**
 * Feature flag categories
 */
export enum FeatureCategory {
  SAFETY = 'safety',
  PERFORMANCE = 'performance',
  EXPERIMENTAL = 'experimental',
  MONITORING = 'monitoring',
  MODIFICATION = 'modification',
}

/**
 * Feature flag definition
 */
export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  category: FeatureCategory;
  enabled: boolean;
  requiresApproval: boolean;
  dependencies?: string[];
}

/**
 * Feature flag schema
 */
export const FeatureFlagSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  description: Joi.string().required(),
  category: Joi.string().valid(...Object.values(FeatureCategory)).required(),
  enabled: Joi.boolean().default(false),
  requiresApproval: Joi.boolean().default(true),
  dependencies: Joi.array().items(Joi.string()).default([]),
});

/**
 * Default feature flags
 */
export const DEFAULT_FEATURE_FLAGS: Record<string, FeatureFlag> = {
  // Safety features
  'auto-rollback': {
    id: 'auto-rollback',
    name: 'Automatic Rollback',
    description: 'Automatically roll back modifications that cause failures',
    category: FeatureCategory.SAFETY,
    enabled: true,
    requiresApproval: false,
  },
  'modification-quota': {
    id: 'modification-quota',
    name: 'Modification Quota',
    description: 'Enforce rate limits on self-modification operations',
    category: FeatureCategory.SAFETY,
    enabled: true,
    requiresApproval: false,
  },
  'safety-validation': {
    id: 'safety-validation',
    name: 'Safety Validation',
    description: 'Run comprehensive safety checks before applying modifications',
    category: FeatureCategory.SAFETY,
    enabled: true,
    requiresApproval: false,
  },

  // Performance features
  'hot-reload': {
    id: 'hot-reload',
    name: 'Hot Module Reload',
    description: 'Reload modified modules without restarting the bot',
    category: FeatureCategory.PERFORMANCE,
    enabled: true,
    requiresApproval: false,
  },
  'performance-optimization': {
    id: 'performance-optimization',
    name: 'Performance Optimization',
    description: 'Automatically optimize code for better performance',
    category: FeatureCategory.PERFORMANCE,
    enabled: true,
    requiresApproval: true,
  },
  'caching': {
    id: 'caching',
    name: 'Response Caching',
    description: 'Cache frequently used responses and computations',
    category: FeatureCategory.PERFORMANCE,
    enabled: true,
    requiresApproval: false,
  },

  // Monitoring features
  'self-monitoring': {
    id: 'self-monitoring',
    name: 'Self-Monitoring',
    description: 'Monitor bot health and performance metrics',
    category: FeatureCategory.MONITORING,
    enabled: true,
    requiresApproval: false,
  },
  'anomaly-detection': {
    id: 'anomaly-detection',
    name: 'Anomaly Detection',
    description: 'Detect unusual behavior patterns and alert',
    category: FeatureCategory.MONITORING,
    enabled: true,
    requiresApproval: true,
  },
  'performance-profiling': {
    id: 'performance-profiling',
    name: 'Performance Profiling',
    description: 'Profile code execution for performance analysis',
    category: FeatureCategory.MONITORING,
    enabled: true,
    requiresApproval: false,
  },

  // Modification features
  'ai-suggestions': {
    id: 'ai-suggestions',
    name: 'AI-Powered Suggestions',
    description: 'Use AI to suggest code improvements',
    category: FeatureCategory.MODIFICATION,
    enabled: true,
    requiresApproval: true,
  },
  'self-healing': {
    id: 'self-healing',
    name: 'Self-Healing',
    description: 'Automatically fix detected issues',
    category: FeatureCategory.MODIFICATION,
    enabled: true,
    requiresApproval: true,
  },

  // Experimental features (disabled by default)
  'autonomous-learning': {
    id: 'autonomous-learning',
    name: 'Autonomous Learning',
    description: 'Allow bot to learn from interactions and adapt behavior',
    category: FeatureCategory.EXPERIMENTAL,
    enabled: false,
    requiresApproval: true,
  },
  'code-generation': {
    id: 'code-generation',
    name: 'Autonomous Code Generation',
    description: 'Generate new code modules automatically',
    category: FeatureCategory.EXPERIMENTAL,
    enabled: false,
    requiresApproval: true,
  },
  'plugin-auto-discovery': {
    id: 'plugin-auto-discovery',
    name: 'Plugin Auto-Discovery',
    description: 'Automatically discover and install compatible plugins',
    category: FeatureCategory.EXPERIMENTAL,
    enabled: false,
    requiresApproval: true,
  },
};

/**
 * Feature flags manager
 */
export class FeatureFlagsManager {
  private flags: Map<string, FeatureFlag>;
  private listeners: Set<(flagId: string, enabled: boolean) => void> = new Set();

  constructor(customFlags?: Record<string, Partial<FeatureFlag>>) {
    this.flags = new Map();
    
    // Initialize with default flags
    for (const [id, flag] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
      const customFlag = customFlags?.[id];
      this.flags.set(id, {
        ...flag,
        ...customFlag,
      });
    }
  }

  /**
   * Get all feature flags
   */
  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  /**
   * Get feature flags by category
   */
  getFlagsByCategory(category: FeatureCategory): FeatureFlag[] {
    return this.getAllFlags().filter(flag => flag.category === category);
  }

  /**
   * Get a specific feature flag
   */
  getFlag(id: string): FeatureFlag | undefined {
    return this.flags.get(id);
  }

  /**
   * Check if a feature is enabled
   */
  isEnabled(id: string): boolean {
    const flag = this.flags.get(id);
    if (!flag) {
      return false;
    }

    // Check dependencies
    if (flag.dependencies) {
      for (const depId of flag.dependencies) {
        if (!this.isEnabled(depId)) {
          return false;
        }
      }
    }

    return flag.enabled;
  }

  /**
   * Enable a feature flag
   */
  async enable(id: string, approved: boolean = false): Promise<void> {
    const flag = this.flags.get(id);
    if (!flag) {
      throw new Error(`Feature flag not found: ${id}`);
    }

    if (flag.requiresApproval && !approved) {
      throw new Error(`Feature flag requires approval: ${id}`);
    }

    // Check dependencies
    if (flag.dependencies) {
      for (const depId of flag.dependencies) {
        if (!this.isEnabled(depId)) {
          throw new Error(`Cannot enable ${id}: dependency ${depId} is not enabled`);
        }
      }
    }

    flag.enabled = true;
    this.flags.set(id, flag);
    this.notifyListeners(id, true);
  }

  /**
   * Disable a feature flag
   */
  async disable(id: string): Promise<void> {
    const flag = this.flags.get(id);
    if (!flag) {
      throw new Error(`Feature flag not found: ${id}`);
    }

    // Check if other features depend on this one
    for (const [otherId, otherFlag] of this.flags.entries()) {
      if (otherFlag.enabled && otherFlag.dependencies?.includes(id)) {
        throw new Error(`Cannot disable ${id}: feature ${otherId} depends on it`);
      }
    }

    flag.enabled = false;
    this.flags.set(id, flag);
    this.notifyListeners(id, false);
  }

  /**
   * Toggle a feature flag
   */
  async toggle(id: string, approved: boolean = false): Promise<void> {
    if (this.isEnabled(id)) {
      await this.disable(id);
    } else {
      await this.enable(id, approved);
    }
  }

  /**
   * Register a new feature flag
   */
  register(flag: FeatureFlag): void {
    const { error } = FeatureFlagSchema.validate(flag);
    if (error) {
      throw new Error(`Invalid feature flag: ${error.message}`);
    }
    this.flags.set(flag.id, flag);
  }

  /**
   * Unregister a feature flag
   */
  unregister(id: string): void {
    this.flags.delete(id);
  }

  /**
   * Reset all flags to defaults
   */
  resetToDefaults(): void {
    this.flags.clear();
    for (const [id, flag] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
      this.flags.set(id, { ...flag });
    }
  }

  /**
   * Get enabled experimental features
   */
  getEnabledExperimentalFeatures(): FeatureFlag[] {
    return this.getFlagsByCategory(FeatureCategory.EXPERIMENTAL).filter(f => f.enabled);
  }

  /**
   * Get all enabled features
   */
  getEnabledFeatures(): FeatureFlag[] {
    return this.getAllFlags().filter(f => f.enabled);
  }

  /**
   * Subscribe to feature flag changes
   */
  onChange(listener: (flagId: string, enabled: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(flagId: string, enabled: boolean): void {
    for (const listener of this.listeners) {
      try {
        listener(flagId, enabled);
      } catch (error) {
        console.error('Error notifying feature flag listener:', error);
      }
    }
  }
}

// Singleton instance
let featureFlagsInstance: FeatureFlagsManager | null = null;

export function getFeatureFlagsManager(customFlags?: Record<string, Partial<FeatureFlag>>): FeatureFlagsManager {
  if (!featureFlagsInstance) {
    featureFlagsInstance = new FeatureFlagsManager(customFlags);
  }
  return featureFlagsInstance;
}

/**
 * Convenience function to check if a feature is enabled
 */
export function isFeatureEnabled(id: string): boolean {
  return getFeatureFlagsManager().isEnabled(id);
}

/**
 * Convenience function to enable a feature
 */
export async function enableFeature(id: string, approved: boolean = false): Promise<void> {
  await getFeatureFlagsManager().enable(id, approved);
}

/**
 * Convenience function to disable a feature
 */
export async function disableFeature(id: string): Promise<void> {
  await getFeatureFlagsManager().disable(id);
}
