/**
 * Tool Registry
 * 
 * This module implements the tool discovery and registration system
 * for the AI tool calling framework.
 */

import { 
  Tool, 
  ToolCategory, 
  ToolSafety, 
  ToolParameter, 
  ParameterType,
  ToolCall,
  ToolError
} from '../../../types/ai';
import { Logger } from '../../../utils/logger';

// ============================================================================
// TOOL REGISTRY CLASS
// ============================================================================

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private categories: Map<ToolCategory, Set<string>> = new Map();
  private permissions: Map<string, string[]> = new Map();
  private logger: Logger;
  private config: ToolRegistryConfig;

  constructor(config: ToolRegistryConfig, logger: Logger) {
    this.logger = logger;
    this.config = config;
    this.initializeCategories();
  }

  /**
   * Register a new tool
   */
  registerTool(tool: Tool): void {
    try {
      // Validate tool structure
      this.validateTool(tool);

      // Check if tool already exists
      if (this.tools.has(tool.name)) {
        throw new Error(`Tool '${tool.name}' is already registered`);
      }

      // Register the tool
      this.tools.set(tool.name, tool);

      // Add to category
      if (!this.categories.has(tool.category)) {
        this.categories.set(tool.category, new Set());
      }
      this.categories.get(tool.category)!.add(tool.name);

      // Store permissions
      this.permissions.set(tool.name, tool.permissions);

      this.logger.info('Tool registered successfully', {
        tool: tool.name,
        category: tool.category,
        safety: tool.safety.level
      });

    } catch (error) {
      this.logger.error('Failed to register tool', error as Error);
      throw error;
    }
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName: string): boolean {
    try {
      const tool = this.tools.get(toolName);
      if (!tool) {
        return false;
      }

      // Remove from registry
      this.tools.delete(toolName);

      // Remove from category
      const categoryTools = this.categories.get(tool.category);
      if (categoryTools) {
        categoryTools.delete(toolName);
        if (categoryTools.size === 0) {
          this.categories.delete(tool.category);
        }
      }

      // Remove permissions
      this.permissions.delete(toolName);

      this.logger.info('Tool unregistered successfully', {
        tool: toolName
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to unregister tool', error as Error);
      return false;
    }
  }

  /**
   * Get a tool by name
   */
  getTool(toolName: string): Tool | undefined {
    return this.tools.get(toolName);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: ToolCategory): Tool[] {
    const toolNames = this.categories.get(category);
    if (!toolNames) {
      return [];
    }

    return Array.from(toolNames)
      .map(name => this.tools.get(name))
      .filter(tool => tool !== undefined) as Tool[];
  }

  /**
   * Get tools by permission level
   */
  getToolsByPermission(permission: string): Tool[] {
    return Array.from(this.tools.values()).filter(tool =>
      tool.permissions.includes(permission)
    );
  }

  /**
   * Get safe tools (no dangerous permissions required)
   */
  getSafeTools(): Tool[] {
    return Array.from(this.tools.values()).filter(tool =>
      tool.safety.level === 'safe'
    );
  }

  /**
   * Search tools by name or description
   */
  searchTools(query: string): Tool[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.tools.values()).filter(tool =>
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.description.toLowerCase().includes(lowerQuery) ||
      tool.metadata.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Check if a tool exists
   */
  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * Get tool permissions
   */
  getToolPermissions(toolName: string): string[] | undefined {
    return this.permissions.get(toolName);
  }

  /**
   * Check if user has permission for tool
   */
  hasPermission(toolName: string, userPermissions: string[]): boolean {
    const toolPerms = this.permissions.get(toolName);
    if (!toolPerms) {
      return false;
    }

    // Check if user has any of the required permissions
    return toolPerms.some(perm => userPermissions.includes(perm));
  }

  /**
   * Get tool statistics
   */
  getStatistics(): ToolRegistryStats {
    const stats: ToolRegistryStats = {
      totalTools: this.tools.size,
      categories: {},
      safetyLevels: {
        safe: 0,
        restricted: 0,
        dangerous: 0
      },
      mostUsedTools: [],
      recentlyRegistered: []
    };

    // Count by category
    for (const [category, toolNames] of this.categories) {
      stats.categories[category] = toolNames.size;
    }

    // Count by safety level
    for (const tool of this.tools.values()) {
      stats.safetyLevels[tool.safety.level]++;
    }

    return stats;
  }

  /**
   * Validate tool structure
   */
  private validateTool(tool: Tool): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool must have a valid name');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error('Tool must have a valid description');
    }

    if (!Array.isArray(tool.parameters)) {
      throw new Error('Tool must have parameters array');
    }

    if (!tool.category || !Object.values(ToolCategory).includes(tool.category)) {
      throw new Error('Tool must have a valid category');
    }

    if (!tool.safety || !tool.safety.level) {
      throw new Error('Tool must have safety configuration');
    }

    // Validate parameters
    for (const param of tool.parameters) {
      this.validateParameter(param);
    }
  }

  /**
   * Validate tool parameter
   */
  private validateParameter(param: ToolParameter): void {
    if (!param.name || typeof param.name !== 'string') {
      throw new Error('Parameter must have a valid name');
    }

    if (!Object.values(ParameterType).includes(param.type)) {
      throw new Error(`Invalid parameter type: ${param.type}`);
    }

    if (typeof param.required !== 'boolean') {
      throw new Error('Parameter must specify if it is required');
    }

    if (!param.description || typeof param.description !== 'string') {
      throw new Error('Parameter must have a valid description');
    }

    // Validate validation rules
    if (param.validation) {
      this.validateParameterValidation(param.validation, param.type);
    }
  }

  /**
   * Validate parameter validation rules
   */
  private validateParameterValidation(validation: any, type: ParameterType): void {
    if (type === 'string' && validation.pattern && typeof validation.pattern !== 'string') {
      throw new Error('String parameter validation must have a valid pattern');
    }

    if (type === 'number') {
      if (validation.min !== undefined && typeof validation.min !== 'number') {
        throw new Error('Number parameter validation min must be a number');
      }
      if (validation.max !== undefined && typeof validation.max !== 'number') {
        throw new Error('Number parameter validation max must be a number');
      }
    }

    if (type === 'string' || type === 'array') {
      if (validation.minLength !== undefined && typeof validation.minLength !== 'number') {
        throw new Error('Parameter validation minLength must be a number');
      }
      if (validation.maxLength !== undefined && typeof validation.maxLength !== 'number') {
        throw new Error('Parameter validation maxLength must be a number');
      }
    }
  }

  /**
   * Initialize tool categories
   */
  private initializeCategories(): void {
    for (const category of Object.values(ToolCategory)) {
      this.categories.set(category, new Set());
    }
  }
}

// ============================================================================
// TOOL EXECUTOR CLASS
// ============================================================================

export class ToolExecutor {
  private registry: ToolRegistry;
  private logger: Logger;
  private config: ToolExecutorConfig;
  private executionStats: Map<string, ToolExecutionStats> = new Map();

  constructor(
    registry: ToolRegistry, 
    config: ToolExecutorConfig, 
    logger: Logger
  ) {
    this.registry = registry;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Execute a tool call
   */
  async executeTool(toolCall: ToolCall, userPermissions: string[]): Promise<ToolCall> {
    const startTime = Date.now();
    
    try {
      // Get tool
      const tool = this.registry.getTool(toolCall.name);
      if (!tool) {
        throw new Error(`Tool '${toolCall.name}' not found`);
      }

      // Check permissions
      if (!this.registry.hasPermission(toolCall.name, userPermissions)) {
        throw new Error(`Insufficient permissions for tool '${toolCall.name}'`);
      }

      // Validate parameters
      this.validateParameters(toolCall.arguments, tool.parameters);

      // Check rate limits
      await this.checkRateLimit(toolCall.name, userPermissions);

      // Update status to executing
      toolCall.status = 'executing';

      this.logger.info('Executing tool', {
        tool: toolCall.name,
        arguments: toolCall.arguments
      });

      // Execute tool (this would be implemented by actual tool handlers)
      const result = await this.executeToolHandler(tool, toolCall.arguments);

      // Update tool call with result
      toolCall.result = result;
      toolCall.status = 'completed';
      toolCall.executionTime = Date.now() - startTime;

      // Update statistics
      this.updateExecutionStats(toolCall.name, true, toolCall.executionTime);

      this.logger.info('Tool execution completed', {
        tool: toolCall.name,
        executionTime: toolCall.executionTime
      });

      return toolCall;

    } catch (error) {
      // Update tool call with error
      toolCall.error = {
        code: 'EXECUTION_ERROR',
        message: (error as Error).message,
        retryable: this.isRetryableError(error as Error)
      };
      toolCall.status = 'failed';
      toolCall.executionTime = Date.now() - startTime;

      // Update statistics
      this.updateExecutionStats(toolCall.name, false, toolCall.executionTime);

      this.logger.error('Tool execution failed', error as Error, {
        tool: toolCall.name,
        arguments: toolCall.arguments
      });

      return toolCall;
    }
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeTools(
    toolCalls: ToolCall[], 
    userPermissions: string[]
  ): Promise<ToolCall[]> {
    // Execute tools in parallel with concurrency limit
    const concurrencyLimit = this.config.maxConcurrentExecutions || 5;
    const results: ToolCall[] = [];

    for (let i = 0; i < toolCalls.length; i += concurrencyLimit) {
      const batch = toolCalls.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(
        batch.map(call => this.executeTool(call, userPermissions))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(): Map<string, ToolExecutionStats> {
    return new Map(this.executionStats);
  }

  /**
   * Reset execution statistics
   */
  resetExecutionStats(): void {
    this.executionStats.clear();
  }

  /**
   * Validate tool call parameters
   */
  private validateParameters(
    arguments: Record<string, any>, 
    parameters: ToolParameter[]
  ): void {
    for (const param of parameters) {
      const value = arguments[param.name];
      const hasValue = value !== undefined && value !== null;

      // Check required parameters
      if (param.required && !hasValue) {
        throw new Error(`Required parameter '${param.name}' is missing`);
      }

      // Skip validation for optional parameters without value
      if (!param.required && !hasValue) {
        continue;
      }

      // Type validation
      this.validateParameterType(value, param);

      // Validation rules
      if (param.validation) {
        this.validateParameterValue(value, param);
      }
    }
  }

  /**
   * Validate parameter type
   */
  private validateParameterType(value: any, param: ToolParameter): void {
    switch (param.type) {
      case 'string':
        if (typeof value !== 'string') {
          throw new Error(`Parameter '${param.name}' must be a string`);
        }
        break;
      case 'number':
        if (typeof value !== 'number') {
          throw new Error(`Parameter '${param.name}' must be a number`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new Error(`Parameter '${param.name}' must be a boolean`);
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          throw new Error(`Parameter '${param.name}' must be an array`);
        }
        break;
      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          throw new Error(`Parameter '${param.name}' must be an object`);
        }
        break;
    }
  }

  /**
   * Validate parameter value against rules
   */
  private validateParameterValue(value: any, param: ToolParameter): void {
    const validation = param.validation!;
    
    if (validation.pattern && typeof value === 'string') {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        throw new Error(`Parameter '${param.name}' does not match required pattern`);
      }
    }

    if (validation.min !== undefined && typeof value === 'number') {
      if (value < validation.min) {
        throw new Error(`Parameter '${param.name}' must be at least ${validation.min}`);
      }
    }

    if (validation.max !== undefined && typeof value === 'number') {
      if (value > validation.max) {
        throw new Error(`Parameter '${param.name}' must be at most ${validation.max}`);
      }
    }

    if (validation.minLength !== undefined && (typeof value === 'string' || Array.isArray(value))) {
      if (value.length < validation.minLength) {
        throw new Error(`Parameter '${param.name}' must have at least ${validation.minLength} characters/items`);
      }
    }

    if (validation.maxLength !== undefined && (typeof value === 'string' || Array.isArray(value))) {
      if (value.length > validation.maxLength) {
        throw new Error(`Parameter '${param.name}' must have at most ${validation.maxLength} characters/items`);
      }
    }

    if (validation.enum && !validation.enum.includes(value)) {
      throw new Error(`Parameter '${param.name}' must be one of: ${validation.enum.join(', ')}`);
    }
  }

  /**
   * Check rate limits
   */
  private async checkRateLimit(toolName: string, userPermissions: string[]): Promise<void> {
    const tool = this.registry.getTool(toolName);
    if (!tool?.safety.rateLimit) {
      return;
    }

    const rateLimit = tool.safety.rateLimit;
    const stats = this.executionStats.get(toolName);
    
    if (stats) {
      const now = Date.now();
      const windowStart = now - 60000; // 1 minute window
      
      const recentCalls = stats.recentCalls.filter(time => time > windowStart);
      
      if (recentCalls.length >= rateLimit.requestsPerMinute) {
        throw new Error(`Rate limit exceeded for tool '${toolName}'`);
      }
    }
  }

  /**
   * Execute tool handler (placeholder for actual implementation)
   */
  private async executeToolHandler(
    tool: Tool, 
    arguments: Record<string, any>
  ): Promise<any> {
    // This would be implemented by actual tool handlers
    // For now, return a placeholder result
    return {
      tool: tool.name,
      arguments,
      executed: true,
      timestamp: new Date()
    };
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const retryableCodes = [
      'TIMEOUT',
      'NETWORK_ERROR',
      'RATE_LIMIT',
      'TEMPORARY_FAILURE'
    ];
    
    return retryableCodes.some(code => 
      error.message.includes(code) || 
      (error as any).code === code
    );
  }

  /**
   * Update execution statistics
   */
  private updateExecutionStats(
    toolName: string, 
    success: boolean, 
    executionTime?: number
  ): void {
    const now = Date.now();
    let stats = this.executionStats.get(toolName);
    
    if (!stats) {
      stats = {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        averageExecutionTime: 0,
        recentCalls: []
      };
      this.executionStats.set(toolName, stats);
    }
    
    stats.totalCalls++;
    stats.recentCalls.push(now);
    
    if (success) {
      stats.successfulCalls++;
    } else {
      stats.failedCalls++;
    }
    
    if (executionTime) {
      stats.averageExecutionTime = 
        (stats.averageExecutionTime * (stats.totalCalls - 1) + executionTime) / stats.totalCalls;
    }
    
    // Keep only recent calls (last hour)
    const oneHourAgo = now - 3600000;
    stats.recentCalls = stats.recentCalls.filter(time => time > oneHourAgo);
  }
}

// ============================================================================
// SUPPORTING INTERFACES
// ============================================================================

export interface ToolRegistryConfig {
  autoRegisterBuiltinTools: boolean;
  enablePermissions: boolean;
  enableCategories: boolean;
  maxTools: number;
}

export interface ToolExecutorConfig {
  maxConcurrentExecutions: number;
  defaultTimeout: number;
  enableRateLimiting: boolean;
  enableMonitoring: boolean;
  sandboxMode: boolean;
}

export interface ToolRegistryStats {
  totalTools: number;
  categories: Record<ToolCategory, number>;
  safetyLevels: {
    safe: number;
    restricted: number;
    dangerous: number;
  };
  mostUsedTools: string[];
  recentlyRegistered: string[];
}

export interface ToolExecutionStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageExecutionTime: number;
  recentCalls: number[];
}