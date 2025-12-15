import {
  ErrorCategory,
  ErrorSeverity,
  ErrorClassification,
  ErrorContext,
  UserFriendlyMessage
} from './types';
import { Logger } from '../../utils/logger';

export class ErrorMessageFormatter {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Format an error for Discord users
   */
  public formatForDiscord(
    error: Error,
    classification: ErrorClassification,
    context: ErrorContext
  ): UserFriendlyMessage {
    const baseMessage = this.getBaseMessage(classification, context);
    const detailedMessage = this.getDetailedMessage(classification, context);
    const color = this.getMessageColor(classification.severity);

    return {
      title: baseMessage.title,
      description: detailedMessage.description,
      color,
      footer: this.getFooter(classification),
      fields: this.getFields(classification, context)
    };
  }

  /**
   * Format error for logging
   */
  public formatForLogging(
    error: Error,
    classification: ErrorClassification,
    context: ErrorContext
  ): {
    message: string;
    metadata: Record<string, any>;
  } {
    return {
      message: `${classification.category.toUpperCase()}: ${error.message}`,
      metadata: {
        category: classification.category,
        severity: classification.severity,
        action: classification.action,
        isRetryable: classification.isRetryable,
        requiresEscalation: classification.requiresEscalation,
        userId: context.userId,
        guildId: context.guildId,
        channelId: context.channelId,
        command: context.command,
        interaction: context.interaction,
        requestId: context.requestId,
        timestamp: context.timestamp,
        stackTrace: context.stackTrace,
        additionalMetadata: context.metadata
      }
    };
  }

  /**
   * Format error for self-editing engine
   */
  public formatForSelfEditing(
    error: Error,
    classification: ErrorClassification,
    context: ErrorContext
  ): {
    type: string;
    severity: string;
    description: string;
    context: Record<string, any>;
    suggestedActions: string[];
  } {
    const suggestedActions = this.getSuggestedActions(classification);

    return {
      type: classification.category,
      severity: classification.severity,
      description: error.message,
      context: {
        userId: context.userId,
        guildId: context.guildId,
        channelId: context.channelId,
        command: context.command,
        interaction: context.interaction,
        timestamp: context.timestamp,
        metadata: context.metadata
      },
      suggestedActions
    };
  }

  /**
   * Get base message based on error category
   */
  private getBaseMessage(classification: ErrorClassification, context: ErrorContext): {
    title: string;
    description: string;
  } {
    const categoryMessages = {
      [ErrorCategory.DISCORD_API]: {
        title: '⚠️ Discord API Error',
        description: 'There was an issue communicating with Discord.'
      },
      [ErrorCategory.RATE_LIMIT]: {
        title: '⏱️ Rate Limited',
        description: 'Please slow down! You\'re making too many requests.'
      },
      [ErrorCategory.PERMISSION]: {
        title: '🚫 Permission Denied',
        description: 'The bot doesn\'t have the required permissions.'
      },
      [ErrorCategory.NETWORK]: {
        title: '🌐 Network Error',
        description: 'Having trouble connecting to the internet.'
      },
      [ErrorCategory.CONNECTION]: {
        title: '🔌 Connection Error',
        description: 'Lost connection to the service.'
      },
      [ErrorCategory.TIMEOUT]: {
        title: '⏰ Timeout Error',
        description: 'The operation took too long to complete.'
      },
      [ErrorCategory.COMMAND]: {
        title: '❌ Command Error',
        description: 'There was an issue executing that command.'
      },
      [ErrorCategory.INTERACTION]: {
        title: '❌ Interaction Error',
        description: 'There was an issue with this interaction.'
      },
      [ErrorCategory.MESSAGE]: {
        title: '❌ Message Error',
        description: 'There was an issue processing this message.'
      },
      [ErrorCategory.SYSTEM]: {
        title: '🖥️ System Error',
        description: 'An internal system error occurred.'
      },
      [ErrorCategory.MEMORY]: {
        title: '💾 Memory Error',
        description: 'The system is running low on memory.'
      },
      [ErrorCategory.CPU]: {
        title: '🔥 CPU Error',
        description: 'The system is experiencing high CPU usage.'
      },
      [ErrorCategory.AI_SERVICE]: {
        title: '🤖 AI Service Error',
        description: 'The AI service is temporarily unavailable.'
      },
      [ErrorCategory.DATABASE]: {
        title: '🗄️ Database Error',
        description: 'There was an issue with the database.'
      },
      [ErrorCategory.STORAGE]: {
        title: '💿 Storage Error',
        description: 'There was an issue with file storage.'
      },
      [ErrorCategory.CONFIGURATION]: {
        title: '⚙️ Configuration Error',
        description: 'There\'s an issue with the bot configuration.'
      },
      [ErrorCategory.VALIDATION]: {
        title: '✋ Validation Error',
        description: 'The provided input is invalid.'
      },
      [ErrorCategory.SELF_EDITING]: {
        title: '🔧 Self-Editing Error',
        description: 'There was an issue with the self-editing system.'
      },
      [ErrorCategory.ADAPTATION]: {
        title: '🔄 Adaptation Error',
        description: 'There was an issue with behavior adaptation.'
      },
      [ErrorCategory.UNKNOWN]: {
        title: '❓ Unknown Error',
        description: 'An unexpected error occurred.'
      }
    };

    return categoryMessages[classification.category] || categoryMessages[ErrorCategory.UNKNOWN];
  }

  /**
   * Get detailed message based on classification and context
   */
  private getDetailedMessage(classification: ErrorClassification, context: ErrorContext): {
    description: string;
  } {
    if (classification.userMessage) {
      return { description: classification.userMessage };
    }

    const contextMessages = {
      [ErrorCategory.RATE_LIMIT]: 'Please wait a moment before trying again.',
      [ErrorCategory.PERMISSION]: 'Please check that the bot has the required permissions.',
      [ErrorCategory.COMMAND]: 'Please check your command syntax and try again.',
      [ErrorCategory.INTERACTION]: 'Please try the interaction again.',
      [ErrorCategory.VALIDATION]: 'Please check your input and try again.',
      [ErrorCategory.TIMEOUT]: 'The operation timed out. Please try again.',
      [ErrorCategory.NETWORK]: 'Please check your internet connection and try again.',
      [ErrorCategory.AI_SERVICE]: 'The AI service is temporarily unavailable. Please try again later.',
      [ErrorCategory.DATABASE]: 'A database error occurred. The issue has been reported.'
    };

    const defaultMessage = 'Please try again later. If the problem persists, contact support.';
    return { description: contextMessages[classification.category] || defaultMessage };
  }

  /**
   * Get message color based on severity
   */
  private getMessageColor(severity: ErrorSeverity): number {
    const colors = {
      [ErrorSeverity.LOW]: 0x00FF00,    // Green
      [ErrorSeverity.MEDIUM]: 0xFFFF00,  // Yellow
      [ErrorSeverity.HIGH]: 0xFF6600,    // Orange
      [ErrorSeverity.CRITICAL]: 0xFF0000  // Red
    };

    return colors[severity] || colors[ErrorSeverity.MEDIUM];
  }

  /**
   * Get footer message
   */
  private getFooter(classification: ErrorClassification): string {
    if (classification.requiresEscalation) {
      return 'This error has been escalated to the development team.';
    }

    if (classification.isRetryable) {
      return 'This operation can be retried automatically.';
    }

    return 'If this error persists, please report it.';
  }

  /**
   * Get additional fields for the message
   */
  private getFields(classification: ErrorClassification, context: ErrorContext): Array<{
    name: string;
    value: string;
    inline?: boolean;
  }> {
    const fields: Array<{
      name: string;
      value: string;
      inline?: boolean;
    }> = [];

    // Add retry information
    if (classification.isRetryable && classification.maxRetries) {
      fields.push({
        name: '🔄 Retry Information',
        value: `Max attempts: ${classification.maxRetries}`,
        inline: true
      });
    }

    // Add context information
    if (context.command) {
      fields.push({
        name: '🔧 Command',
        value: context.command,
        inline: true
      });
    }

    if (context.interaction) {
      fields.push({
        name: '🎯 Interaction',
        value: context.interaction,
        inline: true
      });
    }

    // Add severity information
    fields.push({
      name: '📊 Severity',
      value: classification.severity.toUpperCase(),
      inline: true
    });

    // Add action information
    fields.push({
      name: '⚡ Action',
      value: classification.action.replace('_', ' ').toUpperCase(),
      inline: true
    });

    return fields;
  }

  /**
   * Get suggested actions for self-editing engine
   */
  private getSuggestedActions(classification: ErrorClassification): string[] {
    const actionSuggestions = {
      [ErrorCategory.RATE_LIMIT]: [
        'Implement rate limiting at the application level',
        'Add exponential backoff for retries',
        'Consider caching responses to reduce API calls'
      ],
      [ErrorCategory.PERMISSION]: [
        'Review and update bot permissions',
        'Add permission checks before executing commands',
        'Provide clear error messages for permission issues'
      ],
      [ErrorCategory.NETWORK]: [
        'Implement circuit breaker pattern',
        'Add connection pooling',
        'Improve network timeout handling'
      ],
      [ErrorCategory.TIMEOUT]: [
        'Increase timeout thresholds for slow operations',
        'Implement async processing for long-running tasks',
        'Add progress indicators for users'
      ],
      [ErrorCategory.MEMORY]: [
        'Implement memory leak detection',
        'Add memory usage monitoring',
        'Optimize data structures and algorithms'
      ],
      [ErrorCategory.AI_SERVICE]: [
        'Implement fallback AI providers',
        'Add response caching',
        'Improve error handling for AI service failures'
      ],
      [ErrorCategory.DATABASE]: [
        'Implement database connection pooling',
        'Add database health monitoring',
        'Improve query optimization'
      ]
    };

    return actionSuggestions[classification.category] || [
      'Review error logs for more details',
      'Consider adding more specific error handling',
      'Implement monitoring for this error type'
    ];
  }

  /**
   * Create a simple text message for quick responses
   */
  public createSimpleMessage(
    classification: ErrorClassification,
    context: ErrorContext
  ): string {
    const baseMessage = this.getBaseMessage(classification, context);
    const detailedMessage = this.getDetailedMessage(classification, context);
    
    return `${baseMessage.title}\n\n${detailedMessage.description}`;
  }

  /**
   * Create an embed object for Discord
   */
  public createDiscordEmbed(
    error: Error,
    classification: ErrorClassification,
    context: ErrorContext
  ): any {
    const message = this.formatForDiscord(error, classification, context);
    
    return {
      title: message.title,
      description: message.description,
      color: message.color,
      footer: message.footer ? { text: message.footer } : undefined,
      fields: message.fields,
      timestamp: new Date().toISOString()
    };
  }
}