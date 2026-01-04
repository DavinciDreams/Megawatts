/**
 * Discord Context Manager
 * 
 * This module implements Discord-specific context management for conversational mode,
 * including channel context, guild context, temporal context, and cross-channel awareness.
 */

import {
  DiscordContext,
  DiscordMessage,
  ChannelContext,
  GuildContext,
  TemporalContext,
  CrossChannelContext,
  ActivityEntry,
  ChannelConversationSummary,
  MessageHistoryEntry,
  ConversationalDiscordConfig,
} from '../../types/conversational';
import { ContextManager } from '../../ai/core/context-manager';
import { ConversationManager } from '../../ai/conversation/conversation-manager';
import { TieredStorageManager, DataType } from '../../storage/tiered/tieredStorage';
import { Logger } from '../../utils/logger';

// ============================================================================
// DISCORD CONTEXT MANAGER CLASS
// ============================================================================

export class DiscordContextManager {
  private config: ConversationalDiscordConfig;
  private contextManager: ContextManager;
  private conversationManager: ConversationManager;
  private tieredStorage: TieredStorageManager;
  private logger: Logger;
  private discordContexts: Map<string, DiscordContext> = new Map();
  private crossChannelCache: Map<string, CrossChannelContext> = new Map();
  private channelInfoCache: Map<string, ChannelContext> = new Map();
  private guildInfoCache: Map<string, GuildContext> = new Map();

  constructor(
    config: ConversationalDiscordConfig,
    contextManager: ContextManager,
    conversationManager: ConversationManager,
    tieredStorage: TieredStorageManager,
    logger: Logger
  ) {
    this.config = config;
    this.contextManager = contextManager;
    this.conversationManager = conversationManager;
    this.tieredStorage = tieredStorage;
    this.logger = logger;

    this.logger.info('DiscordContextManager initialized', {
      crossChannelAwareness: config.features.crossChannelAwareness,
      temporalContext: config.features.temporalContext,
    });
  }

  /**
   * Extract Discord-specific context from a message
   */
  async extractDiscordContext(message: DiscordMessage): Promise<DiscordContext> {
    this.logger.debug('Extracting Discord context', {
      messageId: message.id,
      userId: message.author.id,
      channelId: message.channelId,
    });

    const conversationId = this.getConversationId(message);
    const temporalContext = await this.getTemporalContext();
    const channelContext = await this.getChannelContext(message);
    const guildContext = message.guildId ? await this.getGuildContext(message.guildId) : undefined;
    const crossChannelContext = this.config.features.crossChannelAwareness
      ? await this.getCrossChannelContext(message.author.id)
      : undefined;

    // Get or create Discord context
    let discordContext = this.discordContexts.get(conversationId);
    if (!discordContext) {
      discordContext = {
        conversationId,
        userId: message.author.id,
        channelId: message.channelId,
        guildId: message.guildId,
        messageHistory: [],
        channelContext,
        guildContext,
        temporalContext,
        crossChannelContext,
        metadata: {},
      };
      this.discordContexts.set(conversationId, discordContext);
    } else {
      // Update existing context
      discordContext.channelContext = channelContext;
      discordContext.guildContext = guildContext;
      discordContext.temporalContext = temporalContext;
      discordContext.crossChannelContext = crossChannelContext;
    }

    // Store in tiered storage for persistence
    await this.storeContext(conversationId, discordContext);

    return discordContext;
  }

  /**
   * Update context with a new message
   */
  async updateContext(conversationId: string, message: DiscordMessage): Promise<void> {
    this.logger.debug('Updating Discord context', {
      conversationId,
      messageId: message.id,
    });

    let discordContext = this.discordContexts.get(conversationId);
    if (!discordContext) {
      discordContext = await this.extractDiscordContext(message);
      return;
    }

    // Add message to history
    const historyEntry: MessageHistoryEntry = {
      role: 'user',
      content: message.content,
      timestamp: message.timestamp,
      metadata: {
        messageId: message.id,
        authorId: message.author.id,
        mentions: message.mentions,
      },
    };
    discordContext.messageHistory.push(historyEntry);

    // Trim to context window
    if (discordContext.messageHistory.length > this.config.contextWindow) {
      const excess = discordContext.messageHistory.length - this.config.contextWindow;
      discordContext.messageHistory = discordContext.messageHistory.slice(excess);
    }

    // Update temporal context
    discordContext.temporalContext = await this.getTemporalContext();

    // Update cross-channel context if enabled
    if (this.config.features.crossChannelAwareness) {
      discordContext.crossChannelContext = await this.getCrossChannelContext(message.author.id);
    }

    // Update channel activity
    await this.updateChannelActivity(message);

    // Store updated context
    await this.storeContext(conversationId, discordContext);

    this.logger.debug('Discord context updated', {
      conversationId,
      messageHistoryLength: discordContext.messageHistory.length,
    });
  }

  /**
   * Get Discord context for a conversation
   */
  async getContext(conversationId: string): Promise<DiscordContext | null> {
    // Check in-memory cache first
    let discordContext = this.discordContexts.get(conversationId);
    if (discordContext) {
      return discordContext;
    }

    // Try to retrieve from tiered storage
    const storedContext = await this.tieredStorage.retrieve<DiscordContext>(
      `discord:context:${conversationId}`
    );
    if (storedContext) {
      this.discordContexts.set(conversationId, storedContext);
      return storedContext;
    }

    return null;
  }

  /**
   * Get cross-channel context for a user
   */
  async getCrossChannelContext(userId: string): Promise<CrossChannelContext> {
    // Check cache first
    const cached = this.crossChannelCache.get(userId);
    if (cached) {
      return cached;
    }

    // Get user's conversations across all channels
    const userConversations = this.conversationManager.getUserConversations(userId);
    const activeChannels = new Set<string>();
    const recentConversations: ChannelConversationSummary[] = [];
    const topicsDiscussed = new Set<string>();

    for (const conv of userConversations) {
      activeChannels.add(conv.channelId);

      // Get channel context
      const channelContext = await this.getChannelContext({
        channelId: conv.channelId,
      } as DiscordMessage);

      // Extract topics from conversation
      const topics = this.extractTopics(conv.messages);
      topics.forEach(topic => topicsDiscussed.add(topic));

      // Build conversation summary
      recentConversations.push({
        channelId: conv.channelId,
        channelName: channelContext.channelName,
        lastActive: conv.updatedAt,
        messageCount: conv.messages.length,
        topics,
      });
    }

    // Sort by last active time
    recentConversations.sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());

    // Determine overall mood
    const overallMood = this.determineOverallMood(userConversations);

    const crossChannelContext: CrossChannelContext = {
      userId,
      activeChannels: Array.from(activeChannels),
      recentConversations: recentConversations.slice(0, 10), // Keep last 10
      topicsDiscussed: Array.from(topicsDiscussed).slice(0, 20), // Keep top 20 topics
      overallMood,
    };

    // Cache the result
    this.crossChannelCache.set(userId, crossChannelContext);

    return crossChannelContext;
  }

  /**
   * Get temporal context
   */
  async getTemporalContext(): Promise<TemporalContext> {
    const now = new Date();
    const hour = now.getHours();

    let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    if (hour >= 6 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 18) timeOfDay = 'afternoon';
    else if (hour >= 18 && hour < 22) timeOfDay = 'evening';
    else timeOfDay = 'night';

    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
    const season = ['winter', 'spring', 'summer', 'fall'][Math.floor(now.getMonth() / 3)];

    return {
      currentTime: now,
      timeOfDay,
      dayOfWeek,
      season,
      timezone: 'UTC', // Could be user-specific
    };
  }

  /**
   * Summarize context for a conversation
   */
  async summarizeContext(conversationId: string): Promise<string> {
    const discordContext = await this.getContext(conversationId);
    if (!discordContext) {
      return '';
    }

    const summaryParts: string[] = [];

    // Add channel info
    summaryParts.push(
      `Conversation in ${discordContext.channelContext.channelName} ` +
      `(${discordContext.channelContext.channelType})`
    );

    // Add guild info if available
    if (discordContext.guildContext) {
      summaryParts.push(
        `in guild ${discordContext.guildContext.guildName} ` +
        `with ${discordContext.guildContext.memberCount} members`
      );
    }

    // Add temporal context
    summaryParts.push(
      `at ${discordContext.temporalContext.timeOfDay} ` +
      `on ${discordContext.temporalContext.dayOfWeek}`
    );

    // Add message count
    summaryParts.push(
      `${discordContext.messageHistory.length} messages exchanged`
    );

    // Add topics
    const topics = this.extractTopicsFromHistory(discordContext.messageHistory);
    if (topics.length > 0) {
      summaryParts.push(`Topics: ${topics.join(', ')}`);
    }

    // Add cross-channel context if available
    if (discordContext.crossChannelContext) {
      summaryParts.push(
        `User active in ${discordContext.crossChannelContext.activeChannels.length} channels, ` +
        `overall mood: ${discordContext.crossChannelContext.overallMood}`
      );
    }

    return summaryParts.join('. ');
  }

  /**
   * Clear context for a conversation
   */
  async clearContext(conversationId: string): Promise<void> {
    this.logger.info('Clearing Discord context', { conversationId });

    // Remove from memory cache
    this.discordContexts.delete(conversationId);

    // Remove from tiered storage
    await this.tieredStorage.delete(`discord:context:${conversationId}`);

    this.logger.info('Discord context cleared', { conversationId });
  }

  /**
   * Get channel context
   */
  private async getChannelContext(message: DiscordMessage): Promise<ChannelContext> {
    // Check cache first
    const cached = this.channelInfoCache.get(message.channelId);
    if (cached) {
      return cached;
    }

    // Try to retrieve from storage
    const stored = await this.tieredStorage.retrieve<ChannelContext>(
      `discord:channel:${message.channelId}`
    );

    if (stored) {
      this.channelInfoCache.set(message.channelId, stored);
      return stored;
    }

    // Create default channel context
    const channelContext: ChannelContext = {
      channelId: message.channelId,
      channelName: `channel-${message.channelId.slice(0, 8)}`,
      channelType: 'text',
      topic: undefined,
      participantCount: 0,
      recentActivity: [],
    };

    // Cache and store
    this.channelInfoCache.set(message.channelId, channelContext);
    await this.tieredStorage.store(
      `discord:channel:${message.channelId}`,
      channelContext,
      DataType.CONVERSATION,
      { tier: 'warm' as any, ttl: 3600 } // 1 hour
    );

    return channelContext;
  }

  /**
   * Get guild context
   */
  private async getGuildContext(guildId: string): Promise<GuildContext> {
    // Check cache first
    const cached = this.guildInfoCache.get(guildId);
    if (cached) {
      return cached;
    }

    // Try to retrieve from storage
    const stored = await this.tieredStorage.retrieve<GuildContext>(
      `discord:guild:${guildId}`
    );

    if (stored) {
      this.guildInfoCache.set(guildId, stored);
      return stored;
    }

    // Create default guild context
    const guildContext: GuildContext = {
      guildId,
      guildName: `guild-${guildId.slice(0, 8)}`,
      memberCount: 0,
      roles: [],
      channels: [],
      rules: [],
      culture: undefined,
    };

    // Cache and store
    this.guildInfoCache.set(guildId, guildContext);
    await this.tieredStorage.store(
      `discord:guild:${guildId}`,
      guildContext,
      DataType.CONVERSATION,
      { tier: 'warm' as any, ttl: 7200 } // 2 hours
    );

    return guildContext;
  }

  /**
   * Update channel activity
   */
  private async updateChannelActivity(message: DiscordMessage): Promise<void> {
    const activityEntry: ActivityEntry = {
      timestamp: message.timestamp,
      userId: message.author.id,
      action: 'message',
      content: message.content,
    };

    // Get current channel context
    const channelContext = await this.getChannelContext(message);

    // Add activity entry
    channelContext.recentActivity.push(activityEntry);

    // Keep only recent activity (last 100 entries)
    if (channelContext.recentActivity.length > 100) {
      channelContext.recentActivity = channelContext.recentActivity.slice(-100);
    }

    // Update participant count (simplified)
    channelContext.participantCount = this.countUniqueParticipants(
      channelContext.recentActivity
    );

    // Store updated context
    await this.tieredStorage.store(
      `discord:channel:${message.channelId}`,
      channelContext,
      DataType.CONVERSATION,
      { tier: 'warm' as any, ttl: 3600 }
    );

    // Update cache
    this.channelInfoCache.set(message.channelId, channelContext);
  }

  /**
   * Store context in tiered storage
   */
  private async storeContext(
    conversationId: string,
    context: DiscordContext
  ): Promise<void> {
    await this.tieredStorage.store(
      `discord:context:${conversationId}`,
      context,
      DataType.CONVERSATION,
      { tier: 'warm' as any, ttl: 7200 } // 2 hours
    );
  }

  /**
   * Extract topics from messages
   */
  private extractTopics(messages: any[]): string[] {
    const topicCounts = new Map<string, number>();
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'to',
      'of', 'in', 'for', 'on', 'at', 'from', 'by', 'with', 'about',
      'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'between', 'under', 'again', 'further', 'then', 'once', 'here',
      'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
      'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only',
      'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also',
      'now', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what',
      'which', 'this', 'that', 'these', 'those', 'am', 'is', 'are',
      'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'but', 'and', 'if', 'or', 'because',
      'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with',
      'about', 'against', 'between', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down',
      'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further',
      'then', 'once',
    ]);

    for (const msg of messages) {
      const content = msg.content || '';
      const words = content.toLowerCase().split(/\s+/);

      for (const word of words) {
        const cleanWord = word.replace(/[^a-z]/g, '');
        if (cleanWord.length > 3 && !stopWords.has(cleanWord)) {
          topicCounts.set(cleanWord, (topicCounts.get(cleanWord) || 0) + 1);
        }
      }
    }

    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);
  }

  /**
   * Extract topics from message history
   */
  private extractTopicsFromHistory(history: MessageHistoryEntry[]): string[] {
    const messages = history.map(entry => ({
      content: entry.content,
    }));
    return this.extractTopics(messages);
  }

  /**
   * Determine overall mood from conversations
   */
  private determineOverallMood(conversations: any[]): string {
    if (conversations.length === 0) {
      return 'neutral';
    }

    // Simple mood detection based on message content
    const positiveWords = ['good', 'great', 'happy', 'love', 'thanks', 'awesome', 'cool'];
    const negativeWords = ['bad', 'terrible', 'hate', 'angry', 'sad', 'awful', 'frustrated'];

    let positiveCount = 0;
    let negativeCount = 0;

    for (const conv of conversations) {
      for (const msg of conv.messages) {
        const content = (msg.content || '').toLowerCase();
        for (const word of positiveWords) {
          if (content.includes(word)) positiveCount++;
        }
        for (const word of negativeWords) {
          if (content.includes(word)) negativeCount++;
        }
      }
    }

    if (positiveCount > negativeCount * 1.5) return 'positive';
    if (negativeCount > positiveCount * 1.5) return 'negative';
    return 'neutral';
  }

  /**
   * Count unique participants from activity
   */
  private countUniqueParticipants(activity: ActivityEntry[]): number {
    const participants = new Set(activity.map(a => a.userId));
    return participants.size;
  }

  /**
   * Generate conversation ID
   */
  private getConversationId(message: DiscordMessage): string {
    return `${message.author.id}:${message.channelId}`;
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.discordContexts.clear();
    this.crossChannelCache.clear();
    this.channelInfoCache.clear();
    this.guildInfoCache.clear();
    this.logger.info('All Discord context caches cleared');
  }

  /**
   * Get context statistics
   */
  getStatistics(): {
    activeContexts: number;
    cachedChannels: number;
    cachedGuilds: number;
    cachedCrossChannel: number;
  } {
    return {
      activeContexts: this.discordContexts.size,
      cachedChannels: this.channelInfoCache.size,
      cachedGuilds: this.guildInfoCache.size,
      cachedCrossChannel: this.crossChannelCache.size,
    };
  }
}
