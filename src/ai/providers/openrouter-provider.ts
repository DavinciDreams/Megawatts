/**
 * OpenRouter Provider Implementation
 * 
 * This module implements the OpenRouter AI provider, which provides access
 * to multiple AI models through a unified OpenAI-compatible API.
 * OpenRouter supports tool calling using OpenAI-style format.
 */

import {
  BaseAIProvider
} from '../core/ai-provider';
import {
  AIProvider,
  AIModel,
  AIRequest,
  AIResponse,
  ProviderConfig,
  ValidationResult
} from '../../types/ai';
import { Logger } from '../../utils/logger';
import OpenAI from 'openai';
import { createOpenAI } from '@ai-sdk/openai';

// ============================================================================
// OPENROUTER PROVIDER
// ============================================================================

export class OpenRouterProvider extends BaseAIProvider {
  private client: OpenAI;
  private baseURL: string = 'https://openrouter.ai/api/v1';
  
  // AI SDK integration
  private useAISDK: boolean = false;
  private aiSDKProvider: any = null;

  constructor(config: ProviderConfig, logger: Logger) {
    super(config, logger);
    
    // Initialize OpenAI client with OpenRouter endpoint
    this.client = new OpenAI({
      apiKey: config.apiKey || '',
      baseURL: config.endpoint || this.baseURL,
      defaultHeaders: {
        'HTTP-Referer': config.customHeaders?.['HTTP-Referer'] || 'https://github.com/your-org/self-editing-discord-bot',
        'X-Title': config.customHeaders?.['X-Title'] || 'Self-Editing Discord Bot',
        ...config.customHeaders
      }
    });

    if (config.endpoint) {
      this.baseURL = config.endpoint;
    }
    
    // Initialize AI SDK provider if enabled
    if (config.useAISDKForProviders) {
      this.useAISDK = true;
      this.aiSDKProvider = createOpenAI({
        apiKey: config.apiKey || '',
        baseURL: config.endpoint || this.baseURL,
        headers: {
          'HTTP-Referer': config.customHeaders?.['HTTP-Referer'] || 'https://github.com/your-org/self-editing-discord-bot',
          'X-Title': config.customHeaders?.['X-Title'] || 'Self-Editing Discord Bot',
          ...config.customHeaders
        }
      });
      
      this.logger.info('AI SDK provider initialized for OpenRouter');
    }
  }

  getProviderInfo(): AIProvider {
    return {
      id: 'openrouter',
      name: 'OpenRouter',
      type: 'openrouter',
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
          requestsPerMinute: 60,
          tokensPerMinute: 150000
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
        tokensPerMinute: 150000
      },
      priority: 2,
      isAvailable: true
    };
  }

  getAvailableModels(): AIModel[] {
    return [
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'openrouter',
        type: 'claude-3.5-sonnet',
        maxTokens: 200000,
        contextWindow: 200000,
        costPerToken: 0.000003,
        cost: {
          input: 0.000003,
          output: 0.000015,
          currency: 'USD'
        },
        capabilities: [
          { name: 'text', description: 'Advanced text generation and reasoning', supported: true },
          { name: 'function_calling', description: 'Function calling capabilities', supported: true },
          { name: 'code_generation', description: 'Code generation and analysis', supported: true }
        ],
        isDefault: true
      },
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        provider: 'openrouter',
        type: 'gpt-4o',
        maxTokens: 128000,
        contextWindow: 128000,
        costPerToken: 0.000005,
        cost: {
          input: 0.000005,
          output: 0.000015,
          currency: 'USD'
        },
        capabilities: [
          { name: 'text', description: 'Advanced text generation', supported: true },
          { name: 'function_calling', description: 'Function calling capabilities', supported: true },
          { name: 'code_generation', description: 'Code generation and analysis', supported: true }
        ],
        isDefault: false
      },
      {
        id: 'openai/gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'openrouter',
        type: 'gpt-4-turbo',
        maxTokens: 128000,
        contextWindow: 128000,
        costPerToken: 0.00001,
        cost: {
          input: 0.00001,
          output: 0.00003,
          currency: 'USD'
        },
        capabilities: [
          { name: 'text', description: 'Advanced text generation', supported: true },
          { name: 'function_calling', description: 'Function calling capabilities', supported: true },
          { name: 'code_generation', description: 'Code generation and analysis', supported: true }
        ],
        isDefault: false
      },
      {
        id: 'google/gemini-pro-1.5',
        name: 'Gemini Pro 1.5',
        provider: 'openrouter',
        type: 'gemini-pro-1.5',
        maxTokens: 1000000,
        contextWindow: 1000000,
        costPerToken: 0.00000125,
        cost: {
          input: 0.00000125,
          output: 0.000005,
          currency: 'USD'
        },
        capabilities: [
          { name: 'text', description: 'Advanced text generation with large context', supported: true },
          { name: 'function_calling', description: 'Function calling capabilities', supported: true },
          { name: 'code_generation', description: 'Code generation and analysis', supported: true }
        ],
        isDefault: false
      },
      {
        id: 'mistralai/devstral-2512:free',
        name: 'Mistral Devstral 2512 (Free)',
        provider: 'openrouter',
        type: 'devstral-2512',
        maxTokens: 128000,
        contextWindow: 128000,
        costPerToken: 0,
        cost: {
          input: 0,
          output: 0,
          currency: 'USD'
        },
        capabilities: [
          { name: 'text', description: 'Advanced text generation', supported: true },
          { name: 'function_calling', description: 'Function calling capabilities', supported: true }
        ],
        isDefault: false
      }
    ];
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.config.customHeaders?.['HTTP-Referer'] || 'https://github.com/your-org/self-editing-discord-bot',
          'X-Title': this.config.customHeaders?.['X-Title'] || 'Self-Editing Discord Bot'
        },
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      this.logger.error('OpenRouter provider availability check failed', error as Error);
      return false;
    }
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    try {
      // Check rate limits
      if (!await this.checkRateLimit('requests', this.getProviderInfo().rateLimits.requestsPerMinute)) {
        throw this.createError('Rate limit exceeded', 'rate_limit_exceeded');
      }

      // Ensure model is set BEFORE building request
      // This allows buildOpenRouterRequest to access the model for tool_choice conversion
      const model = request.model || 'anthropic/claude-3.5-sonnet';
      request.model = model;

      const requestBody = this.buildOpenRouterRequest(request);
      
      const response = await this.client.chat.completions.create({
        ...requestBody,
        model
      });

      return this.parseOpenRouterResponse(response, request);

    } catch (error) {
      this.logger.error('OpenRouter request failed', error as Error);
      
      // Handle OpenAI SDK errors
      if (error instanceof Error && 'status' in error) {
        const apiError = error as any;
        throw this.createError(
          apiError.message || 'Request failed',
          'api_error',
          { status: apiError.status, details: apiError }
        );
      }
      
      throw error;
    }
  }

  async validateRequest(request: AIRequest): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!request.messages || request.messages.length === 0) {
      errors.push('Messages array is required and cannot be empty');
    }

    // Check if model is supported
    const model = this.getAvailableModels().find(m => m.id === request.model);
    if (!model) {
      errors.push(`Model ${request.model} is not supported by OpenRouter provider`);
    } else {
      // Check max tokens against model's context window
      if (request.maxTokens && request.maxTokens > model.maxTokens) {
        warnings.push(`Max tokens (${request.maxTokens}) exceeds model's maximum (${model.maxTokens})`);
      }
    }

    // Validate tools format if provided
    if (request.tools) {
      for (const tool of request.tools) {
        if (!tool.type || tool.type !== 'function') {
          errors.push('Tool type must be "function"');
        }
        if (!tool.function || !tool.function.name || !tool.function.parameters) {
          errors.push('Tool must have function with name and parameters');
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  async estimateCost(request: AIRequest): Promise<number> {
    const model = this.getAvailableModels().find(m => m.id === request.model);
    if (!model) return 0;

    // Estimate input tokens (rough calculation: ~4 chars per token)
    const inputText = request.messages.map(m => m.content).join(' ');
    const estimatedInputTokens = Math.ceil(inputText.length / 4);
    const estimatedOutputTokens = request.maxTokens || 1000;

    // Calculate cost based on input and output rates
    const inputCost = (estimatedInputTokens / 1000) * model.cost.input;
    const outputCost = (estimatedOutputTokens / 1000) * model.cost.output;

    return inputCost + outputCost;
  }

  /**
   * Build OpenRouter request in OpenAI-compatible format
   */
  private buildOpenRouterRequest(request: AIRequest): any {
    const requestBody: any = {
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        ...(msg.name && { name: msg.name }),
        ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
        ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id })
      })),
      temperature: request.temperature ?? 0.7,
      top_p: request.topP,
      stream: false
    };

    // Add optional parameters
    if (request.maxTokens) {
      requestBody.max_tokens = request.maxTokens;
    }

    if (request.frequencyPenalty !== undefined) {
      requestBody.frequency_penalty = request.frequencyPenalty;
    }

    if (request.presencePenalty !== undefined) {
      requestBody.presence_penalty = request.presencePenalty;
    }

    // Add tools and tool_choice for function calling
    if (request.tools && request.tools.length > 0) {
      requestBody.tools = request.tools;
    }

    // Handle tool_choice format - Anthropic requires object format, OpenAI uses string
    if (request.tool_choice) {
      const isAnthropicModel = request.model?.startsWith('anthropic/');
      
      if (isAnthropicModel && typeof request.tool_choice === 'string') {
        // Anthropic expects {type: "auto"} instead of "auto"
        const toolChoiceMap: Record<string, string> = {
          'auto': 'auto',
          'required': 'any',
          'none': 'none'
        };
        
        const anthropicType = toolChoiceMap[request.tool_choice] || 'auto';
        requestBody.tool_choice = { type: anthropicType };
        
        this.logger.debug('[TOOL_CHOICE] Converted tool_choice for Anthropic model', {
          model: request.model,
          original: request.tool_choice,
          converted: requestBody.tool_choice
        });
      } else {
        // OpenAI and other providers use string format
        requestBody.tool_choice = request.tool_choice;
        
        if (isAnthropicModel) {
          this.logger.debug('[TOOL_CHOICE] Using object format for Anthropic', {
            model: request.model,
            tool_choice: requestBody.tool_choice
          });
        }
      }
    }

    // Legacy function calling support
    if (request.functions) {
      requestBody.functions = request.functions;
    }

    if (request.function_call) {
      requestBody.function_call = request.function_call;
    }

    return requestBody;
  }

  /**
   * Parse OpenRouter response to AIResponse format
   */
  private parseOpenRouterResponse(data: any, request: AIRequest): AIResponse {
    const choice = data.choices[0];
    const message = choice.message;
    
    return {
      id: data.id,
      model: data.model,
      created: new Date(data.created * 1000),
      content: message.content || '',
      role: message.role || 'assistant',
      finishReason: choice.finish_reason,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      },
      functionCall: message.function_call,
      toolCalls: message.tool_calls,
      metadata: {
        provider: 'openrouter',
        requestId: request.id,
        processingTime: Date.now() - request.timestamp.getTime(),
        type: 'text',
        format: 'markdown',
        length: message.content?.length || 0,
        tokens: data.usage?.total_tokens || 0,
        tokensUsed: data.usage?.total_tokens || 0,
        modelUsed: data.model
      }
    };
  }
}
