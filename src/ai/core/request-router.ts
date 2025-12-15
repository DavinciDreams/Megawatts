/**
 * AI Request Router
 * 
 * This module handles intelligent routing of AI requests to appropriate providers
 * based on content analysis, user context, and system state.
 */

import {
  Intent,
  Priority,
  ConversationContext,
  UserPreferences,
  Response
} from '../../types/ai';
import { AIRequest, AIResponse } from './ai-provider';
import { Logger } from '../../utils/logger';
import { ModelSelector, ModelSelectionRequest } from './model-selector';
import { BaseAIProvider } from './ai-provider';

// ============================================================================
// REQUEST ROUTER CLASS
// ============================================================================

export class RequestRouter {
  private modelSelector: ModelSelector;
  private logger: Logger;
  private requestQueue: Map<string, QueuedRequest> = new Map();
  private activeRequests: Map<string, ActiveRequest> = new Map();
  private routingStrategies: Map<string, RoutingStrategy> = new Map();

  constructor(
    modelSelector: ModelSelector,
    logger: Logger,
    config: RouterConfig
  ) {
    this.modelSelector = modelSelector;
    this.logger = logger;
    this.initializeRoutingStrategies(config);
  }

  /**
   * Route and process an AI request
   */
  async routeRequest(request: RoutingRequest): Promise<RoutingResult> {
    try {
      const requestId = this.generateRequestId();
      const startTime = Date.now();

      // Analyze request characteristics
      const analysis = await this.analyzeRequest(request);
      
      // Determine routing strategy
      const strategy = this.selectRoutingStrategy(analysis);
      
      // Apply preprocessing
      const preprocessedRequest = await this.preprocessRequest(request, analysis);
      
      // Queue request if needed
      if (this.shouldQueueRequest(preprocessedRequest, analysis)) {
        return this.queueRequest(requestId, preprocessedRequest, analysis);
      }

      // Route to appropriate provider
      const routingDecision = await this.makeRoutingDecision(preprocessedRequest, analysis, strategy);
      
      // Execute request
      const result = await this.executeRequest(requestId, routingDecision, preprocessedRequest);
      
      // Post-process response
      const processedResponse = await this.postProcessResponse(result, analysis);
      
      // Update metrics
      this.updateMetrics(requestId, routingDecision, result, Date.now() - startTime);
      
      return {
        requestId,
        response: processedResponse,
        routingDecision,
        processingTime: Date.now() - startTime,
        strategy,
        analysis
      };

    } catch (error) {
      this.logger.error('Request routing failed', error as Error);
      throw error;
    }
  }

  /**
   * Analyze request characteristics
   */
  private async analyzeRequest(request: RoutingRequest): Promise<RequestAnalysis> {
    const analysis: RequestAnalysis = {
      complexity: this.assessComplexity(request),
      priority: this.determinePriority(request),
      estimatedTokens: this.estimateTokens(request),
      capabilities: this.identifyRequiredCapabilities(request),
      contentType: this.identifyContentType(request),
      urgency: this.assessUrgency(request),
      costSensitivity: this.assessCostSensitivity(request),
      latencySensitivity: this.assessLatencySensitivity(request)
    };

    // Add intent analysis if available
    if (request.intent) {
      analysis.intent = request.intent;
    } else {
      analysis.intent = await this.inferIntent(request);
    }

    return analysis;
  }

  /**
   * Assess request complexity
   */
  private assessComplexity(request: RoutingRequest): 'low' | 'medium' | 'high' {
    let complexity = 0;

    // Base complexity from message length
    const totalLength = request.messages?.reduce((sum, msg) => sum + msg.content.length, 0) || 0;
    if (totalLength > 1000) complexity += 2;
    else if (totalLength > 500) complexity += 1;

    // Complexity from message count
    const messageCount = request.messages?.length || 0;
    if (messageCount > 10) complexity += 2;
    else if (messageCount > 5) complexity += 1;

    // Complexity from function/tool calls
    if (request.functions && request.functions.length > 0) {
      complexity += Math.min(request.functions.length, 3);
    }

    if (request.tools && request.tools.length > 0) {
      complexity += Math.min(request.tools.length, 3);
    }

    // Complexity from context requirements
    if (request.contextWindow && request.contextWindow > 32000) complexity += 2;
    else if (request.contextWindow && request.contextWindow > 8000) complexity += 1;

    if (complexity <= 2) return 'low';
    if (complexity <= 5) return 'medium';
    return 'high';
  }

  /**
   * Determine request priority
   */
  private determinePriority(request: RoutingRequest): Priority {
    // Explicit priority takes precedence
    if (request.priority) {
      return request.priority;
    }

    // Priority from user role/permissions
    if (request.userRole === 'admin' || request.userRole === 'moderator') {
      return { level: 'high', score: 8 };
    }

    // Priority from urgency
    const urgency = this.assessUrgency(request);
    if (urgency === 'critical') return { level: 'urgent', score: 10 };
    if (urgency === 'high') return { level: 'high', score: 8 };

    // Priority from content type
    const contentType = this.identifyContentType(request);
    if (contentType === 'emergency' || contentType === 'moderation') {
      return { level: 'high', score: 8 };
    }

    // Default priority
    return { level: 'normal', score: 5 };
  }

  /**
   * Estimate token count
   */
  private estimateTokens(request: RoutingRequest): number {
    if (!request.messages) return 0;

    // Simple estimation: ~4 characters per token
    const totalChars = request.messages.reduce((sum, msg) => sum + msg.content.length, 0);
    const estimatedTokens = Math.ceil(totalChars / 4);

    // Add tokens for function/tool definitions
    let additionalTokens = 0;
    if (request.functions) {
      additionalTokens += request.functions.length * 50; // Rough estimate
    }
    if (request.tools) {
      additionalTokens += request.tools.length * 50; // Rough estimate
    }

    return estimatedTokens + additionalTokens;
  }

  /**
   * Identify required capabilities
   */
  private identifyRequiredCapabilities(request: RoutingRequest): string[] {
    const capabilities: string[] = [];

    // Basic text generation
    capabilities.push('text');

    // Function calling
    if (request.functions && request.functions.length > 0) {
      capabilities.push('function_calling');
    }

    // Tool usage
    if (request.tools && request.tools.length > 0) {
      capabilities.push('function_calling');
    }

    // Code generation
    const content = request.messages?.map(m => m.content).join(' ').toLowerCase() || '';
    if (content.includes('code') || content.includes('program') || content.includes('script')) {
      capabilities.push('code_generation');
    }

    // Vision (if images are present)
    if (request.attachments && request.attachments.some(a => a.type.startsWith('image/'))) {
      capabilities.push('vision');
    }

    return [...new Set(capabilities)]; // Remove duplicates
  }

  /**
   * Identify content type
   */
  private identifyContentType(request: RoutingRequest): string {
    const content = request.messages?.map(m => m.content.toLowerCase()).join(' ') || '';

    if (content.includes('emergency') || content.includes('urgent')) {
      return 'emergency';
    }

    if (content.includes('ban') || content.includes('kick') || content.includes('mute')) {
      return 'moderation';
    }

    if (content.includes('help') || content.includes('how to')) {
      return 'help';
    }

    if (content.includes('analyze') || content.includes('explain')) {
      return 'analysis';
    }

    if (content.includes('create') || content.includes('generate')) {
      return 'generation';
    }

    return 'general';
  }

  /**
   * Assess urgency
   */
  private assessUrgency(request: RoutingRequest): 'low' | 'medium' | 'high' | 'critical' {
    const content = request.messages?.map(m => m.content.toLowerCase()).join(' ') || '';
    let urgencyScore = 0;

    // Keywords indicating urgency
    const urgentKeywords = ['urgent', 'emergency', 'critical', 'asap', 'immediately'];
    for (const keyword of urgentKeywords) {
      if (content.includes(keyword)) urgencyScore += 2;
    }

    // Time-based urgency
    const now = new Date();
    const hour = now.getHours();
    if (hour < 6 || hour > 22) urgencyScore += 1; // Outside business hours

    // User role urgency
    if (request.userRole === 'admin') urgencyScore += 1;
    if (request.userRole === 'moderator') urgencyScore += 1;

    if (urgencyScore >= 4) return 'critical';
    if (urgencyScore >= 2) return 'high';
    if (urgencyScore >= 1) return 'medium';
    return 'low';
  }

  /**
   * Assess cost sensitivity
   */
  private assessCostSensitivity(request: RoutingRequest): 'low' | 'medium' | 'high' {
    // High usage users are more cost sensitive
    if (request.userStats && request.userStats.dailyRequests > 100) {
      return 'high';
    }

    // Free tier users are cost sensitive
    if (request.userTier === 'free') {
      return 'high';
    }

    // Large token requests are cost sensitive
    if (request.maxTokens && request.maxTokens > 50000) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Assess latency sensitivity
   */
  private assessLatencySensitivity(request: RoutingRequest): 'low' | 'medium' | 'high' {
    // Real-time interactions are latency sensitive
    const contentType = this.identifyContentType(request);
    if (contentType === 'emergency' || contentType === 'moderation') {
      return 'high';
    }

    // Interactive conversations are latency sensitive
    if (request.context?.messageCount && request.context.messageCount > 5) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Infer intent from request content
   */
  private async inferIntent(request: RoutingRequest): Promise<Intent> {
    const content = request.messages?.map(m => m.content).join(' ') || '';
    
    // Simple keyword-based intent inference
    // In a real implementation, this would use NLP models
    const intents = [
      { type: 'question' as const, keywords: ['what', 'how', 'why', 'when', 'where', '?'] },
      { type: 'command' as const, keywords: ['help', 'status', 'config', 'list'] },
      { type: 'greeting' as const, keywords: ['hello', 'hi', 'hey', 'good morning'] },
      { type: 'farewell' as const, keywords: ['bye', 'goodbye', 'see you', 'farewell'] },
      { type: 'moderation' as const, keywords: ['ban', 'kick', 'mute', 'warn'] },
      { type: 'self_edit' as const, keywords: ['improve', 'optimize', 'learn', 'update'] },
      { type: 'file_operation' as const, keywords: ['read', 'write', 'delete', 'search'] }
    ];

    const lowerContent = content.toLowerCase();
    let bestMatch: { type: 'question' | 'command' | 'greeting' | 'farewell' | 'moderation' | 'self_edit' | 'file_operation' | 'unknown', confidence: number } = { type: 'unknown', confidence: 0 };

    for (const intent of intents) {
      const matches = intent.keywords.filter(keyword => lowerContent.includes(keyword)).length;
      const confidence = matches / intent.keywords.length;
      
      if (confidence > bestMatch.confidence) {
        bestMatch = { type: intent.type, confidence };
      }
    }

    return {
      type: bestMatch.type,
      confidence: bestMatch.confidence,
      parameters: {},
      subIntents: [],
      context: {
        previousIntents: [],
        userHistory: {
          commonIntents: [],
          intentPatterns: [],
          successRate: {} as Record<string, number>,
          lastUsed: {} as Record<string, Date>
        },
        conversationFlow: {
          stage: 'opening',
          progress: 0,
          expectedNextIntents: [],
          blockers: []
        },
        temporalContext: {
          timeOfDay: 'morning',
          dayOfWeek: 'monday',
          season: 'spring',
          recentEvents: []
        }
      }
    } as any;
  }

  /**
   * Select routing strategy
   */
  private selectRoutingStrategy(analysis: RequestAnalysis): RoutingStrategy {
    // High urgency requests get priority routing
    if (analysis.urgency === 'critical') {
      return this.routingStrategies.get('priority') || this.routingStrategies.get('default')!;
    }

    // High complexity requests get intelligent routing
    if (analysis.complexity === 'high') {
      return this.routingStrategies.get('intelligent') || this.routingStrategies.get('default')!;
    }

    // Cost sensitive requests get cost-optimized routing
    if (analysis.costSensitivity === 'high') {
      return this.routingStrategies.get('cost_optimized') || this.routingStrategies.get('default')!;
    }

    // Latency sensitive requests get fastest routing
    if (analysis.latencySensitivity === 'high') {
      return this.routingStrategies.get('fastest') || this.routingStrategies.get('default')!;
    }

    return this.routingStrategies.get('default')!;
  }

  /**
   * Preprocess request
   */
  private async preprocessRequest(
    request: RoutingRequest, 
    analysis: RequestAnalysis
  ): Promise<RoutingRequest> {
    const preprocessed = { ...request };

    // Add context information
    if (analysis.context) {
      preprocessed.context = analysis.context;
    }

    // Optimize token limits based on complexity
    if (!preprocessed.maxTokens) {
      switch (analysis.complexity) {
        case 'low':
          preprocessed.maxTokens = 1000;
          break;
        case 'medium':
          preprocessed.maxTokens = 4000;
          break;
        case 'high':
          preprocessed.maxTokens = 8000;
          break;
      }
    }

    // Adjust temperature based on content type
    if (!preprocessed.temperature) {
      switch (analysis.contentType) {
        case 'generation':
          preprocessed.temperature = 0.8;
          break;
        case 'analysis':
          preprocessed.temperature = 0.3;
          break;
        case 'help':
          preprocessed.temperature = 0.5;
          break;
        default:
          preprocessed.temperature = 0.7;
      }
    }

    return preprocessed;
  }

  /**
   * Check if request should be queued
   */
  private shouldQueueRequest(request: RoutingRequest, analysis: RequestAnalysis): boolean {
    // Low priority requests can be queued during high load
    if (analysis.priority === 'low' && this.getCurrentLoad() > 0.8) {
      return true;
    }

    // Non-urgent requests can be queued during peak hours
    if (analysis.urgency === 'low' && this.isPeakHours()) {
      return true;
    }

    return false;
  }

  /**
   * Queue request
   */
  private async queueRequest(
    requestId: string, 
    request: RoutingRequest, 
    analysis: RequestAnalysis
  ): Promise<RoutingResult> {
    const queuedRequest: QueuedRequest = {
      id: requestId,
      request,
      analysis,
      queuedAt: new Date(),
      estimatedProcessingTime: this.estimateQueueTime()
    };

    this.requestQueue.set(requestId, queuedRequest);

    // Process queue asynchronously
    setTimeout(async () => {
      try {
        const result = await this.routeRequest(request);
        // Notify of completion (implementation depends on notification system)
        this.logger.info(`Queued request ${requestId} completed`, result);
      } catch (error) {
        this.logger.error(`Queued request ${requestId} failed`, error as Error);
      }
    }, queuedRequest.estimatedProcessingTime);

    return {
      requestId,
      queued: true,
      estimatedProcessingTime: queuedRequest.estimatedProcessingTime,
      queuePosition: this.requestQueue.size
    } as RoutingResult;
  }

  /**
   * Make routing decision
   */
  private async makeRoutingDecision(
    request: RoutingRequest,
    analysis: RequestAnalysis,
    strategy: RoutingStrategy
  ): Promise<RoutingDecision> {
    const modelSelectionRequest: ModelSelectionRequest = {
      id: this.generateRequestId(),
      userId: request.userId || '',
      guildId: request.guildId || '',
      channelId: request.channelId || '',
      intent: analysis.intent,
      messages: request.messages || [],
      requiredCapabilities: analysis.capabilities,
      maxTokens: request.maxTokens || 1000,
      contextWindow: request.contextWindow,
      maxCost: analysis.costSensitivity === 'high' ? 0.01 : undefined,
      priority: analysis.priority
    };

    const modelSelection = await this.modelSelector.selectModel(modelSelectionRequest);

    return {
      provider: modelSelection.provider.getProviderInfo().id,
      model: modelSelection.model.modelId,
      confidence: modelSelection.confidence,
      reasoning: modelSelection.reasoning,
      strategy: strategy.name,
      estimatedCost: await modelSelection.provider.estimateCost({
        id: modelSelectionRequest.id,
        model: modelSelection.model.modelId,
        messages: request.messages || [],
        maxTokens: request.maxTokens,
        timestamp: new Date()
      })
    };
  }

  /**
   * Execute request
   */
  private async executeRequest(
    requestId: string,
    decision: RoutingDecision,
    request: RoutingRequest
  ): Promise<AIResponse> {
    const providerHealth = this.modelSelector.getProviderHealth();
    // Get provider through public method instead of accessing private property
    const availableProviders = this.modelSelector.getAvailableModels();
    const provider = availableProviders.find(p => p.providerId === decision.provider);
    
    if (!provider) {
      throw new Error(`Provider ${decision.provider} not available`);
    }
    
    if (!provider) {
      throw new Error(`Provider ${decision.provider} not available`);
    }

    const activeRequest: ActiveRequest = {
      id: requestId,
      provider: decision.provider,
      model: decision.model,
      startedAt: new Date(),
      status: 'executing'
    };

    this.activeRequests.set(requestId, activeRequest);

    try {
      const response = await provider.generateResponse({
        id: requestId,
        model: decision.model,
        messages: request.messages || [],
        maxTokens: request.maxTokens || 1000,
        temperature: request.temperature,
        topP: request.topP,
        frequencyPenalty: request.frequencyPenalty,
        presencePenalty: request.presencePenalty,
        functions: request.functions,
        function_call: request.function_call,
        tools: request.tools,
        tool_choice: request.tool_choice,
        timestamp: new Date()
      });

      if (!response) {
        throw new Error('No response received from provider');
      }

      activeRequest.status = 'completed';
      activeRequest.completedAt = new Date();
      
      return response;

    } catch (error) {
      activeRequest.status = 'failed';
      activeRequest.error = error as Error;
      throw error;
    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Post-process response
   */
  private async postProcessResponse(
    response: AIResponse,
    analysis: RequestAnalysis
  ): Promise<AIResponse> {
    // Add routing metadata
    response.metadata.routing = {
      analysis,
      processedAt: new Date(),
      optimizations: []
    };

    // Apply content filtering if needed
    if (analysis.contentType === 'moderation') {
      response.content = await this.applyModerationFilters(response.content);
    }

    // Apply formatting based on content type
    response.content = this.formatResponse(response.content, analysis.contentType);

    return response;
  }

  /**
   * Update metrics
   */
  private updateMetrics(
    requestId: string,
    decision: RoutingDecision,
    response: AIResponse,
    processingTime: number
  ): void {
    // Update provider stats
    this.modelSelector.updateRequestStats(
      decision.provider,
      true,
      processingTime,
      decision.estimatedCost || 0
    );

    // Log routing decision
    this.logger.info('Request routing completed', {
      requestId,
      provider: decision.provider,
      model: decision.model,
      processingTime,
      tokensUsed: response.usage.totalTokens,
      cost: decision.estimatedCost
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCurrentLoad(): number {
    return this.activeRequests.size / Math.max(1, this.activeRequests.size + this.requestQueue.size);
  }

  private isPeakHours(): boolean {
    const hour = new Date().getHours();
    return hour >= 9 && hour <= 17; // 9 AM to 5 PM
  }

  private estimateQueueTime(): number {
    return this.requestQueue.size * 5000; // 5 seconds per queued request
  }

  private async applyModerationFilters(content: string): Promise<string> {
    // Placeholder for moderation filtering
    return content;
  }

  private formatResponse(content: string, contentType: string): string {
    // Basic formatting based on content type
    switch (contentType) {
      case 'help':
        return content.replace(/\n/g, '\n• ');
      case 'analysis':
        return `**Analysis:**\n${content}`;
      case 'generation':
        return `**Generated Content:**\n${content}`;
      default:
        return content;
    }
  }

  private initializeRoutingStrategies(config: RouterConfig): void {
    this.routingStrategies.set('default', {
      name: 'default',
      algorithm: 'intelligent',
      weights: {
        cost: 0.3,
        speed: 0.3,
        quality: 0.4
      }
    });

    this.routingStrategies.set('priority', {
      name: 'priority',
      algorithm: 'priority_based',
      weights: {
        cost: 0.1,
        speed: 0.2,
        quality: 0.7
      }
    });

    this.routingStrategies.set('cost_optimized', {
      name: 'cost_optimized',
      algorithm: 'least_cost',
      weights: {
        cost: 0.8,
        speed: 0.1,
        quality: 0.1
      }
    });

    this.routingStrategies.set('fastest', {
      name: 'fastest',
      algorithm: 'fastest',
      weights: {
        cost: 0.1,
        speed: 0.8,
        quality: 0.1
      }
    });

    this.routingStrategies.set('intelligent', {
      name: 'intelligent',
      algorithm: 'adaptive',
      weights: {
        cost: 0.3,
        speed: 0.3,
        quality: 0.4
      }
    });
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

export interface RouterConfig {
  maxConcurrentRequests: number;
  queueSize: number;
  timeoutMs: number;
  retryAttempts: number;
  strategies: RoutingStrategyConfig[];
}

export interface RoutingStrategyConfig {
  name: string;
  algorithm: string;
  weights: Record<string, number>;
  conditions?: Record<string, any>;
}

export interface RoutingRequest {
  id?: string;
  userId?: string;
  guildId?: string;
  channelId?: string;
  userRole?: string;
  userTier?: string;
  userStats?: UserStats;
  priority?: Priority;
  intent?: Intent;
  context?: ConversationContext;
  messages?: any[];
  maxTokens?: number;
  contextWindow?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  functions?: any[];
  function_call?: any;
  tools?: any[];
  tool_choice?: any;
  attachments?: Attachment[];
}

export interface RoutingResult {
  requestId: string;
  response?: AIResponse;
  routingDecision?: RoutingDecision;
  processingTime: number;
  strategy: RoutingStrategy;
  analysis: RequestAnalysis;
  queued?: boolean;
  estimatedProcessingTime?: number;
  queuePosition?: number;
}

export interface RequestAnalysis {
  complexity: 'low' | 'medium' | 'high';
  priority: Priority;
  estimatedTokens: number;
  capabilities: string[];
  contentType: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  costSensitivity: 'low' | 'medium' | 'high';
  latencySensitivity: 'low' | 'medium' | 'high';
  intent?: Intent;
  context?: ConversationContext;
}

export interface RoutingDecision {
  provider: string;
  model: string;
  confidence: number;
  reasoning: string[];
  strategy: string;
  estimatedCost: number;
}

export interface RoutingStrategy {
  name: string;
  algorithm: string;
  weights: Record<string, number>;
}

export interface QueuedRequest {
  id: string;
  request: RoutingRequest;
  analysis: RequestAnalysis;
  queuedAt: Date;
  estimatedProcessingTime: number;
}

export interface ActiveRequest {
  id: string;
  provider: string;
  model: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'executing' | 'completed' | 'failed';
  error?: Error;
}

export interface UserStats {
  dailyRequests: number;
  monthlyRequests: number;
  averageTokensPerRequest: number;
  lastRequest: Date;
}

export interface Attachment {
  type: string;
  url: string;
  size: number;
  name: string;
}