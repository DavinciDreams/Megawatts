/**
 * Conversation Manager
 * 
 * This module implements conversation threading and context management
 * for the AI system.
 */

import { 
  Conversation, 
  ConversationMessage, 
  ConversationContext, 
  ConversationMetadata,
  UserPreferences,
  Entity,
  SentimentAnalysis,
  IntentAnalysis,
  MessageProcessing
} from '../../../types/ai';
import { Logger } from '../../../utils/logger';

// ============================================================================
// CONVERSATION MANAGER CLASS
// ============================================================================

export class ConversationManager {
  private conversations: Map<string, Conversation> = new Map();
  private userConversations: Map<string, Set<string>> = new Map();
  private conversationContexts: Map<string, ConversationContext> = new Map();
  private messageIndex: Map<string, ConversationMessage> = new Map();
  private logger: Logger;
  private config: ConversationManagerConfig;

  constructor(config: ConversationManagerConfig, logger: Logger) {
    this.logger = logger;
    this.config = config;
  }

  /**
   * Create a new conversation
   */
  async createConversation(
    userId: string,
    channelId: string,
    guildId?: string,
    initialMessage?: ConversationMessage
  ): Promise<Conversation> {
    try {
      const conversationId = this.generateConversationId(userId, channelId);
      
      // Check if conversation already exists
      if (this.conversations.has(conversationId)) {
        return this.conversations.get(conversationId)!;
      }

      const now = new Date();
      const conversation: Conversation = {
        id: conversationId,
        userId,
        channelId,
        guildId,
        messages: initialMessage ? [initialMessage] : [],
        context: await this.initializeContext(userId, initialMessage),
        metadata: {
          priority: 'medium',
          category: 'general',
          resolved: false,
          tags: []
        },
        status: 'active',
        createdAt: now,
        updatedAt: now
      };

      // Store conversation
      this.conversations.set(conversationId, conversation);
      
      // Update user conversation mapping
      if (!this.userConversations.has(userId)) {
        this.userConversations.set(userId, new Set());
      }
      this.userConversations.get(userId)!.add(conversationId);

      // Index messages
      if (initialMessage) {
        this.indexMessage(initialMessage);
      }

      this.logger.info('Conversation created', {
        conversationId,
        userId,
        channelId,
        guildId
      });

      return conversation;

    } catch (error) {
      this.logger.error('Failed to create conversation', error as Error);
      throw error;
    }
  }

  /**
   * Get a conversation by ID
   */
  getConversation(conversationId: string): Conversation | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * Get all conversations for a user
   */
  getUserConversations(userId: string): Conversation[] {
    const conversationIds = this.userConversations.get(userId);
    if (!conversationIds) {
      return [];
    }

    return Array.from(conversationIds)
      .map(id => this.conversations.get(id))
      .filter(conv => conv !== undefined) as Conversation[];
  }

  /**
   * Get active conversation for user and channel
   */
  getActiveConversation(userId: string, channelId: string): Conversation | undefined {
    const conversationId = this.generateConversationId(userId, channelId);
    return this.conversations.get(conversationId);
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(
    conversationId: string,
    message: ConversationMessage
  ): Promise<Conversation> {
    try {
      const conversation = this.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      // Process message
      const processedMessage = await this.processMessage(message, conversation.context);
      
      // Add to conversation
      conversation.messages.push(processedMessage);
      conversation.updatedAt = new Date();

      // Update context
      await this.updateContext(conversation, processedMessage);

      // Index message
      this.indexMessage(processedMessage);

      // Check conversation limits
      await this.enforceConversationLimits(conversation);

      this.logger.info('Message added to conversation', {
        conversationId,
        messageId: message.id,
        type: message.type
      });

      return conversation;

    } catch (error) {
      this.logger.error('Failed to add message to conversation', error as Error);
      throw error;
    }
  }

  /**
   * Update conversation metadata
   */
  updateConversationMetadata(
    conversationId: string,
    metadata: Partial<ConversationMetadata>
  ): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return false;
    }

    conversation.metadata = { ...conversation.metadata, ...metadata };
    conversation.updatedAt = new Date();

    this.logger.info('Conversation metadata updated', {
      conversationId,
      metadata
    });

    return true;
  }

  /**
   * Pause a conversation
   */
  pauseConversation(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return false;
    }

    conversation.status = 'paused';
    conversation.updatedAt = new Date();

    this.logger.info('Conversation paused', { conversationId });
    return true;
  }

  /**
   * Resume a conversation
   */
  resumeConversation(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return false;
    }

    conversation.status = 'active';
    conversation.updatedAt = new Date();

    this.logger.info('Conversation resumed', { conversationId });
    return true;
  }

  /**
   * End a conversation
   */
  async endConversation(conversationId: string, reason?: string): Promise<boolean> {
    try {
      const conversation = this.conversations.get(conversationId);
      if (!conversation) {
        return false;
      }

      conversation.status = 'ended';
      conversation.updatedAt = new Date();

      if (reason) {
        conversation.metadata.tags.push(`ended:${reason}`);
      }

      // Archive conversation if configured
      if (this.config.archiveEndedConversations) {
        await this.archiveConversation(conversation);
      }

      // Clean up from active memory if configured
      if (this.config.cleanupEndedConversations) {
        this.cleanupConversation(conversationId);
      }

      this.logger.info('Conversation ended', {
        conversationId,
        reason
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to end conversation', error as Error);
      return false;
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      const conversation = this.conversations.get(conversationId);
      if (!conversation) {
        return false;
      }

      // Remove from all indexes
      this.conversations.delete(conversationId);
      
      const userConvs = this.userConversations.get(conversation.userId);
      if (userConvs) {
        userConvs.delete(conversationId);
        if (userConvs.size === 0) {
          this.userConversations.delete(conversation.userId);
        }
      }

      this.conversationContexts.delete(conversationId);

      // Remove message indexes
      for (const message of conversation.messages) {
        this.messageIndex.delete(message.id);
      }

      this.logger.info('Conversation deleted', { conversationId });
      return true;

    } catch (error) {
      this.logger.error('Failed to delete conversation', error as Error);
      return false;
    }
  }

  /**
   * Search conversations
   */
  searchConversations(
    userId: string,
    query: string,
    options?: SearchOptions
  ): Conversation[] {
    const userConvs = this.getUserConversations(userId);
    const lowerQuery = query.toLowerCase();

    return userConvs.filter(conv => {
      // Check metadata
      if (conv.metadata.title?.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      if (conv.metadata.summary?.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      if (conv.metadata.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) {
        return true;
      }

      // Check messages if requested
      if (options?.searchMessages) {
        return conv.messages.some(msg => 
          msg.content.toLowerCase().includes(lowerQuery)
        );
      }

      return false;
    });
  }

  /**
   * Get conversation statistics
   */
  getConversationStats(userId: string): ConversationStats {
    const conversations = this.getUserConversations(userId);
    
    const stats: ConversationStats = {
      total: conversations.length,
      active: conversations.filter(c => c.status === 'active').length,
      paused: conversations.filter(c => c.status === 'paused').length,
      ended: conversations.filter(c => c.status === 'ended').length,
      totalMessages: conversations.reduce((sum, c) => sum + c.messages.length, 0),
      averageMessagesPerConversation: 0,
      mostActiveChannel: '',
      longestConversation: '',
      categories: {},
      timeStats: {
        averageDuration: 0,
        totalDuration: 0
      }
    };

    if (conversations.length > 0) {
      stats.averageMessagesPerConversation = stats.totalMessages / conversations.length;
      
      // Find most active channel
      const channelCounts = conversations.reduce((acc, conv) => {
        acc[conv.channelId] = (acc[conv.channelId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      stats.mostActiveChannel = Object.entries(channelCounts)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || '';

      // Find longest conversation
      stats.longestConversation = conversations
        .sort((a, b) => b.messages.length - a.messages.length)[0]?.id || '';

      // Category distribution
      for (const conv of conversations) {
        stats.categories[conv.metadata.category] = 
          (stats.categories[conv.metadata.category] || 0) + 1;
      }

      // Time statistics
      const activeConversations = conversations.filter(c => c.status === 'active');
      if (activeConversations.length > 0) {
        const now = new Date();
        const totalDuration = activeConversations.reduce((sum, conv) => 
          sum + (now.getTime() - conv.createdAt.getTime()), 0
        );
        stats.timeStats.totalDuration = totalDuration;
        stats.timeStats.averageDuration = totalDuration / activeConversations.length;
      }
    }

    return stats;
  }

  /**
   * Generate conversation ID
   */
  private generateConversationId(userId: string, channelId: string): string {
    return `${userId}:${channelId}`;
  }

  /**
   * Initialize conversation context
   */
  private async initializeContext(
    userId: string, 
    initialMessage?: ConversationMessage
  ): Promise<ConversationContext> {
    // Get user preferences
    const userPrefs = await this.getUserPreferences(userId);
    
    const context: ConversationContext = {
      entities: [],
      intents: [],
      userPreferences: userPrefs,
      previousMessages: initialMessage ? [initialMessage] : [],
      language: userPrefs?.language || 'en',
      timezone: userPrefs?.timezone || 'UTC',
      platform: 'discord'
    };

    return context;
  }

  /**
   * Process a message
   */
  private async processMessage(
    message: ConversationMessage,
    context: ConversationContext
  ): Promise<ConversationMessage> {
    const processing: MessageProcessing = {
      confidence: 0,
      processingTime: 0
    };

    // This would integrate with NLP components
    // For now, return the message with basic processing
    return {
      ...message,
      processing
    };
  }

  /**
   * Update conversation context
   */
  private async updateContext(
    conversation: Conversation,
    message: ConversationMessage
  ): Promise<void> {
    // Update previous messages
    conversation.context.previousMessages = conversation.messages.slice(-10); // Keep last 10 messages
    
    // Update entities if available
    if (message.processing?.entities) {
      conversation.context.entities = [
        ...conversation.context.entities,
        ...message.processing.entities
      ];
    }

    // Update intents if available
    if (message.processing?.intent) {
      conversation.context.intents.push(message.processing.intent.type);
    }

    // Update sentiment if available
    if (message.processing?.sentiment) {
      conversation.context.sentiment = {
        overall: message.processing.sentiment.sentiment,
        trend: 'stable',
        history: [],
        predictions: []
      };
    }
  }

  /**
   * Index a message for quick lookup
   */
  private indexMessage(message: ConversationMessage): void {
    this.messageIndex.set(message.id, message);
  }

  /**
   * Enforce conversation limits
   */
  private async enforceConversationLimits(conversation: Conversation): Promise<void> {
    // Message count limit
    if (conversation.messages.length > this.config.maxMessagesPerConversation) {
      // Remove oldest messages
      const excess = conversation.messages.length - this.config.maxMessagesPerConversation;
      const removed = conversation.messages.splice(0, excess);
      
      // Remove from index
      for (const msg of removed) {
        this.messageIndex.delete(msg.id);
      }

      this.logger.info('Trimmed conversation messages', {
        conversationId: conversation.id,
        removedCount: excess
      });
    }

    // Age limit
    const maxAge = this.config.maxConversationAge;
    if (maxAge) {
      const cutoff = new Date(Date.now() - maxAge);
      if (conversation.createdAt < cutoff) {
        await this.endConversation(conversation.id, 'age_limit');
      }
    }
  }

  /**
   * Archive a conversation
   */
  private async archiveConversation(conversation: Conversation): Promise<void> {
    // This would integrate with storage system
    this.logger.info('Archiving conversation', {
      conversationId: conversation.id
    });
  }

  /**
   * Clean up conversation from memory
   */
  private cleanupConversation(conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return;
    }

    // Remove from all indexes
    this.conversations.delete(conversationId);
    
    const userConvs = this.userConversations.get(conversation.userId);
    if (userConvs) {
      userConvs.delete(conversationId);
    }

    this.conversationContexts.delete(conversationId);

    // Remove message indexes
    for (const message of conversation.messages) {
      this.messageIndex.delete(message.id);
    }
  }

  /**
   * Get user preferences (placeholder)
   */
  private async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    // This would integrate with user preference system
    return undefined;
  }
}

// ============================================================================
// SUPPORTING INTERFACES
// ============================================================================

export interface ConversationManagerConfig {
  maxMessagesPerConversation: number;
  maxConversationAge?: number; // in milliseconds
  archiveEndedConversations: boolean;
  cleanupEndedConversations: boolean;
  enablePersistence: boolean;
  contextWindow: number;
}

export interface SearchOptions {
  searchMessages?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  categories?: string[];
  status?: ('active' | 'paused' | 'ended')[];
  limit?: number;
}

export interface ConversationStats {
  total: number;
  active: number;
  paused: number;
  ended: number;
  totalMessages: number;
  averageMessagesPerConversation: number;
  mostActiveChannel: string;
  longestConversation: string;
  categories: Record<string, number>;
  timeStats: {
    averageDuration: number;
    totalDuration: number;
  };
}