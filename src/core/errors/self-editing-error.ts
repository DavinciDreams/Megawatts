/**
 * Self-Editing Error Class
 * 
 * This class represents errors that occur during self-editing operations.
 * It extends the native Error class and implements the SelfEditingError interface.
 */

import type { SelfEditingError as ISelfEditingError } from '../../types/self-editing.js';

export class SelfEditingError extends Error implements ISelfEditingError {
  code: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  component: string;
  operation: string;
  modificationId?: string;
  pluginId?: string;
  learningDataId?: string;
  recoveryAction?: string;
  context?: Record<string, any>;

  constructor(
    message: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    component: string,
    operation: string,
    modificationId?: string,
    pluginId?: string,
    learningDataId?: string,
    recoveryAction?: string,
    context?: Record<string, any>
  ) {
    super(message);
    
    // Maintain proper stack trace for where our error was thrown
    this.name = 'SelfEditingError';
    this.code = 'SELF_EDITING_ERROR';
    this.severity = severity;
    this.timestamp = new Date();
    this.component = component;
    this.operation = operation;
    this.modificationId = modificationId;
    this.pluginId = pluginId;
    this.learningDataId = learningDataId;
    this.recoveryAction = recoveryAction;
    this.context = context;

    // Set the prototype explicitly for instanceof checks
    Object.setPrototypeOf(this, SelfEditingError.prototype);
  }

  /**
   * Create a SelfEditingError from a generic Error
   */
  static fromError(error: Error, component: string, operation: string): SelfEditingError {
    return new SelfEditingError(
      error.message,
      'high',
      component,
      operation,
      undefined,
      undefined,
      undefined,
      undefined,
      { originalError: error.name, stack: error.stack }
    );
  }

  /**
   * Create a critical error for initialization failures
   */
  static initializationFailed(message: string, recoveryAction?: string): SelfEditingError {
    return new SelfEditingError(
      message,
      'critical',
      'core',
      'initialization',
      undefined,
      undefined,
      undefined,
      recoveryAction
    );
  }

  /**
   * Create a high severity error for operation failures
   */
  static operationFailed(message: string, operation: string, recoveryAction?: string): SelfEditingError {
    return new SelfEditingError(
      message,
      'high',
      'core',
      operation,
      undefined,
      undefined,
      undefined,
      recoveryAction
    );
  }

  /**
   * Create a medium severity error for stop failures
   */
  static stopFailed(message: string, recoveryAction?: string): SelfEditingError {
    return new SelfEditingError(
      message,
      'medium',
      'core',
      'stop',
      undefined,
      undefined,
      undefined,
      recoveryAction
    );
  }
}
