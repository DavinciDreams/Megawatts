/**
 * Custom error classes for the Discord bot
 */

export class BotError extends Error {
  public readonly code: string;
  public readonly severity: 'low' | 'medium' | 'high' | 'critical';
  public readonly context?: Record<string, any> | undefined;

  constructor(
    message: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'BotError';
    this.code = 'BOT_ERROR';
    this.severity = severity;
    this.context = context;
  }
}

export class ConfigError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, any> | undefined;

  constructor(message: string, code: string = 'CONFIG_ERROR', context?: Record<string, any>) {
    super(message);
    this.name = 'ConfigError';
    this.code = code;
    this.context = context;
  }
}

export class DatabaseError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, any> | undefined;

  constructor(message: string, code: string = 'DATABASE_ERROR', context?: Record<string, any>) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.context = context;
  }
}

export class AIError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, any> | undefined;

  constructor(message: string, code: string = 'AI_ERROR', context?: Record<string, any>) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.context = context;
  }
}

export class PluginError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, any> | undefined;

  constructor(message: string, code: string = 'PLUGIN_ERROR', context?: Record<string, any>) {
    super(message);
    this.name = 'PluginError';
    this.code = code;
    this.context = context;
  }
}

export class ValidationError extends Error {
  public readonly code: string;
  public readonly field?: string | undefined;

  constructor(message: string, field?: string, code: string = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.field = field;
  }
}

// Type guards for error handling
export const isBotError = (error: unknown): error is BotError => {
  return error instanceof Error && error.name === 'BotError';
};

export const isConfigError = (error: unknown): error is ConfigError => {
  return error instanceof Error && error.name === 'ConfigError';
};

export const isDatabaseError = (error: unknown): error is DatabaseError => {
  return error instanceof Error && error.name === 'DatabaseError';
};

export const isAIError = (error: unknown): error is AIError => {
  return error instanceof Error && error.name === 'AIError';
};

export const isPluginError = (error: unknown): error is PluginError => {
  return error instanceof Error && error.name === 'PluginError';
};

export const isValidationError = (error: unknown): error is ValidationError => {
  return error instanceof Error && error.name === 'ValidationError';
};