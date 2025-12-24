import { Message } from 'discord.js';
import { Logger } from '../../utils/logger.js';
import {
  MessageContext,
  RoutingDecision,
  HandlerType,
  MessageIntent,
  SafetyCheckResult,
  PipelineConfig,
  IntentType
} from './types';

/**
 * Routes messages to appropriate handlers based on intent and safety
 */
export class MessageRouter {
  private config: PipelineConfig;
  private logger: Logger;
  private routingRules: RoutingRule[] = [];
  private handlerPriorities: Map<HandlerType, number> = new Map();

  constructor(config: PipelineConfig) {
    this.config = config;
    this.logger = new Logger('MessageRouter');
    this.initializePriorities();
    this.initializeRoutingRules();
  }

  /**
   * Route message to appropriate handler
   */
  async routeMessage(
    message: Message,
    context: MessageContext,
    intent: MessageIntent,
    safety: SafetyCheckResult
  ): Promise<RoutingDecision> {
    try {
      this.logger.debug(`Routing message ${message.id} with intent: ${intent.type}`);

      // Check if message should be ignored
      if (this.shouldIgnoreMessage(message, context, intent, safety)) {
        return this.createRoutingDecision(HandlerType.IGNORE, 0, false, false);
      }

      // Apply routing rules in priority order
      for (const rule of this.routingRules) {
        if (this.matchesRule(message, context, intent, safety, rule)) {
          const decision = this.applyRule(message, context, intent, safety, rule);
          this.logger.debug(`Applied rule: ${rule.name}, handler: ${decision.handler}`);
          return decision;
        }
      }

      // Default routing logic
      return this.defaultRouting(message, context, intent, safety);

    } catch (error) {
      this.logger.error('Error routing message:', error);
      return this.createRoutingDecision(HandlerType.IGNORE, 0, false, false);
    }
  }

  /**
   * Initialize handler priorities
   */
  private initializePriorities(): void {
    this.handlerPriorities.set(HandlerType.MODERATION, 100);
    this.handlerPriorities.set(HandlerType.COMMAND, 90);
    this.handlerPriorities.set(HandlerType.HELP_SYSTEM, 80);
    this.handlerPriorities.set(HandlerType.AI_CHAT, 70);
    this.handlerPriorities.set(HandlerType.LOG_ONLY, 50);
    this.handlerPriorities.set(HandlerType.IGNORE, 0);
  }

  /**
   * Initialize routing rules
   */
  private initializeRoutingRules(): void {
    this.routingRules = [
      {
        name: 'critical_safety',
        priority: 100,
        condition: (msg, ctx, intent, safety) => 
          !safety.isSafe && safety.riskLevel === 'critical',
        action: (msg, ctx, intent, safety) => ({
          handler: HandlerType.MODERATION,
          priority: 100,
          requiresModeration: true,
          shouldRespond: false,
          metadata: { reason: 'critical_safety_violation', violations: safety.violations }
        })
      },
      {
        name: 'high_safety',
        priority: 90,
        condition: (msg, ctx, intent, safety) => 
          !safety.isSafe && safety.riskLevel === 'high',
        action: (msg, ctx, intent, safety) => ({
          handler: HandlerType.MODERATION,
          priority: 90,
          requiresModeration: true,
          shouldRespond: false,
          metadata: { reason: 'high_safety_violation', violations: safety.violations }
        })
      },
      {
        name: 'command_handler',
        priority: 80,
        condition: (msg, ctx, intent, safety) => 
          intent.type === IntentType.COMMAND && intent.confidence > 0.7,
        action: (msg, ctx, intent, safety) => ({
          handler: HandlerType.COMMAND,
          priority: 80,
          requiresModeration: false,
          shouldRespond: true,
          metadata: { 
            command: intent.entities.find(e => e.type === 'command')?.value,
            action: intent.action,
            target: intent.target
          }
        })
      },
      {
        name: 'help_request',
        priority: 70,
        condition: (msg, ctx, intent, safety) => 
          intent.type === IntentType.HELP && intent.confidence > 0.6,
        action: (msg, ctx, intent, safety) => ({
          handler: HandlerType.HELP_SYSTEM,
          priority: 70,
          requiresModeration: false,
          shouldRespond: true,
          metadata: { helpType: 'user_request' }
        })
      },
      {
        name: 'moderation_intent',
        priority: 60,
        condition: (msg, ctx, intent, safety) => 
          intent.type === IntentType.MODERATION && intent.confidence > 0.7,
        action: (msg, ctx, intent, safety) => ({
          handler: HandlerType.MODERATION,
          priority: 60,
          requiresModeration: true,
          shouldRespond: false,
          metadata: { 
            reason: 'moderation_command',
            action: intent.action,
            target: intent.target
          }
        })
      },
      {
        name: 'spam_detection',
        priority: 50,
        condition: (msg, ctx, intent, safety) => 
          intent.type === IntentType.SPAM && intent.confidence > 0.8,
        action: (msg, ctx, intent, safety) => ({
          handler: HandlerType.MODERATION,
          priority: 50,
          requiresModeration: true,
          shouldRespond: false,
          metadata: { reason: 'spam_detected', spamScore: ctx.userHistory?.spamScore }
        })
      },
      {
        name: 'question_handler',
        priority: 40,
        condition: (msg, ctx, intent, safety) => 
          intent.type === IntentType.QUESTION && intent.confidence > 0.5,
        action: (msg, ctx, intent, safety) => ({
          handler: HandlerType.AI_CHAT,
          priority: 40,
          requiresModeration: false,
          shouldRespond: true,
          metadata: { responseType: 'question' }
        })
      },
      {
        name: 'greeting_response',
        priority: 30,
        condition: (msg, ctx, intent, safety) => 
          (intent.type === IntentType.GREETING || intent.type === IntentType.FAREWELL) && 
          intent.confidence > 0.6,
        action: (msg, ctx, intent, safety) => ({
          handler: HandlerType.AI_CHAT,
          priority: 30,
          requiresModeration: false,
          shouldRespond: true,
          metadata: { responseType: 'greeting', intentType: intent.type }
        })
      }
    ];

    // Sort rules by priority
    this.routingRules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if message should be ignored
   */
  private shouldIgnoreMessage(
    message: Message,
    context: MessageContext,
    intent: MessageIntent,
    safety: SafetyCheckResult
  ): boolean {
    // Ignore bot messages
    if (message.author?.bot) {
      this.logger.debug(`Ignoring bot message from ${message.author?.id}`);
      return true;
    }

    // Ignore messages from self
    if (message.author?.id === message.client?.user?.id) {
      this.logger.debug(`Ignoring self message`);
      return true;
    }

    // Ignore very low confidence intents
    if (intent.confidence < 0.1) {
      this.logger.debug(`Ignoring low confidence intent: ${intent.confidence}`);
      return true;
    }

    // Ignore empty messages
    if (!message.content || message.content.trim().length === 0) {
      this.logger.debug(`Ignoring empty message`);
      return true;
    }

    // Channel filtering and mention detection
    const isInAllowedChannel = this.isInAllowedChannel(context.channelId, message);
    const hasBotMention = this.hasBotMention(message);

    // If respondToMentions is enabled and bot is mentioned, allow regardless of channel
    if (this.config.respondToMentions && hasBotMention) {
      this.logger.debug(`Allowing message with bot mention in channel ${context.channelId}`);
      return false;
    }

    // If not in allowed channel and no bot mention, ignore
    if (!isInAllowedChannel && !hasBotMention) {
      this.logger.debug(`Ignoring message in channel ${context.channelId} - not in allowed channels and no bot mention`);
      return true;
    }

    return false;
  }

  /**
   * Check if channel is in allowed channels list
   */
  private isInAllowedChannel(channelId: string, message: Message): boolean {
    // If no channel restrictions are set, allow all channels
    if (!this.config.allowedChannels?.length && !this.config.allowedChannelNames?.length) {
      return true;
    }

    // Check by channel ID
    if (this.config.allowedChannels?.includes(channelId)) {
      this.logger.debug(`Channel ${channelId} is in allowed channels list`);
      return true;
    }

    // Check by channel name (fallback) - only for guild channels
    if (message.channel && 'name' in message.channel) {
      const channelName = (message.channel as any).name;
      if (channelName && this.config.allowedChannelNames?.includes(channelName)) {
        this.logger.debug(`Channel name ${channelName} is in allowed channel names list`);
        return true;
      }
    }

    return false;
  }

  /**
   * Check if message contains a bot mention
   */
  private hasBotMention(message: Message): boolean {
    // Check if message mentions the bot
    if (message.mentions?.users?.has(message.client?.user?.id || '')) {
      this.logger.debug(`Message contains bot mention`);
      return true;
    }

    // Check for @everyone mentions (optional - can be configured)
    // This is useful for when bot should respond to mass mentions
    if (message.mentions?.everyone) {
      this.logger.debug(`Message contains @everyone mention`);
      return true;
    }

    return false;
  }

  /**
   * Check if message matches a routing rule
   */
  private matchesRule(
    message: Message,
    context: MessageContext,
    intent: MessageIntent,
    safety: SafetyCheckResult,
    rule: RoutingRule
  ): boolean {
    try {
      return rule.condition(message, context, intent, safety);
    } catch (error) {
      this.logger.warn(`Error in routing rule condition for ${rule.name}:`, error);
      return false;
    }
  }

  /**
   * Apply routing rule
   */
  private applyRule(
    message: Message,
    context: MessageContext,
    intent: MessageIntent,
    safety: SafetyCheckResult,
    rule: RoutingRule
  ): RoutingDecision {
    try {
      return rule.action(message, context, intent, safety);
    } catch (error) {
      this.logger.error(`Error applying routing rule ${rule.name}:`, error);
      return this.createRoutingDecision(HandlerType.IGNORE, 0, false, false);
    }
  }

  /**
   * Default routing logic
   */
  private defaultRouting(
    message: Message,
    context: MessageContext,
    intent: MessageIntent,
    safety: SafetyCheckResult
  ): RoutingDecision {
    // If safety violations require action
    if (!safety.isSafe && safety.requiresAction) {
      return this.createRoutingDecision(HandlerType.MODERATION, 85, true, false, {
        reason: 'safety_violation',
        violations: safety.violations
      });
    }

    // If high confidence conversation
    if (intent.type === IntentType.CONVERSATION && intent.confidence > 0.7) {
      return this.createRoutingDecision(HandlerType.AI_CHAT, 35, false, true, {
        responseType: 'conversation'
      });
    }

    // Default to AI chat with low priority
    if (intent.confidence > 0.3) {
      return this.createRoutingDecision(HandlerType.AI_CHAT, 20, false, true, {
        responseType: 'general'
      });
    }

    // Log only for low confidence or unknown intents
    return this.createRoutingDecision(HandlerType.LOG_ONLY, 10, false, false, {
      reason: 'low_confidence',
      intentType: intent.type,
      confidence: intent.confidence
    });
  }

  /**
   * Create routing decision
   */
  private createRoutingDecision(
    handler: HandlerType,
    priority: number,
    requiresModeration: boolean,
    shouldRespond: boolean,
    metadata?: Record<string, any>
  ): RoutingDecision {
    return {
      handler,
      priority,
      requiresModeration,
      shouldRespond,
      metadata
    };
  }

  /**
   * Add custom routing rule
   */
  addRoutingRule(rule: RoutingRule): void {
    this.routingRules.push(rule);
    this.routingRules.sort((a, b) => b.priority - a.priority);
    this.logger.debug(`Added routing rule: ${rule.name}`);
  }

  /**
   * Remove routing rule
   */
  removeRoutingRule(ruleName: string): boolean {
    const index = this.routingRules.findIndex(rule => rule.name === ruleName);
    if (index !== -1) {
      this.routingRules.splice(index, 1);
      this.logger.debug(`Removed routing rule: ${ruleName}`);
      return true;
    }
    return false;
  }

  /**
   * Get handler priority
   */
  getHandlerPriority(handler: HandlerType): number {
    return this.handlerPriorities.get(handler) || 0;
  }

  /**
   * Set handler priority
   */
  setHandlerPriority(handler: HandlerType, priority: number): void {
    this.handlerPriorities.set(handler, priority);
    this.logger.debug(`Set ${handler} priority to ${priority}`);
  }

  /**
   * Get all routing rules
   */
  getRoutingRules(): RoutingRule[] {
    return [...this.routingRules];
  }

  /**
   * Update router configuration
   */
  updateConfig(config: PipelineConfig): void {
    this.config = config;
    this.logger.debug('Message router configuration updated');
  }
}

/**
 * Routing rule interface
 */
interface RoutingRule {
  name: string;
  priority: number;
  condition: (
    message: Message,
    context: MessageContext,
    intent: MessageIntent,
    safety: SafetyCheckResult
  ) => boolean;
  action: (
    message: Message,
    context: MessageContext,
    intent: MessageIntent,
    safety: SafetyCheckResult
  ) => RoutingDecision;
}