/**
 * AI SDK Configuration Manager
 *
 * Manages AI SDK feature flags and configuration for hybrid AI integration.
 * Supports gradual rollout with configurable feature flags.
 */

import { Logger } from '../utils/logger';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import chokidar from 'chokidar';

/**
 * AI SDK Feature Flags
 * Controls which parts of the AI SDK are enabled
 */
export interface AISDKFeatureFlags {
  // Main flag to enable AI SDK
  useAISDK: boolean;

  // Use AI SDK for parameter validation (Zod schemas)
  useAISDKForValidation: boolean;

  // Use AI SDK for tool execution
  useAISDKForExecution: boolean;

  // Use AI SDK for provider creation
  useAISDKForProviders: boolean;

  // Use AI SDK for streaming responses
  useAISDKForStreaming: boolean;
}

/**
 * AI SDK Configuration
 */
export interface AISDKConfig {
  features: AISDKFeatureFlags;
  enableMultiStep: boolean;
  enableStreaming: boolean;
}

/**
 * AI SDK Configuration Manager
 */
export class AISDKConfigManager {
  private config: AISDKConfig;
  private logger: Logger;
  private configPath: string;
  private watchers: Map<string, (() => void)[]> = new Map();

  constructor(configPath?: string) {
    this.logger = new Logger('AISDKConfigManager');
    this.configPath = configPath || this.getDefaultConfigPath();
    this.config = this.loadConfiguration();
    this.setupFileWatching();
  }

  private getDefaultConfigPath(): string {
    const basePath = process.env.CONFIG_PATH || process.cwd();
    return resolve(basePath, 'ai-sdk.config.json');
  }

  /**
   * Load configuration from file and environment variables
   */
  private loadConfiguration(): AISDKConfig {
    const baseConfig: AISDKConfig = this.getDefaultConfig();

    // Load from file if exists
    const fileConfig = this.loadFromFile();
    if (fileConfig) {
      Object.assign(baseConfig, fileConfig);
    }

    // Override with environment variables
    const envOverrides = this.loadFromEnvironment();
    Object.assign(baseConfig, envOverrides);

    // Validate configuration
    this.validateConfiguration(baseConfig);

    return baseConfig;
  }

  /**
   * Load configuration from file
   */
  private loadFromFile(): Partial<AISDKConfig> | null {
    if (existsSync(this.configPath)) {
      try {
        const fileContent = readFileSync(this.configPath, 'utf8');
        const config = JSON.parse(fileContent);
        this.logger.info(`AI SDK configuration loaded from file: ${this.configPath}`);
        return config;
      } catch (error) {
        this.logger.error(`Failed to load AI SDK configuration from file: ${this.configPath}`, error as Error);
        return null;
      }
    }
    return null;
  }

  /**
   * Load configuration overrides from environment variables
   */
  private loadFromEnvironment(): Partial<AISDKConfig> {
    const overrides: Partial<AISDKConfig> = {
      features: {
        useAISDK: process.env.USE_AI_SDK === 'true',
        useAISDKForValidation: process.env.USE_AI_SDK_FOR_VALIDATION === 'true',
        useAISDKForExecution: process.env.USE_AI_SDK_FOR_EXECUTION === 'true',
        useAISDKForProviders: process.env.USE_AI_SDK_FOR_PROVIDERS === 'true',
        useAISDKForStreaming: process.env.USE_AI_SDK_FOR_STREAMING === 'true',
      },
    };

    return overrides;
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): AISDKConfig {
    return {
      features: {
        // All features default to false for backward compatibility
        useAISDK: false,
        useAISDKForValidation: false,
        useAISDKForExecution: false,
        useAISDKForProviders: false,
        useAISDKForStreaming: false,
      },
      enableMultiStep: false,
      enableStreaming: false,
    };
  }

  /**
   * Validate configuration values
   */
  private validateConfiguration(config: AISDKConfig): void {
    // Ensure all feature flags are boolean
    const featureFlags = config.features;
    if (typeof featureFlags.useAISDK !== 'boolean') {
      this.logger.warn('Invalid useAISDK value, defaulting to false');
      featureFlags.useAISDK = false;
    }
    if (typeof featureFlags.useAISDKForValidation !== 'boolean') {
      this.logger.warn('Invalid useAISDKForValidation value, defaulting to false');
      featureFlags.useAISDKForValidation = false;
    }
    if (typeof featureFlags.useAISDKForExecution !== 'boolean') {
      this.logger.warn('Invalid useAISDKForExecution value, defaulting to false');
      featureFlags.useAISDKForExecution = false;
    }
    if (typeof featureFlags.useAISDKForProviders !== 'boolean') {
      this.logger.warn('Invalid useAISDKForProviders value, defaulting to false');
      featureFlags.useAISDKForProviders = false;
    }
    if (typeof featureFlags.useAISDKForStreaming !== 'boolean') {
      this.logger.warn('Invalid useAISDKForStreaming value, defaulting to false');
      featureFlags.useAISDKForStreaming = false;
    }

    // Safety check: If useAISDK is false, all other flags should be false
    if (!featureFlags.useAISDK) {
      if (featureFlags.useAISDKForValidation) {
        this.logger.warn('useAISDK is false but useAISDKForValidation is true, setting useAISDKForValidation to false');
        featureFlags.useAISDKForValidation = false;
      }
      if (featureFlags.useAISDKForExecution) {
        this.logger.warn('useAISDK is false but useAISDKForExecution is true, setting useAISDKForExecution to false');
        featureFlags.useAISDKForExecution = false;
      }
      if (featureFlags.useAISDKForProviders) {
        this.logger.warn('useAISDK is false but useAISDKForProviders is true, setting useAISDKForProviders to false');
        featureFlags.useAISDKForProviders = false;
      }
      if (featureFlags.useAISDKForStreaming) {
        this.logger.warn('useAISDK is false but useAISDKForStreaming is true, setting useAISDKForStreaming to false');
        featureFlags.useAISDKForStreaming = false;
      }
    }
  }

  /**
   * Get configuration value by path
   */
  get<T = any>(path: string): T {
    const keys = path.split('.');
    let value: any = this.config;
    for (const key of keys) {
      value = value?.[key];
    }
    return value;
  }

  /**
   * Set configuration value by path
   */
  set(path: string, value: any): void {
    const keys = path.split('.');
    let current: any = this.config;
    for (const key of keys) {
      if (!current) current = {};
      current[key] = value;
    }
    this.config = current;
    this.saveConfiguration();
    this.notifyWatchers(path);
  }

  /**
   * Get full configuration
   */
  getConfiguration(): AISDKConfig {
    return { ...this.config };
  }

  /**
   * Get feature flags
   */
  getFeatureFlags(): AISDKFeatureFlags {
    return { ...this.config.features };
  }

  /**
   * Check if AI SDK is enabled
   */
  isEnabled(): boolean {
    return this.config.features.useAISDK;
  }

  /**
   * Check if AI SDK should be used for a specific operation
   */
  shouldUseAISDK(operation: 'validation' | 'execution' | 'providers' | 'streaming'): boolean {
    if (!this.config.features.useAISDK) {
      return false;
    }

    switch (operation) {
      case 'validation':
        return this.config.features.useAISDKForValidation;
      case 'execution':
        return this.config.features.useAISDKForExecution;
      case 'providers':
        return this.config.features.useAISDKForProviders;
      case 'streaming':
        return this.config.features.useAISDKForStreaming;
      default:
        return false;
    }
  }

  /**
   * Update configuration with partial values
   */
  updateConfiguration(updates: Partial<AISDKConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfiguration(this.config);
    this.saveConfiguration();
    this.notifyWatchers('config');
  }

  /**
   * Update feature flags
   */
  updateFeatureFlags(updates: Partial<AISDKFeatureFlags>): void {
    this.config.features = { ...this.config.features, ...updates };
    this.validateConfiguration(this.config);
    this.saveConfiguration();
    this.notifyWatchers('features');
  }

  /**
   * Reload configuration from file and environment
   */
  reload(): void {
    this.config = this.loadConfiguration();
    this.notifyWatchers();
  }

  /**
   * Save configuration to file
   */
  saveConfiguration(): void {
    try {
      const configData = JSON.stringify(this.config, null, 2);
      writeFileSync(this.configPath, configData, 'utf8');
      this.logger.info(`AI SDK configuration saved to: ${this.configPath}`);
    } catch (error) {
      this.logger.error('Failed to save AI SDK configuration:', error as Error);
    }
  }

  /**
   * Watch configuration changes
   */
  watch(path: string, callback: () => void): () => void {
    if (!this.watchers.has(path)) {
      this.watchers.set(path, []);
    }
    this.watchers.get(path)!.push(callback);

    return () => {
      const callbacks = this.watchers.get(path);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
        if (callbacks.length === 0) {
          this.watchers.delete(path);
        }
      }
    };
  }

  /**
   * Setup file watching for hot-reloading
   */
  private setupFileWatching(): void {
    try {
      // Check if chokidar is available
      if (typeof chokidar === 'undefined' || chokidar === null) {
        this.logger.warn('chokidar is not available, file watching disabled');
        return;
      }

      const watcher = chokidar.watch(this.configPath);

      watcher.on('change', () => {
        this.logger.info('AI SDK configuration file changed, reloading...');
        this.reload();
      });

      watcher.on('error', (error: any) => {
        this.logger.error('AI SDK configuration file watcher error:', error);
      });
    } catch (error) {
      this.logger.error('Failed to setup file watching for AI SDK configuration:', error as Error);
      // Continue without file watching - config will still work, just won't auto-reload
    }
  }

  /**
   * Notify all watchers of configuration changes
   */
  private notifyWatchers(path?: string): void {
    const pathsToNotify = path ? [path] : Array.from(this.watchers.keys());

    for (const watchPath of pathsToNotify) {
      const callbacks = this.watchers.get(watchPath);
      if (callbacks) {
        for (const callback of callbacks) {
          try {
            callback();
          } catch (error) {
            this.logger.error(`AI SDK configuration watcher callback error for ${watchPath}:`, error as Error);
          }
        }
      }
    }
  }
}

// Singleton instance
export const aiSDKConfigManager = new AISDKConfigManager();
