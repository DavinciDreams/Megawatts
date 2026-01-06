/**
 * AI Provider Interface and Implementations
 * 
 * This module defines the interface for AI providers and implements
 * support for OpenAI, Anthropic, and local models.
 */

import {
  AIProvider,
  AIModel,
  AICapability,
  ProviderConfig,
  RateLimit,
  ModelCapability,
  AIRequest,
  AIMessage,
  AIResponse,
  TokenUsage,
  ResponseMetadata,
  ValidationResult
} from '../../types/ai';
import { Logger } from '../../utils/logger';

// ============================================================================
// BASE AI PROVIDER INTERFACE
// ============================================================================

export abstract class BaseAIProvider {
  protected config: ProviderConfig;
  protected logger: Logger;
  protected rateLimiter: Map<string, number[]> = new Map();
  
  constructor(config: ProviderConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  abstract getProviderInfo(): AIProvider;
  abstract getAvailableModels(): AIModel[];
  abstract isAvailable(): Promise<boolean>;
  abstract generateResponse(request: AIRequest): Promise<AIResponse>;
  abstract validateRequest(request: AIRequest): Promise<ValidationResult>;
  abstract estimateCost(request: AIRequest): Promise<number>;

  protected async checkRateLimit(requestId: string, limit: number): Promise<boolean> {
    const now = Date.now();
    const requests = this.rateLimiter.get(requestId) || [];
    
    // Remove requests older than 1 minute
    const validRequests = requests.filter(time => now - time < 60000);
    
    if (validRequests.length >= limit) {
      return false;
    }
    
    validRequests.push(now);
    this.rateLimiter.set(requestId, validRequests);
    return true;
  }

  protected createError(message: string, code: string, details?: any): AIError {
    return {
      type: 'provider_error',
      code,
      message,
      details,
      timestamp: new Date(),
      recoverable: true
    };
  }
}

// ============================================================================
// OPENAI PROVIDER
// ============================================================================

export class OpenAIProvider extends BaseAIProvider {
  private apiKey: string;
  private baseURL: string = 'https://api.openai.com/v1';

  constructor(config: ProviderConfig, logger: Logger) {
    super(config, logger);
    this.apiKey = config.apiKey || '';
    if (config.endpoint) {
      this.baseURL = config.endpoint;
    }
  }

  getProviderInfo(): AIProvider {
    return {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai',
      models: this.getAvailableModels(),
      capabilities: [
        { type: 'text', supported: true, confidence: 0.95 },
        { type: 'function_calling', supported: true, confidence: 0.90 },
        { type: 'code_generation', supported: true, confidence: 0.85 }
      ],
      config: {
        apiKey: this.config.apiKey,
        endpoint: this.config.endpoint,
        timeout: this.config.timeout || 30000,
        retries: this.config.retries || 3,
        customHeaders: this.config.customHeaders || {},
        rateLimit: {
          requestsPerMinute: 3500,
          tokensPerMinute: 90000
        },
        fallback: {
          enabled: false,
          providers: [],
          threshold: 0.5
        }
      },
      status: 'active',
      health: {
        status: 'healthy',
        lastCheck: new Date(),
        responseTime: 0,
        errorRate: 0,
        uptime: 1
      },
      rateLimits: {
        requestsPerMinute: 3500,
        tokensPerMinute: 90000
      },
      priority: 1,
      isAvailable: true
    };
  }

  getAvailableModels(): AIModel[] {
    return [
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        type: 'gpt-3.5-turbo',
        maxTokens: 16384,
        contextWindow: 16384,
        costPerToken: 0.000002,
        cost: {
          input: 0.000002,
          output: 0.000004,
          currency: 'USD'
        },
        capabilities: [
          { name: 'text', description: 'Advanced text generation', supported: true },
          { name: 'function_calling', description: 'Function calling capabilities', supported: true },
          { name: 'code_generation', description: 'Code generation and analysis', supported: true }
        ],
        isDefault: true
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        type: 'gpt-3.5-turbo',
        maxTokens: 16384,
        contextWindow: 16384,
        costPerToken: 0.000002,
        cost: {
          input: 0.000002,
          output: 0.000004,
          currency: 'USD'
        },
        capabilities: [
          { name: 'text', description: 'Text generation', supported: true },
          { name: 'function_calling', description: 'Basic function calling', supported: true }
        ],
        isDefault: false
      }
    ];
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      this.logger.error('OpenAI provider availability check failed', error as Error);
      return false;
    }
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    try {
      // Check rate limits
      if (!await this.checkRateLimit('requests', this.getProviderInfo().rateLimits.requestsPerMinute)) {
        throw this.createError('Rate limit exceeded', 'rate_limit_exceeded');
      }

      const requestBody = this.buildOpenAIRequest(request);
      
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeout || 30000)
      });

      if (!response.ok) {
        const error = await response.json();
        throw this.createError(error.error?.message || 'Request failed', 'api_error', error);
      }

      const data = await response.json();
      return this.parseOpenAIResponse(data, request);

    } catch (error) {
      this.logger.error('OpenAI request failed', error as Error);
      throw error;
    }
  }

  async validateRequest(request: AIRequest): Promise<ValidationResult> {
    const errors: string[] = [];
    
    if (!request.messages || request.messages.length === 0) {
      errors.push('Messages array is required and cannot be empty');
    }

    if (request.maxTokens && request.maxTokens > 128000) {
      errors.push('Max tokens cannot exceed 128000 for OpenAI models');
    }

    const model = this.getAvailableModels().find(m => m.id === request.model);
    if (!model) {
      errors.push(`Model ${request.model} is not supported by OpenAI provider`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  async estimateCost(request: AIRequest): Promise<number> {
    const model = this.getAvailableModels().find(m => m.id === request.model);
    if (!model) return 0;

    // Estimate input tokens (rough calculation)
    const inputText = request.messages.map(m => m.content).join(' ');
    const estimatedInputTokens = Math.ceil(inputText.length / 4);
    const estimatedOutputTokens = request.maxTokens || 1000;

    return (estimatedInputTokens + estimatedOutputTokens) * model.costPerToken;
  }

  private buildOpenAIRequest(request: AIRequest): any {
    return {
      model: request.model || 'gpt-3.5-turbo',
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        ...(msg.function_call && { function_call: msg.function_call }),
        ...(msg.tool_calls && { tool_calls: msg.tool_calls })
      })),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      frequency_penalty: request.frequencyPenalty,
      presence_penalty: request.presencePenalty,
      ...(request.functions && { functions: request.functions }),
      ...(request.function_call && { function_call: request.function_call }),
      ...(request.tools && { tools: request.tools }),
      ...(request.tool_choice && { tool_choice: request.tool_choice }),
      stream: false
    };
  }

  private parseOpenAIResponse(data: any, request: AIRequest): AIResponse {
    const choice = data.choices[0];
    
    return {
      id: data.id,
      model: data.model,
      created: new Date(data.created * 1000),
      content: choice.message?.content || '',
      role: choice.message?.role || 'assistant',
      finishReason: choice.finish_reason,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      },
      functionCall: choice.message?.function_call,
      toolCalls: choice.message?.tool_calls,
      metadata: {
        provider: 'openai',
        requestId: request.id,
        processingTime: Date.now() - request.timestamp.getTime(),
        type: 'text',
        format: 'markdown',
        length: choice.message?.content?.length || 0,
        tokens: data.usage?.total_tokens || 0,
        tokensUsed: data.usage?.total_tokens || 0,
        modelUsed: data.model
      } as ResponseMetadata
    };
  }
}

// ============================================================================
// ANTHROPIC PROVIDER
// ============================================================================

export class AnthropicProvider extends BaseAIProvider {
  private apiKey: string;
  private baseURL: string = 'https://api.anthropic.com/v1';

  constructor(config: ProviderConfig, logger: Logger) {
    super(config, logger);
    this.apiKey = config.apiKey || '';
    if (config.endpoint) {
      this.baseURL = config.endpoint;
    }
  }

  getProviderInfo(): AIProvider {
    return {
      id: 'anthropic',
      name: 'Anthropic',
      type: 'anthropic',
      models: this.getAvailableModels(),
      capabilities: [
        { type: 'text', supported: true, confidence: 0.95 },
        { type: 'function_calling', supported: true, confidence: 0.85 }
      ],
      config: {
        apiKey: this.config.apiKey,
        endpoint: this.config.endpoint,
        timeout: this.config.timeout || 30000,
        retries: this.config.retries || 3,
        customHeaders: this.config.customHeaders || {},
        rateLimit: {
          requestsPerMinute: 1000,
          tokensPerMinute: 40000
        },
        fallback: {
          enabled: false,
          providers: [],
          threshold: 0.5
        }
      },
      status: 'active',
      health: {
        status: 'healthy',
        lastCheck: new Date(),
        responseTime: 0,
        errorRate: 0,
        uptime: 1
      },
      rateLimits: {
        requestsPerMinute: 1000,
        tokensPerMinute: 40000
      },
      priority: 2,
      isAvailable: true
    };
  }

  getAvailableModels(): AIModel[] {
    return [
      {
        id: 'claude-sonnet-4-5-20250929',
        name: 'Claude Sonnet 4.5',
        provider: 'anthropic',
        type: 'claude-sonnet-4-5',
        maxTokens: 200000,
        contextWindow: 200000,
        costPerToken: 0.000015,
        cost: {
          input: 0.000015,
          output: 0.00003,
          currency: 'USD'
        },
        capabilities: [
          { name: 'text', description: 'Advanced reasoning and text generation', supported: true },
          { name: 'function_calling', description: 'Function calling capabilities', supported: true }
        ],
        isDefault: true
      },
      {
        id: 'claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        provider: 'anthropic',
        type: 'claude-3-sonnet',
        maxTokens: 200000,
        contextWindow: 200000,
        costPerToken: 0.000015,
        cost: {
          input: 0.000015,
          output: 0.00003,
          currency: 'USD'
        },
        capabilities: [
          { name: 'text', description: 'Balanced performance and cost', supported: true },
          { name: 'function_calling', description: 'Function calling capabilities', supported: true }
        ],
        isDefault: false
      }
    ];
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'test' }]
        }),
        signal: AbortSignal.timeout(5000)
      });
      return response.ok || response.status === 400; // 400 is ok for availability check
    } catch (error) {
      this.logger.error('Anthropic provider availability check failed', error as Error);
      return false;
    }
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    try {
      // Check rate limits
      if (!await this.checkRateLimit('requests', this.getProviderInfo().rateLimits.requestsPerMinute)) {
        throw this.createError('Rate limit exceeded', 'rate_limit_exceeded');
      }

      const requestBody = this.buildAnthropicRequest(request);
      
      const response = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeout || 30000)
      });

      if (!response.ok) {
        const error = await response.json();
        throw this.createError(error.error?.message || 'Request failed', 'api_error', error);
      }

      const data = await response.json();
      return this.parseAnthropicResponse(data, request);

    } catch (error) {
      this.logger.error('Anthropic request failed', error as Error);
      throw error;
    }
  }

  async validateRequest(request: AIRequest): Promise<ValidationResult> {
    const errors: string[] = [];
    
    if (!request.messages || request.messages.length === 0) {
      errors.push('Messages array is required and cannot be empty');
    }

    if (request.maxTokens && request.maxTokens > 200000) {
      errors.push('Max tokens cannot exceed 200000 for Anthropic models');
    }

    const model = this.getAvailableModels().find(m => m.id === request.model);
    if (!model) {
      errors.push(`Model ${request.model} is not supported by Anthropic provider`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  async estimateCost(request: AIRequest): Promise<number> {
    const model = this.getAvailableModels().find(m => m.id === request.model);
    if (!model) return 0;

    // Estimate input tokens
    const inputText = request.messages.map(m => m.content).join(' ');
    const estimatedInputTokens = Math.ceil(inputText.length / 4);
    const estimatedOutputTokens = request.maxTokens || 1000;

    return (estimatedInputTokens + estimatedOutputTokens) * model.costPerToken;
  }

  private buildAnthropicRequest(request: AIRequest): any {
    // Convert OpenAI format to Anthropic format
    const messages = this.convertMessagesToAnthropicFormat(request.messages);
    
    return {
      model: request.model || 'claude-sonnet-4-5-20250929',
      max_tokens: request.maxTokens || 1000,
      messages,
      temperature: request.temperature,
      top_p: request.topP,
      ...(request.tools && { tools: this.convertToolsToAnthropicFormat(request.tools) }),
      ...(request.tool_choice && { tool_choice: request.tool_choice }),
      stream: false
    };
  }

  private convertMessagesToAnthropicFormat(messages: AIMessage[]): any[] {
    const anthropicMessages: any[] = [];
    
    for (const message of messages) {
      if (message.role === 'system') {
        // System messages are handled separately in Anthropic
        continue;
      }
      
      anthropicMessages.push({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content
      });
    }
    
    return anthropicMessages;
  }

  private convertToolsToAnthropicFormat(tools: any[]): any[] {
    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters
    }));
  }

  private parseAnthropicResponse(data: any, request: AIRequest): AIResponse {
    const content = data.content[0];
    
    return {
      id: data.id,
      model: data.model,
      created: new Date(),
      content: content.text || '',
      role: 'assistant',
      finishReason: data.stop_reason,
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      },
      toolCalls: content.tool_calls,
      metadata: {
        provider: 'anthropic',
        requestId: request.id,
        processingTime: Date.now() - request.timestamp.getTime(),
        type: 'text',
        format: 'markdown',
        length: content.text?.length || 0,
        tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        modelUsed: data.model
      }
    };
  }
}

// ============================================================================
// LOCAL MODEL PROVIDER
// ============================================================================

export class LocalModelProvider extends BaseAIProvider {
  private modelPath: string;
  private endpoint: string;

  constructor(config: ProviderConfig, logger: Logger) {
    super(config, logger);
    this.modelPath = config.modelPath || '';
    this.endpoint = config.endpoint || 'http://localhost:8080';
  }

  getProviderInfo(): AIProvider {
    return {
      id: 'local',
      name: 'Local Models',
      type: 'local',
      models: this.getAvailableModels(),
      capabilities: [
        { type: 'text', supported: true, confidence: 0.80 },
        { type: 'function_calling', supported: true, confidence: 0.70 }
      ],
      config: {
        endpoint: this.config.endpoint,
        timeout: this.config.timeout || 60000,
        retries: this.config.retries || 3,
        modelPath: this.config.modelPath,
        rateLimit: {
          requestsPerMinute: 60,
          tokensPerMinute: 10000
        },
        fallback: {
          enabled: false,
          providers: [],
          threshold: 0.5
        }
      },
      status: 'active',
      health: {
        status: 'healthy',
        lastCheck: new Date(),
        responseTime: 0,
        errorRate: 0,
        uptime: 1
      },
      rateLimits: {
        requestsPerMinute: 60,
        tokensPerMinute: 10000
      },
      priority: 3,
      isAvailable: true
    };
  }

  getAvailableModels(): AIModel[] {
    return [
      {
        id: 'llama-2-7b',
        name: 'LLaMA 2 7B',
        provider: 'local',
        type: 'llama-2',
        maxTokens: 4096,
        contextWindow: 4096,
        costPerToken: 0, // Local models are free to run
        cost: {
          input: 0,
          output: 0,
          currency: 'USD'
        },
        capabilities: [
          { name: 'text', description: 'Basic text generation', supported: true },
          { name: 'function_calling', description: 'Limited function calling', supported: true }
        ],
        isDefault: true
      }
    ];
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      this.logger.error('Local model provider availability check failed', error as Error);
      return false;
    }
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    try {
      const requestBody = this.buildLocalRequest(request);
      
      const response = await fetch(`${this.endpoint}/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeout || 60000)
      });

      if (!response.ok) {
        const error = await response.json();
        throw this.createError(error.error || 'Request failed', 'api_error', error);
      }

      const data = await response.json();
      return this.parseLocalResponse(data, request);

    } catch (error) {
      this.logger.error('Local model request failed', error as Error);
      throw error;
    }
  }

  async validateRequest(request: AIRequest): Promise<ValidationResult> {
    const errors: string[] = [];
    
    if (!request.messages || request.messages.length === 0) {
      errors.push('Messages array is required and cannot be empty');
    }

    const model = this.getAvailableModels().find(m => m.id === request.model);
    if (!model) {
      errors.push(`Model ${request.model} is not supported by local provider`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: ['Local models may have reduced capabilities compared to cloud providers']
    };
  }

  async estimateCost(request: AIRequest): Promise<number> {
    // Local models are free to run
    return 0;
  }

  private buildLocalRequest(request: AIRequest): any {
    return {
      model: request.model || 'llama-2-7b',
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      stream: false
    };
  }

  private parseLocalResponse(data: any, request: AIRequest): AIResponse {
    return {
      id: data.id || `local-${Date.now()}`,
      model: data.model || request.model,
      created: new Date(),
      content: data.choices?.[0]?.message?.content || '',
      role: 'assistant',
      finishReason: data.choices?.[0]?.finish_reason,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      },
      metadata: {
        provider: 'local',
        requestId: request.id,
        processingTime: Date.now() - request.timestamp.getTime(),
        type: 'text',
        format: 'markdown',
        length: data.choices?.[0]?.message?.content?.length || 0,
        tokens: data.usage?.total_tokens || 0,
        tokensUsed: data.usage?.total_tokens || 0,
        modelUsed: data.model || request.model
      }
    };
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

export interface ProviderResponseMetadata {
  provider: string;
  requestId: string;
  processingTime: number;
}

export interface AIError {
  type: 'provider_error' | 'validation_error' | 'rate_limit_error' | 'timeout_error';
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  recoverable: boolean;
}