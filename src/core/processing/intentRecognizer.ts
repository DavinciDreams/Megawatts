import { Message } from 'discord.js';
import { Logger } from '../../utils/logger';
import { MessageContext, MessageIntent, IntentType, IntentEntity, PipelineConfig } from './types';

/**
 * Recognizes user intent from messages using various techniques
 */
export class IntentRecognizer {
  private config: PipelineConfig;
  private logger: Logger;
  private commandPatterns: Map<string, RegExp[]> = new Map();
  private intentPatterns: Map<IntentType, RegExp[]> = new Map();
  private entityExtractors: Map<string, RegExp> = new Map();

  constructor(config: PipelineConfig) {
    this.config = config;
    this.logger = new Logger('IntentRecognizer');
    this.initializePatterns();
  }

  /**
   * Recognize intent from message and context
   */
  async recognizeIntent(message: Message, context: MessageContext): Promise<MessageIntent> {
    try {
      const content = (message.content || '').toLowerCase().trim();
      
      if (!content) {
        return this.createIntent(IntentType.UNKNOWN, 0.0, []);
      }

      // Check for commands first (highest priority)
      const commandIntent = this.recognizeCommand(content, context);
      if (commandIntent.confidence > this.config.intentConfidenceThreshold) {
        return commandIntent;
      }

      // Check for other intents
      const intents: MessageIntent[] = [
        this.recognizeGreeting(content),
        this.recognizeFarewell(content),
        this.recognizeHelp(content),
        this.recognizeQuestion(content),
        this.recognizeModeration(content, context),
        this.recognizeSpam(content, context),
        this.recognizeConversation(content)
      ];

      // Find highest confidence intent
      const bestIntent = intents.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      , intents[0]);

      // Extract entities
      const entities = this.extractEntities(content, bestIntent.type);

      return {
        type: bestIntent.type,
        confidence: bestIntent.confidence,
        entities,
        action: this.extractAction(content, bestIntent.type),
        target: this.extractTarget(content, bestIntent.type)
      };

    } catch (error) {
      this.logger.error('Error recognizing intent:', error);
      return this.createIntent(IntentType.UNKNOWN, 0.0, []);
    }
  }

  /**
   * Initialize pattern matching for intents
   */
  private initializePatterns(): void {
    // Command patterns
    this.commandPatterns.set('help', [
      /^help$/i,
      /^h$/i,
      /^\?$/i
    ]);
    
    this.commandPatterns.set('ping', [
      /^ping$/i,
      /^pong$/i
    ]);
    
    this.commandPatterns.set('info', [
      /^info$/i,
      /^about$/i,
      /^status$/i
    ]);

    // Intent patterns
    this.intentPatterns.set(IntentType.GREETING, [
      /^(hi|hello|hey|yo|sup|greetings)/i,
      /^(good morning|good evening|good night)/i,
      /^(what's up|howdy|g'day)/i
    ]);

    this.intentPatterns.set(IntentType.FAREWELL, [
      /^(bye|goodbye|farewell|see ya|cya)/i,
      /^(good night|take care|later)/i,
      /^(peace out|I'm off)/i
    ]);

    this.intentPatterns.set(IntentType.QUESTION, [
      /^(what|how|why|when|where|who|which)/i,
      /^(can you|could you|would you)/i,
      /^(is there|are there|do you know)/i,
      /\?/
    ]);

    this.intentPatterns.set(IntentType.HELP, [
      /^(help|assist|support|aid)/i,
      /^(I need|I want|can you help)/i,
      /^(stuck|confused|don't understand)/i
    ]);

    // Entity extractors
    this.entityExtractors.set('user', /<@!?(\d+)>/g);
    this.entityExtractors.set('channel', /<#(\d+)>/g);
    this.entityExtractors.set('url', /https?:\/\/[^\s]+/g);
    this.entityExtractors.set('mention', /@(\w+)/g);
  }

  /**
   * Recognize command intent
   */
  private recognizeCommand(content: string, context: MessageContext): MessageIntent {
    const prefix = this.getCommandPrefix(content);
    if (!prefix) {
      return this.createIntent(IntentType.CONVERSATION, 0.0, []);
    }

    const command = content.substring(prefix.length).trim().split(/\s+/)[0];
    const patterns = this.commandPatterns.get(command);
    
    if (patterns) {
      const confidence = this.calculatePatternConfidence(content, patterns);
      return this.createIntent(IntentType.COMMAND, confidence, [
        {
          type: 'command',
          value: command,
          confidence,
          start: prefix.length,
          end: prefix.length + command.length
        }
      ]);
    }

    return this.createIntent(IntentType.CONVERSATION, 0.0, []);
  }

  /**
   * Recognize greeting intent
   */
  private recognizeGreeting(content: string): MessageIntent {
    const patterns = this.intentPatterns.get(IntentType.GREETING) || [];
    const confidence = this.calculatePatternConfidence(content, patterns);
    return this.createIntent(IntentType.GREETING, confidence, []);
  }

  /**
   * Recognize farewell intent
   */
  private recognizeFarewell(content: string): MessageIntent {
    const patterns = this.intentPatterns.get(IntentType.FAREWELL) || [];
    const confidence = this.calculatePatternConfidence(content, patterns);
    return this.createIntent(IntentType.FAREWELL, confidence, []);
  }

  /**
   * Recognize help intent
   */
  private recognizeHelp(content: string): MessageIntent {
    const patterns = this.intentPatterns.get(IntentType.HELP) || [];
    const confidence = this.calculatePatternConfidence(content, patterns);
    return this.createIntent(IntentType.HELP, confidence, []);
  }

  /**
   * Recognize question intent
   */
  private recognizeQuestion(content: string): MessageIntent {
    const patterns = this.intentPatterns.get(IntentType.QUESTION) || [];
    const confidence = this.calculatePatternConfidence(content, patterns);
    return this.createIntent(IntentType.QUESTION, confidence, []);
  }

  /**
   * Recognize moderation intent
   */
  private recognizeModeration(content: string, context: MessageContext): MessageIntent {
    const moderationKeywords = [
      'kick', 'ban', 'mute', 'warn', 'timeout', 'moderate',
      'delete', 'remove', 'silence', 'restrict'
    ];

    const hasKeyword = moderationKeywords.some(keyword => 
      content.includes(keyword.toLowerCase())
    );

    const confidence = hasKeyword ? 0.8 : 0.0;
    
    // Check if user has moderation permissions
    const hasModerationRole = context.guildContext?.userRoles.some(role =>
      role.toLowerCase().includes('mod') || role.toLowerCase().includes('admin')
    );

    return this.createIntent(
      IntentType.MODERATION, 
      hasKeyword && hasModerationRole ? confidence : 0.0,
      []
    );
  }

  /**
   * Recognize spam intent
   */
  private recognizeSpam(content: string, context: MessageContext): MessageIntent {
    const spamScore = context.userHistory?.spamScore || 0;
    const confidence = Math.min(spamScore, 1.0);
    
    return this.createIntent(IntentType.SPAM, confidence, []);
  }

  /**
   * Recognize general conversation intent
   */
  private recognizeConversation(content: string): MessageIntent {
    // Default intent with low confidence
    return this.createIntent(IntentType.CONVERSATION, 0.3, []);
  }

  /**
   * Calculate confidence for pattern matching
   */
  private calculatePatternConfidence(content: string, patterns: RegExp[]): number {
    if (!patterns.length) {
      return 0.0;
    }

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return 0.9; // High confidence for pattern match
      }
    }

    return 0.0;
  }

  /**
   * Extract entities from content
   */
  private extractEntities(content: string, intentType: IntentType): IntentEntity[] {
    const entities: IntentEntity[] = [];

    // Extract based on intent type
    switch (intentType) {
      case IntentType.COMMAND:
        entities.push(...this.extractCommandEntities(content));
        break;
      case IntentType.MODERATION:
        entities.push(...this.extractModerationEntities(content));
        break;
      default:
        entities.push(...this.extractGeneralEntities(content));
        break;
    }

    return entities;
  }

  /**
   * Extract command-specific entities
   */
  private extractCommandEntities(content: string): IntentEntity[] {
    const entities: IntentEntity[] = [];
    
    // Extract user mentions
    const userMatches = content.matchAll(this.entityExtractors.get('user')!);
    userMatches.forEach((match, index) => {
      entities.push({
        type: 'user',
        value: match[1],
        confidence: 0.9,
        start: match.index || 0,
        end: (match.index || 0) + match[0].length
      });
    });

    return entities;
  }

  /**
   * Extract moderation-specific entities
   */
  private extractModerationEntities(content: string): IntentEntity[] {
    const entities: IntentEntity[] = [];
    
    // Extract action
    const actions = ['kick', 'ban', 'mute', 'warn', 'timeout'];
    for (const action of actions) {
      if (content.includes(action)) {
        const index = content.indexOf(action);
        entities.push({
          type: 'action',
          value: action,
          confidence: 0.8,
          start: index,
          end: index + action.length
        });
        break;
      }
    }

    // Extract target user
    const userMatches = content.matchAll(this.entityExtractors.get('user')!);
    userMatches.forEach((match) => {
      entities.push({
        type: 'target',
        value: match[1],
        confidence: 0.9,
        start: match.index || 0,
        end: (match.index || 0) + match[0].length
      });
    });

    return entities;
  }

  /**
   * Extract general entities
   */
  private extractGeneralEntities(content: string): IntentEntity[] {
    const entities: IntentEntity[] = [];
    
    // Extract URLs
    const urlMatches = content.matchAll(this.entityExtractors.get('url')!);
    urlMatches.forEach((match) => {
      entities.push({
        type: 'url',
        value: match[0],
        confidence: 0.95,
        start: match.index || 0,
        end: (match.index || 0) + match[0].length
      });
    });

    return entities;
  }

  /**
   * Extract action from content
   */
  private extractAction(content: string, intentType: IntentType): string | undefined {
    if (intentType === IntentType.COMMAND) {
      const parts = content.trim().split(/\s+/);
      return parts[1] || undefined;
    }
    
    return undefined;
  }

  /**
   * Extract target from content
   */
  private extractTarget(content: string, intentType: IntentType): string | undefined {
    if (intentType === IntentType.COMMAND || intentType === IntentType.MODERATION) {
      const userMatches = content.matchAll(this.entityExtractors.get('user')!);
      return userMatches.length > 0 ? userMatches[0][1] : undefined;
    }
    
    return undefined;
  }

  /**
   * Get command prefix from content
   */
  private getCommandPrefix(content: string): string {
    const prefixes = ['!', '/', '$', '.'];
    
    for (const prefix of prefixes) {
      if (content.startsWith(prefix)) {
        return prefix;
      }
    }
    
    return '';
  }

  /**
   * Create intent object
   */
  private createIntent(type: IntentType, confidence: number, entities: IntentEntity[]): MessageIntent {
    return {
      type,
      confidence: Math.max(0, Math.min(1, confidence)),
      entities
    };
  }

  /**
   * Update recognizer configuration
   */
  updateConfig(config: PipelineConfig): void {
    this.config = config;
    this.logger.debug('Intent recognizer configuration updated');
  }

  /**
   * Add custom command pattern
   */
  addCommandPattern(command: string, patterns: RegExp[]): void {
    this.commandPatterns.set(command, patterns);
    this.logger.debug(`Added patterns for command: ${command}`);
  }

  /**
   * Add custom intent pattern
   */
  addIntentPattern(intent: IntentType, patterns: RegExp[]): void {
    const existing = this.intentPatterns.get(intent) || [];
    this.intentPatterns.set(intent, [...existing, ...patterns]);
    this.logger.debug(`Added patterns for intent: ${intent}`);
  }
}