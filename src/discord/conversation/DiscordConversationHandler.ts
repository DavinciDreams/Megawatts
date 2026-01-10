/**
 * Discord Conversation Handler
 *
 * This module implements main handler for conversational Discord mode,
 * processing messages through AI integration pipeline.
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
import { ToolRegistry, ToolExecutionResult } from '../../ai/tools/tool-registry';
import { Tool } from '../../types/ai';
import { ToolExecutor, ExecutionContext } from '../../ai/tools/tool-executor';
import { ToolSandbox, SandboxConfig } from '../../ai/tools/tool-sandbox';
import { DiscordToolExecutor } from '../../tools/discord-tools';
import { PermissionFlagsBits } from 'discord.js';

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
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private toolSandbox: ToolSandbox;
  private logger: Logger;
  private activeConversations: Map<string, ConversationContext> = new Map();
  private discordToolExecutor: DiscordToolExecutor;

  constructor(
    config: ConversationalDiscordConfig,
    aiProvider: ConversationalAIProviderRouter,
    discordContextManager: DiscordContextManager,
    conversationManager: ConversationManager,
    emotionalIntelligenceEngine: EmotionalIntelligenceEngine,
    emergencyStopHandler: EmergencyStopHandler,
    toolRegistry: ToolRegistry,
    logger: Logger
  ) {
    this.config = config;
    this.aiProvider = aiProvider;
    this.discordContextManager = discordContextManager;
    this.conversationManager = conversationManager;
    this.emotionalIntelligenceEngine = emotionalIntelligenceEngine;
    this.emergencyStopHandler = emergencyStopHandler;
    this.toolRegistry = toolRegistry;
    this.logger = logger;
    
    // Initialize tool executor for handling tool calls
    const sandboxConfig: SandboxConfig = {
      enabled: false, // Sandbox disabled for now
      timeoutMs: 30000,
      maxMemoryMB: 512,
      maxCpuPercent: 80,
      enableNetworkIsolation: false,
      enableFileSystemIsolation: false,
      enableApiRestrictions: false,
      allowedDomains: [],
      allowedPaths: [],
      blockedPaths: [],
      allowedApis: [],
      blockedApis: []
    };
    
    this.toolSandbox = new ToolSandbox(sandboxConfig, this.logger);
    
    // Create Discord tool executor
    this.discordToolExecutor = new DiscordToolExecutor(this.logger);
    
    this.toolExecutor = new ToolExecutor(
      this.toolRegistry,
      this.toolSandbox,
      {
        maxConcurrentExecutions: 5,
        defaultTimeout: 30000,
        enableRateLimiting: true,
        enableMonitoring: true,
        sandboxMode: false,
        retryAttempts: 3,
        retryDelay: 1000
      },
      this.logger,
      this.discordToolExecutor  // Pass Discord tool executor to enable tool execution
    );

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
   * Set Discord client on the tool executor
   * This allows the handler to access Discord client for permission checks
   */
  setDiscordClient(client: any): void {
    this.discordToolExecutor.setClient(client);
    this.logger.info('Discord client set on tool executor');
  }

  /**
   * Convert Discord PermissionFlagsBits to permission strings
   * This converts the bot's permission bits to the string format expected by tools
   */
  private convertPermissionBitsToStrings(permissionBits: bigint): string[] {
    const permissions: string[] = [];
    
    // Map Discord.js PermissionFlagsBits to string names
    // Only include permissions that are actually used by tools
    // Keys are in snake_case to match tool permission definitions
    const permissionMap: Record<string, bigint> = {
      'create_instant_invite': PermissionFlagsBits.CreateInstantInvite,
      'kick_members': PermissionFlagsBits.KickMembers,
      'ban_members': PermissionFlagsBits.BanMembers,
      'administrator': PermissionFlagsBits.Administrator,
      'manage_channels': PermissionFlagsBits.ManageChannels,
      'manage_guild': PermissionFlagsBits.ManageGuild,
      'add_reactions': PermissionFlagsBits.AddReactions,
      'view_audit_log': PermissionFlagsBits.ViewAuditLog,
      'priority_speaker': PermissionFlagsBits.PrioritySpeaker,
      'stream': PermissionFlagsBits.Stream,
      'read_messages': PermissionFlagsBits.ReadMessageHistory,
      'send_messages': PermissionFlagsBits.SendMessages,
      'send_tts_messages': PermissionFlagsBits.SendTTSMessages,
      'manage_messages': PermissionFlagsBits.ManageMessages,
      'embed_links': PermissionFlagsBits.EmbedLinks,
      'attach_files': PermissionFlagsBits.AttachFiles,
      'read_message_history': PermissionFlagsBits.ReadMessageHistory,
      'mention_everyone': PermissionFlagsBits.MentionEveryone,
      'external_emojis': PermissionFlagsBits.UseExternalEmojis,
      'view_guild_insights': PermissionFlagsBits.ViewGuildInsights,
      'moderate_members': PermissionFlagsBits.ModerateMembers,
      'view_creator_monetization_analytics': PermissionFlagsBits.ViewCreatorMonetizationAnalytics,
      'use_soundboard': PermissionFlagsBits.UseSoundboard,
      'use_external_sounds': PermissionFlagsBits.UseExternalSounds,
      'use_vad': PermissionFlagsBits.UseVAD,
      'request_to_speak': PermissionFlagsBits.RequestToSpeak,
      'manage_nicknames': PermissionFlagsBits.ManageNicknames,
      'manage_roles': PermissionFlagsBits.ManageRoles,
      'manage_webhooks': PermissionFlagsBits.ManageWebhooks,
      'manage_guild_expressions': PermissionFlagsBits.ManageGuildExpressions,
      'use_application_commands': PermissionFlagsBits.UseApplicationCommands,
      'manage_threads': PermissionFlagsBits.ManageThreads,
      'create_public_threads': PermissionFlagsBits.CreatePublicThreads,
      'create_private_threads': PermissionFlagsBits.CreatePrivateThreads,
      'use_external_stickers': PermissionFlagsBits.UseExternalStickers,
      'send_messages_in_threads': PermissionFlagsBits.SendMessagesInThreads,
      'manage_events': PermissionFlagsBits.ManageEvents,
      'send_polls': PermissionFlagsBits.SendPolls,
    };
    
    // Check each permission flag and add corresponding string
    for (const [name, flag] of Object.entries(permissionMap)) {
      if ((permissionBits & flag) === flag) {
        permissions.push(name);
      }
    }
    
    // Debug log the converted permissions
    this.logger.debug('[PERMISSION-CHECK] Converted permission bits to strings', {
      permissionBits: permissionBits.toString(),
      permissions: permissions,
    });
    
    return permissions;
  }

  /**
   * Get bot permissions for a guild/channel
   * This retrieves the bot's actual Discord permissions and converts them to permission strings
   */
  private async getBotPermissions(guildId?: string, channelId?: string): Promise<string[]> {
    const permissions: string[] = [];

    try {
      // Get Discord client from tool executor
      const client = this.discordToolExecutor.getClient();

      if (!client) {
        this.logger.warn('[PERMISSION-CHECK] Discord client not available, using empty permissions');
        return permissions;
      }

      // If no guild ID, this is a DM - use basic permissions
      if (!guildId) {
        this.logger.debug('[PERMISSION-CHECK] No guild ID (DM), using basic permissions');
        return ['send_messages'];
      }

      // Get the guild
      const guild = await client.guilds.fetch(guildId).catch(() => null);

      if (!guild) {
        this.logger.warn('[PERMISSION-CHECK] Guild not found, using empty permissions');
        return permissions;
      }

      // Get bot's member in the guild
      const botMember = await guild.members.fetchMe().catch(() => null);

      if (!botMember) {
        this.logger.warn('[PERMISSION-CHECK] Bot member not found in guild, using empty permissions');
        return permissions;
      }

      // Get bot's permissions in the guild
      const botPermissions = botMember.permissions;

      // Convert PermissionFlagsBits to permission strings
      const permissionStrings = this.convertPermissionBitsToStrings(botPermissions);

      this.logger.debug('[PERMISSION-CHECK] Retrieved bot permissions', {
        guildId,
        channelId,
        botPermissions: botPermissions.toString(),
        permissionStrings,
      });

      return permissionStrings;
    } catch (error) {
      this.logger.error('[PERMISSION-CHECK] Failed to get bot permissions', error as Error, {
        guildId,
        channelId,
      });
      return [];
    }
  }

  /**
   * Process a Discord message through conversational pipeline
   */
  async processMessage(message: DiscordMessage): Promise<ConversationResponse> {
    try {
      this.logger.info('[DEBUG-TOOL] toolCalling enabled:', { toolCalling: this.config.features.toolCalling });
      this.logger.debug('Processing Discord message', {
        messageId: message.id,
        userId: message.author.id,
        channelId: message.channelId,
        content: message.content,
      });

      // DEBUG: Log if message is a command
      const isCommand = message.content.startsWith('!');
      this.logger.info(`[DEBUG-CONV] Message "${message.content}" is command: ${isCommand}`);

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

      // Check if message is a command (starts with !)
      // In hybrid mode, commands should be handled by command handler, not conversational mode
      if (message.content.startsWith('!')) {
        this.logger.info(`[CONV-SKIP] Skipping command message: "${message.content}" - should be handled by command handler`);
        return {
          content: '',
          tone: 'friendly',
          metadata: {
            skipped: true,
            reason: 'Command message - should be handled by command handler',
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
            content: deEscalationResponse.content as string,
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
        tools: this.getToolsForRequest(),
      };

      // Route to AI provider and get response
      const aiResponse = await this.aiProvider.routeRequest(conversationalRequest);

      // Handle tool calls if present in AI response
      if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
        this.logger.info('[TOOL-CALL] AI returned tool calls', {
          toolCount: aiResponse.toolCalls.length,
          tools: aiResponse.toolCalls.map(tc => tc.name)
        });

        // Execute tool calls
        const toolResults = await this.executeToolCalls(aiResponse.toolCalls, conversationContext);

        // Add tool results to message history for multi-turn conversation
        for (const toolResult of toolResults) {
          conversationContext.messageHistory.push({
            role: 'tool',
            content: JSON.stringify({
              tool: toolResult.toolName,
              result: toolResult.result,
              error: toolResult.error
            }),
            timestamp: new Date(),
            metadata: {
              toolExecution: toolResult.success,
              executionTime: toolResult.executionTime
            }
          });
        }

        // Re-send to AI with tool results for final response
        this.logger.info('[TOOL-CALL] Re-sending to AI with tool results');
        const toolResultsMessage = toolResults
          .filter(r => r.success)
          .map(r => `Tool ${r.toolName} result: ${JSON.stringify(r.result)}`)
          .join('\n');

        // Add tool results message as user message
        conversationContext.messageHistory.push({
          role: 'user',
          content: toolResultsMessage,
          timestamp: new Date()
        });

        // Get final AI response
        const finalAiResponse = await this.aiProvider.routeRequest(conversationalRequest);

        // Add final AI response to history
        conversationContext.messageHistory.push({
          role: 'assistant',
          content: finalAiResponse.content,
          timestamp: new Date(),
          metadata: {
            provider: finalAiResponse.provider,
            model: finalAiResponse.model,
            tokensUsed: finalAiResponse.tokensUsed,
          },
        });

        // Return final AI response
        return {
          content: finalAiResponse.content,
          tone: this.config.tone,
          emotion: conversationContext.emotionalContext?.emotion?.primary,
          metadata: {
            conversationId,
            provider: finalAiResponse.provider,
            model: finalAiResponse.model,
            tokensUsed: finalAiResponse.tokensUsed,
            processingTime: finalAiResponse.metadata?.processingTime,
            emotionalAdaptations: this.config.emotionalIntelligence.enabled,
            toolCallsExecuted: toolResults.length,
          },
        };
      } else {
        // Add AI response to history (no tool calls)
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
      }

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
   * Execute tool calls
   */
  private async executeToolCalls(
    toolCalls: any[],
    conversationContext: ConversationContext
  ): Promise<ToolExecutionResult[]> {
    this.logger.info('Executing tool calls', {
      toolCount: toolCalls.length
    });

    const results: ToolExecutionResult[] = [];
    for (const toolCall of toolCalls) {
      // Get bot permissions for this guild/channel
      const permissions = await this.getBotPermissions(
        conversationContext.guildId,
        conversationContext.channelId
      );

      // Create execution context from conversation context
      const executionContext: ExecutionContext = {
        userId: conversationContext.userId,
        guildId: conversationContext.guildId,
        channelId: conversationContext.channelId,
        permissions: permissions,
        requestId: this.generateRequestId(),
        timestamp: new Date(),
      };

      // Debug log permissions
      this.logger.debug('[PERMISSION-CHECK] Tool execution context permissions', {
        toolName: toolCall.name,
        permissions: permissions,
        guildId: conversationContext.guildId,
        channelId: conversationContext.channelId,
      });

      const result = await this.toolExecutor.executeTool(toolCall, executionContext);
      results.push(result);
    }

    return results;
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

      const conversationId = `${userId}:${channelId}`;

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
   * Get tools for AI request
   */
  private getToolsForRequest(): any[] | undefined {
    this.logger.debug('[DEBUG-TOOLS] getToolsForRequest called', {
      toolCallingEnabled: this.config.features.toolCalling
    });

    // Only include tools if tool calling is enabled in config
    if (!this.config.features.toolCalling) {
      this.logger.debug('[DEBUG-TOOLS] Tool calling disabled, returning undefined');
      return undefined;
    }

    // Get all tools from registry
    const tools = this.toolRegistry.getAllTools();
    this.logger.debug('[DEBUG-TOOLS] getToolsForRequest returning:', {
      totalTools: tools.length,
      toolNames: tools.map(t => t.name)
    });

    // Convert tools to OpenAI format for AI providers
    const convertedTools = tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.reduce((acc, param) => {
            acc[param.name] = {
              type: param.type,
              description: param.description,
              ...(param.defaultValue !== undefined && { default: param.defaultValue }),
              ...(param.validation && {
                ...(param.validation.min !== undefined && { minimum: param.validation.min }),
                ...(param.validation.max !== undefined && { maximum: param.validation.max }),
                ...(param.validation.minLength !== undefined && { minLength: param.validation.minLength }),
                ...(param.validation.maxLength !== undefined && { maxLength: param.validation.maxLength }),
                ...(param.validation.pattern !== undefined && { pattern: param.validation.pattern }),
                ...(param.validation.enum !== undefined && { enum: param.validation.enum }),
              }),
            };
            return acc;
          }, {} as Record<string, any>),
          required: tool.parameters.filter(p => p.required).map(p => p.name),
        },
      },
    }));

    // DEBUG: Log the exact tool schema being generated in OpenAI format
    this.logger.debug('[DEBUG-TOOLS] Generated OpenAI format tools:', {
      toolCount: convertedTools.length,
      tools: JSON.stringify(convertedTools, null, 2)
    });

    return convertedTools;
  }

  /**
   * Get current configuration
   */
  getConfig(): ConversationalDiscordConfig {
    return { ...this.config };
  }

  /**
   * Get conversation ID from a Discord message
   */
  private getConversationId(message: DiscordMessage): string {
    return `${message.author.id}:${message.channelId}`;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get model for current AI provider
   */
  private getModelForProvider(): string {
    // Use default model since config doesn't have ai property
    // The actual model selection is handled by the AI provider router
    return 'gpt-4';
  }

  /**
   * Get user preferences (placeholder)
   */
  private getUserPreferences(userId: string): UserPreferences | undefined {
    // This would integrate with user preference system
    return undefined;
  }

  /**
   * Create initial emotional context
   */
  private createInitialEmotionalContext(): EmotionalContext {
    return {
      sentiment: {
        score: 0,
        magnitude: 0,
        confidence: 0,
        approach: 'rule-based',
      },
      emotion: {
        primary: 'neutral',
        emotions: {},
        confidence: 0,
      },
      mood: {
        mood: 'neutral',
        intensity: 0,
        confidence: 0,
        factors: [],
      },
    };
  }
}
