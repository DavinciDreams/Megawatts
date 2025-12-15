/**
 * Error handling system types for Discord operations
 */

export enum ErrorCategory {
  // Discord API related errors
  DISCORD_API = 'discord_api',
  RATE_LIMIT = 'rate_limit',
  PERMISSION = 'permission',
  
  // Network related errors
  NETWORK = 'network',
  CONNECTION = 'connection',
  TIMEOUT = 'timeout',
  
  // Bot operation errors
  COMMAND = 'command',
  INTERACTION = 'interaction',
  MESSAGE = 'message',
  
  // System errors
  SYSTEM = 'system',
  MEMORY = 'memory',
  CPU = 'cpu',
  
  // External service errors
  AI_SERVICE = 'ai_service',
  DATABASE = 'database',
  STORAGE = 'storage',
  
  // Configuration errors
  CONFIGURATION = 'configuration',
  VALIDATION = 'validation',
  
  // Self-editing errors
  SELF_EDITING = 'self_editing',
  ADAPTATION = 'adaptation',
  
  // Unknown errors
  UNKNOWN = 'unknown'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorAction {
  RETRY = 'retry',
  ESCALATE = 'escalate',
  IGNORE = 'ignore',
  RESTART = 'restart',
  NOTIFY_USER = 'notify_user',
  LOG_ONLY = 'log_only'
}

export interface ErrorContext {
  userId?: string;
  guildId?: string;
  channelId?: string;
  command?: string;
  interaction?: string;
  requestId?: string;
  timestamp: Date;
  stackTrace?: string;
  metadata?: Record<string, any>;
}

export interface ErrorClassification {
  category: ErrorCategory;
  severity: ErrorSeverity;
  action: ErrorAction;
  isRetryable: boolean;
  maxRetries?: number;
  retryDelay?: number;
  userMessage?: string | undefined;
  requiresEscalation: boolean;
  retryConfig?: Partial<RetryConfig>;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export interface ErrorReport {
  id: string;
  timestamp: Date;
  error: Error;
  classification: ErrorClassification;
  context: ErrorContext;
  retryAttempts: number;
  resolved: boolean;
  resolutionTime?: Date;
  resolutionAction?: string;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  retrySuccessRate: number;
  averageResolutionTime: number;
  criticalErrors: number;
  escalatedErrors: number;
}

export interface ErrorHandlerConfig {
  enableRetry: boolean;
  enableReporting: boolean;
  enableUserNotification: boolean;
  defaultRetryConfig: RetryConfig;
  classificationRules: ClassificationRule[];
  reportingThreshold: ErrorSeverity;
}

export interface ClassificationRule {
  category: ErrorCategory;
  patterns: RegExp[];
  severity: ErrorSeverity;
  action: ErrorAction;
  isRetryable: boolean;
  retryConfig?: Partial<RetryConfig>;
  userMessage?: string;
}

export interface UserFriendlyMessage {
  title: string;
  description: string;
  color?: number;
  footer?: string;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}