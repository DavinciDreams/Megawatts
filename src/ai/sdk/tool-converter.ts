/**
 * Tool Converter
 *
 * This module provides conversion utilities between custom Tool format
 * and AI SDK tool format for hybrid integration.
 */

import { z } from 'zod';
import {
  Tool,
  ToolParameter,
  ParameterType,
  ToolCategory,
  ToolSafety,
  ToolMetadata,
  ToolExample
} from '../../types/ai';
import { Logger } from '../../utils/logger';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Conversion options
 */
export interface ConversionOptions {
  preserveSafetyMetadata?: boolean;
  includeExamples?: boolean;
}

/**
 * Conversion result
 */
export interface ConversionResult {
  tool: Tool;
  aiSdkTool: any;
  openaiFormat: any;
  success: boolean;
  errors: string[];
}

/**
 * Zod schema conversion result
 */
export interface ZodSchemaResult {
  schema: z.ZodType<any, any, any>;
  openaiFormat: any;
  success: boolean;
  errors: string[];
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

/**
 * Map safety level to OpenAI safety level
 */
function mapSafetyLevelToOpenAI(level: 'safe' | 'restricted' | 'dangerous'): string {
  switch (level) {
    case 'safe':
      return 'none';
    case 'restricted':
      return 'medium';
    case 'dangerous':
      return 'high';
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

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Convert custom Tool to AI SDK tool format
   */
  convertToAISDK(tool: Tool, options: ConversionOptions = {}): any {
    const errors: string[] = [];

    try {
      // Build Zod schema from parameters
      const schema = this.buildZodSchema(tool.parameters);

      // Create AI SDK tool object
      const aiSdkTool = {
        description: tool.description,
        parameters: schema,
        // Execute function - this will be handled by ToolExecutor
        // We include a reference to the original tool for metadata
        _tool: tool,
        _category: tool.category,
        _safety: tool.safety,
        _metadata: tool.metadata
      };

      this.logger.debug(`Tool converted to AI SDK format: ${tool.name}`);

      return {
        tool,
        aiSdkTool,
        openaiFormat: this.convertToOpenAIFormat(tool),
        success: true,
        errors: []
      };
    } catch (error) {
      errors.push(`Failed to convert tool: ${(error as Error).message}`);
      this.logger.error(`Tool conversion failed: ${tool.name}`, error as Error);
      return {
        tool,
        aiSdkTool: null,
        openaiFormat: null,
        success: false,
        errors
      };
    }
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
   * Build Zod schema from ToolParameter array
   */
  buildZodSchema(parameters: ToolParameter[]): z.ZodType<any, any, any> {
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

    return z.object(schemaShape);
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

  /**
   * Batch convert multiple tools
   */
  batchConvertTools(tools: Tool[], options: ConversionOptions = {}): ConversionResult[] {
    return tools.map(tool => this.convertToAISDK(tool, options));
  }

  /**
   * Batch convert tools to OpenAI format
   */
  batchConvertToOpenAIFormat(tools: Tool[]): any[] {
    return tools.map(tool => this.convertToOpenAIFormat(tool));
  }

  /**
   * Extract metadata from AI SDK tool result
   */
  extractMetadataFromAISDKTool(aiSdkTool: any): {
    category?: ToolCategory;
    safety?: ToolSafety;
    metadata?: ToolMetadata;
  } {
    return {
      category: aiSdkTool._category,
      safety: aiSdkTool._safety,
      metadata: aiSdkTool._metadata
    };
  }

  /**
   * Merge AI SDK tool result with tool metadata
   */
  mergeMetadata(toolName: string, result: any, metadata: {
    category?: ToolCategory;
    safety?: ToolSafety;
    metadata?: ToolMetadata;
  }): any {
    return {
      ...result,
      _tool: toolName,
      _category: metadata.category,
      _safety: metadata.safety,
      _metadata: metadata.metadata
    };
  }

  /**
   * Get tool converter statistics
   */
  getConversionStats(tools: Tool[]): {
    totalTools: number;
    convertedTools: number;
    failedTools: number;
    errors: string[];
  } {
    const stats = {
      totalTools: tools.length,
      convertedTools: 0,
      failedTools: 0,
      errors: []
    };

    for (const tool of tools) {
      const result = this.convertToAISDK(tool);
      if (result.success) {
        stats.convertedTools++;
      } else {
        stats.failedTools++;
        stats.errors.push(...result.errors);
      }
    }

    return stats;
  }

  /**
   * Validate tool structure
   */
  validateToolStructure(tool: Tool): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate required fields
    if (!tool.name || typeof tool.name !== 'string') {
      errors.push('Tool must have a valid name');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      errors.push('Tool must have a valid description');
    }

    if (!Array.isArray(tool.parameters)) {
      errors.push('Tool must have parameters array');
    }

    if (!tool.category || !Object.values(ToolCategory).includes(tool.category)) {
      errors.push('Tool must have a valid category');
    }

    if (!tool.safety || !tool.safety.level) {
      errors.push('Tool must have safety configuration');
    }

    if (!tool.metadata || !tool.metadata.version) {
      errors.push('Tool must have metadata with version');
    }

    // Validate parameters
    for (const param of tool.parameters) {
      if (!param.name || typeof param.name !== 'string') {
        errors.push(`Parameter '${param.name}' must have a valid name`);
      }

      if (!Object.values(ParameterType).includes(param.type)) {
        errors.push(`Parameter '${param.name}' has invalid type: ${param.type}`);
      }

      if (typeof param.required !== 'boolean') {
        errors.push(`Parameter '${param.name}' must specify if required`);
      }

      if (!param.description || typeof param.description !== 'string') {
        errors.push(`Parameter '${param.name}' must have a description`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get logger instance
   */
  getLogger(): Logger {
    return this.logger;
  }
}
