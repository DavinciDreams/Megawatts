/**
 * Tool Executor
 *
 * This module implements secure tool execution with resource limiting,
 * timeout handling, result validation, and execution history tracking.
 */

import { Tool, ToolCall, ToolError } from '../../types/ai';
import { ToolRegistry, ToolExecutorConfig, ToolExecutionResult } from './tool-registry';
import { ToolSandbox } from './tool-sandbox';
import { Logger, LogLevel } from '../../utils/logger';
import { BotError, AIError } from '../../utils/errors';
import { AISDKAdapter, AIAdapterConfig } from '../sdk/ai-sdk-adapter';

export { ToolExecutionResult };

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ExecutionContext {
  userId: string;
  guildId?: string;
  channelId?: string;
  permissions: string[];
  requestId: string;
  timestamp: Date;
}

export interface ExecutionLimits {
  maxExecutionTime: number;
  maxMemoryMB: number;
  maxCpuUsage: number;
  maxNetworkRequests: number;
  maxFileSizeMB: number;
}

export interface ExecutionMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  memoryUsageMB: number;
  cpuUsage: number;
  networkRequests: number;
  success: boolean;
  error?: Error;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ExecutionHistoryEntry {
  id: string;
  toolName: string;
  userId: string;
  context: ExecutionContext;
  parameters: Record<string, any>;
  result: any;
  error?: ToolError;
  metrics: ExecutionMetrics;
  timestamp: Date;
  cached: boolean;
}

export interface ResourceMonitor {
  startMonitoring(): void;
  stopMonitoring(): ExecutionMetrics;
  getCurrentUsage(): ResourceUsage;
  checkLimits(limits: ExecutionLimits): boolean;
  enforceLimits(limits: ExecutionLimits): void;
}

export interface ResourceUsage {
  memoryUsageMB: number;
  cpuUsage: number;
  networkRequests: number;
  executionTime: number;
}

// ============================================================================
// TOOL EXECUTOR CLASS
// ============================================================================

export class ToolExecutor {
  private registry: ToolRegistry;
  private sandbox: ToolSandbox;
  private logger: Logger;
  private config: ToolExecutorConfig;
  private executionHistory: ExecutionHistoryEntry[] = [];
  private activeExecutions: Map<string, Promise<any>> = new Map();
  private resourceMonitor: ResourceMonitor;
  private executionQueue: Map<string, Promise<any>[]> = new Map();
  private retryCount: Map<string, number> = new Map();
  
  // AI SDK integration
  private aiSDKAdapter: AISDKAdapter;
  
  // Discord tool executor for Discord-specific tools
  private discordToolExecutor: any = null;

  constructor(
    registry: ToolRegistry,
    sandbox: ToolSandbox,
    config: ToolExecutorConfig,
    logger: Logger,
    discordToolExecutor?: any
  ) {
    this.registry = registry;
    this.sandbox = sandbox;
    this.config = config;
    this.logger = logger;
    this.resourceMonitor = new DefaultResourceMonitor(logger);
    this.discordToolExecutor = discordToolExecutor || null;
    
    // Get AI SDK adapter from registry
    this.aiSDKAdapter = registry.getAISDKAdapter();
  }

  /**
   * Set Discord tool executor
   */
  setDiscordToolExecutor(executor: any): void {
    this.discordToolExecutor = executor;
    this.logger.info('Discord tool executor set', { hasExecutor: !!executor });
  }

  /**
   * Execute a tool call
   */
  async executeTool(
    toolCall: ToolCall,
    context: ExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();

    this.logger.info('Executing tool', {
      tool: toolCall.name,
      executionId,
      userId: context.userId,
      guildId: context.guildId
    });

    try {
      // Check if tool exists
      const tool = this.registry.getTool(toolCall.name);
      if (!tool) {
        throw new AIError(
          `Tool '${toolCall.name}' not found in registry`,
          'TOOL_NOT_FOUND'
        );
      }

      // Check permissions
      const hasPermission = this.registry.hasPermission(toolCall.name, context.permissions);
      this.logger.debug('[DEBUG-TOOLS] Permission check result', {
        toolName: toolCall.name,
        requiredPermissions: tool.permissions,
        userPermissions: context.permissions,
        hasPermission
      });

      if (!hasPermission) {
        throw new BotError(
          `Insufficient permissions for tool '${toolCall.name}'`,
          'medium',
          { tool: toolCall.name, required: tool.permissions, provided: context.permissions }
        );
      }

      // Check rate limits
      await this.registry.checkRateLimit(toolCall.name);

      // Validate parameters using AI SDK if enabled, otherwise use legacy validation
      let validation: ValidationResult;
      if (this.registry.shouldUseAISDKForExecution()) {
        this.logger.debug('[DEBUG-TOOLS] Using AI SDK for parameter validation', {
          toolName: toolCall.name
        });
        const aiSDKValidation = this.registry.validateToolParametersWithAISDK(
          toolCall.name,
          toolCall.arguments
        );
        validation = {
          valid: aiSDKValidation.valid,
          errors: aiSDKValidation.errors,
          warnings: []
        };
      } else {
        this.logger.debug('[DEBUG-TOOLS] Using legacy parameter validation', {
          toolName: toolCall.name
        });
        validation = this.validateParameters(toolCall.arguments, tool.parameters);
      }

      this.logger.debug('[DEBUG-TOOLS] Parameter validation result', {
        toolName: toolCall.name,
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings
      });

      if (!validation.valid) {
        throw new AIError(
          `Parameter validation failed: ${validation.errors.join(', ')}`,
          'VALIDATION_ERROR'
        );
      }

      // Check if execution is already in progress
      if (this.activeExecutions.has(toolCall.id)) {
        this.logger.warn('Tool execution already in progress', {
          tool: toolCall.name,
          toolCallId: toolCall.id
        });
        return {
          success: false,
          error: {
            code: 'EXECUTION_IN_PROGRESS',
            message: 'Tool execution is already in progress',
            retryable: false
          },
          executionTime: 0,
          toolName: toolCall.name,
          cached: false
        };
      }

      // Update status to executing
      toolCall.status = 'executing';

      // Start resource monitoring
      this.resourceMonitor.startMonitoring();

      // Execute tool with retry logic
      const result = await this.executeWithRetry(toolCall, context, tool);

      // Stop resource monitoring
      const metrics = this.resourceMonitor.stopMonitoring();

      // Validate result
      const validationResult = this.validateResult(result, tool);

      if (!validationResult.valid) {
        this.logger.warn('Tool result validation failed', {
          tool: toolCall.name,
          errors: validationResult.errors
        });
      }

      // Record execution in history
      const historyEntry: ExecutionHistoryEntry = {
        id: executionId,
        toolName: toolCall.name,
        userId: context.userId,
        context,
        parameters: toolCall.arguments,
        result,
        metrics,
        timestamp: new Date(),
        cached: false
      };

      this.addToHistory(historyEntry);

      // Update tool call with result
      toolCall.result = result;
      toolCall.status = 'completed';
      toolCall.executionTime = Date.now() - startTime;

      // Update registry execution stats
      this.registry.updateExecutionStats(
        toolCall.name,
        true,
        toolCall.executionTime
      );

      this.logger.info('Tool execution completed', {
        tool: toolCall.name,
        executionId,
        executionTime: toolCall.executionTime,
        success: true
      });

      return {
        success: true,
        result,
        executionTime: toolCall.executionTime,
        toolName: toolCall.name,
        cached: false
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Update tool call with error
      toolCall.error = {
        code: (error as any).code || 'EXECUTION_ERROR',
        message: (error as Error).message,
        retryable: this.isRetryableError(error as Error)
      };
      toolCall.status = 'failed';
      toolCall.executionTime = executionTime;

      // Update registry execution stats
      this.registry.updateExecutionStats(toolCall.name, false, executionTime);

      // Record failed execution in history
      const historyEntry: ExecutionHistoryEntry = {
        id: executionId,
        toolName: toolCall.name,
        userId: context.userId,
        context,
        parameters: toolCall.arguments,
        result: undefined,
        metrics: {
          startTime,
          endTime: Date.now(),
          duration: executionTime,
          memoryUsageMB: 0,
          cpuUsage: 0,
          networkRequests: 0,
          success: false,
          error: error as Error
        },
        timestamp: new Date(),
        cached: false,
        error: toolCall.error
      };

      this.addToHistory(historyEntry);

      this.logger.error('Tool execution failed', error as Error, {
        tool: toolCall.name,
        executionId,
        executionTime
      });

      return {
        success: false,
        error: toolCall.error,
        executionTime,
        toolName: toolCall.name,
        cached: false
      };
    } finally {
      // Remove from active executions
      this.activeExecutions.delete(toolCall.id);
    }
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeTools(
    toolCalls: ToolCall[],
    context: ExecutionContext
  ): Promise<ToolExecutionResult[]> {
    const concurrencyLimit = this.config.maxConcurrentExecutions || 5;
    const results: ToolExecutionResult[] = [];

    this.logger.info('Executing multiple tools', {
      count: toolCalls.length,
      concurrencyLimit
    });

    // Execute tools in batches
    for (let i = 0; i < toolCalls.length; i += concurrencyLimit) {
      const batch = toolCalls.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(
        batch.map(call => this.executeTool(call, context))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Execute tool with retry logic
   */
  private async executeWithRetry(
    toolCall: ToolCall,
    context: ExecutionContext,
    tool: Tool
  ): Promise<any> {
    let lastError: Error | null = null;
    const maxRetries = this.config.retryAttempts || 3;
    const retryDelay = this.config.retryDelay || 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check if this is a retry
        if (attempt > 0) {
          this.logger.info(`Retrying tool execution`, {
            tool: tool.name,
            attempt,
            maxRetries
          });
          await this.sleep(retryDelay * attempt);
        }

        // Execute tool in sandbox if enabled
        if (this.config.sandboxMode) {
          return await this.sandbox.executeTool(toolCall, context);
        } else {
          return await this.executeToolDirect(toolCall, context, tool);
        }
      } catch (error) {
        lastError = error as Error;

        this.logger.warn(`Tool execution attempt ${attempt + 1} failed`, {
          tool: tool.name,
          error: (error as Error).message
        });

        // Check if error is retryable
        if (!this.isRetryableError(error as Error)) {
          throw error;
        }
      }
    }

    throw lastError || new Error('Max retry attempts reached');
  }

  /**
   * Execute tool directly without sandbox
   */
  private async executeToolDirect(
    toolCall: ToolCall,
    context: ExecutionContext,
    tool: Tool
  ): Promise<any> {
    // Track active execution
    this.activeExecutions.set(toolCall.id, Promise.resolve());

    // Log tool execution start
    this.logger.info('Starting direct tool execution', {
      toolName: tool.name,
      toolCategory: tool.category,
      toolCallId: toolCall.id,
      userId: context.userId,
      guildId: context.guildId,
      channelId: context.channelId,
      arguments: toolCall.arguments
    });

    try {
      // Route to appropriate executor based on tool category
      if (tool.category === 'discord') {
        if (!this.discordToolExecutor) {
          throw new BotError(
            'Discord tool executor not initialized. Please set the Discord tool executor.',
            'high',
            { toolName: tool.name }
          );
        }

        this.logger.debug('Routing to Discord tool executor', {
          toolName: tool.name
        });

        // Execute using Discord tool executor
        const result = await this.discordToolExecutor.execute(
          tool.name,
          toolCall.arguments
        );

        // Log successful execution
        this.logger.info('Tool execution completed successfully', {
          toolName: tool.name,
          toolCallId: toolCall.id,
          success: true
        });

        return result;
      }

      // Handle other tool categories
      // For now, throw an error for unsupported categories
      throw new BotError(
        `Tool category '${tool.category}' is not supported for direct execution`,
        'medium',
        { toolName: tool.name, category: tool.category }
      );
    } catch (error) {
      // Log execution error
      this.logger.error('Tool execution failed', error as Error, {
        toolName: tool.name,
        toolCallId: toolCall.id,
        arguments: toolCall.arguments
      });
      throw error;
    }
  }

  /**
   * Validate tool parameters
   */
  private validateParameters(
    args: Record<string, any>,
    parameters: any[]
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const param of parameters) {
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
      errors,
      warnings
    };
  }

  /**
   * Validate parameter type
   */
  private validateParameterType(value: any, param: any): string | null {
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
    }
    return null;
  }

  /**
   * Validate parameter value against rules
   */
  private validateParameterValue(value: any, param: any): string | null {
    const validation = param.validation;

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
   * Validate tool result
   */
  private validateResult(result: any, tool: Tool): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if result is defined
    if (result === undefined || result === null) {
      errors.push('Tool returned undefined or null result');
      return { valid: false, errors, warnings };
    }

    // Check if result is an object
    if (typeof result !== 'object' || Array.isArray(result)) {
      errors.push('Tool result must be an object');
      return { valid: false, errors, warnings };
    }

    // Check for error in result
    if (result.error) {
      errors.push(`Tool returned error: ${result.error}`);
    }

    // Check for success flag
    if (result.success === false && !result.error) {
      warnings.push('Tool returned success=false but no error message');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      'timeout',
      'network',
      'rate limit',
      'temporary',
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EAI_AGAIN'
    ];

    const errorMessage = error.message.toLowerCase();
    return retryablePatterns.some(pattern =>
      errorMessage.includes(pattern) ||
      (error as any).code?.toLowerCase().includes(pattern)
    );
  }

  /**
   * Add entry to execution history
   */
  private addToHistory(entry: ExecutionHistoryEntry): void {
    this.executionHistory.push(entry);

    // Keep only last 10000 executions
    if (this.executionHistory.length > 10000) {
      this.executionHistory.shift();
    }
  }

  /**
   * Get execution history
   */
  getExecutionHistory(
    toolName?: string,
    userId?: string,
    limit?: number
  ): ExecutionHistoryEntry[] {
    let history = this.executionHistory;

    // Filter by tool name
    if (toolName) {
      history = history.filter(entry => entry.toolName === toolName);
    }

    // Filter by user ID
    if (userId) {
      history = history.filter(entry => entry.userId === userId);
    }

    // Apply limit
    if (limit) {
      history = history.slice(-limit);
    }

    return history;
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory(): void {
    this.executionHistory = [];
    this.logger.info('Execution history cleared');
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): string[] {
    return Array.from(this.activeExecutions.keys());
  }

  /**
   * Cancel an active execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return false;
    }

    // Note: This is a simplified implementation
    // In a real implementation, we would need to track
    // the actual promise and cancel it
    this.activeExecutions.delete(executionId);

    this.logger.info('Execution cancelled', { executionId });
    return true;
  }

  /**
   * Get execution statistics
   */
  getExecutionStatistics(): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
    successRate: number;
    toolUsage: Record<string, number>;
  } {
    const total = this.executionHistory.length;
    const successful = this.executionHistory.filter(e => e.metrics.success).length;
    const failed = this.executionHistory.filter(e => !e.metrics.success).length;
    const totalTime = this.executionHistory.reduce((sum, e) => sum + e.metrics.duration, 0);
    const avgTime = total > 0 ? totalTime / total : 0;

    // Tool usage statistics
    const toolUsage: Record<string, number> = {};
    for (const entry of this.executionHistory) {
      toolUsage[entry.toolName] = (toolUsage[entry.toolName] || 0) + 1;
    }

    return {
      totalExecutions: total,
      successfulExecutions: successful,
      failedExecutions: failed,
      averageExecutionTime: avgTime,
      successRate: total > 0 ? successful / total : 0,
      toolUsage
    };
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// DEFAULT RESOURCE MONITOR IMPLEMENTATION
// ============================================================================

class DefaultResourceMonitor implements ResourceMonitor {
  private logger: Logger;
  private startTime: number = 0;
  private startMemory: number = 0;
  private networkRequests: number = 0;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  startMonitoring(): void {
    this.startTime = Date.now();
    this.startMemory = this.getMemoryUsage();
    this.networkRequests = 0;
    this.logger.debug('Resource monitoring started');
  }

  stopMonitoring(): ExecutionMetrics {
    const endTime = Date.now();
    const duration = endTime - this.startTime;
    const endMemory = this.getMemoryUsage();
    const memoryUsed = endMemory - this.startMemory;

    this.logger.debug('Resource monitoring stopped', {
      duration,
      memoryUsed
    });

    return {
      startTime: this.startTime,
      endTime,
      duration,
      memoryUsageMB: memoryUsed / (1024 * 1024),
      cpuUsage: 0, // Simplified - would need actual CPU monitoring
      networkRequests: this.networkRequests,
      success: true
    };
  }

  getCurrentUsage(): ResourceUsage {
    return {
      memoryUsageMB: this.getMemoryUsage() / (1024 * 1024),
      cpuUsage: 0,
      networkRequests: this.networkRequests,
      executionTime: Date.now() - this.startTime
    };
  }

  checkLimits(limits: ExecutionLimits): boolean {
    const usage = this.getCurrentUsage();

    if (usage.executionTime > limits.maxExecutionTime) {
      this.logger.warn('Execution time limit exceeded', {
        usage: usage.executionTime,
        limit: limits.maxExecutionTime
      });
      return false;
    }

    if (usage.memoryUsageMB > limits.maxMemoryMB) {
      this.logger.warn('Memory limit exceeded', {
        usage: usage.memoryUsageMB,
        limit: limits.maxMemoryMB
      });
      return false;
    }

    if (usage.networkRequests > limits.maxNetworkRequests) {
      this.logger.warn('Network request limit exceeded', {
        usage: usage.networkRequests,
        limit: limits.maxNetworkRequests
      });
      return false;
    }

    return true;
  }

  enforceLimits(limits: ExecutionLimits): void {
    // In a real implementation, this would enforce limits
    // For now, just log warnings
    this.checkLimits(limits);
  }

  private getMemoryUsage(): number {
    // Simplified memory usage check
    // In a real implementation, use process.memoryUsage()
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }
}
