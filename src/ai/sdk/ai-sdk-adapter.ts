/**
 * AI SDK Adapter
 *
 * This module provides an adapter layer for integrating Vercel AI SDK
 * with existing custom tool calling infrastructure.
 *
 * The hybrid approach uses AI SDK for core primitives while retaining
 * custom security and operational features.
 */

import { tool as createTool, type Tool as AI_SDK_Tool } from 'ai';
import { z } from 'zod';
import { Logger } from '../../utils/logger';
import type { Tool, ToolParameter, ParameterType } from '../../types/ai';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * AI SDK-compatible tool definition
 */
export interface AISDKTool {
  description: string;
  parameters: z.ZodType<any, any, any>;
  execute: (parameters: any) => Promise<any>;
}

/**
 * Schema cache entry
 */
interface SchemaCacheEntry {
  schema: z.ZodType<any, any, any>;
  timestamp: number;
}

/**
 * Adapter configuration
 */
export interface AIAdapterConfig {
  useAISDK: boolean;
  useAISDKForExecution: boolean;
  useAISDKForProviders: boolean;
  enableStreaming: boolean;
  enableMultiStep: boolean;
}

/**
 * Conversion options
 */
export interface ConversionOptions {
  preserveSafetyMetadata?: boolean;
  includeExamples?: boolean;
}

// ============================================================================
// TYPE MAPPING UTILITIES
// ============================================================================

/**
 * Map ParameterType to Zod type
 */
function mapParameterTypeToZod(paramType: ParameterType): z.ZodTypeAny {
  switch (paramType) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(z.any());
    case 'object':
      return z.record(z.any(), z.any());
    case 'file':
      return z.string(); // File paths as strings
    case 'url':
      return z.string().url();
    case 'custom':
      return z.any();
    default:
      return z.any();
  }
}

/**
 * Map ParameterType to OpenAI function parameter type
 */
function mapParameterTypeToOpenAI(paramType: ParameterType): string {
  switch (paramType) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'array';
    case 'object':
      return 'object';
    case 'file':
      return 'string';
    case 'url':
      return 'string';
    case 'custom':
      return 'object';
    default:
      return 'string';
  }
}

// ============================================================================
// TOOL CONVERTER CLASS
// ============================================================================

/**
 * Converts between custom Tool format and AI SDK tool format
 */
export class ToolConverter {
  private logger: Logger;
  private schemaCache: Map<string, SchemaCacheEntry>;
  private readonly SCHEMA_CACHE_TTL = 300000; // 5 minutes in milliseconds

  constructor(logger: Logger) {
    this.logger = logger;
    this.schemaCache = new Map();
  }

  /**
   * Clear expired schema cache entries
   */
  private clearExpiredCacheEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.schemaCache.entries()) {
      if (now - entry.timestamp > this.SCHEMA_CACHE_TTL) {
        this.schemaCache.delete(key);
      }
    }
  }

  /**
   * Convert custom Tool to AI SDK tool format
   */
  convertToAISDK(tool: Tool, options: ConversionOptions = {}): AI_SDK_Tool {
    // Build Zod schema from parameters
    const schema = this.buildZodSchema(tool.parameters);

    // Create AI SDK tool
    const aiSdkTool = createTool({
      description: tool.description,
      inputSchema: schema,
      execute: async (params: any) => {
        this.logger.debug(`AI SDK tool executed: ${tool.name}`, { params });
        // Tool execution is handled by ToolExecutor
        // This is a placeholder - actual execution happens through ToolExecutor
        return { toolName: tool.name, params };
      }
    });

    return aiSdkTool;
  }

  /**
   * Convert custom Tool to OpenAI-compatible tool format
   */
  convertToOpenAIFormat(tool: Tool): any {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const param of tool.parameters) {
      // Build OpenAI parameter schema
      const paramSchema: any = {
        type: mapParameterTypeToOpenAI(param.type),
        description: param.description
      };

      // Add validation rules
      if (param.validation) {
        if (param.validation.min !== undefined) {
          paramSchema.minimum = param.validation.min;
        }
        if (param.validation.max !== undefined) {
          paramSchema.maximum = param.validation.max;
        }
        if (param.validation.minLength !== undefined) {
          paramSchema.minLength = param.validation.minLength;
        }
        if (param.validation.maxLength !== undefined) {
          paramSchema.maxLength = param.validation.maxLength;
        }
        if (param.validation.pattern) {
          paramSchema.pattern = param.validation.pattern;
        }
        if (param.validation.enum && param.validation.enum.length > 0) {
          paramSchema.enum = param.validation.enum;
        }
      }

      properties[param.name] = paramSchema;

      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties,
          required
        }
      }
    };
  }

  /**
   * Convert AI SDK tool result to custom ToolResult format
   */
  convertToolResult(toolName: string, result: any): any {
    // AI SDK returns results directly
    // Wrap in standard format for compatibility
    return {
      tool: toolName,
      success: true,
      result,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Build Zod schema from ToolParameter array with caching
   */
  private buildZodSchema(parameters: ToolParameter[]): z.ZodType<any, any, any> {
    // Create cache key from parameter definitions
    const cacheKey = parameters
      .map(p => `${p.name}:${p.type}:${p.required}:${p.validation?.min ?? ''}:${p.validation?.max ?? ''}:${p.validation?.minLength ?? ''}:${p.validation?.maxLength ?? ''}`)
      .join('|');

    // Check cache first
    if (this.schemaCache.has(cacheKey)) {
      this.logger.debug(`Using cached schema for tool with ${parameters.length} parameters`);
      return this.schemaCache.get(cacheKey)!.schema;
    }

    // Build schema
    const schemaShape: Record<string, z.ZodTypeAny> = {};
    for (const param of parameters) {
      let zodType = mapParameterTypeToZod(param.type);

      // Apply validation rules
      if (param.validation) {
        if (param.validation.min !== undefined) {
          zodType = (zodType as any).min(param.validation.min);
        }
        if (param.validation.max !== undefined) {
          zodType = (zodType as any).max(param.validation.max);
        }
        if (param.validation.minLength !== undefined) {
          zodType = (zodType as any).min(param.validation.minLength);
        }
        if (param.validation.maxLength !== undefined) {
          zodType = (zodType as any).max(param.validation.maxLength);
        }
        if (param.validation.pattern) {
          zodType = (zodType as any).regex(new RegExp(param.validation.pattern));
        }
        if (param.validation.enum && param.validation.enum.length > 0) {
          zodType = (zodType as any).enum(param.validation.enum);
        }
      }

      // Add description
      zodType = zodType.describe(param.description);

      // Handle optional parameters
      if (!param.required) {
        zodType = (zodType as any).optional();
      }

      schemaShape[param.name] = zodType;
    }

    const schema = z.object(schemaShape);

    // Cache the schema
    this.schemaCache.set(cacheKey, {
      schema,
      timestamp: Date.now()
    });

    // Clear expired entries
    this.clearExpiredCacheEntries();

    return schema;
  }

  /**
   * Validate parameters using Zod schema
   */
  validateParameters(tool: Tool, args: Record<string, any>): {
    valid: boolean;
    errors: string[];
  } {
    try {
      const schema = this.buildZodSchema(tool.parameters);
      schema.parse(args);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.issues.map(e => `${e.path.join('.')}: ${e.message}`)
        };
      }
      return {
        valid: false,
        errors: [(error as Error).message]
      };
    }
  }
}

// ============================================================================
// AI SDK ADAPTER CLASS
// ============================================================================

/**
 * Main adapter for AI SDK integration
 */
export class AISDKAdapter {
  private logger: Logger;
  private config: AIAdapterConfig;
  private toolConverter: ToolConverter;

  constructor(config: AIAdapterConfig, logger: Logger) {
    this.logger = logger;
    this.config = config;
    this.toolConverter = new ToolConverter(logger);
  }

  /**
   * Check if AI SDK should be used for a specific operation
   */
  shouldUseAISDK(operation: 'execution' | 'providers' | 'validation'): boolean {
    switch (operation) {
      case 'execution':
        return this.config.useAISDKForExecution;
      case 'providers':
        return this.config.useAISDKForProviders;
      case 'validation':
        return this.config.useAISDK;
      default:
        return false;
    }
  }

  /**
   * Get tool converter instance
   */
  getToolConverter(): ToolConverter {
    return this.toolConverter;
  }

  /**
   * Convert tools to AI SDK format
   */
  convertToolsToAISDK(tools: Tool[]): AI_SDK_Tool[] {
    return tools.map(tool => this.toolConverter.convertToAISDK(tool));
  }

  /**
   * Convert tools to OpenAI format
   */
  convertToolsToOpenAIFormat(tools: Tool[]): any[] {
    return tools.map(tool => this.toolConverter.convertToOpenAIFormat(tool));
  }

  /**
   * Validate tool parameters using AI SDK (Zod)
   */
  validateToolParameters(tool: Tool, args: Record<string, any>): {
    valid: boolean;
    errors: string[];
  } {
    if (this.shouldUseAISDK('validation')) {
      return this.toolConverter.validateParameters(tool, args);
    }

    // Fall back to legacy validation
    return this.validateParametersLegacy(tool, args);
  }

  /**
   * Legacy parameter validation (fallback)
   */
  private validateParametersLegacy(tool: Tool, args: Record<string, any>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    for (const param of tool.parameters) {
      const value = args[param.name];
      const hasValue = value !== undefined && value !== null;

      // Check required parameters
      if (param.required && !hasValue) {
        errors.push(`Required parameter '${param.name}' is missing`);
        continue;
      }

      // Skip validation for optional parameters without value
      if (!param.required && !hasValue) {
        continue;
      }

      // Type validation
      const typeError = this.validateParameterType(value, param);
      if (typeError) {
        errors.push(typeError);
      }

      // Validation rules
      if (param.validation) {
        const validationError = this.validateParameterValue(value, param);
        if (validationError) {
          errors.push(validationError);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate parameter type
   */
  private validateParameterType(value: any, param: ToolParameter): string | null {
    switch (param.type) {
      case 'string':
        if (typeof value !== 'string') {
          return `Parameter '${param.name}' must be a string`;
        }
        break;
      case 'number':
        if (typeof value !== 'number') {
          return `Parameter '${param.name}' must be a number`;
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          return `Parameter '${param.name}' must be a boolean`;
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          return `Parameter '${param.name}' must be an array`;
        }
        break;
      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          return `Parameter '${param.name}' must be an object`;
        }
        break;
      case 'file':
        if (typeof value !== 'string') {
          return `Parameter '${param.name}' must be a file path`;
        }
        break;
      case 'url':
        if (typeof value !== 'string') {
          return `Parameter '${param.name}' must be a URL`;
        }
        break;
      case 'custom':
        // Custom types are allowed
        break;
      default:
        return null;
    }
  }

  /**
   * Validate parameter value against rules
   */
  private validateParameterValue(value: any, param: ToolParameter): string | null {
    const validation = param.validation;
    if (!validation) return null;

    if (validation.pattern && typeof value === 'string') {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        return `Parameter '${param.name}' does not match required pattern`;
      }
    }

    if (validation.min !== undefined && typeof value === 'number') {
      if (value < validation.min) {
        return `Parameter '${param.name}' must be at least ${validation.min}`;
      }
    }

    if (validation.max !== undefined && typeof value === 'number') {
      if (value > validation.max) {
        return `Parameter '${param.name}' must be at most ${validation.max}`;
      }
    }

    if (validation.minLength !== undefined && (typeof value === 'string' || Array.isArray(value))) {
      if (value.length < validation.minLength) {
        return `Parameter '${param.name}' must have at least ${validation.minLength} characters/items`;
      }
    }

    if (validation.maxLength !== undefined && (typeof value === 'string' || Array.isArray(value))) {
      if (value.length > validation.maxLength) {
        return `Parameter '${param.name}' must have at most ${validation.maxLength} characters/items`;
      }
    }

    if (validation.enum && !validation.enum.includes(value)) {
      return `Parameter '${param.name}' must be one of: ${validation.enum.join(', ')}`;
    }

    return null;
  }

  /**
   * Get adapter configuration
   */
  getConfig(): AIAdapterConfig {
    return { ...this.config };
  }

  /**
   * Update adapter configuration
   */
  updateConfig(config: Partial<AIAdapterConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('AI SDK adapter configuration updated', { config: this.config });
  }
}
