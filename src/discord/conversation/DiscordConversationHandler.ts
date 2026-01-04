/**
 * Discord Conversation Handler
 * 
 * This module implements the main handler for conversational Discord mode,
 * processing messages through the AI integration pipeline.
 */

import {
  DiscordMessage,
  ConversationContext,
  ConversationResponse,
  ConversationalDiscordConfig,
  MessageHistoryEntry,
  UserPreferences,
  EmotionalContext,
  DiscordContext,
  ConflictContext,
} from '../../types/conversational';
import {
  Conversation,
  ConversationMessage,
  UserPreferences as AIUserPreferences,
} from '../../types/ai';
import { ConversationalAIProviderRouter } from '../../ai/providers/conversationalAIProviderRouter';
import { ConversationManager } from '../../ai/conversation/conversation-manager';
import { DiscordContextManager } from '../context/DiscordContextManager';
import { EmotionalIntelligenceEngine } from '../emotional/EmotionalIntelligenceEngine';
import { EmergencyStopHandler } from '../emotional/EmergencyStopHandler';
import { Logger } from '../../utils/logger';

// ============================================================================
// DISCORD CONVERSATION HANDLER CLASS
// ============================================================================

export class DiscordConversationHandler {
  private config: ConversationalDiscordConfig;
  private aiProvider: ConversationalAIProviderRouter;
  private discordContextManager: DiscordContextManager;
  private conversationManager: ConversationManager;
  private emotionalIntelligenceEngine: EmotionalIntelligenceEngine;
  private emergencyStopHandler: EmergencyStopHandler;
  private logger: Logger;
  private activeConversations: Map<string, ConversationContext> = new Map();

  constructor(
    config: ConversationalDiscordConfig,
    aiProvider: ConversationalAIProviderRouter,
    discordContextManager: DiscordContextManager,
    conversationManager: ConversationManager,
    emotionalIntelligenceEngine: EmotionalIntelligenceEngine,
    emergencyStopHandler: EmergencyStopHandler,
    logger: Logger
  ) {
    this.config = config;
    this.aiProvider = aiProvider;
    this.discordContextManager = discordContextManager;
    this.conversationManager = conversationManager;
    this.emotionalIntelligenceEngine = emotionalIntelligenceEngine;
    this.emergencyStopHandler = emergencyStopHandler;
    this.logger = logger;

    this.logger.info('DiscordConversationHandler initialized', {
      enabled: config.enabled,
      mode: config.mode,
      contextWindow: config.contextWindow,
      crossChannelAwareness: config.features.crossChannelAwareness,
      temporalContext: config.features.temporalContext,
      emotionalIntelligenceEnabled: config.emotionalIntelligence.enabled,
      emergencyStopEnabled: config.safety.emergencyStop,
    });
  }

  /**
   * Process a Discord message through the conversational pipeline
   */
  async processMessage(message: DiscordMessage): Promise<ConversationResponse> {
    try {
      this.logger.debug('Processing Discord message', {
        messageId: message.id,
        userId: message.author.id,
        channelId: message.channelId,
      });

      // Check if conversational mode is enabled
      if (!this.config.enabled) {
        return {
          content: '',
          tone: 'friendly',
          metadata: {
            skipped: true,
            reason: 'Conversational mode is disabled',
          },
        };
      }

      // Check if message is from a bot
      if (message.author.bot) {
        return {
          content: '',
          tone: 'friendly',
          metadata: {
            skipped: true,
            reason: 'Message from bot',
          },
        };
      }

      // Check for emergency stop phrases
      if (this.emergencyStopHandler.checkEmergencyStop(message.content)) {
        const conversationId = this.getConversationId(message);
        await this.emergencyStopHandler.triggerEmergencyStop(conversationId);
        
        this.logger.info('Emergency stop triggered', {
          messageId: message.id,
          userId: message.author.id,
          channelId: message.channelId,
        });

        return {
          content: 'Conversation stopped. If you need help, please contact an administrator.',
          tone: 'professional',
          metadata: {
            skipped: true,
            reason: 'Emergency stop triggered',
            emergencyStop: true,
          },
        };
      }

      // Get or create conversation context
      const conversationId = this.getConversationId(message);
      let conversationContext = this.activeConversations.get(conversationId);

      if (!conversationContext) {
        conversationContext = await this.createConversationContext(message);
        this.activeConversations.set(conversationId, conversationContext);
      }

      // Update Discord-specific context
      await this.discordContextManager.updateContext(conversationId, message);

      // Get Discord context for cross-channel awareness
      const discordContext = await this.discordContextManager.getContext(conversationId);

      // Add user message to history
      conversationContext.messageHistory.push({
        role: 'user',
        content: message.content,
        timestamp: message.timestamp,
        metadata: {
          messageId: message.id,
          authorId: message.author.id,
          mentions: message.mentions,
        },
      });

      // Trim message history to context window
      if (conversationContext.messageHistory.length > this.config.contextWindow) {
        const excess = conversationContext.messageHistory.length - this.config.contextWindow;
        conversationContext.messageHistory = conversationContext.messageHistory.slice(excess);
      }

      // Analyze emotional context if enabled
      if (this.config.emotionalIntelligence.enabled) {
        const emotionalContext = await this.emotionalIntelligenceEngine.analyzeEmotionalContext(
          message.content,
          conversationContext.messageHistory
        );
        
        // Update conversation context with emotional analysis
        conversationContext.emotionalContext = emotionalContext;

        // Check for conflict and handle de-escalation
        if (this.emotionalIntelligenceEngine.needsDeescalation(emotionalContext)) {
          const conflictContext: ConflictContext = {
            userId: message.author.id,
            channelId: message.channelId,
            conflictType: emotionalContext.conflict?.indicators[0] || 'unknown',
            severity: emotionalContext.conflict?.severity || 'low',
            history: conversationContext.messageHistory,
          };

          const deEscalationResponse = await this.emotionalIntelligenceEngine.generateDeEscalationResponse(
            conflictContext
          );

          this.logger.info('De-escalation response generated', {
            conflictType: conflictContext.conflictType,
            severity: conflictContext.severity,
          });

          return {
            content: deEscalationResponse,
            tone: 'professional',
            emotion: emotionalContext.emotion.primary,
            metadata: {
              conversationId,
              deescalation: true,
              conflictSeverity: conflictContext.severity,
            },
          };
        }
      }

      // Build conversational AI request
      const conversationalRequest: any = {
        message: message.content,
        context: conversationContext,
        config: this.config,
        systemPrompt: this.config.personality.systemPrompt,
      };

      // Route to AI provider and get response
      const aiResponse = await this.aiProvider.routeRequest(conversationalRequest);

      // Add AI response to history
      conversationContext.messageHistory.push({
        role: 'assistant',
        content: aiResponse.content,
        timestamp: new Date(),
        metadata: {
          provider: aiResponse.provider,
          model: aiResponse.model,
          tokensUsed: aiResponse.tokensUsed,
        },
      });

      // Trim again if needed
      if (conversationContext.messageHistory.length > this.config.contextWindow) {
        const excess = conversationContext.messageHistory.length - this.config.contextWindow;
        conversationContext.messageHistory = conversationContext.messageHistory.slice(excess);
      }

      // Adapt response based on emotional context if enabled
      let adaptedContent = aiResponse.content;
      let adaptedTone: 'friendly' | 'professional' | 'casual' = this.config.tone === 'playful' ? 'friendly' : this.config.tone;

      if (this.config.emotionalIntelligence.enabled && conversationContext.emotionalContext) {
        const adaptedResponse = await this.emotionalIntelligenceEngine.adaptResponse(
          aiResponse.content,
          conversationContext.emotionalContext
        );
        
        adaptedContent = adaptedResponse.content;
        adaptedTone = adaptedResponse.tone as 'friendly' | 'professional' | 'casual';
      }

      // Build conversation response with cross-channel awareness
      const response: ConversationResponse = {
        content: adaptedContent,
        tone: adaptedTone,
        emotion: conversationContext.emotionalContext?.emotion?.primary,
        metadata: {
          conversationId,
          provider: aiResponse.provider,
          model: aiResponse.model,
          tokensUsed: aiResponse.tokensUsed,
          processingTime: aiResponse.metadata?.processingTime,
          crossChannelContext: discordContext?.crossChannelContext,
          temporalContext: discordContext?.temporalContext,
          emotionalAdaptations: this.config.emotionalIntelligence.enabled,
        },
      };

      this.logger.debug('Message processed successfully', {
        messageId: message.id,
        conversationId,
        responseLength: response.content.length,
      });

      return response;

    } catch (error) {
      this.logger.error('Failed to process Discord message', error as Error);
      return {
        content: 'I apologize, but I encountered an error processing your message.',
        tone: 'friendly',
        metadata: {
          error: (error as Error).message,
          conversationId: this.getConversationId(message),
        },
      };
    }
  }

  /**
   * Start a new conversation
   */
  async startConversation(
    userId: string,
    channelId: string,
    guildId?: string
  ): Promise<string> {
    try {
      this.logger.info('Starting new conversation', {
        userId,
        channelId,
        guildId,
      });

      const conversationId = this.generateConversationId(userId, channelId);

      // Create conversation in conversation manager
      const conversation = await this.conversationManager.createConversation(
        userId,
        channelId,
        guildId
      );

      // Create conversation context
      const conversationContext: ConversationContext = {
        conversationId,
        userId,
        channelId,
        guildId,
        messageHistory: [],
        userPreferences: this.getUserPreferences(userId),
        emotionalContext: this.createInitialEmotionalContext(),
      };

      this.activeConversations.set(conversationId, conversationContext);

      this.logger.info('Conversation started', { conversationId });

      return conversationId;

    } catch (error) {
      this.logger.error('Failed to start conversation', error as Error);
      throw error;
    }
  }

  /**
   * End a conversation
   */
  async endConversation(conversationId: string): Promise<void> {
    try {
      this.logger.info('Ending conversation', { conversationId });

      // Remove from active conversations
      this.activeConversations.delete(conversationId);

      // End conversation in conversation manager
      await this.conversationManager.endConversation(conversationId, 'user_request');

      this.logger.info('Conversation ended', { conversationId });

    } catch (error) {
      this.logger.error('Failed to end conversation', error as Error);
      throw error;
    }
  }

  /**
   * Get conversation context for a message
   */
  private async createConversationContext(
    message: DiscordMessage
  ): Promise<ConversationContext> {
    const conversationId = this.getConversationId(message);

    return {
      conversationId,
      userId: message.author.id,
      channelId: message.channelId,
      guildId: message.guildId,
      messageHistory: [],
      userPreferences: this.getUserPreferences(message.author.id),
      emotionalContext: this.createInitialEmotionalContext(),
    };
  }

  /**
   * Build AI request from message and context
   */
  private async buildAIRequest(
    message: DiscordMessage,
    context: ConversationContext,
    discordContext?: DiscordContext
  ): Promise<any> {
    const messages: any[] = [];

    // Add system prompt if configured
    if (this.config.personality.systemPrompt) {
      messages.push({
        role: 'system',
        content: this.config.personality.systemPrompt,
      });
    }

    // Add message history
    for (const entry of context.messageHistory) {
      messages.push({
        role: entry.role,
        content: entry.content,
      });
    }

    // Add current message
    messages.push({
      role: 'user',
      content: message.content,
    });

    return {
      id: this.generateRequestId(),
      model: this.getModelForProvider(),
      messages,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      userId: message.author.id,
      conversationId: context.conversationId,
      timestamp: new Date(),
    };
  }

  /**
   * Get user preferences (placeholder implementation)
   */
  private getUserPreferences(userId: string): UserPreferences {
    // This would integrate with user preference system
    const configTone = this.config.tone === 'playful' ? 'friendly' : this.config.tone;
    return {
      tone: configTone,
      language: this.config.multilingual.defaultLanguage,
      verbosity: this.config.verbosity === 'concise' ? 'concise' :
                this.config.verbosity === 'detailed' ? 'detailed' : 'normal',
    };
  }

  /**
   * Create initial emotional context
   */
  private createInitialEmotionalContext(): EmotionalContext {
    return {
      sentiment: {
        score: 0,
        magnitude: 0,
        confidence: 0.5,
        approach: 'rule-based',
      },
      emotion: {
        primary: 'neutral',
        emotions: {},
        confidence: 0.5,
      },
      mood: {
        mood: 'neutral',
        intensity: 0,
        confidence: 0.5,
        factors: [],
      },
    };
  }

  /**
   * Generate conversation ID from message
   */
  private getConversationId(message: DiscordMessage): string {
    return this.generateConversationId(message.author.id, message.channelId);
  }

  /**
   * Generate conversation ID from components
   */
  private generateConversationId(userId: string, channelId: string): string {
    return `${userId}:${channelId}`;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get model for current provider
   */
  private getModelForProvider(): string {
    const providerInfo = this.aiProvider.getProviderInfo();
    const models = this.aiProvider.getAvailableModels();
    const defaultModel = models.find(m => m.isDefault);
    return defaultModel?.id || providerInfo.models[0]?.id || 'gpt-4-turbo';
  }

  /**
   * Get active conversation context
   */
  getConversationContext(conversationId: string): ConversationContext | undefined {
    return this.activeConversations.get(conversationId);
  }

  /**
   * Get all active conversations
   */
  getActiveConversations(): Map<string, ConversationContext> {
    return new Map(this.activeConversations);
  }

  /**
   * Check if conversation exists
   */
  hasConversation(conversationId: string): boolean {
    return this.activeConversations.has(conversationId);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ConversationalDiscordConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Configuration updated', { config });
  }

  /**
   * Get current configuration
   */
  getConfig(): ConversationalDiscordConfig {
    return { ...this.config };
  }
}
