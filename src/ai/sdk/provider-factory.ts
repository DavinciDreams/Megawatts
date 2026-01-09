/**
 * Provider Factory
 *
 * This module provides a factory for creating AI SDK providers
 * while maintaining compatibility with existing provider configuration.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { ProviderConfig } from '../../types/ai';
import { Logger } from '../../utils/logger';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Created provider with metadata
 */
export interface CreatedProvider {
  type: 'openai' | 'anthropic' | 'openrouter';
  provider: any; // AI SDK provider instance
  config: ProviderConfig;
}

/**
 * Provider factory configuration
 */
export interface ProviderFactoryConfig {
  openai?: {
    apiKey?: string;
    baseURL?: string;
  };
  anthropic?: {
    apiKey?: string;
    baseURL?: string;
  };
  openrouter?: {
    apiKey?: string;
    baseURL?: string;
    customHeaders?: Record<string, string>;
  };
}

// ============================================================================
// PROVIDER FACTORY CLASS
// ============================================================================

/**
 * Factory for creating AI SDK providers
 */
export class ProviderFactory {
  private logger: Logger;
  private config: ProviderFactoryConfig;
  private providers: Map<string, CreatedProvider> = new Map();

  constructor(config: ProviderFactoryConfig, logger: Logger) {
    this.logger = logger;
    this.config = config;
  }

  /**
   * Create OpenAI provider using AI SDK
   */
  createOpenAIProvider(): CreatedProvider {
    try {
      const provider = createOpenAI({
        apiKey: this.config.openai?.apiKey || process.env.OPENAI_API_KEY || '',
        baseURL: this.config.openai?.baseURL
      });

      const providerConfig: ProviderConfig = {
        apiKey: this.config.openai?.apiKey || process.env.OPENAI_API_KEY || '',
        endpoint: this.config.openai?.baseURL,
        retries: 3,
        customHeaders: {}
      };

      const created: CreatedProvider = {
        type: 'openai',
        provider,
        config: providerConfig
      };

      this.providers.set('openai', created);
      this.logger.info('OpenAI provider created using AI SDK');

      return created;
    } catch (error) {
      this.logger.error('Failed to create OpenAI provider', error as Error);
      throw new Error(`Failed to create OpenAI provider: ${(error as Error).message}`);
    }
  }

  /**
   * Create Anthropic provider using AI SDK
   */
  createAnthropicProvider(): CreatedProvider {
    try {
      const provider = createAnthropic({
        apiKey: this.config.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY || '',
        baseURL: this.config.anthropic?.baseURL
      });

      const providerConfig: ProviderConfig = {
        apiKey: this.config.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY || '',
        endpoint: this.config.anthropic?.baseURL,
        retries: 3,
        customHeaders: {}
      };

      const created: CreatedProvider = {
        type: 'anthropic',
        provider,
        config: providerConfig
      };

      this.providers.set('anthropic', created);
      this.logger.info('Anthropic provider created using AI SDK');

      return created;
    } catch (error) {
      this.logger.error('Failed to create Anthropic provider', error as Error);
      throw new Error(`Failed to create Anthropic provider: ${(error as Error).message}`);
    }
  }

  /**
   * Create OpenRouter provider (OpenAI-compatible)
   */
  createOpenRouterProvider(): CreatedProvider {
    try {
      // OpenRouter uses OpenAI-compatible API
      const provider = createOpenAI({
        apiKey: this.config.openrouter?.apiKey || process.env.OPENROUTER_API_KEY || '',
        baseURL: this.config.openrouter?.baseURL || 'https://openrouter.ai/api/v1',
        // OpenRouter requires custom headers
        headers: {
          'HTTP-Referer': this.config.openrouter?.customHeaders?.['HTTP-Referer'] || 'https://github.com/your-org/self-editing-discord-bot',
          'X-Title': this.config.openrouter?.customHeaders?.['X-Title'] || 'Self-Editing Discord Bot',
          ...this.config.openrouter?.customHeaders
        }
      });

      const providerConfig: ProviderConfig = {
        apiKey: this.config.openrouter?.apiKey || process.env.OPENROUTER_API_KEY || '',
        endpoint: this.config.openrouter?.baseURL || 'https://openrouter.ai/api/v1',
        retries: 3,
        customHeaders: this.config.openrouter?.customHeaders || {}
      };

      const created: CreatedProvider = {
        type: 'openrouter',
        provider,
        config: providerConfig
      };

      this.providers.set('openrouter', created);
      this.logger.info('OpenRouter provider created using AI SDK (OpenAI-compatible)');

      return created;
    } catch (error) {
      this.logger.error('Failed to create OpenRouter provider', error as Error);
      throw new Error(`Failed to create OpenRouter provider: ${(error as Error).message}`);
    }
  }

  /**
   * Get a previously created provider
   */
  getProvider(type: 'openai' | 'anthropic' | 'openrouter'): CreatedProvider | undefined {
    return this.providers.get(type);
  }

  /**
   * Get all created providers
   */
  getAllProviders(): CreatedProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Create provider from ProviderConfig
   */
  createProviderFromConfig(config: ProviderConfig): CreatedProvider {
    // Determine provider type from endpoint or config
    const endpoint = config.endpoint || '';

    if (endpoint.includes('openrouter.ai') || endpoint.includes('openrouter')) {
      return this.createOpenRouterProvider();
    } else if (endpoint.includes('anthropic') || endpoint.includes('api.anthropic.com')) {
      return this.createAnthropicProvider();
    } else {
      // Default to OpenAI
      return this.createOpenAIProvider();
    }
  }

  /**
   * Create all providers based on configuration
   */
  createAllProviders(): void {
    if (this.config.openai) {
      this.createOpenAIProvider();
    }
    if (this.config.anthropic) {
      this.createAnthropicProvider();
    }
    if (this.config.openrouter) {
      this.createOpenRouterProvider();
    }
  }

  /**
   * Clear all providers
   */
  clearProviders(): void {
    this.providers.clear();
    this.logger.info('All providers cleared');
  }

  /**
   * Check if a provider is available
   */
  async isProviderAvailable(type: 'openai' | 'anthropic' | 'openrouter'): Promise<boolean> {
    const created = this.providers.get(type);
    if (!created) {
      return false;
    }

    try {
      // Simple availability check - try to create a minimal request
      // This is a basic check - actual implementation would depend on provider
      return true;
    } catch (error) {
      this.logger.warn(`Provider ${type} availability check failed`, error as Error);
      return false;
    }
  }
}
