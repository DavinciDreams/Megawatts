import {
  ErrorCategory,
  ErrorSeverity,
  ErrorAction,
  ErrorClassification,
  ErrorContext,
  ClassificationRule,
  RetryConfig
} from './types';
import { Logger } from '../../utils/logger';

export class ErrorClassifier {
  private logger: Logger;
  private classificationRules: ClassificationRule[];
  private defaultRetryConfig: RetryConfig;

  constructor(
    classificationRules: ClassificationRule[],
    defaultRetryConfig: RetryConfig,
    logger: Logger
  ) {
    this.classificationRules = classificationRules;
    this.defaultRetryConfig = defaultRetryConfig;
    this.logger = logger;
  }

  /**
   * Classify an error based on its properties and message
   */
  public classifyError(error: Error, context: ErrorContext): ErrorClassification {
    const errorMessage = error.message.toLowerCase();
    const errorStack = error.stack?.toLowerCase() || '';
    const combinedMessage = `${errorMessage} ${errorStack}`;

    // Try to match against classification rules
    for (const rule of this.classificationRules) {
      if (this.matchesRule(combinedMessage, rule)) {
        this.logger.debug('Error matched classification rule', {
          category: rule.category,
          severity: rule.severity,
          action: rule.action,
          errorMessage: error.message
        });

        return {
          category: rule.category,
          severity: rule.severity,
          action: rule.action,
          isRetryable: rule.isRetryable,
          maxRetries: rule.retryConfig?.maxAttempts || this.defaultRetryConfig.maxAttempts,
          retryDelay: rule.retryConfig?.baseDelay || this.defaultRetryConfig.baseDelay,
          userMessage: rule.userMessage,
          requiresEscalation: rule.severity === ErrorSeverity.CRITICAL || rule.action === ErrorAction.ESCALATE
        };
      }
    }

    // Default classification for unmatched errors
    return this.getDefaultClassification(error, context);
  }

  /**
   * Check if an error message matches a classification rule
   */
  private matchesRule(message: string, rule: ClassificationRule): boolean {
    return rule.patterns.some(pattern => pattern.test(message));
  }

  /**
   * Get default classification for unmatched errors
   */
  private getDefaultClassification(error: Error, context: ErrorContext): ErrorClassification {
    const errorMessage = error.message.toLowerCase();
    
    // Discord API errors
    if (errorMessage.includes('discord') || errorMessage.includes('discord api')) {
      if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
        return {
          category: ErrorCategory.RATE_LIMIT,
          severity: ErrorSeverity.MEDIUM,
          action: ErrorAction.RETRY,
          isRetryable: true,
          maxRetries: 3,
          retryDelay: 5000,
          userMessage: 'The bot is experiencing rate limiting. Please try again in a moment.',
          requiresEscalation: false
        };
      }

      if (errorMessage.includes('permission') || errorMessage.includes('missing permissions')) {
        return {
          category: ErrorCategory.PERMISSION,
          severity: ErrorSeverity.MEDIUM,
          action: ErrorAction.NOTIFY_USER,
          isRetryable: false,
          userMessage: 'The bot lacks the required permissions to perform this action.',
          requiresEscalation: false
        };
      }

      return {
        category: ErrorCategory.DISCORD_API,
        severity: ErrorSeverity.HIGH,
        action: ErrorAction.RETRY,
        isRetryable: true,
        maxRetries: 2,
        retryDelay: 1000,
        userMessage: 'There was an issue with the Discord API. Please try again.',
        requiresEscalation: true
      };
    }

    // Network errors
    if (errorMessage.includes('network') || errorMessage.includes('connection') || 
        errorMessage.includes('timeout') || errorMessage.includes('econnreset')) {
      
      if (errorMessage.includes('timeout')) {
        return {
          category: ErrorCategory.TIMEOUT,
          severity: ErrorSeverity.MEDIUM,
          action: ErrorAction.RETRY,
          isRetryable: true,
          maxRetries: 2,
          retryDelay: 2000,
          userMessage: 'The operation timed out. Please try again.',
          requiresEscalation: false
        };
      }

      return {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        action: ErrorAction.RETRY,
        isRetryable: true,
        maxRetries: 3,
        retryDelay: 1500,
        userMessage: 'Network error occurred. Retrying...',
        requiresEscalation: false
      };
    }

    // Database errors
    if (errorMessage.includes('database') || errorMessage.includes('sql') || 
        errorMessage.includes('connection') && errorMessage.includes('db')) {
      return {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        action: ErrorAction.ESCALATE,
        isRetryable: false,
        userMessage: 'A database error occurred. The issue has been reported.',
        requiresEscalation: true
      };
    }

    // AI service errors
    if (errorMessage.includes('ai') || errorMessage.includes('openai') || 
        errorMessage.includes('anthropic') || errorMessage.includes('claude')) {
      return {
        category: ErrorCategory.AI_SERVICE,
        severity: ErrorSeverity.MEDIUM,
        action: ErrorAction.RETRY,
        isRetryable: true,
        maxRetries: 2,
        retryDelay: 3000,
        userMessage: 'AI service is temporarily unavailable. Please try again.',
        requiresEscalation: false
      };
    }

    // Memory errors
    if (errorMessage.includes('memory') || errorMessage.includes('out of memory') || 
        errorMessage.includes('heap')) {
      return {
        category: ErrorCategory.MEMORY,
        severity: ErrorSeverity.CRITICAL,
        action: ErrorAction.RESTART,
        isRetryable: false,
        userMessage: 'System resources are low. The bot will restart automatically.',
        requiresEscalation: true
      };
    }

    // Command/interaction errors
    if (context.command || context.interaction) {
      return {
        category: ErrorCategory.COMMAND,
        severity: ErrorSeverity.LOW,
        action: ErrorAction.NOTIFY_USER,
        isRetryable: false,
        userMessage: 'There was an issue executing this command. Please check your input and try again.',
        requiresEscalation: false
      };
    }

    // Default unknown error
    return {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      action: ErrorAction.LOG_ONLY,
      isRetryable: false,
      userMessage: 'An unexpected error occurred. The issue has been logged.',
      requiresEscalation: true
    };
  }

  /**
   * Get default classification rules
   */
  public static getDefaultRules(): ClassificationRule[] {
    return [
      // Discord API errors
      {
        category: ErrorCategory.RATE_LIMIT,
        patterns: [/rate limit/i, /too many requests/i, /429/i],
        severity: ErrorSeverity.MEDIUM,
        action: ErrorAction.RETRY,
        isRetryable: true,
        retryConfig: { maxAttempts: 3, baseDelay: 5000 },
        userMessage: 'The bot is experiencing rate limiting. Please try again in a moment.'
      },
      {
        category: ErrorCategory.PERMISSION,
        patterns: [/permission/i, /missing permissions/i, /unauthorized/i, /403/i],
        severity: ErrorSeverity.MEDIUM,
        action: ErrorAction.NOTIFY_USER,
        isRetryable: false,
        userMessage: 'The bot lacks the required permissions to perform this action.'
      },
      
      // Network errors
      {
        category: ErrorCategory.NETWORK,
        patterns: [/network/i, /connection/i, /econnreset/i, /enotfound/i],
        severity: ErrorSeverity.MEDIUM,
        action: ErrorAction.RETRY,
        isRetryable: true,
        retryConfig: { maxAttempts: 3, baseDelay: 1500 },
        userMessage: 'Network error occurred. Retrying...'
      },
      {
        category: ErrorCategory.TIMEOUT,
        patterns: [/timeout/i, /etimedout/i],
        severity: ErrorSeverity.MEDIUM,
        action: ErrorAction.RETRY,
        isRetryable: true,
        retryConfig: { maxAttempts: 2, baseDelay: 2000 },
        userMessage: 'The operation timed out. Please try again.'
      },
      
      // Database errors
      {
        category: ErrorCategory.DATABASE,
        patterns: [/database/i, /sql/i, /connection.*refused/i, /econnrefused/i],
        severity: ErrorSeverity.HIGH,
        action: ErrorAction.ESCALATE,
        isRetryable: false,
        userMessage: 'A database error occurred. The issue has been reported.'
      },
      
      // AI service errors
      {
        category: ErrorCategory.AI_SERVICE,
        patterns: [/openai/i, /anthropic/i, /claude/i, /ai.*service/i],
        severity: ErrorSeverity.MEDIUM,
        action: ErrorAction.RETRY,
        isRetryable: true,
        retryConfig: { maxAttempts: 2, baseDelay: 3000 },
        userMessage: 'AI service is temporarily unavailable. Please try again.'
      },
      
      // System errors
      {
        category: ErrorCategory.MEMORY,
        patterns: [/out of memory/i, /heap/i, /memory/i],
        severity: ErrorSeverity.CRITICAL,
        action: ErrorAction.RESTART,
        isRetryable: false,
        userMessage: 'System resources are low. The bot will restart automatically.'
      },
      
      // Configuration errors
      {
        category: ErrorCategory.CONFIGURATION,
        patterns: [/config/i, /configuration/i, /missing.*config/i],
        severity: ErrorSeverity.HIGH,
        action: ErrorAction.ESCALATE,
        isRetryable: false,
        userMessage: 'Configuration error detected. The issue has been reported.'
      }
    ];
  }

  /**
   * Get default retry configuration
   */
  public static getDefaultRetryConfig(): RetryConfig {
    return {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true
    };
  }
}