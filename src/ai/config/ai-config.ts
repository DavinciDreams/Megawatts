/**
 * AI Configuration
 * 
 * This module implements AI provider configurations,
 * model selection and routing configuration, and safety settings.
 */

import { 
  AIConfig,
  AIProviderConfig,
  ModelConfig,
  RoutingConfig,
  SafetyConfig,
  LearningConfig,
  ToolsConfig,
  ModelType,
  SafetyType
} from '../../types/ai';
import { Logger } from '../../utils/logger';

// ============================================================================
// AI CONFIGURATION MANAGER CLASS
// ============================================================================

export class AIConfigManager {
  private logger: Logger;
  private config: AIConfig;
  private configPath: string;
  private watchers: Map<string, Function> = new Map();

  constructor(configPath: string, logger: Logger) {
    this.logger = logger;
    this.configPath = configPath;
    this.config = this.loadDefaultConfig();
    this.watchForChanges();
  }

  /**
   * Get current AI configuration
   */
  getConfig(): AIConfig {
    return this.config;
  }

  /**
   * Update AI configuration
   */
  async updateConfig(updates: Partial<AIConfig>): Promise<void> {
    try {
      // Validate updates
      this.validateConfigUpdates(updates);
      
      // Apply updates
      this.config = { ...this.config, ...updates };
      
      // Save to file
      await this.saveConfig();
      
      // Notify watchers
      this.notifyWatchers('config_updated', this.config);
      
      this.logger.info('AI configuration updated', {
        updates: Object.keys(updates)
      });

    } catch (error) {
      this.logger.error('Failed to update AI configuration', error as Error);
      throw error;
    }
  }

  /**
   * Reset configuration to defaults
   */
  async resetConfig(): Promise<void> {
    this.config = this.loadDefaultConfig();
    await this.saveConfig();
    this.notifyWatchers('config_reset', this.config);
    
    this.logger.info('AI configuration reset to defaults');
  }

  /**
   * Get provider configuration
   */
  getProviderConfig(providerName: string): AIProviderConfig | undefined {
    return this.config.providers.find(p => p.name === providerName);
  }

  /**
   * Update provider configuration
   */
  async updateProviderConfig(
    providerName: string, 
    updates: Partial<AIProviderConfig>
  ): Promise<void> {
    const providerIndex = this.config.providers.findIndex(p => p.name === providerName);
    if (providerIndex === -1) {
      throw new Error(`Provider ${providerName} not found`);
    }

    this.config.providers[providerIndex] = { 
      ...this.config.providers[providerIndex], 
      ...updates 
    };
    
    await this.saveConfig();
    this.notifyWatchers('provider_updated', { provider: providerName, updates });
  }

  /**
   * Get model configuration
   */
  getModelConfig(modelName: string): ModelConfig | undefined {
    return this.config.models.find(m => m.name === modelName);
  }

  /**
   * Update model configuration
   */
  async updateModelConfig(
    modelName: string, 
    updates: Partial<ModelConfig>
  ): Promise<void> {
    const modelIndex = this.config.models.findIndex(m => m.name === modelName);
    if (modelIndex === -1) {
      throw new Error(`Model ${modelName} not found`);
    }

    this.config.models[modelIndex] = { 
      ...this.config.models[modelIndex], 
      ...updates 
    };
    
    await this.saveConfig();
    this.notifyWatchers('model_updated', { model: modelName, updates });
  }

  /**
   * Get routing configuration
   */
  getRoutingConfig(): RoutingConfig {
    return this.config.routing;
  }

  /**
   * Update routing configuration
   */
  async updateRoutingConfig(updates: Partial<RoutingConfig>): Promise<void> {
    this.config.routing = { ...this.config.routing, ...updates };
    await this.saveConfig();
    this.notifyWatchers('routing_updated', updates);
  }

  /**
   * Get safety configuration
   */
  getSafetyConfig(): SafetyConfig {
    return this.config.safety;
  }

  /**
   * Update safety configuration
   */
  async updateSafetyConfig(updates: Partial<SafetyConfig>): Promise<void> {
    this.config.safety = { ...this.config.safety, ...updates };
    await this.saveConfig();
    this.notifyWatchers('safety_updated', updates);
  }

  /**
   * Get learning configuration
   */
  getLearningConfig(): LearningConfig {
    return this.config.learning;
  }

  /**
   * Update learning configuration
   */
  async updateLearningConfig(updates: Partial<LearningConfig>): Promise<void> {
    this.config.learning = { ...this.config.learning, ...updates };
    await this.saveConfig();
    this.notifyWatchers('learning_updated', updates);
  }

  /**
   * Get tools configuration
   */
  getToolsConfig(): ToolsConfig {
    return this.config.tools;
  }

  /**
   * Update tools configuration
   */
  async updateToolsConfig(updates: Partial<ToolsConfig>): Promise<void> {
    this.config.tools = { ...this.config.tools, ...updates };
    await this.saveConfig();
    this.notifyWatchers('tools_updated', updates);
  }

  /**
   * Add configuration watcher
   */
  addWatcher(event: string, callback: Function): void {
    this.watchers.set(event, callback);
  }

  /**
   * Remove configuration watcher
   */
  removeWatcher(event: string): void {
    this.watchers.delete(event);
  }

  /**
   * Validate configuration updates
   */
  private validateConfigUpdates(updates: Partial<AIConfig>): void {
    // Validate provider configurations
    if (updates.providers) {
      for (const provider of updates.providers) {
        this.validateProviderConfig(provider);
      }
    }

    // Validate model configurations
    if (updates.models) {
      for (const model of updates.models) {
        this.validateModelConfig(model);
      }
    }

    // Validate routing configuration
    if (updates.routing) {
      this.validateRoutingConfig(updates.routing);
    }

    // Validate safety configuration
    if (updates.safety) {
      this.validateSafetyConfig(updates.safety);
    }

    // Validate learning configuration
    if (updates.learning) {
      this.validateLearningConfig(updates.learning);
    }

    // Validate tools configuration
    if (updates.tools) {
      this.validateToolsConfig(updates.tools);
    }
  }

  /**
   * Validate provider configuration
   */
  private validateProviderConfig(config: AIProviderConfig): void {
    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Provider name is required and must be a string');
    }

    if (!config.type || !['openai', 'anthropic', 'local', 'custom'].includes(config.type)) {
      throw new Error('Provider type must be one of: openai, anthropic, local, custom');
    }

    if (config.timeout && (typeof config.timeout !== 'number' || config.timeout < 1000 || config.timeout > 300000)) {
      throw new Error('Provider timeout must be between 1000ms and 300000ms');
    }

    if (config.retries && (typeof config.retries !== 'number' || config.retries < 0 || config.retries > 10)) {
      throw new Error('Provider retries must be between 0 and 10');
    }
  }

  /**
   * Validate model configuration
   */
  private validateModelConfig(config: ModelConfig): void {
    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Model name is required and must be a string');
    }

    if (!config.provider || typeof config.provider !== 'string') {
      throw new Error('Model provider is required and must be a string');
    }

    if (!config.type || !Object.values(ModelType).includes(config.type)) {
      throw new Error('Model type must be a valid ModelType');
    }

    if (config.parameters) {
      if (typeof config.parameters.temperature !== 'number' || 
          config.parameters.temperature < 0 || config.parameters.temperature > 2) {
        throw new Error('Model temperature must be between 0 and 2');
      }

      if (typeof config.parameters.maxTokens !== 'number' || 
          config.parameters.maxTokens < 1 || config.parameters.maxTokens > 32000) {
        throw new Error('Model maxTokens must be between 1 and 32000');
      }

      if (typeof config.parameters.topP !== 'number' || 
          config.parameters.topP < 0 || config.parameters.topP > 1) {
        throw new Error('Model topP must be between 0 and 1');
      }
    }
  }

  /**
   * Validate routing configuration
   */
  private validateRoutingConfig(config: RoutingConfig): void {
    if (!config.strategy || !['round_robin', 'load_balanced', 'capability_based', 'cost_optimized'].includes(config.strategy)) {
      throw new Error('Routing strategy must be one of: round_robin, load_balanced, capability_based, cost_optimized');
    }

    if (config.fallback && typeof config.fallback.enabled !== 'boolean') {
      throw new Error('Routing fallback enabled must be a boolean');
    }

    if (config.fallback && config.fallback.threshold && 
        (typeof config.fallback.threshold !== 'number' || 
         config.fallback.threshold < 0 || config.fallback.threshold > 1)) {
      throw new Error('Routing fallback threshold must be between 0 and 1');
    }
  }

  /**
   * Validate safety configuration
   */
  private validateSafetyConfig(config: SafetyConfig): void {
    if (typeof config.enabled !== 'boolean') {
      throw new Error('Safety enabled must be a boolean');
    }

    if (config.enabled && config.level && !['strict', 'moderate', 'relaxed'].includes(config.level)) {
      throw new Error('Safety level must be one of: strict, moderate, relaxed');
    }

    if (config.enabled && config.categories && !Array.isArray(config.categories)) {
      throw new Error('Safety categories must be an array');
    }
  }

  /**
   * Validate learning configuration
   */
  private validateLearningConfig(config: LearningConfig): void {
    if (typeof config.enabled !== 'boolean') {
      throw new Error('Learning enabled must be a boolean');
    }

    if (config.enabled && config.dataRetention && 
        (typeof config.dataRetention !== 'number' || config.dataRetention < 86400000)) { // 1 day minimum
      throw new Error('Learning data retention must be at least 1 day (86400000ms)');
    }

    if (config.enabled && config.adaptation && 
        (!config.adaptation.enabled || typeof config.adaptation.enabled !== 'boolean')) {
      throw new Error('Learning adaptation enabled must be a boolean');
    }

    if (config.enabled && config.adaptation && config.adaptation.threshold && 
        (typeof config.adaptation.threshold !== 'number' || 
         config.adaptation.threshold < 0 || config.adaptation.threshold > 1)) {
      throw new Error('Learning adaptation threshold must be between 0 and 1');
    }
  }

  /**
   * Validate tools configuration
   */
  private validateToolsConfig(config: ToolsConfig): void {
    if (typeof config.enabled !== 'boolean') {
      throw new Error('Tools enabled must be a boolean');
    }

    if (config.enabled && config.sandbox && 
        (!config.sandbox.enabled || typeof config.sandbox.enabled !== 'boolean')) {
      throw new Error('Tools sandbox enabled must be a boolean');
    }

    if (config.enabled && config.sandbox && config.sandbox.timeout && 
        (typeof config.sandbox.timeout !== 'number' || config.sandbox.timeout < 1000)) {
      throw new Error('Tools sandbox timeout must be at least 1000ms');
    }
  }

  /**
   * Load default configuration
   */
  private loadDefaultConfig(): AIConfig {
    return {
      providers: [
        {
          name: 'openai',
          type: 'openai',
          baseURL: 'https://api.openai.com/v1',
          timeout: 30000,
          retries: 3,
          rateLimit: {
            requestsPerMinute: 60,
            tokensPerMinute: 90000,
            concurrentRequests: 5
          },
          fallback: {
            enabled: true,
            providers: ['anthropic'],
            threshold: 0.8
          }
        },
        {
          name: 'anthropic',
          type: 'anthropic',
          baseURL: 'https://api.anthropic.com',
          timeout: 30000,
          retries: 3,
          rateLimit: {
            requestsPerMinute: 50,
            tokensPerMinute: 40000,
            concurrentRequests: 3
          },
          fallback: {
            enabled: true,
            providers: ['openai'],
            threshold: 0.7
          }
        }
      ],
      models: [
        {
          name: 'gpt-4-turbo',
          provider: 'openai',
          type: 'gpt-4-turbo',
          capabilities: [
            { name: 'text', supported: true, quality: 0.95, cost: 1.0 },
            { name: 'function_calling', supported: true, quality: 0.90, cost: 1.2 },
            { name: 'code_generation', supported: true, quality: 0.85, cost: 1.1 }
          ],
          parameters: {
            temperature: 0.7,
            maxTokens: 4096,
            topP: 0.9,
            frequencyPenalty: 0.0,
            presencePenalty: 0.0
          },
          usage: {
            maxRequests: 1000,
            maxTokens: 100000,
            rateLimit: {
              requestsPerMinute: 60,
              tokensPerMinute: 90000,
              concurrentRequests: 5
            },
            costLimit: 10.0
          }
        },
        {
          name: 'claude-3-sonnet',
          provider: 'anthropic',
          type: 'claude-3-sonnet',
          capabilities: [
            { name: 'text', supported: true, quality: 0.93, cost: 0.8 },
            { name: 'function_calling', supported: true, quality: 0.88, cost: 1.0 },
            { name: 'code_generation', supported: true, quality: 0.82, cost: 0.9 }
          ],
          parameters: {
            temperature: 0.7,
            maxTokens: 4096,
            topP: 0.8,
            frequencyPenalty: 0.0,
            presencePenalty: 0.0
          },
          usage: {
            maxRequests: 500,
            maxTokens: 50000,
            rateLimit: {
              requestsPerMinute: 50,
              tokensPerMinute: 40000,
              concurrentRequests: 3
            },
            costLimit: 8.0
          }
        }
      ],
      routing: {
        strategy: 'capability_based',
        fallback: {
          enabled: true,
          providers: ['openai', 'anthropic'],
          threshold: 0.7
        },
        healthCheck: {
          enabled: true,
          interval: 30000, // 30 seconds
          timeout: 5000,
          retries: 3
        }
      },
      safety: {
        enabled: true,
        level: 'moderate',
        categories: ['toxicity', 'violence', 'self_harm', 'sexual_content', 'hate_speech', 'personal_info'],
        actions: [
          {
            type: 'delete',
            reason: 'Inappropriate content',
            automated: true
          },
          {
            type: 'warn',
            reason: 'Potentially inappropriate content',
            automated: true
          }
        ],
        monitoring: true
      },
      learning: {
        enabled: true,
        algorithms: ['pattern_recognition', 'preference_adaptation', 'performance_optimization'],
        dataRetention: 2592000000, // 30 days
        privacy: true,
        adaptation: {
          enabled: true,
          threshold: 0.8,
          frequency: 'batch',
          scope: 'individual'
        }
      },
      tools: {
        enabled: true,
        registry: 'default',
        permissions: {
          default: ['read', 'write'],
          restricted: ['admin', 'moderation'],
          dangerous: ['system', 'database'],
          custom: {}
        },
        sandbox: {
          enabled: true,
          timeout: 30000,
          memory: 512,
          network: false,
          filesystem: false
        },
        monitoring: {
          enabled: true,
          logging: true,
          metrics: true,
          alerts: true
        }
      }
    };
  }

  /**
   * Save configuration to file
   */
  private async saveConfig(): Promise<void> {
    try {
      // In a real implementation, this would save to file system
      // For now, just log the save
      this.logger.info('AI configuration saved', {
        configPath: this.configPath
      });
    } catch (error) {
      this.logger.error('Failed to save AI configuration', error as Error);
      throw error;
    }
  }

  /**
   * Watch for configuration changes
   */
  private watchForChanges(): void {
    // In a real implementation, this would watch the config file
    // For now, just log that watching is enabled
    this.logger.info('Configuration watching enabled', {
      configPath: this.configPath
    });
  }

  /**
   * Notify configuration watchers
   */
  private notifyWatchers(event: string, data: any): void {
    for (const [watcherEvent, callback] of this.watchers) {
      if (watcherEvent === event) {
        try {
          callback(data);
        } catch (error) {
          this.logger.error('Configuration watcher error', error as Error);
        }
      }
    }
  }
}

// ============================================================================
// CONFIGURATION VALIDATOR CLASS
// ============================================================================

export class ConfigValidator {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Validate complete AI configuration
   */
  validateConfig(config: AIConfig): ValidationResult {
    const errors: string[] = [];

    try {
      // Validate providers
      if (!config.providers || !Array.isArray(config.providers)) {
        errors.push('Providers must be an array');
      }

      // Validate models
      if (!config.models || !Array.isArray(config.models)) {
        errors.push('Models must be an array');
      }

      // Validate routing
      if (!config.routing) {
        errors.push('Routing configuration is required');
      }

      // Validate safety
      if (!config.safety) {
        errors.push('Safety configuration is required');
      }

      // Validate learning
      if (!config.learning) {
        errors.push('Learning configuration is required');
      }

      // Validate tools
      if (!config.tools) {
        errors.push('Tools configuration is required');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings: []
      };

    } catch (error) {
      this.logger.error('Configuration validation failed', error as Error);
      
      return {
        valid: false,
        errors: [`Validation error: ${(error as Error).message}`],
        warnings: []
      };
    }
  }

  /**
   * Validate provider configuration
   */
  validateProviderConfig(config: AIProviderConfig): string[] {
    const errors: string[] = [];

    if (!config.name) {
      errors.push('Provider name is required');
    }

    if (!config.type) {
      errors.push('Provider type is required');
    }

    if (config.timeout && (config.timeout < 1000 || config.timeout > 300000)) {
      errors.push('Provider timeout must be between 1000ms and 300000ms');
    }

    return errors;
  }

  /**
   * Validate model configuration
   */
  validateModelConfig(config: ModelConfig): string[] {
    const errors: string[] = [];

    if (!config.name) {
      errors.push('Model name is required');
    }

    if (!config.type) {
      errors.push('Model type is required');
    }

    if (config.parameters?.temperature && (config.parameters.temperature < 0 || config.parameters.temperature > 2)) {
      errors.push('Model temperature must be between 0 and 2');
    }

    return errors;
  }
}

// ============================================================================
// SUPPORTING INTERFACES
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigExportOptions {
  includeSecrets?: boolean;
  format?: 'json' | 'yaml' | 'env';
  encrypt?: boolean;
}

export interface ConfigImportOptions {
  mergeWithExisting?: boolean;
  validateOnImport?: boolean;
  backupExisting?: boolean;
}