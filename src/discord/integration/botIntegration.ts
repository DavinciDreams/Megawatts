/**
 * Discord Bot Integration Module
 *
 * This module provides integration between Discord bot and conversational
 * Discord handler, enabling seamless message routing between command-based and
 * conversational modes.
 */

import { Client, Message } from 'discord.js';
import { DiscordConversationHandler } from '../conversation/DiscordConversationHandler';
import { EmotionalIntelligenceEngine } from '../emotional/EmotionalIntelligenceEngine';
import { EmergencyStopHandler } from '../emotional/EmergencyStopHandler';
import { ConversationalAIProviderRouter } from '../../ai/providers/conversationalAIProviderRouter';
import { ConversationManager, ConversationManagerConfig } from '../../ai/conversation/conversation-manager';
import { ConversationalDiscordConfig, DiscordMessage, ConversationResponse } from '../../types/conversational';
import { AIConfiguration } from '../../types/ai';
import { Logger } from '../../utils/logger';
import { DiscordContextManager } from '../context/DiscordContextManager';
import { ContextManager } from '../../ai/core/context-manager';
import { TieredStorageManager } from '../../storage/tiered/tieredStorage';
import { OpenAIProvider, AnthropicProvider, LocalModelProvider } from '../../ai/core/ai-provider';
import { ToolRegistry } from '../../ai/tools/tool-registry';

// ============================================================================
// INTEGRATION INTERFACE
// ============================================================================

export interface DiscordBotIntegration {
  /**
   * Process a Discord message through appropriate handler
   */
  processMessage(message: Message): Promise<ConversationResponse | null>;
  
  /**
   * Check if conversational mode is enabled
   */
  isConversationalMode(): boolean;
  
  /**
   * Check if a message should be handled by conversational mode
   */
  shouldUseConversationalMode(message: Message): boolean;
  
  /**
   * Get conversation handler instance
   */
  getConversationHandler(): DiscordConversationHandler | null;
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<ConversationalDiscordConfig>): void;
}

// ============================================================================
// INTEGRATION FACTORY OPTIONS
// ============================================================================

export interface DiscordBotIntegrationOptions {
  /**
   * Discord client instance
   */
  client: Client;
  
  /**
   * Conversational Discord configuration
   */
  config: ConversationalDiscordConfig;
  
  /**
   * AI configuration for provider router
   */
  aiConfig: AIConfiguration;
  
  /**
   * Logger instance
   */
  logger: Logger;
  
  /**
   * Optional: Pre-configured instances for dependency injection
   */
  conversationHandler?: DiscordConversationHandler;
  conversationManager?: ConversationManager;
  aiProviderRouter?: ConversationalAIProviderRouter;
  emotionalIntelligenceEngine?: EmotionalIntelligenceEngine;
  emergencyStopHandler?: EmergencyStopHandler;
  discordContextManager?: DiscordContextManager;
  contextManager?: ContextManager;
  tieredStorage?: TieredStorageManager;
  toolRegistry?: ToolRegistry;
}

// ============================================================================
// DISCORD BOT INTEGRATION CLASS
// ============================================================================

export class DiscordBotIntegrationImpl implements DiscordBotIntegration {
  private client: Client;
  private config: ConversationalDiscordConfig;
  private aiConfig: AIConfiguration;
  private logger: Logger;
  
  // Core components
  private conversationHandler: DiscordConversationHandler | null = null;
  private conversationManager: ConversationManager | null = null;
  private aiProviderRouter: ConversationalAIProviderRouter | null = null;
  private emotionalIntelligenceEngine: EmotionalIntelligenceEngine | null = null;
  private emergencyStopHandler: EmergencyStopHandler | null = null;
  private discordContextManager: DiscordContextManager | null = null;
  private contextManager: ContextManager | null = null;
  private tieredStorage: TieredStorageManager | null = null;
  private toolRegistry: ToolRegistry | null = null;
  
  // State tracking
  private initialized = false;
  private commandPrefix = '!';

  constructor(options: DiscordBotIntegrationOptions) {
    // Validate required config fields
    this.validateConfig(options.config, options.aiConfig);
    
    this.client = options.client;
    this.config = options.config;
    this.aiConfig = options.aiConfig;
    this.logger = options.logger;
    
    // Use injected instances if provided
    if (options.conversationHandler) {
      this.conversationHandler = options.conversationHandler;
    }
    if (options.conversationManager) {
      this.conversationManager = options.conversationManager;
    }
    if (options.aiProviderRouter) {
      this.aiProviderRouter = options.aiProviderRouter;
    }
    if (options.emotionalIntelligenceEngine) {
      this.emotionalIntelligenceEngine = options.emotionalIntelligenceEngine;
    }
    if (options.emergencyStopHandler) {
      this.emergencyStopHandler = options.emergencyStopHandler;
    }
    if (options.discordContextManager) {
      this.discordContextManager = options.discordContextManager;
    }
    if (options.contextManager) {
      this.contextManager = options.contextManager;
    }
    if (options.tieredStorage) {
      this.tieredStorage = options.tieredStorage;
    }
    if (options.toolRegistry) {
      this.toolRegistry = options.toolRegistry;
    }
    
    this.logger.info('DiscordBotIntegration created', {
      conversationalEnabled: this.config.enabled,
      mode: this.config.mode,
    });
  }
  
  /**
   * Validate configuration before initialization
   */
  private validateConfig(
    config: ConversationalDiscordConfig,
    aiConfig: AIConfiguration
  ): void {
    const errors: string[] = [];
    
    // Validate conversational config
    if (!config) {
      errors.push('ConversationalDiscordConfig is required');
    } else {
      if (config.enabled === undefined || config.enabled === null) {
        errors.push('config.enabled is required');
      }
      if (!config.mode) {
        errors.push('config.mode is required (must be "conversational", "command", or "hybrid")');
      }
      if (config.mode && !['conversational', 'command', 'hybrid'].includes(config.mode)) {
        errors.push(`config.mode must be one of: conversational, command, hybrid. Got: ${config.mode}`);
      }
      if (config.contextWindow === undefined || config.contextWindow === null) {
        errors.push('config.contextWindow is required');
      }
      if (config.memory && config.memory.mediumTermRetentionDays === undefined) {
        errors.push('config.memory.mediumTermRetentionDays is required');
      }
    }
    
    // Validate AI config
    if (!aiConfig) {
      errors.push('AIConfiguration is required');
    } else {
      // Check if at least one provider is configured
      const hasOpenAI = aiConfig.providers?.openai?.enabled && aiConfig.providers.openai.apiKey;
      const hasAnthropic = aiConfig.providers?.anthropic?.enabled && aiConfig.providers.anthropic.apiKey;
      const hasLocal = aiConfig.providers?.local?.enabled;
      
      if (!hasOpenAI && !hasAnthropic && !hasLocal) {
        errors.push('At least one AI provider must be configured and enabled with an API key');
      }
      
      if (aiConfig.providers?.openai?.enabled && !aiConfig.providers.openai.apiKey) {
        errors.push('aiConfig.providers.openai.apiKey is required when openai provider is enabled');
      }
      
      if (aiConfig.providers?.anthropic?.enabled && !aiConfig.providers.anthropic.apiKey) {
        errors.push('aiConfig.providers.anthropic.apiKey is required when anthropic provider is enabled');
      }
    }
    
    if (errors.length > 0) {
      throw new Error(
        `Configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`
      );
    }
  }
  
  /**
   * Initialize integration and all its components
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('DiscordBotIntegration already initialized');
      return;
    }
    
    try {
      this.logger.info('Initializing DiscordBotIntegration...');
      
      // Initialize components if not already provided
      await this.initializeComponents();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      this.initialized = true;
      this.logger.info('DiscordBotIntegration initialized successfully', {
        conversationalEnabled: this.config.enabled,
        mode: this.config.mode,
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize DiscordBotIntegration', error as Error);
      throw error;
    }
  }
  
  /**
   * Initialize all required components
   */
  private async initializeComponents(): Promise<void> {
    // Initialize ContextManager if not provided
    if (!this.contextManager) {
      const contextManagerConfig = {
        maxMessagesPerConversation: this.config.contextWindow,
        maxMessageAge: this.config.memory.mediumTermRetentionDays * 24 * 60 * 60 * 1000,
        memory: {
          maxMemories: 1000,
          retention: this.config.memory.mediumTermRetentionDays * 24 * 60 * 60 * 1000,
          indexing: true,
        },
        cleanup: {
          enabled: true,
          interval: 3600000, // 1 hour
          maxAge: this.config.memory.longTermRetentionDays * 24 * 60 * 60 * 1000,
        },
      };
      this.contextManager = new ContextManager(contextManagerConfig, this.logger);
      this.logger.debug('ContextManager initialized');
    }
    
    // Initialize TieredStorageManager if not provided
    if (!this.tieredStorage) {
      throw new Error(
        'TieredStorageManager must be provided via options. ' +
        'Please initialize TieredStorageManager with PostgresConnectionManager and RedisConnectionManager ' +
        'before creating DiscordBotIntegration.'
      );
    }
    
    // Initialize ConversationManager if not provided
    // IMPORTANT: This must be initialized BEFORE DiscordContextManager because DiscordContextManager depends on it
    if (!this.conversationManager) {
      const conversationManagerConfig: ConversationManagerConfig = {
        maxMessagesPerConversation: this.config.contextWindow,
        maxConversationAge: this.config.memory.mediumTermRetentionDays * 24 * 60 * 60 * 1000,
        archiveEndedConversations: true,
        cleanupEndedConversations: false,
        enablePersistence: false,
        contextWindow: this.config.contextWindow,
      };
      this.conversationManager = new ConversationManager(
        conversationManagerConfig,
        this.logger
      );
      this.logger.debug('ConversationManager initialized');
    }
    
    // Initialize DiscordContextManager if not provided
    // IMPORTANT: This must be initialized AFTER ConversationManager because it depends on it
    if (!this.discordContextManager) {
      this.discordContextManager = new DiscordContextManager(
        this.config,
        this.contextManager,
        this.conversationManager!,
        this.tieredStorage,
        this.logger
      );
      this.logger.debug('DiscordContextManager initialized');
    }
    
    // Initialize AIProviderRouter if not provided
    if (!this.aiProviderRouter) {
      this.aiProviderRouter = new ConversationalAIProviderRouter(
        this.aiConfig,
        this.logger
      );
      this.logger.debug('ConversationalAIProviderRouter initialized');
      
      // Register AI providers based on configuration
      this.registerAIProviders();
    }
    
    // Initialize EmotionalIntelligenceEngine if not provided
    if (!this.emotionalIntelligenceEngine) {
      this.emotionalIntelligenceEngine = new EmotionalIntelligenceEngine(
        this.config,
        this.logger
      );
      this.logger.debug('EmotionalIntelligenceEngine initialized');
    }
    
    // Initialize EmergencyStopHandler if not provided
    if (!this.emergencyStopHandler) {
      this.emergencyStopHandler = new EmergencyStopHandler(
        this.config,
        this.logger
      );
      this.logger.debug('EmergencyStopHandler initialized');
    }
    
    // Initialize DiscordConversationHandler if not provided
    if (!this.conversationHandler) {
      this.conversationHandler = new DiscordConversationHandler(
        this.config,
        this.aiProviderRouter!,
        this.discordContextManager!,
        this.conversationManager!,
        this.emotionalIntelligenceEngine!,
        this.emergencyStopHandler!,
        this.toolRegistry!,
        this.logger
      );
      this.logger.debug('DiscordConversationHandler initialized');
    }
  }
  
  /**
   * Register AI providers with router based on configuration
   */
  private registerAIProviders(): void {
    if (!this.aiProviderRouter) {
      this.logger.warn('Cannot register providers - router not initialized');
      return;
    }
    
    const { providers } = this.aiConfig;
    
    // DEBUG: Log provider configuration
    this.logger.info('[AI-PROVIDER-REG] Starting provider registration');
    this.logger.info(`[AI-PROVIDER-REG] OpenAI enabled: ${providers?.openai?.enabled}`);
    this.logger.info(`[AI-PROVIDER-REG] OpenAI API key exists: ${!!providers?.openai?.apiKey}`);
    this.logger.info(`[AI-PROVIDER-REG] OpenAI API key length: ${providers?.openai?.apiKey?.length || 0}`);
    this.logger.info(`[AI-PROVIDER-REG] Anthropic enabled: ${providers?.anthropic?.enabled}`);
    this.logger.info(`[AI-PROVIDER-REG] Anthropic API key exists: ${!!providers?.anthropic?.apiKey}`);
    this.logger.info(`[AI-PROVIDER-REG] Anthropic API key length: ${providers?.anthropic?.apiKey?.length || 0}`);
    
    // Register OpenAI provider if configured
    if (providers?.openai?.enabled && providers.openai.apiKey) {
      this.logger.info('[AI-PROVIDER-REG] Registering OpenAI provider - enabled and API key present');
      const openaiProvider = new OpenAIProvider(
        {
          apiKey: providers.openai.apiKey,
          endpoint: providers.openai.endpoint,
          timeout: providers.openai.timeout,
          retries: providers.openai.retries,
        },
        this.logger
      );
      this.aiProviderRouter.registerProvider('openai', openaiProvider);
      this.logger.info('OpenAI provider registered');
    } else {
      this.logger.warn('[AI-PROVIDER-REG] OpenAI NOT registered', {
        enabled: providers?.openai?.enabled,
        apiKeyPresent: !!providers?.openai?.apiKey,
      });
    }
    
    // Register Anthropic provider if configured
    if (providers?.anthropic?.enabled && providers.anthropic.apiKey) {
      this.logger.info('[AI-PROVIDER-REG] Registering Anthropic provider - enabled and API key present');
      const anthropicProvider = new AnthropicProvider(
        {
          apiKey: providers.anthropic.apiKey,
          endpoint: providers.anthropic.endpoint,
          timeout: providers.anthropic.timeout,
          retries: providers.anthropic.retries,
        },
        this.logger
      );
      this.aiProviderRouter.registerProvider('anthropic', anthropicProvider);
      this.logger.info('Anthropic provider registered');
    } else {
      this.logger.warn('[AI-PROVIDER-REG] Anthropic NOT registered', {
        enabled: providers?.anthropic?.enabled,
        apiKeyPresent: !!providers?.anthropic?.apiKey,
      });
    }
    
    // Register Local model provider if configured
    if (providers?.local?.enabled) {
      this.logger.info('[AI-PROVIDER-REG] Registering Local provider - enabled');
      const localProvider = new LocalModelProvider(
        {
          endpoint: providers.local.endpoint,
          modelPath: providers.local.modelPath,
          timeout: providers.local.timeout,
          retries: providers.local.retries,
        },
        this.logger
      );
      this.aiProviderRouter.registerProvider('local', localProvider);
      this.logger.info('Local model provider registered');
    } else {
      this.logger.warn('[AI-PROVIDER-REG] Local NOT registered', {
        enabled: providers?.local?.enabled,
      });
    }
    
    const registeredProviders = this.aiProviderRouter.getProviders();
    this.logger.info('AI providers registered', {
      count: registeredProviders.size,
      providers: Array.from(registeredProviders.keys()),
    });
  }
  
  /**
   * Setup event handlers for Discord client
   */
  private setupEventHandlers(): void {
    // Check if client is already ready
    if (this.client.isReady()) {
      this.logger.info('Discord client already ready, setting client on tool executor immediately');
      if (this.conversationHandler) {
        this.conversationHandler.setDiscordClient(this.client);
        this.logger.info('Discord client set on conversation handler tool executor');
      }
    } else {
      // Register ready event listener for when client connects
      this.client.on('ready', () => {
        this.logger.info('Discord client ready, integration active');
        if (this.conversationHandler) {
          this.conversationHandler.setDiscordClient(this.client);
          this.logger.info('Discord client set on conversation handler tool executor');
        }
      });
    }
    
    // Handle disconnection
    this.client.on('disconnect', () => {
      this.logger.warn('Discord client disconnected');
    });
    
    // Handle reconnection
    this.client.on('reconnecting', () => {
      this.logger.info('Discord client reconnecting');
    });
  }
  
  /**
   * Process a Discord message through appropriate handler
   */
  async processMessage(message: Message): Promise<ConversationResponse | null> {
    // Ignore bot messages
    if (message.author.bot) {
      return null;
    }
    
    // Check if conversational mode should be used
    if (!this.shouldUseConversationalMode(message)) {
      // Return null to indicate message should be handled by command handler
      return null;
    }
    
    try {
      // Convert Discord message to internal format
      const discordMessage = this.convertDiscordMessage(message);
      
      // Process through conversation handler
      const response = await this.conversationHandler!.processMessage(discordMessage);
      
      // Check if response was skipped
      if (response.metadata?.skipped) {
        this.logger.debug('Message skipped by conversational handler', {
          reason: response.metadata.reason,
        });
        return null;
      }
      
      this.logger.debug('Message processed through conversational handler', {
        messageId: message.id,
        userId: message.author.id,
        responseLength: response.content.length,
      });
      
      return response;
      
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to process message through conversational handler', errorObj, {
        messageId: message.id,
        userId: message.author.id,
        errorName: errorObj.name,
        errorMessage: errorObj.message,
        errorStack: errorObj.stack,
      });
      
      // Return error response with full error details
      return {
        content: 'I apologize, but I encountered an error processing your message.',
        tone: 'friendly',
        metadata: {
          error: errorObj.message,
          errorName: errorObj.name,
          errorDetails: {
            name: errorObj.name,
            message: errorObj.message,
            stack: errorObj.stack,
          },
        },
      };
    }
  }
  
  /**
   * Check if conversational mode is enabled
   */
  isConversationalMode(): boolean {
    return this.config.enabled;
  }
  
  /**
   * Check if a message should be handled by conversational mode
   */
  shouldUseConversationalMode(message: Message): boolean {
    // If conversational mode is disabled, always use command mode
    if (!this.config.enabled) {
      return false;
    }
    
    // Check mode
    switch (this.config.mode) {
      case 'conversational':
        // All messages go through conversational handler
        return true;
      
      case 'command':
        // All messages go through command handler
        return false;
      
      case 'hybrid':
        // Messages starting with prefix go to command handler
        // All other messages go to conversational handler
        return !message.content.startsWith(this.commandPrefix);
      
      default:
        return false;
    }
  }
  
  /**
   * Convert Discord.js Message to internal DiscordMessage format
   */
  private convertDiscordMessage(message: Message): DiscordMessage {
    return {
      id: message.id,
      content: message.content,
      author: {
        id: message.author.id,
        username: message.author.username,
        discriminator: message.author.discriminator,
        bot: message.author.bot,
      },
      channelId: message.channelId,
      guildId: message.guildId || undefined,
      timestamp: message.createdAt,
      mentions: message.mentions.users.map(user => user.id),
    };
  }
  
  /**
   * Get conversation handler instance
   */
  getConversationHandler(): DiscordConversationHandler | null {
    return this.conversationHandler;
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<ConversationalDiscordConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Note: DiscordConversationHandler doesn't have updateConfig method
    // Config is updated via constructor in this implementation
    // To update config, a new handler instance would need to be created
    
    this.logger.info('Configuration updated', { config });
  }
  
  /**
   * Cleanup and shutdown integration
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down DiscordBotIntegration...');
    
    // Note: DiscordConversationHandler doesn't have getActiveConversations method
    // The active conversations are managed internally by the handler
    // Cleanup would be handled by the handler's own shutdown logic
  }
  
  /**
   * Get current configuration
   */
  getConfig(): ConversationalDiscordConfig {
    return { ...this.config };
  }
  
  /**
   * Set command prefix for hybrid mode
   */
  setCommandPrefix(prefix: string): void {
    this.commandPrefix = prefix;
    this.logger.info('Command prefix updated', { prefix });
  }
  
  /**
   * Get command prefix
   */
  getCommandPrefix(): string {
    return this.commandPrefix;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a Discord bot integration instance with all required components
 *
 * @param options - Integration options
 * @returns Initialized DiscordBotIntegration instance
 */
export async function createDiscordBotIntegration(
  options: DiscordBotIntegrationOptions
): Promise<DiscordBotIntegration> {
  const integration = new DiscordBotIntegrationImpl(options);
  await integration.initialize();
  return integration;
}

/**
 * Create a Discord bot integration instance without initialization
 * Useful for dependency injection scenarios
 *
 * @param options - Integration options
 * @returns Uninitialized DiscordBotIntegration instance
 */
export function createDiscordBotIntegrationUninitialized(
  options: DiscordBotIntegrationOptions
): DiscordBotIntegration {
  return new DiscordBotIntegrationImpl(options);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a message is a command (starts with prefix)
 */
export function isCommandMessage(message: Message, prefix: string = '!'): boolean {
  return message.content.startsWith(prefix);
}

/**
 * Extract command name from message
 */
export function extractCommandName(message: Message, prefix: string = '!'): string {
  const content = message.content.slice(prefix.length).trim();
  const parts = content.split(/\s+/);
  return parts[0].toLowerCase();
}

/**
 * Extract command arguments from message
 */
export function extractCommandArgs(message: Message, prefix: string = '!'): string[] {
  const content = message.content.slice(prefix.length).trim();
  const parts = content.split(/\s+/);
  return parts.slice(1);
}
