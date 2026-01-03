/**
 * Tool Sandbox
 *
 * This module implements a sandboxed execution environment with
 * file system isolation, network isolation, API restrictions, and permission management.
 */

import { ToolCall, Tool } from '../../types/ai';
import { ExecutionContext } from './tool-executor';
import { Logger } from '../../utils/logger';
import { BotError } from '../../utils/errors';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SandboxConfig {
  enabled: boolean;
  timeoutMs: number;
  maxMemoryMB: number;
  maxCpuPercent: number;
  enableNetworkIsolation: boolean;
  enableFileSystemIsolation: boolean;
  allowedDomains: string[];
  allowedPaths: string[];
  blockedPaths: string[];
  enableApiRestrictions: boolean;
  allowedApis: string[];
  blockedApis: string[];
}

export interface SandboxContext {
  id: string;
  createdAt: Date;
  config: SandboxConfig;
  executionCount: number;
  lastExecution?: Date;
  violations: SandboxViolation[];
}

export interface SandboxViolation {
  type: 'network' | 'filesystem' | 'api' | 'resource' | 'permission';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  details?: Record<string, any>;
}

export interface SandboxResult {
  success: boolean;
  result?: any;
  error?: Error;
  violations: SandboxViolation[];
  executionTime: number;
  sandboxContext: SandboxContext;
}

export interface FileSystemIsolation {
  allowedPaths: string[];
  blockedPaths: string[];
  virtualFileSystem: Map<string, VirtualFile>;
  maxFileSizeMB: number;
  maxFiles: number;
}

export interface NetworkIsolation {
  allowedDomains: string[];
  blockedDomains: string[];
  allowedProtocols: string[];
  blockedProtocols: string[];
  requestCount: number;
  maxRequests: number;
}

export interface ApiRestrictions {
  allowedApis: string[];
  blockedApis: string[];
  rateLimits: Map<string, RateLimit>;
  permissionChecks: boolean;
}

export interface VirtualFile {
  name: string;
  content: string;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  permissions: FilePermissions;
}

export interface FilePermissions {
  read: boolean;
  write: boolean;
  delete: boolean;
  execute: boolean;
}

export interface RateLimit {
  maxRequests: number;
  windowMs: number;
  currentRequests: number;
}

// ============================================================================
// TOOL SANDBOX CLASS
// ============================================================================

export class ToolSandbox {
  private logger: Logger;
  private config: SandboxConfig;
  private activeSandboxes: Map<string, SandboxContext> = new Map();
  private fileSystemIsolation: FileSystemIsolation;
  private networkIsolation: NetworkIsolation;
  private apiRestrictions: ApiRestrictions;
  private permissionManager: PermissionManager;

  constructor(config: SandboxConfig, logger: Logger) {
    this.logger = logger;
    this.config = config;

    this.fileSystemIsolation = new FileSystemIsolation({
      allowedPaths: config.allowedPaths || [],
      blockedPaths: config.blockedPaths || [],
      maxFileSizeMB: 10,
      maxFiles: 100
    }, logger);

    this.networkIsolation = new NetworkIsolation({
      allowedDomains: config.allowedDomains || [],
      blockedDomains: [],
      allowedProtocols: ['https', 'http'],
      blockedProtocols: ['file', 'data'],
      maxRequests: 100
    }, logger);

    this.apiRestrictions = new ApiRestrictions({
      allowedApis: config.allowedApis || [],
      blockedApis: config.blockedApis || [],
      permissionChecks: true
    }, logger);

    this.permissionManager = new PermissionManager(logger);

    this.logger.info('Tool sandbox initialized', {
      enabled: config.enabled,
      timeoutMs: config.timeoutMs,
      maxMemoryMB: config.maxMemoryMB
    });
  }

  /**
   * Execute a tool in sandboxed environment
   */
  async executeTool(
    toolCall: ToolCall,
    context: ExecutionContext
  ): Promise<SandboxResult> {
    const startTime = Date.now();
    const sandboxId = this.generateSandboxId();

    this.logger.info('Executing tool in sandbox', {
      tool: toolCall.name,
      sandboxId,
      userId: context.userId
    });

    // Create sandbox context
    const sandboxContext: SandboxContext = {
      id: sandboxId,
      createdAt: new Date(),
      config: this.config,
      executionCount: 0,
      violations: []
    };

    this.activeSandboxes.set(sandboxId, sandboxContext);

    try {
      if (!this.config.enabled) {
        // Sandbox disabled, execute directly
        return await this.executeDirectly(toolCall, context, sandboxContext, startTime);
      }

      // Check if tool is allowed
      const allowed = this.checkToolAllowed(toolCall.name);
      if (!allowed) {
        throw new BotError(
          `Tool '${toolCall.name}' is not allowed in sandbox`,
          'high',
          { tool: toolCall.name }
        );
      }

      // Execute with timeout
      const result = await this.executeWithTimeout(
        toolCall,
        context,
        sandboxContext,
        this.config.timeoutMs
      );

      // Update sandbox context
      sandboxContext.executionCount++;
      sandboxContext.lastExecution = new Date();

      const executionTime = Date.now() - startTime;

      this.logger.info('Sandbox execution completed', {
        tool: toolCall.name,
        sandboxId,
        executionTime,
        violations: sandboxContext.violations.length
      });

      return {
        success: true,
        result,
        violations: sandboxContext.violations,
        executionTime,
        sandboxContext
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Record violation if error is security-related
      if (this.isSecurityError(error as Error)) {
        const violation: SandboxViolation = {
          type: 'permission',
          severity: 'high',
          message: `Security violation: ${(error as Error).message}`,
          timestamp: new Date(),
          details: { error: (error as Error).message }
        };
        sandboxContext.violations.push(violation);
      }

      this.logger.error('Sandbox execution failed', error as Error, {
        tool: toolCall.name,
        sandboxId,
        executionTime
      });

      return {
        success: false,
        error: error as Error,
        violations: sandboxContext.violations,
        executionTime,
        sandboxContext
      };
    } finally {
      // Cleanup sandbox
      await this.cleanupSandbox(sandboxId);
    }
  }

  /**
   * Execute tool directly without sandbox
   */
  private async executeDirectly(
    toolCall: ToolCall,
    context: ExecutionContext,
    sandboxContext: SandboxContext,
    startTime: number
  ): Promise<SandboxResult> {
    // This would delegate to the actual tool executor
    // For now, return a placeholder result
    return {
      success: true,
      result: {
        tool: toolCall.name,
        arguments: toolCall.arguments,
        executed: true,
        timestamp: new Date()
      },
      violations: [],
      executionTime: Date.now() - startTime,
      sandboxContext
    };
  }

  /**
   * Execute tool with timeout
   */
  private async executeWithTimeout(
    toolCall: ToolCall,
    context: ExecutionContext,
    sandboxContext: SandboxContext,
    timeoutMs: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const violation: SandboxViolation = {
          type: 'resource',
          severity: 'medium',
          message: 'Tool execution timeout',
          timestamp: new Date(),
          details: { timeoutMs, tool: toolCall.name }
        };
        sandboxContext.violations.push(violation);

        reject(new BotError(
          `Tool execution timeout after ${timeoutMs}ms`,
          'medium',
          { tool: toolCall.name, timeoutMs }
        ));
      }, timeoutMs);

      // Execute the tool
      this.executeToolInternal(toolCall, context, sandboxContext)
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Execute tool internally with sandbox restrictions
   */
  private async executeToolInternal(
    toolCall: ToolCall,
    context: ExecutionContext,
    sandboxContext: SandboxContext
  ): Promise<any> {
    // Check file system access
    this.checkFileSystemAccess(toolCall);

    // Check network access
    await this.checkNetworkAccess(toolCall);

    // Check API access
    this.checkApiAccess(toolCall.name);

    // Check permissions
    this.checkPermissions(toolCall.name, context.permissions);

    // Execute the tool (placeholder - would be actual tool execution)
    return {
      tool: toolCall.name,
      arguments: toolCall.arguments,
      executed: true,
      timestamp: new Date()
    };
  }

  /**
   * Check if tool is allowed in sandbox
   */
  private checkToolAllowed(toolName: string): boolean {
    // Check if tool is in blocked APIs
    if (this.apiRestrictions.blockedApis.includes(toolName)) {
      return false;
    }

    // Check if tool is in allowed APIs (if whitelist is configured)
    if (
      this.apiRestrictions.allowedApis.length > 0 &&
      !this.apiRestrictions.allowedApis.includes(toolName)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Check file system access
   */
  private checkFileSystemAccess(toolCall: ToolCall): void {
    const args = toolCall.arguments;

    // Check for file path parameters
    for (const key of Object.keys(args)) {
      if (key.includes('path') || key.includes('file') || key.includes('directory')) {
        const path = args[key];

        if (typeof path === 'string') {
          // Check if path is allowed
          const isAllowed = this.fileSystemIsolation.isPathAllowed(path);
          if (!isAllowed) {
            const violation: SandboxViolation = {
              type: 'filesystem',
              severity: 'high',
              message: `Attempted to access blocked path: ${path}`,
              timestamp: new Date(),
              details: { path, tool: toolCall.name }
            };
            // Add to current sandbox context
            const activeSandbox = this.getActiveSandbox();
            if (activeSandbox) {
              activeSandbox.violations.push(violation);
            }

            throw new BotError(
              `File system access denied: ${path}`,
              'high',
              { path, tool: toolCall.name }
            );
          }
        }
      }
    }
  }

  /**
   * Check network access
   */
  private async checkNetworkAccess(toolCall: ToolCall): Promise<void> {
    const args = toolCall.arguments;

    // Check for URL or domain parameters
    for (const key of Object.keys(args)) {
      if (key.includes('url') || key.includes('domain') || key.includes('endpoint')) {
        const url = args[key];

        if (typeof url === 'string') {
          // Extract domain from URL
          const domain = this.extractDomain(url);

          // Check if domain is allowed
          const isAllowed = this.networkIsolation.isDomainAllowed(domain);
          if (!isAllowed) {
            const violation: SandboxViolation = {
              type: 'network',
              severity: 'high',
              message: `Attempted to access blocked domain: ${domain}`,
              timestamp: new Date(),
              details: { domain, url, tool: toolCall.name }
            };
            const activeSandbox = this.getActiveSandbox();
            if (activeSandbox) {
              activeSandbox.violations.push(violation);
            }

            throw new BotError(
              `Network access denied: ${domain}`,
              'high',
              { domain, url, tool: toolCall.name }
            );
          }

          // Increment request count
          this.networkIsolation.incrementRequestCount();
        }
      }
    }
  }

  /**
   * Check API access
   */
  private checkApiAccess(toolName: string): void {
    // Check if API is allowed
    const isAllowed = this.apiRestrictions.isApiAllowed(toolName);
    if (!isAllowed) {
      const violation: SandboxViolation = {
        type: 'api',
        severity: 'high',
        message: `Attempted to access blocked API: ${toolName}`,
        timestamp: new Date(),
        details: { api: toolName }
      };
      const activeSandbox = this.getActiveSandbox();
      if (activeSandbox) {
        activeSandbox.violations.push(violation);
      }

      throw new BotError(
        `API access denied: ${toolName}`,
        'high',
        { api: toolName }
      );
    }
  }

  /**
   * Check permissions
   */
  private checkPermissions(toolName: string, userPermissions: string[]): void {
    const required = this.permissionManager.getRequiredPermissions(toolName);
    if (!required) {
      return;
    }

    const hasPermission = required.some(perm => userPermissions.includes(perm));
    if (!hasPermission) {
      const violation: SandboxViolation = {
        type: 'permission',
        severity: 'high',
        message: `Insufficient permissions for tool: ${toolName}`,
        timestamp: new Date(),
        details: {
          tool: toolName,
          required,
          provided: userPermissions
        }
      };
      const activeSandbox = this.getActiveSandbox();
      if (activeSandbox) {
        activeSandbox.violations.push(violation);
      }

      throw new BotError(
        `Permission denied for tool: ${toolName}`,
        'high',
        { tool: toolName, required, provided: userPermissions }
      );
    }
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      // If not a valid URL, return as-is
      return url;
    }
  }

  /**
   * Get active sandbox context
   */
  private getActiveSandbox(): SandboxContext | undefined {
    const activeIds = Array.from(this.activeSandboxes.keys());
    if (activeIds.length === 0) {
      return undefined;
    }
    return this.activeSandboxes.get(activeIds[0]);
  }

  /**
   * Cleanup sandbox
   */
  private async cleanupSandbox(sandboxId: string): Promise<void> {
    const context = this.activeSandboxes.get(sandboxId);
    if (!context) {
      return;
    }

    this.logger.debug('Cleaning up sandbox', { sandboxId });

    // Cleanup file system
    this.fileSystemIsolation.cleanup(sandboxId);

    // Cleanup network
    this.networkIsolation.reset();

    // Remove from active sandboxes
    this.activeSandboxes.delete(sandboxId);

    this.logger.debug('Sandbox cleaned up', { sandboxId });
  }

  /**
   * Get sandbox statistics
   */
  getSandboxStatistics(): {
    activeSandboxes: number;
    totalExecutions: number;
    totalViolations: number;
    violationsByType: Record<string, number>;
  } {
    const totalExecutions = Array.from(this.activeSandboxes.values())
      .reduce((sum, ctx) => sum + ctx.executionCount, 0);

    const allViolations: SandboxViolation[] = [];
    for (const ctx of this.activeSandboxes.values()) {
      allViolations.push(...ctx.violations);
    }

    const violationsByType: Record<string, number> = {};
    for (const violation of allViolations) {
      violationsByType[violation.type] = (violationsByType[violation.type] || 0) + 1;
    }

    return {
      activeSandboxes: this.activeSandboxes.size,
      totalExecutions,
      totalViolations: allViolations.length,
      violationsByType
    };
  }

  /**
   * Get active sandbox contexts
   */
  getActiveSandboxes(): SandboxContext[] {
    return Array.from(this.activeSandboxes.values());
  }

  /**
   * Generate unique sandbox ID
   */
  private generateSandboxId(): string {
    return `sandbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update sandbox configuration
   */
  updateConfig(config: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...config };

    this.logger.info('Sandbox configuration updated', {
      enabled: this.config.enabled,
      timeoutMs: this.config.timeoutMs,
      maxMemoryMB: this.config.maxMemoryMB
    });
  }
}

// ============================================================================
// FILE SYSTEM ISOLATION CLASS
// ============================================================================

class FileSystemIsolation {
  private allowedPaths: string[];
  private blockedPaths: string[];
  private virtualFileSystem: Map<string, VirtualFile> = new Map();
  private sandboxFileSystems: Map<string, Map<string, VirtualFile>> = new Map();
  private maxFileSizeMB: number;
  private maxFiles: number;
  private logger: Logger;

  constructor(config: {
    allowedPaths: string[];
    blockedPaths: string[];
    maxFileSizeMB: number;
    maxFiles: number;
  }, logger: Logger) {
    this.allowedPaths = config.allowedPaths;
    this.blockedPaths = config.blockedPaths;
    this.maxFileSizeMB = config.maxFileSizeMB;
    this.maxFiles = config.maxFiles;
    this.logger = logger;
  }

  isPathAllowed(path: string): boolean {
    // Check if path is blocked
    for (const blocked of this.blockedPaths) {
      if (path.startsWith(blocked)) {
        return false;
      }
    }

    // If allowed paths are specified, check if path is allowed
    if (this.allowedPaths.length > 0) {
      for (const allowed of this.allowedPaths) {
        if (path.startsWith(allowed)) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  readFile(sandboxId: string, path: string): string | null {
    const fs = this.sandboxFileSystems.get(sandboxId);
    if (!fs) {
      return null;
    }

    const file = fs.get(path);
    return file ? file.content : null;
  }

  writeFile(sandboxId: string, path: string, content: string): boolean {
    const fs = this.sandboxFileSystems.get(sandboxId);
    if (!fs) {
      fs.set(sandboxId, new Map());
    }

    const size = Buffer.byteLength(content, 'utf8');
    if (size > this.maxFileSizeMB * 1024 * 1024) {
      return false;
    }

    const currentFs = this.sandboxFileSystems.get(sandboxId)!;
    if (currentFs.size >= this.maxFiles) {
      return false;
    }

    const file: VirtualFile = {
      name: path,
      content,
      size,
      createdAt: new Date(),
      modifiedAt: new Date(),
      permissions: { read: true, write: true, delete: false, execute: false }
    };

    currentFs.set(path, file);
    return true;
  }

  deleteFile(sandboxId: string, path: string): boolean {
    const fs = this.sandboxFileSystems.get(sandboxId);
    if (!fs) {
      return false;
    }

    return fs.delete(path);
  }

  cleanup(sandboxId: string): void {
    this.sandboxFileSystems.delete(sandboxId);
    this.logger.debug('File system cleaned up', { sandboxId });
  }
}

// ============================================================================
// NETWORK ISOLATION CLASS
// ============================================================================

class NetworkIsolation {
  private allowedDomains: string[];
  private blockedDomains: string[];
  private allowedProtocols: string[];
  private blockedProtocols: string[];
  private requestCount: number = 0;
  private maxRequests: number;
  private logger: Logger;

  constructor(config: {
    allowedDomains: string[];
    blockedDomains: string[];
    allowedProtocols: string[];
    blockedProtocols: string[];
    maxRequests: number;
  }, logger: Logger) {
    this.allowedDomains = config.allowedDomains;
    this.blockedDomains = config.blockedDomains;
    this.allowedProtocols = config.allowedProtocols;
    this.blockedProtocols = config.blockedProtocols;
    this.maxRequests = config.maxRequests;
    this.logger = logger;
  }

  isDomainAllowed(domain: string): boolean {
    // Check if domain is blocked
    for (const blocked of this.blockedDomains) {
      if (domain === blocked || domain.endsWith(`.${blocked}`)) {
        return false;
      }
    }

    // If allowed domains are specified, check if domain is allowed
    if (this.allowedDomains.length > 0) {
      for (const allowed of this.allowedDomains) {
        if (domain === allowed || domain.endsWith(`.${allowed}`)) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  incrementRequestCount(): void {
    this.requestCount++;
  }

  reset(): void {
    this.requestCount = 0;
  }

  isRequestLimitReached(): boolean {
    return this.requestCount >= this.maxRequests;
  }
}

// ============================================================================
// API RESTRICTIONS CLASS
// ============================================================================

class ApiRestrictions {
  private allowedApis: string[];
  private blockedApis: string[];
  private rateLimits: Map<string, RateLimit> = new Map();
  private permissionChecks: boolean;
  private logger: Logger;

  constructor(config: {
    allowedApis: string[];
    blockedApis: string[];
    permissionChecks: boolean;
  }, logger: Logger) {
    this.allowedApis = config.allowedApis;
    this.blockedApis = config.blockedApis;
    this.permissionChecks = config.permissionChecks;
    this.logger = logger;
  }

  isApiAllowed(apiName: string): boolean {
    // Check if API is blocked
    if (this.blockedApis.includes(apiName)) {
      return false;
    }

    // If allowed APIs are specified, check if API is allowed
    if (this.allowedApis.length > 0) {
      return this.allowedApis.includes(apiName);
    }

    return true;
  }

  checkRateLimit(apiName: string): boolean {
    const limit = this.rateLimits.get(apiName);
    if (!limit) {
      return true;
    }

    const now = Date.now();
    const windowStart = now - limit.windowMs;

    // Reset if window has passed
    if (limit.currentRequests < 0 || now < windowStart) {
      limit.currentRequests = 0;
    }

    limit.currentRequests++;

    return limit.currentRequests <= limit.maxRequests;
  }
}

// ============================================================================
// PERMISSION MANAGER CLASS
// ============================================================================

class PermissionManager {
  private toolPermissions: Map<string, string[]> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.initializeDefaultPermissions();
  }

  private initializeDefaultPermissions(): void {
    // Define default permissions for common tools
    this.toolPermissions.set('create_role', ['manage_roles']);
    this.toolPermissions.set('update_role', ['manage_roles']);
    this.toolPermissions.set('delete_role', ['manage_roles']);
    this.toolPermissions.set('assign_role', ['manage_roles']);
    this.toolPermissions.set('remove_role', ['manage_roles']);

    this.toolPermissions.set('create_channel', ['manage_channels']);
    this.toolPermissions.set('update_channel', ['manage_channels']);
    this.toolPermissions.set('delete_channel', ['manage_channels']);

    this.toolPermissions.set('kick_user', ['kick_members']);
    this.toolPermissions.set('ban_user', ['ban_members']);
    this.toolPermissions.set('timeout_user', ['moderate_members']);

    this.toolPermissions.set('send_message', ['send_messages']);
    this.toolPermissions.set('edit_message', ['manage_messages']);
    this.toolPermissions.set('delete_message', ['manage_messages']);

    this.toolPermissions.set('create_webhook', ['manage_webhooks']);
    this.toolPermissions.set('update_webhook', ['manage_webhooks']);
    this.toolPermissions.set('delete_webhook', ['manage_webhooks']);
    this.toolPermissions.set('execute_webhook', []);

    // Safe tools (no permissions required)
    this.toolPermissions.set('get_user_info', []);
    this.toolPermissions.set('get_server_info', []);
    this.toolPermissions.set('get_channel_info', []);
    this.toolPermissions.set('get_message', []);
    this.toolPermissions.set('get_server_members', []);
    this.toolPermissions.set('get_server_channels', []);
  }

  getRequiredPermissions(toolName: string): string[] | undefined {
    return this.toolPermissions.get(toolName);
  }

  setToolPermissions(toolName: string, permissions: string[]): void {
    this.toolPermissions.set(toolName, permissions);
    this.logger.info('Tool permissions updated', { toolName, permissions });
  }

  getAllPermissions(): Map<string, string[]> {
    return new Map(this.toolPermissions);
  }
}
