/**
 * Conversational AI Provider Router
 * 
 * This module routes AI requests for conversational mode to appropriate
 * providers with fallback and retry logic.
 */

import {
  ConversationalAIRequest,
  ConversationalAIResponse,
} from '../../types/conversational';
import { BaseAIProvider } from '../core/ai-provider';
import { AIConfiguration } from '../../types/ai';
import { Logger } from '../../utils/logger';

// ============================================================================
// PROVIDER HEALTH TRACKING
// ============================================================================

interface ProviderHealth {
  provider: BaseAIProvider | null;
  available: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  lastError?: string;
  averageResponseTime: number;
  responseTimeHistory: number[];
}

// ============================================================================
// CONVERSATIONAL AI PROVIDER ROUTER CLASS
// ============================================================================

export class ConversationalAIProviderRouter {
  private providers: Map<string, BaseAIProvider> = new Map();
  private config: AIConfiguration;
  private logger: Logger;
  private providerHealth: Map<string, ProviderHealth> = new Map();
  private defaultProvider: string = 'openai';
  private maxRetries: number = 3;
  private baseRetryDelay: number = 1000; // 1 second
  
  // Provider fallback priority order
  private providerPriority: string[] = ['openai', 'anthropic', 'local'];

  constructor(config: AIConfiguration, logger: Logger) {
    this.config = config;
    this.logger = logger;
    
    this.initializeProviders();
    this.logger.info('ConversationalAIProviderRouter initialized', {
      providers: Array.from(this.providers.keys()),
      defaultProvider: this.defaultProvider,
    });
  }

  /**
   * Route request to appropriate AI provider with fallback logic
   */
  async routeRequest(request: ConversationalAIRequest): Promise<ConversationalAIResponse> {
    const requestId = this.generateRequestId();
    this.logger.debug('Routing conversational AI request', {
      requestId,
      contextWindow: request.config.contextWindow,
      maxTokens: request.config.maxTokens,
    });

    // DEBUG: Log available providers before routing
    const availableProviders = this.getProviders();
    this.logger.info(`[AI-ROUTER] Available providers: ${Array.from(availableProviders.keys()).join(', ')}`);
    this.logger.info(`[AI-ROUTER] Provider count: ${availableProviders.size}`);

    // Track which providers have been tried to avoid retrying
    const triedProviders: Set<string> = new Set();
    const errors: Array<{ provider: string; error: string }> = [];

    // Try providers in priority order
    for (const providerId of this.providerPriority) {
      // Skip if provider not registered or already tried
      if (!this.providers.has(providerId) || triedProviders.has(providerId)) {
        this.logger.debug(`[AI-ROUTER] Skipping provider ${providerId} - not registered or already tried`);
        continue;
      }

      const provider = this.providers.get(providerId)!;
      triedProviders.add(providerId);

      this.logger.debug(`[AI-ROUTER] Attempting provider ${providerId}`, {
        requestId,
        attemptOrder: triedProviders.size,
      });

      try {
        // Check if provider is available before attempting
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          this.logger.warn(`[AI-ROUTER] Provider ${providerId} not available`, {
            requestId,
          });
          errors.push({ provider: providerId, error: 'Provider not available' });
          continue;
        }

        // Execute request with retry logic for this provider
        const response = await this.executeWithRetry(
          provider,
          request,
          providerId,
          requestId
        );

        // Validate AI response content before building conversational response
        // This prevents propagating empty responses that would cause Discord API errors
        if (!response.content || response.content.trim().length === 0) {
          // Allow empty content if tool calls are present
          if (!response.toolCalls || response.toolCalls.length === 0) {
            this.logger.warn(`[AI-ROUTER] Provider ${providerId} returned empty response`, {
              requestId,
              provider: providerId,
            });
            // Continue to next provider instead of returning empty response
            throw new Error(`Provider ${providerId} returned empty response`);
          }
        }

        // Update provider health on success
        this.updateProviderHealthSuccess(providerId);

        // Build conversational response
        const conversationalResponse: ConversationalAIResponse = {
          content: response.content,
          tone: request.config.tone,
          emotion: this.detectEmotion(response.content),
          metadata: {
            requestId,
            provider: providerId,
            model: response.model,
            processingTime: response.metadata?.processingTime,
            retryAttempts: response.metadata?.retryAttempts || 0,
            fallbackAttempted: triedProviders.size > 1,
            providersTried: Array.from(triedProviders),
          },
          provider: providerId,
          model: response.model,
          tokensUsed: response.usage?.totalTokens || 0,
          toolCalls: response.toolCalls,
        };

        this.logger.info(`[AI-ROUTER] Request completed successfully via ${providerId}`, {
          requestId,
          tokensUsed: conversationalResponse.tokensUsed,
        });

        return conversationalResponse;

      } catch (error) {
        const errorMessage = (error as Error).message;
        this.logger.warn(`[AI-ROUTER] Provider ${providerId} request failed`, {
          requestId,
          error: errorMessage,
        });

        // Update provider health on failure
        this.updateProviderHealthFailure(providerId, error as Error);

        // Track error for final response
        errors.push({ provider: providerId, error: errorMessage });
      }
    }

    // All providers failed - return graceful error response
    this.logger.error('[AI-ROUTER] All providers failed', new Error('All providers exhausted'), {
      requestId,
      providersTried: Array.from(triedProviders),
      errors,
    });

    this.logger.info(`[AI-ROUTER] Returning error response: ${errors.map(e => `${e.provider}: ${e.error}`).join('; ')}`);

    return {
      content: 'I apologize, but I\'m currently unable to process your request. All AI providers are experiencing issues. Please try again later.',
      tone: 'friendly',
      emotion: 'concerned',
      metadata: {
        requestId,
        error: 'All providers failed',
        providersTried: Array.from(triedProviders),
        errors: errors.map(e => `${e.provider}: ${e.error}`).join('; '),
        fallbackAttempted: true,
      },
      provider: 'fallback',
      model: 'unknown',
      tokensUsed: 0,
    };
  }

  /**
   * Select appropriate provider for the request
   */
  private selectProvider(request: ConversationalAIRequest): BaseAIProvider {
    // Check if request specifies a preferred provider
    const preferredProvider = this.determinePreferredProvider(request);
    
    // Get provider health
    const providerHealth = this.providerHealth.get(preferredProvider);
    
    // If preferred provider is healthy, use it
    if (providerHealth && providerHealth.available && providerHealth.consecutiveFailures < 3) {
      return this.providers.get(preferredProvider)!;
    }

    // Otherwise, find the best available provider
    return this.findBestAvailableProvider();
  }

  /**
   * Determine preferred provider based on request characteristics
   */
  private determinePreferredProvider(request: ConversationalAIRequest): string {
    // Check for provider-specific requirements in context
    const context = request.context;
    
    // If user prefers specific language other than English, prefer Anthropic
    if (context.userPreferences?.language && 
        context.userPreferences.language !== 'en' &&
        this.providers.has('anthropic')) {
      return 'anthropic';
    }

    // Use configured default provider
    if (this.config.providers && this.config.providers.openai?.enabled) {
      return 'openai';
    }
    if (this.config.providers && this.config.providers.anthropic?.enabled) {
      return 'anthropic';
    }

    return this.defaultProvider;
  }

  /**
   * Find best available provider based on health
   */
  private findBestAvailableProvider(): BaseAIProvider {
    let bestProvider: BaseAIProvider | null = null;
    let bestScore = -1;

    for (const [providerId, health] of this.providerHealth.entries()) {
      const provider = this.providers.get(providerId);
      
      if (!provider || !health.available) {
        continue;
      }

      // Calculate provider score
      const score = this.calculateProviderScore(health);

      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }

    return bestProvider || this.providers.get(this.defaultProvider)!;
  }

  /**
   * Calculate provider health score
   */
  private calculateProviderScore(health: ProviderHealth): number {
    // Lower consecutive failures = better
    const failureScore = Math.max(0, 10 - health.consecutiveFailures);
    
    // Lower average response time = better
    const responseTimeScore = Math.max(0, 10 - health.averageResponseTime / 1000);
    
    // Combine scores
    return failureScore + responseTimeScore;
  }

  /**
   * Check if error is retryable
   * Non-retryable errors include quota, authentication, and permission issues
   */
  private isRetryableError(error: Error): boolean {
    const nonRetryablePatterns = [
      'quota_exceeded',
      'insufficient_quota',
      'invalid_api_key',
      'invalid_request',
      'permission_denied'
    ];

    const errorMessage = error.message.toLowerCase();
    const errorCode = (error as any).code?.toLowerCase() || '';
    
    // Check if error matches any non-retryable pattern
    const isNonRetryable = nonRetryablePatterns.some(pattern =>
      errorMessage.includes(pattern) || errorCode.includes(pattern)
    );
    
    return !isNonRetryable;
  }

  /**
   * Execute request with retry logic and exponential backoff
   */
  private async executeWithRetry(
     provider: BaseAIProvider,
     request: ConversationalAIRequest,
     providerId: string,
     requestId: string
   ): Promise<any> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Check if provider is available before attempting
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          throw new Error(`Provider ${providerId} is not available`);
        }
        
        // Build AI request - use the provider's default model
        const aiRequest = this.buildAIRequest(request, requestId, attempt, provider);
        
        // Execute request
        const response = await provider.generateResponse(aiRequest);
        
        this.logger.debug('Request succeeded', {
          requestId,
          provider: providerId,
          attempt,
        });
        
        // Add metadata about retry attempts
        if (attempt > 1) {
          response.metadata = {
            ...response.metadata,
            retryAttempts: attempt - 1,
          };
        }
        
        return response;

      } catch (error) {
        lastError = error as Error;
        const errorMessage = (error as Error).message;
        
        // Check for quota errors specifically
        const isQuotaError = errorMessage.toLowerCase().includes('quota') ||
          (error as any).code?.toLowerCase().includes('quota');
        
        if (isQuotaError) {
          this.logger.error('Quota error detected - request will not be retried', error as Error, {
            requestId,
            provider: providerId,
            attempt,
            errorCode: (error as any).code,
            recoverable: false
          });
          // Quota errors are not retryable - throw immediately
          throw error;
        }

        this.logger.warn('Request attempt failed', {
          requestId,
          provider: providerId,
          attempt,
          error: errorMessage,
        });

        // Update provider health on failure
        this.updateProviderHealthFailure(providerId, error as Error);

        // Check if error is retryable before attempting retry
        if (!this.isRetryableError(error as Error)) {
          this.logger.warn('Error is not retryable - aborting retries', {
            requestId,
            provider: providerId,
            attempt,
            error: errorMessage,
          });
          throw error;
        }

        // If not the last attempt, wait with exponential backoff
        if (attempt < this.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          this.logger.debug('Waiting before retry', {
            requestId,
            provider: providerId,
            attempt,
            delay,
          });
          
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    throw lastError || new Error('All retry attempts exhausted');
  }

  /**
   * Build AI request from conversational request
   */
  private buildAIRequest(
    request: ConversationalAIRequest,
    requestId: string,
    attempt: number,
    currentProvider: BaseAIProvider
  ): any {
    const messages: any[] = [];

    // Add system prompt if configured
    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }

    // Add message history
    for (const entry of request.context.messageHistory) {
      messages.push({
        role: entry.role,
        content: entry.content,
      });
    }

    // Add current message
    messages.push({
      role: 'user',
      content: request.message,
    });

    // Get model for provider
    const model = this.getModelForProvider(currentProvider);

    // Build request with tools if provided
    const aiRequest: any = {
      id: requestId,
      model,
      messages,
      maxTokens: request.config.maxTokens,
      temperature: request.config.temperature,
      userId: request.context.userId,
      conversationId: request.context.conversationId,
      timestamp: new Date(),
    };

    // Include tools if provided and tool calling is enabled
    if (request.tools && request.config.features.toolCalling) {
      aiRequest.tools = request.tools;
      aiRequest.tool_choice = 'auto'; // Enable AI to decide when to call tools
      this.logger.info('[DEBUG-TOOL] Setting tool_choice to auto for AI request');
    }
    this.logger.info('[DEBUG-TOOL] Adding tools to AI request:', {
      hasTools: !!aiRequest.tools,
      toolChoice: aiRequest.tool_choice
    });

    return aiRequest;
  }

  /**
   * Get model for a specific provider
   */
  private getModelForProvider(provider: BaseAIProvider): string {
    const providerInfo = provider.getProviderInfo();
    const models = provider.getAvailableModels();
    const defaultModel = models.find(m => m.isDefault);
    return defaultModel?.id || models[0]?.id || 'gpt-4-turbo';
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    return this.baseRetryDelay * Math.pow(2, attempt - 1);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update provider health on success
   */
  private updateProviderHealthSuccess(providerId: string): void {
    const health = this.providerHealth.get(providerId);
    if (!health) return;

    const now = Date.now();
    const responseTime = now - health.lastCheck.getTime();

    // Update response time history
    health.responseTimeHistory.push(responseTime);
    if (health.responseTimeHistory.length > 10) {
      health.responseTimeHistory.shift();
    }

    // Calculate average response time
    health.averageResponseTime = 
      health.responseTimeHistory.reduce((sum, time) => sum + time, 0) / 
      health.responseTimeHistory.length;

    health.available = true;
    health.consecutiveFailures = 0;
    health.lastError = undefined;
    health.lastCheck = new Date();

    this.providerHealth.set(providerId, health);
  }

  /**
   * Update provider health on failure
   */
  private updateProviderHealthFailure(providerId: string, error: Error): void {
    const health = this.providerHealth.get(providerId);
    if (!health) return;

    health.available = false;
    health.consecutiveFailures++;
    health.lastError = error.message;
    health.lastCheck = new Date();

    this.providerHealth.set(providerId, health);

    // If too many consecutive failures, mark as unavailable
    if (health.consecutiveFailures >= 5) {
      this.logger.error('Provider marked as unavailable due to repeated failures', new Error(`Provider ${providerId} has ${health.consecutiveFailures} consecutive failures`), {
        providerId,
        failures: health.consecutiveFailures,
      });
    }
  }

  /**
   * Initialize providers from config
   */
  private initializeProviders(): void {
    // Note: In a real implementation, this would create actual provider instances
    // For now, we'll track them conceptually
    
    if (this.config.providers?.openai?.apiKey) {
      // OpenAI provider would be initialized here
      this.defaultProvider = 'openai';
    }

    if (this.config.providers?.anthropic?.apiKey) {
      // Anthropic provider would be initialized here
      if (!this.config.providers?.openai?.apiKey) {
        this.defaultProvider = 'anthropic';
      }
    }

    if (this.config.providers?.local?.enabled) {
      // Local provider would be initialized here
      if (!this.config.providers?.openai?.apiKey &&
          !this.config.providers?.anthropic?.apiKey) {
        this.defaultProvider = 'local';
      }
    }

    // Initialize health tracking for all providers
    const providers = ['openai', 'anthropic', 'local'];
    for (const providerId of providers) {
      const provider = this.providers.get(providerId);
      this.providerHealth.set(providerId, {
        provider: provider || null,
        available: true,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        averageResponseTime: 0,
        responseTimeHistory: [],
      });
    }
  }

  /**
   * Get provider ID from provider instance
   */
  private getProviderId(provider: BaseAIProvider): string {
    const info = provider.getProviderInfo();
    return info.id;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `conv_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Detect emotion from response content (simplified)
   */
  private detectEmotion(content: string): string {
    const lowerContent = content.toLowerCase();
    
    // Simple emotion detection based on keywords
    if (lowerContent.includes('thank') || lowerContent.includes('appreciate')) {
      return 'grateful';
    }
    if (lowerContent.includes('sorry') || lowerContent.includes('apologize')) {
      return 'apologetic';
    }
    if (lowerContent.includes('excited') || lowerContent.includes('great!')) {
      return 'enthusiastic';
    }
    if (lowerContent.includes('understand') || lowerContent.includes('see')) {
      return 'empathetic';
    }
    
    return 'neutral';
  }

  /**
   * Check provider health status
   */
  async checkProviderHealth(providerId?: string): Promise<Map<string, ProviderHealth>> {
    // Update availability for all providers
    for (const [id, health] of this.providerHealth.entries()) {
      const provider = this.providers.get(id);
      if (provider) {
        try {
          const isAvailable = await provider.isAvailable();
          health.available = isAvailable;
          health.lastCheck = new Date();
          this.providerHealth.set(id, health);
        } catch (error) {
          this.logger.warn('Health check failed for provider', {
            provider: id,
            error: (error as Error).message,
          });
          health.available = false;
          health.lastCheck = new Date();
          this.providerHealth.set(id, health);
        }
      }
    }

    return providerId 
      ? new Map([[providerId, this.providerHealth.get(providerId)!]])
      : new Map(this.providerHealth);
  }

  /**
   * Get provider health for a specific provider
   */
  getProviderHealth(providerId: string): ProviderHealth | undefined {
    return this.providerHealth.get(providerId);
  }

  /**
   * Register a provider
   */
  registerProvider(providerId: string, provider: BaseAIProvider): void {
    this.providers.set(providerId, provider);
    this.providerHealth.set(providerId, {
      provider,
      available: true,
      lastCheck: new Date(),
      consecutiveFailures: 0,
      averageResponseTime: 0,
      responseTimeHistory: [],
    });

    this.logger.info('Provider registered', { providerId });
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(providerId: string): void {
    this.providers.delete(providerId);
    this.providerHealth.delete(providerId);

    this.logger.info('Provider unregistered', { providerId });
  }

  /**
   * Get all registered providers
   */
  getProviders(): Map<string, BaseAIProvider> {
    return new Map(this.providers);
  }

  /**
   * Get default provider
   */
  getDefaultProvider(): string {
    return this.defaultProvider;
  }

  /**
   * Set default provider
   */
  setDefaultProvider(providerId: string): void {
    if (this.providers.has(providerId)) {
      this.defaultProvider = providerId;
      this.logger.info('Default provider updated', { providerId });
    } else {
      this.logger.warn('Cannot set default provider - provider not registered', {
        providerId,
      });
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AIConfiguration>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Configuration updated', { config });
  }

  /**
   * Get current configuration
   */
  getConfig(): AIConfiguration {
    return { ...this.config };
  }
}
