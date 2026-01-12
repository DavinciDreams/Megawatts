import { Message, Guild, User } from 'discord.js';
import { Logger } from '../../utils/logger';
import { MessageContext, UserMessageHistory, GuildContext, PipelineConfig } from './types';

/**
 * Extracts and manages context information for messages
 */
export class ContextExtractor {
  private config: PipelineConfig;
  private logger: Logger;
  private messageCache: Map<string, Message[]> = new Map();
  private userHistoryCache: Map<string, UserMessageHistory> = new Map();
  private guildContextCache: Map<string, GuildContext> = new Map();

  constructor(config: PipelineConfig) {
    this.config = config;
    this.logger = new Logger('ContextExtractor');
  }

  /**
   * Extract comprehensive context for a message
   */
  async extractContext(message: Message): Promise<MessageContext> {
    try {
      const userId = message.author?.id;
      const guildId = message.guildId;
      const channelId = message.channelId;

      if (!userId) {
        throw new Error('Message has no author');
      }

      // Extract message history
      const previousMessages = await this.getMessageHistory(channelId, message.id);
      
      // Extract user history
      const userHistory = await this.getUserHistory(userId);
      
      // Extract guild context
      const guildContext = guildId ? await this.getGuildContext(guildId, userId) : undefined;

      const context: MessageContext = {
        userId,
        guildId,
        channelId,
        messageId: message.id,
        timestamp: new Date(),
        previousMessages,
        userHistory,
        guildContext
      };

      // Update caches
      this.updateMessageCache(channelId, message);
      this.updateUserHistory(userId, message);

      this.logger.debug(`Context extracted for message ${message.id}`);
      return context;
    } catch (error) {
      this.logger.error('Error extracting context:', error);
      throw error;
    }
  }

  /**
   * Get message history for a channel
   */
  private async getMessageHistory(channelId: string, currentMessageId: string): Promise<Message[]> {
    const cacheKey = channelId;
    const cached = this.messageCache.get(cacheKey) || [];
    
    // Return cached messages (excluding current message)
    return cached.filter(msg => msg.id !== currentMessageId);
  }

  /**
   * Get user message history
   */
  private async getUserHistory(userId: string): Promise<UserMessageHistory> {
    const cached = this.userHistoryCache.get(userId);
    
    if (cached) {
      return cached;
    }

    // Initialize user history if not cached
    const history: UserMessageHistory = {
      messageCount: 0,
      lastMessageTime: new Date(),
      averageMessageLength: 0,
      commonPatterns: [],
      spamScore: 0
    };

    this.userHistoryCache.set(userId, history);
    return history;
  }

  /**
   * Get guild context information
   */
  private async getGuildContext(guildId: string, userId: string): Promise<GuildContext | undefined> {
    const cached = this.guildContextCache.get(guildId);
    
    if (cached) {
      return cached;
    }

    // Fetch guild context from Discord API or database
    // For now, return basic context with placeholder data
    const context: GuildContext = {
      memberCount: Math.floor(Math.random() * 1000), // Mock: would be fetched from guild
      userRoles: ['@everyone', '@verified'], // Mock: would be fetched from member
      channelType: 'text', // Mock: would be determined from channel
      activeModerators: [], // Mock: would be fetched from guild
      guildRules: [] // Mock: would be fetched from guild
    };

    this.guildContextCache.set(guildId, context);
    return context;
  }

  /**
   * Get guild member count
   */
  private async getGuildMemberCount(guildId: string): Promise<number> {
    // Mock implementation - would fetch from Discord API
    return Math.floor(Math.random() * 1000);
  }

  /**
   * Get user roles for guild
   */
  private async getUserRoles(guildId: string, userId: string): Promise<string[]> {
    // Mock implementation - would fetch from Discord API
    return ['@everyone', '@verified'];
  }

  /**
   * Get channel type
   */
  private async getChannelType(channelId: string): Promise<string> {
    // Mock implementation - would fetch from Discord API
    return 'text';
  }

  /**
   * Get active moderators
   */
  private async getActiveModerators(guildId: string): Promise<string[]> {
    // Mock implementation - would fetch from Discord API
    return [];
  }

  /**
   * Get guild rules
   */
  private async getGuildRules(guildId: string): Promise<string[]> {
    // Mock implementation - would fetch from Discord API
    return [];
  }

  /**
   * Update message cache
   */
  private updateMessageCache(channelId: string, message: Message): void {
    const cacheKey = channelId;
    const messages = this.messageCache.get(cacheKey) || [];
    
    // Add new message to cache
    messages.push(message);
    
    // Maintain cache size limit
    const maxSize = this.config.contextHistorySize || 50;
    if (messages.length > maxSize) {
      messages.splice(0, messages.length - maxSize);
    }
    
    this.messageCache.set(cacheKey, messages);
  }

  /**
   * Update user history
   */
  private updateUserHistory(userId: string, message: Message): void {
    const history = this.userHistoryCache.get(userId);
    
    if (!history) {
      return;
    }

    const content = message.content || '';
    const contentLength = content.length;

    // Update message count
    history.messageCount++;

    // Update last message time
    history.lastMessageTime = new Date();

    // Update average message length
    history.averageMessageLength = 
      (history.averageMessageLength * (history.messageCount - 1) + contentLength) / 
      history.messageCount;

    // Update common patterns (simple implementation)
    this.updateCommonPatterns(history, content);

    // Update spam score
    history.spamScore = this.calculateSpamScore(history);

    this.userHistoryCache.set(userId, history);
  }

  /**
   * Update common patterns in user messages
   */
  private updateCommonPatterns(history: UserMessageHistory, content: string): void {
    // Simple pattern detection - could be enhanced with NLP
    const words = content.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    
    words.forEach(word => {
      const existing = history.commonPatterns.find(pattern => pattern === word);
      if (!existing) {
        // Increment frequency (not stored in current structure, would need enhancement)
        if (history.commonPatterns.length < 10) {
          history.commonPatterns.push(word);
        }
      }
    });
  }

  /**
   * Calculate spam score for user
   */
  private calculateSpamScore(history: UserMessageHistory): number {
    let score = 0;

    // High message frequency
    const timeSinceLastMessage = Date.now() - history.lastMessageTime.getTime();
    if (timeSinceLastMessage < 1000) { // Less than 1 second
      score += 0.3;
    } else if (timeSinceLastMessage < 5000) { // Less than 5 seconds
      score += 0.1;
    }

    // Short messages (potential spam)
    if (history.averageMessageLength < 10) {
      score += 0.2;
    }

    // High message count in short time
    if (history.messageCount > 10) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Clear context caches
   */
  clearCache(): void {
    this.messageCache.clear();
    this.userHistoryCache.clear();
    this.guildContextCache.clear();
    this.logger.info('Context caches cleared');
  }

  /**
   * Clear cache for specific user
   */
  clearUserCache(userId: string): void {
    this.userHistoryCache.delete(userId);
    this.logger.debug(`Cache cleared for user ${userId}`);
  }

  /**
   * Clear cache for specific guild
   */
  clearGuildCache(guildId: string): void {
    this.guildContextCache.delete(guildId);
    this.logger.debug(`Cache cleared for guild ${guildId}`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    messageCacheSize: number;
    userHistoryCacheSize: number;
    guildContextCacheSize: number;
  } {
    return {
      messageCacheSize: this.messageCache.size,
      userHistoryCacheSize: this.userHistoryCache.size,
      guildContextCacheSize: this.guildContextCache.size
    };
  }

  /**
   * Update extractor configuration
   */
  updateConfig(config: PipelineConfig): void {
    this.config = config;
    this.logger.debug('Context extractor configuration updated');
  }
}
