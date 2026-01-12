/**
 * Base Bot Error Class
 * 
 * This class represents the base error type for all bot operations.
 * It extends the native Error class and implements the BotError interface.
 */

import type { BotError as IBotError } from '../../types/index.js';

export class BotError extends Error implements IBotError {
  code: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  context?: Record<string, any>;

  constructor(
    message: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    context?: Record<string, any>
  ) {
    super(message);
    
    // Maintain proper stack trace for where our error was thrown
    this.name = 'BotError';
    this.code = 'BOT_ERROR';
    this.severity = severity;
    this.timestamp = new Date();
    this.context = context;

    // Set the prototype explicitly for instanceof checks
    Object.setPrototypeOf(this, BotError.prototype);
  }

  /**
   * Create a BotError from a generic Error
   */
  static fromError(error: Error, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'): BotError {
    return new BotError(
      error.message,
      severity,
      { originalError: error.name, stack: error.stack }
    );
  }

  /**
   * Create a low severity error
   */
  static low(message: string, context?: Record<string, any>): BotError {
    return new BotError(message, 'low', context);
  }

  /**
   * Create a medium severity error
   */
  static medium(message: string, context?: Record<string, any>): BotError {
    return new BotError(message, 'medium', context);
  }

  /**
   * Create a high severity error
   */
  static high(message: string, context?: Record<string, any>): BotError {
    return new BotError(message, 'high', context);
  }

  /**
   * Create a critical severity error
   */
  static critical(message: string, context?: Record<string, any>): BotError {
    return new BotError(message, 'critical', context);
  }
}
