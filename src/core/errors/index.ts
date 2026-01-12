/**
 * Comprehensive Error Handling System for Discord Operations
 * 
 * This module provides:
 * - Error classification and categorization
 * - Retry logic with exponential backoff
 * - User-friendly error message formatting
 * - Error reporting to self-editing engine
 * - Centralized error handling orchestration
 */

// Export all types
export * from './types';

// Export core classes
export { ErrorClassifier } from './classifier';
export { RetryHandler, type RetryAttempt, type RetryResult } from './retry';
export { ErrorMessageFormatter } from './formatter';
export { ErrorReporter } from './reporter';
export { ErrorHandler, type DiscordContext, type ErrorHandlingResult } from './handler';
export { BotError } from './bot-error';
export { SelfEditingError } from './self-editing-error';

// Export utility functions
export { createDefaultErrorHandler, createCustomErrorHandler, createErrorHandlerWithOptions } from './factory';