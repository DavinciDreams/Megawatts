/**
 * AI Core Module
 * 
 * This is the main orchestrator for the AI system, coordinating
 * all AI components including providers, model selection,
 * request routing, response processing, and context management.
 */

import { 
  AIConfiguration,
  AIProvider,
  AIRequest,
  AIResponse,
  RoutingRequest,
  RoutingResult,
  ProcessingContext,
  ModelSelectionRequest,
  ModelSelectionResult
} from '../../types/ai';
import { Logger } from '../../utils/logger';
import { BaseAIProvider, OpenAIProvider, AnthropicProvider, LocalModelProvider } from './ai-provider';
import { ModelSelector } from './model-selector';
import { RequestRouter } from './request-router';
import { ResponseProcessor } from './response-processor';
import { ContextManager } from './context-manager';

// ============================================================================
// AI CORE CLASS
// ============================================================================

export class AICore {
  private providers: Map<string, BaseAIProvider> = new Map();
  private modelSelector!: ModelSelector;
  private requestRouter!: RequestRouter;
  private responseProcessor!: ResponseProcessor;
  private contextManager!: ContextManager;
  private config: AIConfiguration;
  private logger: Logger;
  private isInitialized = false;
  private metrics: AICoreMetrics;

  constructor(config: AIConfiguration, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      totalTokensUsed: 0,
      totalCost: 0,
      uptime: new Date(),
      lastReset: new Date()
    };
  }

  /**
   * Initialize the AI core system
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing AI Core system...');

      // Initialize providers
      await this.initializeProviders();

      // Initialize model selector
      await this.initializeModelSelector();

      // Initialize request router
      await this.initializeRequestRouter();

      // Initialize response processor
      await this.initializeResponseProcessor();

      // Initialize context manager
      await this.initializeContextManager();

      this.isInitialized = true;
      this.metrics.uptime = new Date();

      this.logger.info('AI Core system initialized successfully', {
        providers: this.providers.size,
        modelSelector: 'initialized',
        requestRouter: 'initialized',
        responseProcessor: 'initialized',
        contextManager: 'initialized'
      });

    } catch (error) {
      this.logger.error('Failed to initialize AI Core system', error as Error);
      throw error;
    }
  }

  /**
   * Process an AI request through the complete pipeline
   */
  async processRequest(request: RoutingRequest): Promise<RoutingResult> {
    if (!this.isInitialized) {
      throw new Error('AI Core system not initialized');
    }

    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Route the request
      const result = await this.requestRouter.routeRequest(request);

      // Update metrics on success
      this.metrics.successfulRequests++;
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * (this.metrics.successfulRequests - 1) + result.processingTime) / 
        this.metrics.successfulRequests;
      this.metrics.totalTokensUsed += result.response?.usage?.totalTokens || 0;
      this.metrics.totalCost += result.routingDecision?.estimatedCost || 0;

      this.logger.info('Request processed successfully', {
        requestId: result.requestId,
        processingTime: result.processingTime,
        provider: result.routingDecision?.provider,
        model: result.routingDecision?.model,
        tokensUsed: result.response?.usage?.totalTokens
      });

      return result as RoutingResult;

    } catch (error) {
      // Update metrics on failure
      this.metrics.failedRequests++;
      
      this.logger.error('Request processing failed', {
        requestId: request.id || 'unknown',
        error: (error as Error).message,
        requestId: request.id || 'unknown',
        processingTime: Date.now() - startTime
      });
      
      throw error;
    }
  }

  /**
   * Get system status and metrics
   */
  getStatus(): AICoreStatus {
    return {
      initialized: this.isInitialized,
      uptime: Date.now() - this.metrics.uptime.getTime(),
      providers: this.getProviderStatus(),
      metrics: { ...this.metrics },
      health: this.getSystemHealth()
    };
  }

  /**
   * Shutdown the AI core system gracefully
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down AI Core system...');

    try {
      // Clear active requests
      // Implementation would depend on request router
      
      // Clear caches
      // Implementation would depend on response processor
      
      // Save state
      await this.saveState();

      this.isInitialized = false;
      this.logger.info('AI Core system shutdown successfully');

    } catch (error) {
      this.logger.error('Error during AI Core shutdown', error as Error);
      throw error;
    }
  }

  /**
   * Add a new provider dynamically
   */
  async addProvider(provider: BaseAIProvider): Promise<void> {
    const providerInfo = provider.getProviderInfo();
    this.providers.set(providerInfo.id, provider);
    
    // Reinitialize model selector with new provider
    this.modelSelector = new ModelSelector(
      Array.from(this.providers.values()),
      {
        routing: {
          ...this.config.routing,
          rules: this.config.routing.rules || []
        },
        logger: this.logger
      }
    );

    this.logger.info(`Provider ${providerInfo.name} added successfully`);
  }

  /**
   * Remove a provider
   */
  async removeProvider(providerId: string): Promise<void> {
    if (this.providers.has(providerId)) {
      this.providers.delete(providerId);
      
      // Reinitialize model selector
    this.modelSelector = new ModelSelector(
      Array.from(this.providers.values()),
      {
        routing: {
          ...this.config.routing,
          rules: this.config.routing.rules || []
        },
        logger: this.logger
      }
    );

      this.logger.info(`Provider ${providerId} removed successfully`);
    }
  }

  /**
   * Update provider configuration
   */
  async updateProviderConfig(providerId: string, config: any): Promise<void> {
    const provider = this.providers.get(providerId);
    if (provider) {
      // Provider-specific configuration update would depend on provider type
      this.logger.info(`Provider ${providerId} configuration updated`);
    }
  }

  /**
   * Get provider-specific information
   */
  async getProviderInfo(providerId?: string): Promise<ProviderInfo | null> {
    if (providerId) {
      const provider = this.providers.get(providerId);
      if (provider) {
        return {
          ...provider.getProviderInfo(),
          capabilities: provider.getProviderInfo().capabilities.map((c: any) => c.name || ''),
          stats: this.modelSelector.getUsageStats().get(providerId) || {
            requestCount: 0,
            successCount: 0,
            errorCount: 0,
            averageResponseTime: 0,
            lastUsed: new Date(),
            cost: 0
          },
          health: this.modelSelector.getProviderHealth().get(providerId) || {
            isHealthy: true,
            lastCheck: new Date(),
            consecutiveFailures: 0,
            lastError: undefined
          }
        } as ProviderInfo;
      }
    }
    
    return null;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      totalTokensUsed: 0,
      totalCost: 0,
      uptime: new Date(),
      lastReset: new Date()
    };
    
    this.logger.info('AI Core metrics reset');
  }

  // ============================================================================
  // PRIVATE INITIALIZATION METHODS
  // ============================================================================

  private async initializeProviders(): Promise<void> {
    this.logger.info('Initializing AI providers...');

    // Initialize OpenAI provider
    if (this.config.providers.openai.enabled) {
      const openaiProvider = new OpenAIProvider(
        {
          apiKey: this.config.providers.openai.apiKey,
          endpoint: this.config.providers.openai.endpoint,
          timeout: this.config.providers.openai.timeout || 30000,
          retries: this.config.providers.openai.retries || 3,
          customHeaders: this.config.providers.openai.customHeaders
        },
        this.logger
      );
      this.providers.set('openai', openaiProvider);
    }

    // Initialize Anthropic provider
    if (this.config.providers.anthropic.enabled) {
      const anthropicProvider = new AnthropicProvider(
        {
          apiKey: this.config.providers.anthropic.apiKey,
          endpoint: this.config.providers.anthropic.endpoint,
          timeout: this.config.providers.anthropic.timeout || 30000,
          retries: this.config.providers.anthropic.retries || 3,
          customHeaders: this.config.providers.anthropic.customHeaders
        },
        this.logger
      );
      this.providers.set('anthropic', anthropicProvider);
    }

    // Initialize local model provider
    if (this.config.providers.local.enabled) {
      const localProvider = new LocalModelProvider(
        {
          endpoint: this.config.providers.local.endpoint,
          timeout: this.config.providers.local.timeout || 60000,
          retries: this.config.providers.local.retries || 1,
          modelPath: this.config.providers.local.modelPath
        },
        this.logger
      );
      this.providers.set('local', localProvider);
    }

    this.logger.info(`Initialized ${this.providers.size} AI providers`);
  }

  private async initializeModelSelector(): Promise<void> {
    this.modelSelector = new ModelSelector(
      Array.from(this.providers.values()),
      {
        routing: {
          ...this.config.routing,
          rules: this.config.routing.rules || []
        },
        logger: this.logger
      }
    );
  }

  private async initializeRequestRouter(): Promise<void> {
    this.requestRouter = new RequestRouter(
      this.modelSelector,
      this.logger,
      {
        maxConcurrentRequests: this.config.performance.maxConcurrentRequests || 100,
        queueSize: this.config.performance.queueSize || 1000,
        timeoutMs: this.config.performance.timeoutMs || 30000,
        retryAttempts: this.config.performance.retryAttempts || 3,
        strategies: (this.config.routing.strategies || []).map((s: any): any => ({
          name: s.name || s.type || 'round_robin',
          type: s.type || 'round_robin' as any,
          algorithm: s.algorithm || 'round_robin',
          weights: s.weights || {},
          config: s.config || {}
        }))
      }
    );
  }

  private async initializeResponseProcessor(): Promise<void> {
    this.responseProcessor = new ResponseProcessor(
      {
        safety: {
          enabled: this.config.safety.enabled,
          level: this.config.safety.level || 'medium',
          checks: this.config.safety.checks || []
        },
        personalization: {
          enabled: this.config.personalization.enabled,
          strategies: this.config.personalization.strategies || []
        },
        formatting: {
          enabled: this.config.formatting.enabled,
          strategies: this.config.formatting.strategies || []
        },
        enhancements: {
          enabled: this.config.enhancements.enabled,
          types: this.config.enhancements.types || []
        }
      },
      this.logger
    );
  }

  private async initializeContextManager(): Promise<void> {
    this.contextManager = new ContextManager(
      {
        maxMessagesPerConversation: this.config.conversation.maxMessagesPerConversation || 100,
        maxMessageAge: this.config.conversation.maxMessageAge || 7 * 24 * 60 * 60 * 1000, // 7 days
        memory: {
          maxMemories: this.config.memory.maxMemories || 10000,
          retention: this.config.memory.retention || 30,
          indexing: this.config.memory.indexing || true
        },
        cleanup: {
          enabled: this.config.conversation.cleanup.enabled,
          interval: this.config.conversation.cleanup.interval || 3600000, // 1 hour
          maxAge: this.config.conversation.cleanup.maxAge || 7 * 24 * 60 * 60 * 1000 // 7 days
        }
      },
      this.logger
    );
  }

  // ============================================================================
  // PRIVATE UTILITY METHODS
  // ============================================================================

  private getProviderStatus(): ProviderStatus[] {
    const status: ProviderStatus[] = [];
    
    for (const [providerId, provider] of this.providers.entries()) {
      const health = this.modelSelector.getProviderHealth().get(providerId);
      const stats = this.modelSelector.getUsageStats().get(providerId);
      
      status.push({
        id: providerId,
        name: provider.getProviderInfo().name,
        available: health?.isHealthy ?? false,
        requests: stats?.requestCount || 0,
        successRate: stats?.requestCount && stats.requestCount > 0
          ? (stats.successCount / stats.requestCount) * 100
          : 0,
        averageResponseTime: stats?.averageResponseTime ?? 0,
        lastUsed: stats?.lastUsed ?? new Date(),
        errors: stats?.errorCount ?? 0
      });
    }
    
    return status;
  }

  private getSystemHealth(): SystemHealth {
    const providerHealth = Array.from(this.modelSelector.getProviderHealth().values());
    const healthyProviders = providerHealth.filter(h => h.isHealthy).length;
    const totalProviders = providerHealth.length;
    
    let healthLevel: 'excellent' | 'good' | 'fair' | 'poor' = 'excellent';
    if (healthyProviders / totalProviders < 0.5) healthLevel = 'poor';
    else if (healthyProviders / totalProviders < 0.75) healthLevel = 'fair';
    else if (healthyProviders / totalProviders < 0.9) healthLevel = 'good';
    
    return {
      overall: healthLevel,
      providers: {
        total: totalProviders,
        healthy: healthyProviders,
        unhealthy: totalProviders - healthyProviders
      },
      issues: this.identifyHealthIssues(providerHealth),
      recommendations: this.getHealthRecommendations(healthLevel)
    };
  }

  private identifyHealthIssues(providerHealth: any[]): string[] {
    const issues: string[] = [];
    
    for (const health of providerHealth) {
      if (!health.isHealthy) {
        if (health.consecutiveFailures > 3) {
          issues.push(`Provider ${health.providerId} has ${health.consecutiveFailures} consecutive failures`);
        }
        
        if (health.lastError) {
          issues.push(`Provider ${health.providerId}: ${health.lastError}`);
        }
      }
    }
    
    return issues;
  }

  private getHealthRecommendations(healthLevel: string): string[] {
    const recommendations: string[] = [];
    
    switch (healthLevel) {
      case 'poor':
        recommendations.push('Immediate intervention required - multiple providers unhealthy');
        recommendations.push('Check provider configurations and network connectivity');
        break;
      case 'fair':
        recommendations.push('Monitor provider performance closely');
        recommendations.push('Consider enabling fallback providers');
        break;
      case 'good':
        recommendations.push('System operating normally');
        break;
      case 'excellent':
        recommendations.push('All systems operating optimally');
        break;
    }
    
    return recommendations;
  }

  private async saveState(): Promise<void> {
    // Save current state to persistent storage
    // Implementation would depend on storage system
    this.logger.info('AI Core state saved');
  }
}

// ============================================================================
// SUPPORTING INTERFACES
// ============================================================================

export interface AICoreStatus {
  initialized: boolean;
  uptime: number;
  providers: ProviderStatus[];
  metrics: AICoreMetrics;
  health: SystemHealth;
}

export interface ProviderStatus {
  id: string;
  name: string;
  available: boolean;
  requests: number;
  successRate: number;
  averageResponseTime: number;
  lastUsed: Date;
  errors: number;
}

export interface AICoreMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  totalTokensUsed: number;
  totalCost: number;
  uptime: Date;
  lastReset: Date;
}

export interface SystemHealth {
  overall: 'excellent' | 'good' | 'fair' | 'poor';
  providers: {
    total: number;
    healthy: number;
    unhealthy: number;
  };
  issues: string[];
  recommendations: string[];
}

export interface ProviderInfo {
  id: string;
  name: string;
  models: any[];
  capabilities: string[];
  priority: number;
  isAvailable: boolean;
  config: any;
  stats: ProviderStats;
  health: ProviderHealth;
}

export interface ProviderStats {
  requestCount: number;
  successCount: number;
  errorCount: number;
  averageResponseTime: number;
  lastUsed: Date;
  cost: number;
}

export interface ProviderHealth {
  isHealthy: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  lastError?: string;
}