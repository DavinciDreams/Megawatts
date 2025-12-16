/**
 * AI Model Selector
 * 
 * This module implements intelligent model selection based on request characteristics,
 * user preferences, cost optimization, and provider availability.
 */

import {
  AIProvider,
  AIModel,
  ModelCapability,
  RoutingStrategy,
  RoutingRule,
  RoutingCondition,
  RoutingAction,
  Intent,
  Priority,
  LoadBalancingConfig,
  HealthCheckConfig
} from '../../types/ai';
import { AIRequest } from './ai-provider';
import { Logger } from '../../utils/logger';
import { BaseAIProvider } from './ai-provider';

// ============================================================================
// INTERFACES
// ============================================================================

export interface ModelSelectorConfig {
  routing: {
    strategy: RoutingStrategy;
    rules: RoutingRule[];
    loadBalancing: LoadBalancingConfig;
    healthCheck: HealthCheckConfig;
  };
  logger: Logger;
}

export interface ProviderHealth {
  isHealthy: boolean;
  lastCheck: Date;
  responseTime: number;
  errorRate: number;
  consecutiveFailures: number;
  lastError?: Error;
}

export interface UsageStats {
  requestCount: number;
  successCount: number;
  errorCount: number;
  averageResponseTime: number;
  lastUsed: Date;
  cost: number;
}

// ============================================================================
// MODEL SELECTOR CLASS
// ============================================================================

export class ModelSelector {
  private providers: Map<string, BaseAIProvider> = new Map();
  private routingRules: RoutingRule[] = [];
  private loadBalancingConfig: LoadBalancingConfig;
  private healthCheckConfig: HealthCheckConfig;
  private logger: Logger;
  private providerHealth: Map<string, ProviderHealth> = new Map();
  private usageStats: Map<string, UsageStats> = new Map();

  constructor(
    providers: BaseAIProvider[],
    config: ModelSelectorConfig
  ) {
    this.logger = config.logger;
    this.loadBalancingConfig = config.routing.loadBalancing;
    this.healthCheckConfig = config.routing.healthCheck;
    this.routingRules = config.routing.rules;

    // Initialize providers
    for (const provider of providers) {
      this.providers.set(provider.getProviderInfo().id, provider);
      this.usageStats.set(provider.getProviderInfo().id, {
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        averageResponseTime: 0,
        lastUsed: new Date(),
        cost: 0
      });
    }

    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Select the best model for a given request
   */
  async selectModel(request: ModelSelectionRequest): Promise<ModelSelectionResult> {
    try {
      // Apply routing rules first
      const routingResult = this.applyRoutingRules(request);
      if (routingResult.forcedSelection) {
        return await this.validateAndReturnSelection(routingResult.forcedSelection, request);
      }

      // Get available models
      const availableModels = await this.getAvailableModels();
      if (availableModels.length === 0) {
        throw new Error('No available models found');
      }

      // Filter models based on request requirements
      const suitableModels = this.filterSuitableModels(availableModels, request);
      if (suitableModels.length === 0) {
        throw new Error('No suitable models found for request requirements');
      }

      // Apply selection strategy
      const selectedModel = this.applySelectionStrategy(suitableModels, request);
      
      // Update usage stats
      this.updateUsageStats(selectedModel.providerId, selectedModel.modelId);

      return {
        model: selectedModel,
        provider: this.providers.get(selectedModel.providerId)!,
        confidence: this.calculateSelectionConfidence(selectedModel, request),
        reasoning: this.getSelectionReasoning(selectedModel, request),
        alternatives: this.getAlternativeModels(suitableModels, selectedModel, 3)
      };

    } catch (error) {
      this.logger.error('Model selection failed', error as Error);
      throw error;
    }
  }

  /**
   * Get all available models from healthy providers
   */
  private async getAvailableModels(): Promise<AvailableModel[]> {
    const availableModels: AvailableModel[] = [];

    for (const [providerId, provider] of Array.from(this.providers.entries())) {
      const health = this.providerHealth.get(providerId);
      if (!health || !health.isHealthy) {
        continue;
      }

      try {
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          this.updateProviderHealth(providerId, false, 'Provider unavailable');
          continue;
        }

        const models = provider.getAvailableModels();
        for (const model of models) {
          availableModels.push({
            modelId: model.id,
            providerId,
            model,
            capabilities: model.capabilities,
            costPerToken: model.costPerToken,
            maxTokens: model.maxTokens,
            contextWindow: model.contextWindow,
            isDefault: model.isDefault || false
          });
        }

        this.updateProviderHealth(providerId, true);

      } catch (error) {
        this.logger.error(`Health check failed for provider ${providerId}`, error as Error);
        this.updateProviderHealth(providerId, false, 'Health check failed');
      }
    }

    return availableModels;
  }

  /**
   * Apply routing rules to determine forced selection
   */
  private applyRoutingRules(request: ModelSelectionRequest): RoutingResult {
    for (const rule of this.routingRules) {
      if (!rule.enabled) continue;

      const matches = this.evaluateRoutingCondition(rule.condition, request);
      if (matches) {
        const providerId = rule.action.provider;
        if (providerId) {
          const provider = this.providers.get(providerId);
          if (provider) {
            const model = rule.action.model
              ? provider.getAvailableModels().find(m => m.id === rule.action.model)
              : provider.getAvailableModels().find(m => m.isDefault);

            if (model) {
              return {
                forcedSelection: {
                  modelId: model.id,
                  providerId: providerId,
                  model,
                  capabilities: model.capabilities,
                  costPerToken: model.costPerToken,
                  maxTokens: model.maxTokens,
                  contextWindow: model.contextWindow,
                  isDefault: model.isDefault || false
                },
                appliedRule: rule
              };
            }
          }
        }
      }
    }

    return { forcedSelection: null, appliedRule: null };
  }

  /**
   * Evaluate routing condition
   */
  private evaluateRoutingCondition(condition: RoutingCondition, request: ModelSelectionRequest): boolean {
    switch (condition.type) {
      case 'intent':
        return this.evaluateIntentCondition(condition, request);
      case 'user':
        return this.evaluateUserCondition(condition, request);
      case 'guild':
        return this.evaluateGuildCondition(condition, request);
      case 'time':
        return this.evaluateTimeCondition(condition, request);
      case 'load':
        return this.evaluateLoadCondition(condition, request);
      case 'custom':
        return this.evaluateCustomCondition(condition, request);
      default:
        return false;
    }
  }

  /**
   * Filter models based on request requirements
   */
  private filterSuitableModels(models: AvailableModel[], request: ModelSelectionRequest): AvailableModel[] {
    return models.filter(model => {
      // Check capability requirements
      if (request.requiredCapabilities) {
        const hasAllCapabilities = request.requiredCapabilities.every(reqCap =>
          model.capabilities.some(cap => cap.name === reqCap && cap.supported)
        );
        if (!hasAllCapabilities) return false;
      }

      // Check token requirements
      if (request.maxTokens && model.maxTokens < request.maxTokens) {
        return false;
      }

      // Check context window requirements
      if (request.contextWindow && model.contextWindow < request.contextWindow) {
        return false;
      }

      // Check cost constraints
      if (request.maxCost && model.costPerToken > request.maxCost) {
        return false;
      }

      // Check priority requirements
      if (request.minPriority) {
        const provider = this.providers.get(model.providerId);
        if (provider && provider.getProviderInfo().priority < request.minPriority) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Apply selection strategy to choose best model
   */
  private applySelectionStrategy(models: AvailableModel[], request: ModelSelectionRequest): AvailableModel {
    if (models.length === 0) {
      throw new Error('No models available for selection');
    }
    
    switch (this.loadBalancingConfig.strategy) {
      case 'weighted':
        return this.applyWeightedSelection(models, request);
      case 'round-robin':
        return this.applyRoundRobinSelection(models);
      case 'least-connections':
        return this.applyLeastConnectionsSelection(models);
      default:
        return this.applyWeightedSelection(models, request);
    }
  }

  /**
   * Weighted selection based on multiple factors
   */
  private applyWeightedSelection(models: AvailableModel[], request: ModelSelectionRequest): AvailableModel {
    const scoredModels = models.map(model => ({
      model,
      score: this.calculateModelScore(model, request)
    }));

    scoredModels.sort((a, b) => b.score - a.score);
    return scoredModels[0]!.model; // We know models is not empty
  }

  /**
   * Calculate model score based on various factors
   */
  private calculateModelScore(model: AvailableModel, request: ModelSelectionRequest): number {
    let score = 0;

    // Cost factor (lower is better)
    const costScore = Math.max(0, 100 - (model.costPerToken * 1000000));
    score += costScore * 0.2;

    // Performance factor (based on usage stats)
    const stats = this.usageStats.get(model.providerId);
    const performanceScore = stats ? (stats.successCount / Math.max(1, stats.requestCount)) * 100 : 50;
    score += performanceScore * 0.3;

    // Health factor
    const health = this.providerHealth.get(model.providerId);
    const healthScore = health ? (health.isHealthy ? 100 : 0) : 50;
    score += healthScore * 0.2;

    // Capability match factor
    if (request.requiredCapabilities) {
      const capabilityMatch = request.requiredCapabilities.filter(reqCap =>
        model.capabilities.some(cap => cap.name === reqCap && cap.supported)
      ).length / request.requiredCapabilities.length;
      score += capabilityMatch * 100 * 0.2;
    } else {
      score += 50 * 0.2;
    }

    // Priority factor
    const provider = this.providers.get(model.providerId);
    const priorityScore = provider ? provider.getProviderInfo().priority * 10 : 0;
    score += priorityScore * 0.1;

    return score;
  }

  /**
   * Round-robin selection
   */
  private applyRoundRobinSelection(models: AvailableModel[]): AvailableModel {
    // Simple round-robin based on request count
    const sortedModels = models.sort((a, b) => {
      const statsA = this.usageStats.get(a.providerId) || { requestCount: 0 };
      const statsB = this.usageStats.get(b.providerId) || { requestCount: 0 };
      return statsA.requestCount - statsB.requestCount;
    });
    return sortedModels[0]!; // We know models is not empty
  }

  /**
   * Least connections selection
   */
  private applyLeastConnectionsSelection(models: AvailableModel[]): AvailableModel {
    const sortedModels = models.sort((a, b) => {
      const statsA = this.usageStats.get(a.providerId) || { requestCount: 0 };
      const statsB = this.usageStats.get(b.providerId) || { requestCount: 0 };
      return statsA.requestCount - statsB.requestCount;
    });
    return sortedModels[0]!; // We know models is not empty
  }

  /**
   * Response time based selection
   */
  private applyResponseTimeSelection(models: AvailableModel[]): AvailableModel {
    const sortedModels = models.sort((a, b) => {
      const statsA = this.usageStats.get(a.providerId) || { averageResponseTime: Infinity };
      const statsB = this.usageStats.get(b.providerId) || { averageResponseTime: Infinity };
      return statsA.averageResponseTime - statsB.averageResponseTime;
    });
    return sortedModels[0]!; // We know models is not empty
  }

  /**
   * Calculate selection confidence
   */
  private calculateSelectionConfidence(model: AvailableModel, request: ModelSelectionRequest): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on capability match
    if (request.requiredCapabilities) {
      const matchCount = request.requiredCapabilities.filter(reqCap =>
        model.capabilities.some(cap => cap.name === reqCap && cap.supported)
      ).length;
      confidence += (matchCount / request.requiredCapabilities.length) * 0.3;
    }

    // Increase confidence based on provider health
    const health = this.providerHealth.get(model.providerId);
    if (health && health.isHealthy) {
      confidence += 0.2;
    }

    return Math.min(1.0, confidence);
  }

  /**
   * Generate selection reasoning
   */
  private getSelectionReasoning(model: AvailableModel, request: ModelSelectionRequest): string[] {
    const reasoning: string[] = [];

    reasoning.push(`Selected ${model.modelId} from ${model.providerId} provider`);

    if (request.requiredCapabilities) {
      const supportedCaps = request.requiredCapabilities.filter(reqCap =>
        model.capabilities.some(cap => cap.name === reqCap && cap.supported)
      );
      reasoning.push(`Supports required capabilities: ${supportedCaps.join(', ')}`);
    }

    if (model.costPerToken === 0) {
      reasoning.push('No cost (local model)');
    } else {
      reasoning.push(`Cost per token: $${model.costPerToken.toFixed(6)}`);
    }

    const stats = this.usageStats.get(model.providerId);
    if (stats && stats.requestCount > 0) {
      const successRate = (stats.successCount / stats.requestCount * 100).toFixed(1);
      reasoning.push(`Historical success rate: ${successRate}%`);
    }

    return reasoning;
  }

  /**
   * Get alternative models
   */
  private getAlternativeModels(
    models: AvailableModel[], 
    selected: AvailableModel, 
    count: number
  ): AvailableModel[] {
    return models
      .filter(m => m !== selected)
      .sort((a, b) => this.calculateModelScore(b, { ...{} as ModelSelectionRequest }) - 
                           this.calculateModelScore(a, { ...{} as ModelSelectionRequest }))
      .slice(0, count);
  }

  /**
   * Validate and return selection
   */
  private async validateAndReturnSelection(
    selection: AvailableModel, 
    request: ModelSelectionRequest
  ): Promise<ModelSelectionResult> {
    const provider = this.providers.get(selection.providerId);
    if (!provider) {
      throw new Error(`Provider ${selection.providerId} not found`);
    }

    // Validate request with provider
    const validation = await provider.validateRequest({
      id: request.id,
      model: selection.modelId,
      messages: request.messages || [],
      maxTokens: request.maxTokens || 1000,
      timestamp: new Date()
    });

    if (!validation.isValid) {
      throw new Error(`Request validation failed: ${validation.errors.join(', ')}`);
    }

    return {
      model: selection,
      provider,
      confidence: 0.9,
      reasoning: ['Forced by routing rule'],
      alternatives: []
    };
  }

  /**
   * Update usage statistics
   */
  private updateUsageStats(providerId: string, modelId: string): void {
    const stats = this.usageStats.get(providerId);
    if (stats) {
      stats.requestCount++;
      stats.lastUsed = new Date();
    }
  }

  /**
   * Update provider health
   */
  private updateProviderHealth(providerId: string, isHealthy: boolean, reason?: string): void {
    const current = this.providerHealth.get(providerId) || {
      isHealthy: true,
      lastCheck: new Date(),
      responseTime: 0,
      errorRate: 0,
      consecutiveFailures: 0,
      lastError: undefined
    };

    current.lastCheck = new Date();
    
    if (isHealthy) {
      current.isHealthy = true;
      current.consecutiveFailures = 0;
      current.lastError = undefined;
    } else {
      current.isHealthy = false;
      current.consecutiveFailures++;
      current.lastError = reason ? new Error(reason) : undefined;
    }

    this.providerHealth.set(providerId, current);
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (!this.healthCheckConfig.enabled) return;

    setInterval(async () => {
      for (const [providerId, provider] of Array.from(this.providers.entries())) {
        try {
          const isHealthy = await provider.isAvailable();
          this.updateProviderHealth(providerId, isHealthy);
        } catch (error) {
          this.updateProviderHealth(providerId, false, 'Health check error');
        }
      }
    }, this.healthCheckConfig.interval);
  }

  // ============================================================================
  // CONDITION EVALUATION METHODS
  // ============================================================================

  private evaluateIntentCondition(condition: RoutingCondition, request: ModelSelectionRequest): boolean {
    if (!request.intent) return false;
    
    switch (condition.operator) {
      case 'equals':
        return request.intent.type === condition.value;
      case 'contains':
        return request.intent.type.toString().includes(condition.value);
      default:
        return false;
    }
  }

  private evaluateUserCondition(condition: RoutingCondition, request: ModelSelectionRequest): boolean {
    if (!request.userId) return false;
    
    switch (condition.operator) {
      case 'equals':
        return request.userId === condition.value;
      case 'contains':
        return request.userId.includes(condition.value);
      default:
        return false;
    }
  }

  private evaluateGuildCondition(condition: RoutingCondition, request: ModelSelectionRequest): boolean {
    if (!request.guildId) return false;
    
    switch (condition.operator) {
      case 'equals':
        return request.guildId === condition.value;
      case 'contains':
        return request.guildId.includes(condition.value);
      default:
        return false;
    }
  }

  private evaluateTimeCondition(condition: RoutingCondition, request: ModelSelectionRequest): boolean {
    const now = new Date();
    
    switch (condition.value) {
      case 'business_hours':
        const hour = now.getHours();
        return hour >= 9 && hour <= 17;
      case 'weekend':
        const day = now.getDay();
        return day === 0 || day === 6;
      default:
        return false;
    }
  }

  private evaluateLoadCondition(condition: RoutingCondition, request: ModelSelectionRequest): boolean {
    // This would require access to current load metrics
    return false; // Placeholder
  }

  private evaluateCustomCondition(condition: RoutingCondition, request: ModelSelectionRequest): boolean {
    // Custom conditions would be evaluated based on configuration
    return false; // Placeholder
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Get current provider health status
   */
  getProviderHealth(): Map<string, ProviderHealth> {
    return new Map(this.providerHealth);
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): Map<string, UsageStats> {
    return new Map(this.usageStats);
  }

  /**
   * Update request completion stats
   */
  updateRequestStats(providerId: string, success: boolean, responseTime: number, cost: number): void {
    const stats = this.usageStats.get(providerId);
    if (stats) {
      if (success) {
        stats.successCount++;
      } else {
        stats.errorCount++;
      }
      
      // Update average response time
      const totalRequests = stats.requestCount;
      const currentAvg = stats.averageResponseTime;
      stats.averageResponseTime = (currentAvg * (totalRequests - 1) + responseTime) / totalRequests;
      
      stats.cost += cost;
    }
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

export interface ModelSelectionRequest {
  id: string;
  userId?: string;
  guildId?: string;
  channelId?: string;
  intent?: Intent;
  messages?: any[];
  requiredCapabilities?: string[];
  maxTokens?: number;
  contextWindow?: number;
  maxCost?: number;
  minPriority?: number;
  priority?: Priority;
}

export interface ModelSelectionResult {
  model: AvailableModel;
  provider: BaseAIProvider;
  confidence: number;
  reasoning: string[];
  alternatives: AvailableModel[];
}

export interface AvailableModel {
  modelId: string;
  providerId: string;
  model: AIModel;
  capabilities: ModelCapability[];
  costPerToken: number;
  maxTokens: number;
  contextWindow: number;
  isDefault: boolean;
}

export interface RoutingResult {
  forcedSelection: AvailableModel | null;
  appliedRule: RoutingRule | null;
}

export interface ProviderHealth {
  isHealthy: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  lastError?: Error | undefined;
}

export interface UsageStats {
  requestCount: number;
  successCount: number;
  errorCount: number;
  averageResponseTime: number;
  lastUsed: Date;
  cost: number;
}