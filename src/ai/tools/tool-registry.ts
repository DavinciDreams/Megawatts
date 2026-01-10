/**
 * Tool Registry
 *
 * This module implements a comprehensive tool discovery, registration, and execution system
 * for the AI tool calling framework with caching, dependency management, and monitoring.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import glob from 'glob';
import {
  Tool,
  ToolCategory,
  ToolSafety,
  ToolParameter,
  ParameterType,
  ToolCall,
  ToolError,
  ToolMetadata,
  ToolExample
} from '../../types/ai';
import { AISDKAdapter, AIAdapterConfig } from '../sdk/ai-sdk-adapter';
import { ToolConverter, ConversionOptions } from '../sdk/tool-converter';
import { Logger, LogLevel } from '../../utils/logger';
import { BotError } from '../../utils/errors';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ToolRegistryConfig {
  autoRegisterBuiltinTools: boolean;
  enablePermissions: boolean;
  enableCategories: boolean;
  maxTools: number;
  toolDiscoveryPaths: string[];
  enableCaching: boolean;
  cacheTTL: number;
  enableMonitoring: boolean;
  enableDependencyManagement: boolean;
  enableRateLimiting: boolean;
}

export interface ToolExecutorConfig {
  maxConcurrentExecutions: number;
  defaultTimeout: number;
  enableRateLimiting: boolean;
  enableMonitoring: boolean;
  sandboxMode: boolean;
  retryAttempts: number;
  retryDelay: number;
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
  executionStats: Record<string, ToolExecutionStats>;
}

export interface ToolExecutionStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageExecutionTime: number;
  recentCalls: number[];
  lastExecution?: Date;
  successRate: number;
}

export interface ToolCacheEntry {
  tool: Tool;
  cachedAt: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessed: Date;
}

export interface ToolDependencyGraph {
  nodes: Map<string, Tool>;
  edges: Map<string, string[]>; // toolName -> [dependentToolNames]
  reverseEdges: Map<string, string[]>; // toolName -> [dependencyToolNames]
}

export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: ToolError;
  executionTime: number;
  cached: boolean;
  toolName: string;
}

export interface ToolDiscoveryResult {
  discovered: number;
  registered: number;
  failed: number;
  errors: Array<{ tool: string; error: string }>;
}

// ============================================================================
// TOOL REGISTRY CLASS
// ============================================================================

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private categories: Map<ToolCategory, Set<string>> = new Map();
  private permissions: Map<string, string[]> = new Map();
  private logger: Logger;
  private config: ToolRegistryConfig;
  private cache: Map<string, ToolCacheEntry> = new Map();
  private executionStats: Map<string, ToolExecutionStats> = new Map();
  private dependencyGraph: ToolDependencyGraph;
  private executionHistory: ToolExecutionResult[] = [];
  private performanceMetrics: Map<string, PerformanceMetrics> = new Map();
  private rateLimiters: Map<string, RateLimiter> = new Map();
  
  // AI SDK integration
  private aiSDKAdapter: AISDKAdapter;
  private toolConverter: ToolConverter;
  private aiSDKConfig: AIAdapterConfig;

  constructor(config: ToolRegistryConfig, logger: Logger, aiSDKConfig?: Partial<AIAdapterConfig>) {
    this.logger = logger;
    this.config = config;
    this.dependencyGraph = {
      nodes: new Map(),
      edges: new Map(),
      reverseEdges: new Map()
    };
    this.initializeCategories();
    
    // Initialize AI SDK components
    this.aiSDKConfig = {
      useAISDK: aiSDKConfig?.useAISDK ?? false,
      useAISDKForExecution: aiSDKConfig?.useAISDKForExecution ?? false,
      useAISDKForProviders: aiSDKConfig?.useAISDKForProviders ?? false,
      enableStreaming: aiSDKConfig?.enableStreaming ?? true,
      enableMultiStep: aiSDKConfig?.enableMultiStep ?? true
    };
    this.aiSDKAdapter = new AISDKAdapter(this.aiSDKConfig, logger);
    this.toolConverter = new ToolConverter(logger);
    
    this.logger.info('ToolRegistry initialized', {
      aiSDKEnabled: this.aiSDKConfig.useAISDK,
      aiSDKExecution: this.aiSDKConfig.useAISDKForExecution,
      aiSDKProviders: this.aiSDKConfig.useAISDKForProviders
    });
  }

  /**
   * Initialize tool categories
   */
  private initializeCategories(): void {
    for (const category of Object.values(ToolCategory)) {
      this.categories.set(category, new Set());
    }
  }

  /**
   * Discover tools from filesystem
   */
  async discoverTools(): Promise<ToolDiscoveryResult> {
    const result: ToolDiscoveryResult = {
      discovered: 0,
      registered: 0,
      failed: 0,
      errors: []
    };

    // Auto-register built-in tools if enabled
    if (this.config.autoRegisterBuiltinTools) {
      this.logger.info('Auto-registering built-in tools', {
        enabled: this.config.autoRegisterBuiltinTools
      });
      await this.autoRegisterBuiltinTools();
    }

    // Determine project root using process.cwd() (works in both dev and production)
    let projectRoot = process.cwd();

    // Validate that we're at the project root by checking for package.json
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const hasPackageJson = await fs.access(packageJsonPath).then(() => true).catch(() => false);

    if (!hasPackageJson) {
      // Fallback: try to find project root by searching upward
      this.logger.warn('package.json not found in current directory, searching for project root');
      let searchDir = projectRoot;
      while (searchDir !== path.dirname(searchDir)) {
        const testPath = path.join(searchDir, 'package.json');
        const exists = await fs.access(testPath).then(() => true).catch(() => false);
        if (exists) {
          projectRoot = searchDir;
          break;
        }
        searchDir = path.dirname(searchDir);
      }
    }

    // Use configured tool discovery paths, falling back to standard paths if not provided
    const potentialPaths = this.config.toolDiscoveryPaths && this.config.toolDiscoveryPaths.length > 0
      ? this.config.toolDiscoveryPaths
      : [
          path.join(projectRoot, 'src/tools'),  // Standard location
          path.join(projectRoot, 'tools'),      // Alternative location
        ];

    this.logger.info('Starting tool discovery', {
      projectRoot,
      discoveryPaths: potentialPaths,
      autoRegisterBuiltinTools: this.config.autoRegisterBuiltinTools,
      cwd: process.cwd()
    });

    for (const discoveryPath of potentialPaths) {
      try {
        const fullPath = path.resolve(discoveryPath);
        const exists = await fs.access(fullPath).then(() => true).catch(() => false);

        if (!exists) {
          this.logger.debug(`Tool discovery path does not exist: ${fullPath}`);
          continue;
        }

        // Find all TypeScript files in the path
        // Convert Windows backslashes to forward slashes for glob compatibility
        const pattern = path.join(fullPath, '**/*.ts').replace(/\\/g, '/');
        const files = await glob(pattern);
        
        // Defensive: Ensure files is iterable
        if (!files || !Array.isArray(files)) {
          this.logger.warn(`glob returned non-iterable result for pattern: ${pattern}`);
          continue;
        }

        this.logger.info(`Found ${files.length} TypeScript files in ${fullPath}`, {
          path: fullPath,
          fileCount: files.length
        });

        for (const file of files) {
          try {
            // Skip test files and type definition files
            if (file.includes('.test.') || file.includes('.spec.') || file.endsWith('.d.ts')) {
              this.logger.debug(`Skipping test/type definition file: ${file}`);
              continue;
            }

            const tool = await this.loadToolFromFile(file);
            if (tool) {
              result.discovered++;
              this.logger.debug(`Discovered tool: ${tool.name} from ${file}`);
              try {
                this.registerTool(tool);
                result.registered++;
                this.logger.info(`Successfully registered tool: ${tool.name}`, {
                  name: tool.name,
                  category: tool.category,
                  safety: tool.safety.level
                });
              } catch (error) {
                result.failed++;
                result.errors.push({
                  tool: tool.name,
                  error: (error as Error).message
                });
                this.logger.error(`Failed to register tool: ${tool.name}`, error as Error);
              }
            }
          } catch (error) {
            this.logger.error(`Failed to load tool from file: ${file}`, error as Error);
          }
        }
      } catch (error) {
        this.logger.error(`Tool discovery failed for path: ${discoveryPath}`, error as Error);
      }
    }

    this.logger.info('Tool discovery completed', {
      discovered: result.discovered,
      registered: result.registered,
      failed: result.failed,
      errors: result.errors
    });

    return result;
  }

  /**
   * Auto-register built-in tools from discord-tools.ts
   */
  private async autoRegisterBuiltinTools(): Promise<void> {
    try {
      // Import the discord tools module
      const discordToolsModule = await import('../../tools/discord-tools');
      
      // Check if the module exports a discordTools array
      if (discordToolsModule.discordTools && Array.isArray(discordToolsModule.discordTools)) {
        const tools = discordToolsModule.discordTools as Tool[];
        
        this.logger.info(`Auto-registering ${tools.length} built-in Discord tools`, {
          toolNames: tools.map(t => t.name)
        });

        for (const tool of tools) {
          try {
            this.registerTool(tool);
            this.logger.info(`Successfully auto-registered built-in tool: ${tool.name}`, {
              name: tool.name,
              category: tool.category,
              safety: tool.safety.level
            });
          } catch (error) {
            this.logger.error(`Failed to auto-register built-in tool: ${tool.name}`, error as Error);
          }
        }
      } else {
        this.logger.warn('discordTools array not found in discord-tools module');
      }
    } catch (error) {
      this.logger.error('Failed to auto-register built-in tools', error as Error);
    }
  }

  /**
   * Load a tool from a file
   */
  private async loadToolFromFile(filePath: string): Promise<Tool | null> {
    try {
      // Clear require cache for dynamic imports
      // delete require.cache[require.resolve(filePath)];  // ES modules don't support require.cache

      // Dynamic import of the module
      const module = await import(filePath);

      // Look for exported tools
      const potentialTools = Object.values(module).filter(
        (item): item is Tool => {
          return (
            item &&
            typeof item === 'object' &&
            'name' in item &&
            'description' in item &&
            'parameters' in item &&
            'category' in item &&
            'safety' in item
          );
        }
      );

      if (potentialTools.length === 0) {
        return null;
      }

      // Return the first valid tool found
      return potentialTools[0];
    } catch (error) {
      this.logger.error(`Failed to load tool from file: ${filePath}`, error as Error);
      return null;
    }
  }

  /**
   * Register a new tool
   */
  registerTool(tool: Tool): void {
    try {
      this.logger.debug('[DEBUG-TOOLS] Starting tool registration', {
        toolName: tool.name,
        category: tool.category,
        safety: tool.safety.level
      });

      // Validate tool structure
      this.validateTool(tool);

      // Check if tool already exists
      if (this.tools.has(tool.name)) {
        this.logger.warn('[DEBUG-TOOLS] Tool already registered', {
          toolName: tool.name,
          existingTool: this.tools.get(tool.name)?.metadata.version
        });
        throw new BotError(
          `Tool '${tool.name}' is already registered`,
          'medium',
          { toolName: tool.name }
        );
      }

      // Check tool limit
      if (this.tools.size >= this.config.maxTools) {
        throw new BotError(
          `Maximum tool limit (${this.config.maxTools}) reached`,
          'high',
          { currentTools: this.tools.size, maxTools: this.config.maxTools }
        );
      }

      // Validate dependencies
      if (this.config.enableDependencyManagement && tool.metadata.dependencies) {
        this.validateDependencies(tool);
      }

      // Register tool
      this.tools.set(tool.name, tool);
      this.logger.debug('[DEBUG-TOOLS] Tool added to registry', {
        toolName: tool.name,
        totalTools: this.tools.size,
        maxTools: this.config.maxTools
      });

      // Add to category
      if (!this.categories.has(tool.category)) {
        this.categories.set(tool.category, new Set());
        this.logger.debug('[DEBUG-TOOLS] Created new category', {
          category: tool.category
        });
      }
      this.categories.get(tool.category)!.add(tool.name);
      this.logger.debug('[DEBUG-TOOLS] Tool added to category', {
        toolName: tool.name,
        category: tool.category,
        toolsInCategory: this.categories.get(tool.category)!.size
      });

      // Store permissions
      this.permissions.set(tool.name, tool.permissions);
      this.logger.debug('[DEBUG-TOOLS] Tool permissions stored', {
        toolName: tool.name,
        permissions: tool.permissions
      });

      // Build dependency graph
      this.addToDependencyGraph(tool);

      // Initialize execution stats
      this.executionStats.set(tool.name, {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        averageExecutionTime: 0,
        recentCalls: [],
        successRate: 1.0
      });

      // Initialize rate limiter if rate limiting is enabled
      if (this.config.enableRateLimiting && tool.safety.rateLimit) {
        this.rateLimiters.set(
          tool.name,
          new RateLimiter(tool.safety.rateLimit.requestsPerMinute, 60000)
        );
      }

      // Initialize performance metrics
      this.performanceMetrics.set(tool.name, {
        p50: 0,
        p95: 0,
        p99: 0,
        min: Infinity,
        max: 0,
        samples: []
      });

      // Cache tool if caching is enabled
      if (this.config.enableCaching) {
        this.cacheTool(tool);
      }

      this.logger.info('Tool registered successfully', {
        tool: tool.name,
        category: tool.category,
        safety: tool.safety.level,
        version: tool.metadata.version
      });
    } catch (error) {
      this.logger.error('Failed to register tool', error as Error, {
        tool: tool.name
      });
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

      // Remove from dependency graph
      this.removeFromDependencyGraph(toolName);

      // Remove from cache
      this.cache.delete(toolName);

      // Remove execution stats
      this.executionStats.delete(toolName);

      // Remove performance metrics
      this.performanceMetrics.delete(toolName);

      // Remove rate limiter
      this.rateLimiters.delete(toolName);

      this.logger.info('Tool unregistered successfully', {
        tool: toolName
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to unregister tool', error as Error, {
        tool: toolName
      });
      return false;
    }
  }

  /**
   * Get a tool by name
   */
  getTool(toolName: string): Tool | undefined {
    // Check cache first
    if (this.config.enableCaching) {
      const cached = this.cache.get(toolName);
      if (cached && !this.isCacheEntryExpired(cached)) {
        cached.accessCount++;
        cached.lastAccessed = new Date();
        this.logger.debug('[DEBUG-TOOLS] Tool retrieved from cache', {
          toolName,
          accessCount: cached.accessCount,
          cachedAt: cached.cachedAt
        });
        return cached.tool;
      }
    }

    const tool = this.tools.get(toolName);
    if (tool) {
      this.logger.debug('[DEBUG-TOOLS] Tool retrieved from registry', {
        toolName,
        category: tool.category,
        safety: tool.safety.level
      });
    } else {
      this.logger.debug('[DEBUG-TOOLS] Tool not found in registry', { toolName });
    }
    return tool;
  }

  /**
   * Get all registered tools
   */
  getAllTools(): Tool[] {
    const tools = Array.from(this.tools.values());
    this.logger.debug('[DEBUG-TOOLS] Retrieved all tools', {
      totalTools: tools.length,
      toolNames: tools.map(t => t.name)
    });
    return tools;
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: ToolCategory): Tool[] {
    const toolNames = this.categories.get(category);
    if (!toolNames) {
      this.logger.debug('[DEBUG-TOOLS] No tools found for category', { category });
      return [];
    }

    const tools = Array.from(toolNames)
      .map(name => this.tools.get(name))
      .filter(tool => tool !== undefined) as Tool[];

    this.logger.debug('[DEBUG-TOOLS] Retrieved tools by category', {
      category,
      count: tools.length,
      toolNames: tools.map(t => t.name)
    });

    return tools;
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
    const tools = Array.from(this.tools.values()).filter(tool =>
      tool.safety.level === 'safe'
    );
    this.logger.debug('[DEBUG-TOOLS] Retrieved safe tools', {
      count: tools.length,
      toolNames: tools.map(t => t.name)
    });
    return tools;
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
    if (!this.config.enablePermissions) {
      this.logger.debug('[DEBUG-TOOLS] Permission check bypassed (permissions disabled)', {
        toolName,
        enablePermissions: this.config.enablePermissions
      });
      return true;
    }

    const toolPerms = this.permissions.get(toolName);
    if (!toolPerms) {
      this.logger.warn('[DEBUG-TOOLS] Tool permissions not found', { toolName });
      return false;
    }

    // Check if user has any of the required permissions
    const hasPermission = toolPerms.some(perm => userPermissions.includes(perm));

    this.logger.debug('[DEBUG-TOOLS] Permission check result', {
      toolName,
      requiredPermissions: toolPerms,
      userPermissions,
      hasPermission,
      enablePermissions: this.config.enablePermissions
    });

    return hasPermission;
  }

  /**
   * Get tool statistics
   */
  getStatistics(): ToolRegistryStats {
    const stats: ToolRegistryStats = {
      totalTools: this.tools.size,
      categories: {} as Record<ToolCategory, number>,
      safetyLevels: {
        safe: 0,
        restricted: 0,
        dangerous: 0
      },
      mostUsedTools: [],
      recentlyRegistered: [],
      executionStats: {}
    };

    // Count by category
    for (const [category, toolNames] of this.categories) {
      stats.categories[category] = toolNames.size;
    }

    // Count by safety level
    for (const tool of this.tools.values()) {
      stats.safetyLevels[tool.safety.level]++;
    }

    // Get most used tools
    const sortedByUsage = Array.from(this.executionStats.entries())
      .sort((a, b) => b[1].totalCalls - a[1].totalCalls)
      .slice(0, 10);

    stats.mostUsedTools = sortedByUsage.map(([name]) => name);
    stats.executionStats = Object.fromEntries(sortedByUsage);

    return stats;
  }

  /**
   * Get execution statistics for a specific tool
   */
  getToolExecutionStats(toolName: string): ToolExecutionStats | undefined {
    return this.executionStats.get(toolName);
  }

  /**
   * Get performance metrics for a specific tool
   */
  getToolPerformanceMetrics(toolName: string): PerformanceMetrics | undefined {
    return this.performanceMetrics.get(toolName);
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit?: number): ToolExecutionResult[] {
    if (limit) {
      return this.executionHistory.slice(-limit);
    }
    return [...this.executionHistory];
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory(): void {
    this.executionHistory = [];
    this.logger.info('Execution history cleared');
  }

  /**
   * Get tool dependencies
   */
  getToolDependencies(toolName: string): string[] {
    const tool = this.tools.get(toolName);
    if (!tool || !tool.metadata.dependencies) {
      return [];
    }
    return tool.metadata.dependencies;
  }

  /**
   * Get tools that depend on a specific tool
   */
  getDependentTools(toolName: string): string[] {
    return this.dependencyGraph.edges.get(toolName) || [];
  }

  /**
   * Validate tool structure
   */
  private validateTool(tool: Tool): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new ValidationError('Tool must have a valid name', 'name');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new ValidationError('Tool must have a valid description', 'description');
    }

    if (!Array.isArray(tool.parameters)) {
      throw new ValidationError('Tool must have parameters array', 'parameters');
    }

    if (!tool.category || !Object.values(ToolCategory).includes(tool.category)) {
      throw new ValidationError('Tool must have a valid category', 'category');
    }

    if (!tool.safety || !tool.safety.level) {
      throw new ValidationError('Tool must have safety configuration', 'safety');
    }

    if (!tool.metadata || !tool.metadata.version) {
      throw new ValidationError('Tool must have metadata with version', 'metadata');
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
      throw new ValidationError('Parameter must have a valid name', 'name');
    }

    if (!Object.values(ParameterType).includes(param.type)) {
      throw new ValidationError(`Invalid parameter type: ${param.type}`, 'type');
    }

    if (typeof param.required !== 'boolean') {
      throw new ValidationError('Parameter must specify if it is required', 'required');
    }

    if (!param.description || typeof param.description !== 'string') {
      throw new ValidationError('Parameter must have a valid description', 'description');
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
      throw new ValidationError('String parameter validation must have a valid pattern', 'validation.pattern');
    }

    if (type === 'number') {
      if (validation.min !== undefined && typeof validation.min !== 'number') {
        throw new ValidationError('Number parameter validation min must be a number', 'validation.min');
      }
      if (validation.max !== undefined && typeof validation.max !== 'number') {
        throw new ValidationError('Number parameter validation max must be a number', 'validation.max');
      }
    }

    if (type === 'string' || type === 'array') {
      if (validation.minLength !== undefined && typeof validation.minLength !== 'number') {
        throw new ValidationError('Parameter validation minLength must be a number', 'validation.minLength');
      }
      if (validation.maxLength !== undefined && typeof validation.maxLength !== 'number') {
        throw new ValidationError('Parameter validation maxLength must be a number', 'validation.maxLength');
      }
    }
  }

  /**
   * Validate tool dependencies
   */
  private validateDependencies(tool: Tool): void {
    if (!tool.metadata.dependencies) {
      return;
    }

    for (const dep of tool.metadata.dependencies) {
      if (!this.tools.has(dep)) {
        throw new BotError(
          `Tool '${tool.name}' depends on '${dep}' which is not registered`,
          'medium',
          { tool: tool.name, dependency: dep }
        );
      }

      // Check for circular dependencies
      if (this.hasCircularDependency(tool.name, dep)) {
        throw new BotError(
          `Circular dependency detected between '${tool.name}' and '${dep}'`,
          'high',
          { tool: tool.name, dependency: dep }
        );
      }
    }
  }

  /**
   * Check for circular dependencies
   */
  private hasCircularDependency(toolName: string, dependencyName: string): boolean {
    const visited = new Set<string>();
    return this.checkCircular(dependencyName, toolName, visited);
  }

  private checkCircular(
    current: string,
    target: string,
    visited: Set<string>
  ): boolean {
    if (current === target) {
      return true;
    }

    if (visited.has(current)) {
      return false;
    }

    visited.add(current);

    const dependencies = this.getToolDependencies(current);
    for (const dep of dependencies) {
      if (this.checkCircular(dep, target, visited)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Add tool to dependency graph
   */
  private addToDependencyGraph(tool: Tool): void {
    this.dependencyGraph.nodes.set(tool.name, tool);

    if (tool.metadata.dependencies) {
      for (const dep of tool.metadata.dependencies) {
        if (!this.dependencyGraph.edges.has(dep)) {
          this.dependencyGraph.edges.set(dep, []);
        }
        this.dependencyGraph.edges.get(dep)!.push(tool.name);

        if (!this.dependencyGraph.reverseEdges.has(tool.name)) {
          this.dependencyGraph.reverseEdges.set(tool.name, []);
        }
        this.dependencyGraph.reverseEdges.get(tool.name)!.push(dep);
      }
    }
  }

  /**
   * Remove tool from dependency graph
   */
  private removeFromDependencyGraph(toolName: string): void {
    this.dependencyGraph.nodes.delete(toolName);

    // Remove edges
    for (const [node, dependents] of this.dependencyGraph.edges) {
      const index = dependents.indexOf(toolName);
      if (index !== -1) {
        dependents.splice(index, 1);
      }
    }

    this.dependencyGraph.edges.delete(toolName);
    this.dependencyGraph.reverseEdges.delete(toolName);
  }

  /**
   * Cache a tool
   */
  private cacheTool(tool: Tool): void {
    const entry: ToolCacheEntry = {
      tool,
      cachedAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.cacheTTL),
      accessCount: 0,
      lastAccessed: new Date()
    };

    this.cache.set(tool.name, entry);
  }

  /**
   * Check if cache entry is expired
   */
  private isCacheEntryExpired(entry: ToolCacheEntry): boolean {
    return new Date() > entry.expiresAt;
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): number {
    let cleared = 0;
    for (const [key, entry] of this.cache) {
      if (this.isCacheEntryExpired(entry)) {
        this.cache.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      this.logger.debug(`Cleared ${cleared} expired cache entries`);
    }

    return cleared;
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.info(`Cleared ${size} cache entries`);
  }

  /**
   * Update execution statistics
   */
  updateExecutionStats(
    toolName: string,
    success: boolean,
    executionTime: number
  ): void {
    const now = Date.now();
    let stats = this.executionStats.get(toolName);

    if (!stats) {
      stats = {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        averageExecutionTime: 0,
        recentCalls: [],
        successRate: 1.0
      };
      this.executionStats.set(toolName, stats);
    }

    stats.totalCalls++;
    stats.recentCalls.push(now);
    stats.lastExecution = new Date(now);

    if (success) {
      stats.successfulCalls++;
    } else {
      stats.failedCalls++;
    }

    // Update average execution time
    stats.averageExecutionTime =
      (stats.averageExecutionTime * (stats.totalCalls - 1) + executionTime) /
      stats.totalCalls;

    // Update success rate
    stats.successRate = stats.successfulCalls / stats.totalCalls;

    // Keep only recent calls (last hour)
    const oneHourAgo = now - 3600000;
    stats.recentCalls = stats.recentCalls.filter(time => time > oneHourAgo);

    // Update performance metrics
    this.updatePerformanceMetrics(toolName, executionTime);
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(toolName: string, executionTime: number): void {
    let metrics = this.performanceMetrics.get(toolName);

    if (!metrics) {
      metrics = {
        p50: 0,
        p95: 0,
        p99: 0,
        min: Infinity,
        max: 0,
        samples: []
      };
      this.performanceMetrics.set(toolName, metrics);
    }

    metrics.samples.push(executionTime);
    metrics.min = Math.min(metrics.min, executionTime);
    metrics.max = Math.max(metrics.max, executionTime);

    // Keep only last 1000 samples
    if (metrics.samples.length > 1000) {
      metrics.samples.shift();
    }

    // Calculate percentiles
    const sorted = [...metrics.samples].sort((a, b) => a - b);
    const len = sorted.length;

    metrics.p50 = sorted[Math.floor(len * 0.5)] || 0;
    metrics.p95 = sorted[Math.floor(len * 0.95)] || 0;
    metrics.p99 = sorted[Math.floor(len * 0.99)] || 0;
  }

  /**
   * Record execution result in history
   */
  recordExecutionResult(result: ToolExecutionResult): void {
    this.executionHistory.push(result);

    // Keep only last 10000 executions
    if (this.executionHistory.length > 10000) {
      this.executionHistory.shift();
    }
  }

  /**
   * Check rate limit for a tool
   */
  async checkRateLimit(toolName: string): Promise<void> {
    if (!this.config.enableRateLimiting) {
      return;
    }

    const rateLimiter = this.rateLimiters.get(toolName);
    if (!rateLimiter) {
      return;
    }

    const canExecute = await rateLimiter.acquire();
    if (!canExecute) {
      throw new BotError(
        `Rate limit exceeded for tool '${toolName}'`,
        'medium',
        { tool: toolName }
      );
    }
  }

  /**
   * Reset rate limiters
   */
  resetRateLimiters(): void {
    for (const [toolName, limiter] of this.rateLimiters) {
      limiter.reset();
      this.logger.debug(`Reset rate limiter for tool: ${toolName}`);
    }
  }

  // ============================================================================
  // AI SDK INTEGRATION METHODS
  // ============================================================================

  /**
   * Get AI SDK adapter instance
   */
  getAISDKAdapter(): AISDKAdapter {
    return this.aiSDKAdapter;
  }

  /**
   * Get AI SDK configuration
   */
  getAISDKConfig(): AIAdapterConfig {
    return { ...this.aiSDKConfig };
  }

  /**
   * Update AI SDK configuration
   */
  updateAISDKConfig(config: Partial<AIAdapterConfig>): void {
    this.aiSDKConfig = { ...this.aiSDKConfig, ...config };
    this.aiSDKAdapter.updateConfig(config);
    this.logger.info('AI SDK configuration updated', { config: this.aiSDKConfig });
  }

  /**
   * Convert all registered tools to AI SDK format
   */
  getToolsAsAISDK(): any[] {
    const tools = this.getAllTools();
    return this.aiSDKAdapter.convertToolsToAISDK(tools);
  }

  /**
   * Convert all registered tools to OpenAI format
   */
  getToolsAsOpenAIFormat(): any[] {
    const tools = this.getAllTools();
    return this.aiSDKAdapter.convertToolsToOpenAIFormat(tools);
  }

  /**
   * Convert specific tool to AI SDK format
   */
  getToolAsAISDK(toolName: string): any | null {
    const tool = this.getTool(toolName);
    if (!tool) {
      return null;
    }
    return this.toolConverter.convertToAISDK(tool);
  }

  /**
   * Convert specific tool to OpenAI format
   */
  getToolAsOpenAIFormat(toolName: string): any | null {
    const tool = this.getTool(toolName);
    if (!tool) {
      return null;
    }
    return this.toolConverter.convertToOpenAIFormat(tool);
  }

  /**
   * Validate tool parameters using AI SDK (Zod)
   */
  validateToolParametersWithAISDK(toolName: string, args: Record<string, any>): {
    valid: boolean;
    errors: string[];
  } {
    const tool = this.getTool(toolName);
    if (!tool) {
      return {
        valid: false,
        errors: [`Tool '${toolName}' not found`]
      };
    }
    return this.aiSDKAdapter.validateToolParameters(tool, args);
  }

  /**
   * Check if AI SDK should be used for tool execution
   */
  shouldUseAISDKForExecution(): boolean {
    return this.aiSDKAdapter.shouldUseAISDK('execution');
  }

  /**
   * Check if AI SDK should be used for providers
   */
  shouldUseAISDKForProviders(): boolean {
    return this.aiSDKAdapter.shouldUseAISDK('providers');
  }

  /**
   * Get tool converter instance
   */
  getToolConverter(): ToolConverter {
    return this.toolConverter;
  }

  /**
   * Batch validate multiple tools with AI SDK
   */
  batchValidateToolsWithAISDK(tools: Tool[]): Map<string, { valid: boolean; errors: string[] }> {
    const results = new Map<string, { valid: boolean; errors: string[] }>();
    for (const tool of tools) {
      const validation = this.aiSDKAdapter.validateToolParameters(tool, {});
      results.set(tool.name, validation);
    }
    return results;
  }

  /**
   * Get conversion statistics for all tools
   */
  getConversionStats(): {
    totalTools: number;
    convertedTools: number;
    failedTools: number;
    errors: string[];
  } {
    const tools = this.getAllTools();
    return this.toolConverter.getConversionStats(tools);
  }

  /**
   * Enable AI SDK for specific operations
   */
  enableAISDKFor(operations: ('execution' | 'providers' | 'validation')[]): void {
    const updates: Partial<AIAdapterConfig> = {};
    for (const op of operations) {
      switch (op) {
        case 'execution':
          updates.useAISDKForExecution = true;
          break;
        case 'providers':
          updates.useAISDKForProviders = true;
          break;
        case 'validation':
          updates.useAISDK = true;
          break;
      }
    }
    this.updateAISDKConfig(updates);
  }

  /**
   * Disable AI SDK for specific operations
   */
  disableAISDKFor(operations: ('execution' | 'providers' | 'validation')[]): void {
    const updates: Partial<AIAdapterConfig> = {};
    for (const op of operations) {
      switch (op) {
        case 'execution':
          updates.useAISDKForExecution = false;
          break;
        case 'providers':
          updates.useAISDKForProviders = false;
          break;
        case 'validation':
          updates.useAISDK = false;
          break;
      }
    }
    this.updateAISDKConfig(updates);
  }
}

// ============================================================================
// SUPPORTING CLASSES
// ============================================================================

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class RateLimiter {
  private requests: number[] = [];
  private windowMs: number;
  private maxRequests: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Remove old requests
    this.requests = this.requests.filter(time => time > windowStart);

    // Check if we can make a request
    if (this.requests.length >= this.maxRequests) {
      return false;
    }

    this.requests.push(now);
    return true;
  }

  reset(): void {
    this.requests = [];
  }

  getRemaining(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    this.requests = this.requests.filter(time => time > windowStart);
    return Math.max(0, this.maxRequests - this.requests.length);
  }
}

interface PerformanceMetrics {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  samples: number[];
}
