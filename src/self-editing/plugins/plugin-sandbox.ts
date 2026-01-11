import { Logger } from '../../utils/logger';
import { PluginError, ValidationError } from '../../utils/errors';
import * as vm from 'vm';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Sandbox policy
 */
export interface SandboxPolicy {
  allowedOperations: string[];
  resourceLimits: ResourceLimits;
  networkAccess: boolean;
  fileSystemAccess: boolean;
  allowedDomains?: string[];
  allowedPaths?: string[];
  executionTimeout: number;
  maxMemoryUsage: number;
  maxCpuTime: number;
}

/**
 * Resource limits
 */
export interface ResourceLimits {
  memory: number; // in bytes
  cpu: number; // percentage (0-100)
  disk: number; // in bytes
  networkBandwidth: number; // in bytes per second
  maxExecutionTime: number; // in milliseconds
}

/**
 * Sandbox instance
 */
export interface SandboxInstance {
  id: string;
  pluginId: string;
  created: Date;
  lastUsed: Date;
  policy: SandboxPolicy;
  context: vm.Context;
  isolated: boolean;
  resources: ResourceUsage;
  state: SandboxState;
}

/**
 * Resource usage
 */
export interface ResourceUsage {
  memoryUsed: number;
  cpuUsed: number;
  diskUsed: number;
  networkUsed: number;
  executionTime: number;
  operationCount: number;
  errorCount: number;
}

/**
 * Sandbox state
 */
export enum SandboxState {
  CREATED = 'created',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  TERMINATED = 'terminated',
  ERROR = 'error'
}

/**
 * Sandbox execution result
 */
export interface SandboxExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
  resourceUsage: ResourceUsage;
  sandboxEscapeDetected: boolean;
}

/**
 * Security violation
 */
export interface SecurityViolation {
  type: 'sandbox_escape' | 'resource_limit' | 'unauthorized_access' | 'malicious_code';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  operation?: string;
  timestamp: Date;
}

/**
 * File system operation
 */
export interface FileSystemOperation {
  type: 'read' | 'write' | 'delete' | 'list' | 'exists';
  path: string;
  allowed: boolean;
  reason?: string;
}

/**
 * Network operation
 */
export interface NetworkOperation {
  type: 'http' | 'https' | 'ws' | 'wss';
  url: string;
  allowed: boolean;
  reason?: string;
}

/**
 * Plugin sandboxing and isolation with resource limiting and security
 */
export class PluginSandbox {
  private logger: Logger;
  private sandboxes: Map<string, SandboxInstance> = new Map();
  private sandboxPolicies: Map<string, SandboxPolicy> = new Map();
  private securityViolations: Map<string, SecurityViolation[]> = new Map();
  private resourceMonitors: Map<string, NodeJS.Timeout> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Create sandbox for plugin
   * @param pluginId Plugin ID
   * @param policy Sandbox policy
   * @returns Sandbox creation result
   */
  public async createSandbox(
    pluginId: string,
    policy: SandboxPolicy
  ): Promise<{
    sandboxId: string;
    success: boolean;
    error?: string;
  }> {
    try {
      this.logger.debug(`Creating sandbox for plugin: ${pluginId}`);

      const sandboxId = `sandbox_${pluginId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Validate policy
      const policyValidation = this.validatePolicy(policy);
      if (!policyValidation.valid) {
        throw new ValidationError(
          `Invalid sandbox policy: ${policyValidation.errors.join(', ')}`,
          'policy',
          'SANDBOX_POLICY'
        );
      }

      // Create isolated VM context
      const context = this.createIsolatedContext(pluginId, policy);

      // Create sandbox instance
      const sandbox: SandboxInstance = {
        id: sandboxId,
        pluginId,
        created: new Date(),
        lastUsed: new Date(),
        policy,
        context,
        isolated: true,
        resources: {
          memoryUsed: 0,
          cpuUsed: 0,
          diskUsed: 0,
          networkUsed: 0,
          executionTime: 0,
          operationCount: 0,
          errorCount: 0
        },
        state: SandboxState.CREATED
      };

      this.sandboxes.set(sandboxId, sandbox);
      this.sandboxPolicies.set(sandboxId, policy);
      this.securityViolations.set(sandboxId, []);

      // Start resource monitoring
      this.startResourceMonitoring(sandboxId);

      this.logger.info(`Sandbox created successfully: ${sandboxId}`);
      return { sandboxId, success: true };
    } catch (error) {
      this.logger.error(`Sandbox creation failed for ${pluginId}:`, error as Error);
      return {
        sandboxId: '',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Execute plugin in sandbox
   * @param sandboxId Sandbox ID
   * @param plugin Plugin module
   * @param operation Operation name
   * @param parameters Operation parameters
   * @returns Execution result
   */
  public async executeInSandbox(
    sandboxId: string,
    plugin: any,
    operation: string,
    parameters: any = {}
  ): Promise<SandboxExecutionResult> {
    const startTime = Date.now();
    let sandboxEscapeDetected = false;

    try {
      this.logger.debug(`Executing in sandbox: ${sandboxId}.${operation}`);

      const sandbox = this.sandboxes.get(sandboxId);
      if (!sandbox) {
        throw new PluginError(`Sandbox not found: ${sandboxId}`, 'SANDBOX_NOT_FOUND');
      }

      const policy = this.sandboxPolicies.get(sandboxId)!;

      // Update sandbox state
      sandbox.state = SandboxState.ACTIVE;
      sandbox.lastUsed = new Date();

      // Validate operation against policy
      const validation = this.validateOperation(operation, policy);
      if (!validation.allowed) {
        this.recordSecurityViolation(sandboxId, {
          type: 'unauthorized_access',
          severity: 'high',
          description: `Unauthorized operation: ${operation}`,
          operation,
          timestamp: new Date()
        });
        throw new PluginError(`Operation not allowed: ${validation.reason}`, 'OPERATION_NOT_ALLOWED');
      }

      // Check for sandbox escape attempts
      const escapeCheck = this.checkForSandboxEscape(operation, parameters);
      if (escapeCheck.detected) {
        sandboxEscapeDetected = true;
        this.recordSecurityViolation(sandboxId, {
          type: 'sandbox_escape',
          severity: 'critical',
          description: escapeCheck.reason || 'Potential sandbox escape detected',
          operation,
          timestamp: new Date()
        });
        throw new PluginError('Sandbox escape attempt detected', 'SANDBOX_ESCAPE');
      }

      // Execute operation with timeout
      const result = await this.executeWithTimeout(
        sandbox,
        plugin,
        operation,
        parameters,
        policy.executionTimeout
      );

      const executionTime = Date.now() - startTime;

      // Update resource usage
      sandbox.resources.executionTime += executionTime;
      sandbox.resources.operationCount++;

      // Check resource limits
      const limitCheck = this.checkResourceLimits(sandboxId);
      if (!limitCheck.withinLimits) {
        this.recordSecurityViolation(sandboxId, {
          type: 'resource_limit',
          severity: 'medium',
          description: `Resource limit exceeded: ${limitCheck.exceeded.join(', ')}`,
          timestamp: new Date()
        });
      }

      sandbox.state = SandboxState.CREATED;

      this.logger.debug(`Sandbox execution completed: ${sandboxId}.${operation} (${executionTime}ms)`);
      return {
        success: true,
        result,
        executionTime,
        resourceUsage: { ...sandbox.resources },
        sandboxEscapeDetected
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      const sandbox = this.sandboxes.get(sandboxId);
      if (sandbox) {
        sandbox.resources.errorCount++;
        sandbox.state = SandboxState.ERROR;
      }

      this.logger.error(`Sandbox execution failed for ${sandboxId}:`, error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
        resourceUsage: sandbox?.resources || this.createEmptyResourceUsage(),
        sandboxEscapeDetected
      };
    }
  }

  /**
   * Destroy sandbox
   * @param sandboxId Sandbox ID
   * @returns Destruction result
   */
  public async destroySandbox(sandboxId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.logger.debug(`Destroying sandbox: ${sandboxId}`);

      const sandbox = this.sandboxes.get(sandboxId);
      if (!sandbox) {
        throw new PluginError(`Sandbox not found: ${sandboxId}`, 'SANDBOX_NOT_FOUND');
      }

      // Stop resource monitoring
      this.stopResourceMonitoring(sandboxId);

      // Cleanup context
      sandbox.context = {} as any;

      sandbox.state = SandboxState.TERMINATED;

      this.sandboxes.delete(sandboxId);
      this.sandboxPolicies.delete(sandboxId);
      this.securityViolations.delete(sandboxId);

      this.logger.info(`Sandbox destroyed successfully: ${sandboxId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Sandbox destruction failed for ${sandboxId}:`, error as Error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Get sandbox info
   * @param sandboxId Sandbox ID
   * @returns Sandbox info or undefined
   */
  public getSandboxInfo(sandboxId: string): {
    id: string;
    pluginId: string;
    created: Date;
    lastUsed: Date;
    isolated: boolean;
    state: SandboxState;
    resources: ResourceUsage;
    policy: SandboxPolicy;
  } | undefined {
    const sandbox = this.sandboxes.get(sandboxId);
    const policy = this.sandboxPolicies.get(sandboxId);

    if (!sandbox || !policy) {
      return undefined;
    }

    return {
      id: sandbox.id,
      pluginId: sandbox.pluginId,
      created: sandbox.created,
      lastUsed: sandbox.lastUsed,
      isolated: sandbox.isolated,
      state: sandbox.state,
      resources: { ...sandbox.resources },
      policy
    };
  }

  /**
   * Get all sandboxes
   * @returns Array of sandbox info
   */
  public getAllSandboxes(): Array<{
    id: string;
    pluginId: string;
    created: Date;
    lastUsed: Date;
    isolated: boolean;
    state: SandboxState;
    resources: ResourceUsage;
  }> {
    return Array.from(this.sandboxes.values()).map(sandbox => ({
      id: sandbox.id,
      pluginId: sandbox.pluginId,
      created: sandbox.created,
      lastUsed: sandbox.lastUsed,
      isolated: sandbox.isolated,
      state: sandbox.state,
      resources: { ...sandbox.resources }
    }));
  }

  /**
   * Check resource usage
   * @param sandboxId Sandbox ID
   * @returns Resource check result
   */
  public checkResourceUsage(sandboxId: string): {
    withinLimits: boolean;
    usage: ResourceUsage;
    limits: ResourceLimits;
    exceeded: string[];
  } {
    const sandbox = this.sandboxes.get(sandboxId);
    const policy = this.sandboxPolicies.get(sandboxId);

    if (!sandbox || !policy) {
      throw new PluginError(`Sandbox not found: ${sandboxId}`, 'SANDBOX_NOT_FOUND');
    }

    const usage = sandbox.resources;
    const limits = policy.resourceLimits;
    const exceeded: string[] = [];

    if (usage.memoryUsed > limits.memory) {
      exceeded.push('memory');
    }
    if (usage.cpuUsed > limits.cpu) {
      exceeded.push('cpu');
    }
    if (usage.diskUsed > limits.disk) {
      exceeded.push('disk');
    }
    if (usage.executionTime > limits.maxExecutionTime) {
      exceeded.push('executionTime');
    }

    return {
      withinLimits: exceeded.length === 0,
      usage: { ...usage },
      limits: { ...limits },
      exceeded
    };
  }

  /**
   * Get security violations
   * @param sandboxId Sandbox ID
   * @returns Array of security violations
   */
  public getSecurityViolations(sandboxId: string): SecurityViolation[] {
    return this.securityViolations.get(sandboxId) || [];
  }

  /**
   * Validate file system operation
   * @param sandboxId Sandbox ID
   * @param operation File system operation
   * @returns Validation result
   */
  public validateFileSystemOperation(
    sandboxId: string,
    operation: FileSystemOperation
  ): {
    allowed: boolean;
    reason?: string;
  } {
    const policy = this.sandboxPolicies.get(sandboxId);
    if (!policy) {
      return { allowed: false, reason: 'Sandbox not found' };
    }

    if (!policy.fileSystemAccess) {
      return { allowed: false, reason: 'File system access disabled' };
    }

    if (policy.allowedPaths && policy.allowedPaths.length > 0) {
      const normalizedPath = path.normalize(operation.path);
      const allowed = policy.allowedPaths.some(allowedPath =>
        normalizedPath.startsWith(path.normalize(allowedPath))
      );

      if (!allowed) {
        return { allowed: false, reason: 'Path not in allowed list' };
      }
    }

    return { allowed: true };
  }

  /**
   * Validate network operation
   * @param sandboxId Sandbox ID
   * @param operation Network operation
   * @returns Validation result
   */
  public validateNetworkOperation(
    sandboxId: string,
    operation: NetworkOperation
  ): {
    allowed: boolean;
    reason?: string;
  } {
    const policy = this.sandboxPolicies.get(sandboxId);
    if (!policy) {
      return { allowed: false, reason: 'Sandbox not found' };
    }

    if (!policy.networkAccess) {
      return { allowed: false, reason: 'Network access disabled' };
    }

    if (policy.allowedDomains && policy.allowedDomains.length > 0) {
      try {
        const url = new URL(operation.url);
        const allowed = policy.allowedDomains.some(domain =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`)
        );

        if (!allowed) {
          return { allowed: false, reason: 'Domain not in allowed list' };
        }
      } catch {
        return { allowed: false, reason: 'Invalid URL' };
      }
    }

    return { allowed: true };
  }

  /**
   * Update sandbox policy
   * @param sandboxId Sandbox ID
   * @param policy New policy
   * @returns Update result
   */
  public async updateSandboxPolicy(
    sandboxId: string,
    policy: SandboxPolicy
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const sandbox = this.sandboxes.get(sandboxId);
      if (!sandbox) {
        throw new PluginError(`Sandbox not found: ${sandboxId}`, 'SANDBOX_NOT_FOUND');
      }

      // Validate new policy
      const policyValidation = this.validatePolicy(policy);
      if (!policyValidation.valid) {
        throw new ValidationError(
          `Invalid sandbox policy: ${policyValidation.errors.join(', ')}`,
          'policy',
          'SANDBOX_POLICY'
        );
      }

      this.sandboxPolicies.set(sandboxId, policy);
      sandbox.policy = policy;

      this.logger.info(`Sandbox policy updated: ${sandboxId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Sandbox policy update failed for ${sandboxId}:`, error as Error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Destroy all sandboxes
   * @returns Destruction result
   */
  public async destroyAllSandboxes(): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    const sandboxIds = Array.from(this.sandboxes.keys());
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const sandboxId of sandboxIds) {
      const result = await this.destroySandbox(sandboxId);
      if (result.success) {
        success++;
      } else {
        failed++;
        errors.push(`${sandboxId}: ${result.error}`);
      }
    }

    this.logger.info(`Destroyed ${success} sandboxes, ${failed} failed`);
    return { success, failed, errors };
  }

  /**
   * Get sandbox statistics
   * @returns Statistics object
   */
  public getSandboxStatistics(): {
    totalSandboxes: number;
    activeSandboxes: number;
    suspendedSandboxes: number;
    terminatedSandboxes: number;
    errorSandboxes: number;
    totalOperations: number;
    totalErrors: number;
    totalExecutionTime: number;
    totalSecurityViolations: number;
  } {
    const sandboxes = Array.from(this.sandboxes.values());
    const activeSandboxes = sandboxes.filter(s => s.state === SandboxState.ACTIVE).length;
    const suspendedSandboxes = sandboxes.filter(s => s.state === SandboxState.SUSPENDED).length;
    const terminatedSandboxes = sandboxes.filter(s => s.state === SandboxState.TERMINATED).length;
    const errorSandboxes = sandboxes.filter(s => s.state === SandboxState.ERROR).length;

    const totalOperations = sandboxes.reduce((sum, s) => sum + s.resources.operationCount, 0);
    const totalErrors = sandboxes.reduce((sum, s) => sum + s.resources.errorCount, 0);
    const totalExecutionTime = sandboxes.reduce((sum, s) => sum + s.resources.executionTime, 0);
    const totalSecurityViolations = Array.from(this.securityViolations.values())
      .reduce((sum, violations) => sum + violations.length, 0);

    return {
      totalSandboxes: sandboxes.length,
      activeSandboxes,
      suspendedSandboxes,
      terminatedSandboxes,
      errorSandboxes,
      totalOperations,
      totalErrors,
      totalExecutionTime,
      totalSecurityViolations
    };
  }

  /**
   * Cleanup all resources
   */
  public async cleanup(): Promise<void> {
    this.logger.debug('Cleaning up plugin sandbox');

    await this.destroyAllSandboxes();

    // Stop all monitors
    for (const monitor of this.resourceMonitors.values()) {
      clearTimeout(monitor);
    }
    this.resourceMonitors.clear();

    this.logger.info('Plugin sandbox cleaned up');
  }

  /**
   * Create isolated VM context
   * @param pluginId Plugin ID
   * @param policy Sandbox policy
   * @returns VM context
   */
  private createIsolatedContext(pluginId: string, policy: SandboxPolicy): vm.Context {
    const context: vm.Context = {
      console: {
        log: (...args: any[]) => this.logger.debug(`[${pluginId}]`, ...args),
        warn: (...args: any[]) => this.logger.warn(`[${pluginId}]`, ...args),
        error: (...args: any[]) => this.logger.error(`[${pluginId}]`, ...args),
        info: (...args: any[]) => this.logger.info(`[${pluginId}]`, ...args),
        debug: (...args: any[]) => this.logger.debug(`[${pluginId}]`, ...args)
      },
      setTimeout: setTimeout.bind(global),
      clearTimeout: clearTimeout.bind(global),
      setInterval: setInterval.bind(global),
      clearInterval: clearInterval.bind(global),
      Promise: Promise,
      JSON: JSON,
      Math: Math,
      Date: Date,
      Array: Array,
      Object: Object,
      String: String,
      Number: Number,
      Boolean: Boolean,
      Error: Error,
      // Add safe API methods
      __sandbox: {
        pluginId,
        allowedOperations: policy.allowedOperations,
        networkAccess: policy.networkAccess,
        fileSystemAccess: policy.fileSystemAccess
      }
    };

    return context;
  }

  /**
   * Validate operation against policy
   * @param operation Operation name
   * @param policy Sandbox policy
   * @returns Validation result
   */
  private validateOperation(operation: string, policy: SandboxPolicy): {
    allowed: boolean;
    reason?: string;
  } {
    if (!policy.allowedOperations.includes(operation)) {
      return {
        allowed: false,
        reason: `Operation not in allowed list: ${operation}`
      };
    }

    return { allowed: true };
  }

  /**
   * Check for sandbox escape attempts
   * @param operation Operation name
   * @param parameters Operation parameters
   * @returns Escape detection result
   */
  private checkForSandboxEscape(operation: string, parameters: any): {
    detected: boolean;
    reason?: string;
  } {
    // Check for dangerous patterns in parameters
    const dangerousPatterns = [
      { pattern: /__proto__/, reason: 'Prototype pollution attempt' },
      { pattern: /constructor\.prototype/, reason: 'Prototype pollution attempt' },
      { pattern: /\.\.\/|\.\.\\/, reason: 'Path traversal attempt' },
      { pattern: /process\.env/i, reason: 'Environment variable access' },
      { pattern: /require\s*\(\s*['"`]child_process['"`]\s*\)/i, reason: 'Child process access' },
      { pattern: /require\s*\(\s*['"`]fs['"`]\s*\)/i, reason: 'File system access' },
      { pattern: /require\s*\(\s*['"`]net['"`]\s*\)/i, reason: 'Network access' }
    ];

    const paramString = JSON.stringify(parameters);
    for (const check of dangerousPatterns) {
      if (check.pattern.test(paramString)) {
        return { detected: true, reason: check.reason };
      }
    }

    return { detected: false };
  }

  /**
   * Execute operation with timeout
   * @param sandbox Sandbox instance
   * @param plugin Plugin module
   * @param operation Operation name
   * @param parameters Operation parameters
   * @param timeout Timeout in milliseconds
   * @returns Operation result
   */
  private async executeWithTimeout(
    sandbox: SandboxInstance,
    plugin: any,
    operation: string,
    parameters: any,
    timeout: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new PluginError(`Operation timeout: ${operation}`, 'TIMEOUT'));
      }, timeout);

      this.executeOperation(sandbox, plugin, operation, parameters)
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Execute operation in sandbox
   * @param sandbox Sandbox instance
   * @param plugin Plugin module
   * @param operation Operation name
   * @param parameters Operation parameters
   * @returns Operation result
   */
  private async executeOperation(
    sandbox: SandboxInstance,
    plugin: any,
    operation: string,
    parameters: any
  ): Promise<any> {
    // Update resource usage (simulated)
    sandbox.resources.memoryUsed += Math.random() * 1024; // Add some memory usage
    sandbox.resources.cpuUsed += Math.random() * 5; // Add some CPU usage

    // Execute in VM context
    try {
      if (plugin[operation]) {
        const script = new vm.Script(`
          (function() {
            return (typeof plugin.${operation} === 'function')
              ? plugin.${operation}(parameters)
              : undefined;
          })()
        `);

        return script.runInNewContext({
          plugin,
          parameters,
          ...sandbox.context
        });
      } else {
        throw new PluginError(`Plugin does not support operation: ${operation}`, 'OPERATION_NOT_SUPPORTED');
      }
    } catch (error) {
      throw new PluginError(`Execution failed: ${error}`, 'EXECUTION_ERROR');
    }
  }

  /**
   * Validate sandbox policy
   * @param policy Sandbox policy
   * @returns Validation result
   */
  private validatePolicy(policy: SandboxPolicy): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!policy.allowedOperations || policy.allowedOperations.length === 0) {
      errors.push('At least one allowed operation must be specified');
    }

    if (policy.resourceLimits.memory <= 0) {
      errors.push('Memory limit must be positive');
    }

    if (policy.resourceLimits.cpu < 0 || policy.resourceLimits.cpu > 100) {
      errors.push('CPU limit must be between 0 and 100');
    }

    if (policy.resourceLimits.maxExecutionTime <= 0) {
      errors.push('Max execution time must be positive');
    }

    if (policy.executionTimeout <= 0) {
      errors.push('Execution timeout must be positive');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check resource limits
   * @param sandboxId Sandbox ID
   * @returns Limit check result
   */
  private checkResourceLimits(sandboxId: string): {
    withinLimits: boolean;
    exceeded: string[];
  } {
    const sandbox = this.sandboxes.get(sandboxId);
    const policy = this.sandboxPolicies.get(sandboxId);

    if (!sandbox || !policy) {
      return { withinLimits: true, exceeded: [] };
    }

    const exceeded: string[] = [];
    const limits = policy.resourceLimits;

    if (sandbox.resources.memoryUsed > limits.memory) {
      exceeded.push('memory');
    }
    if (sandbox.resources.cpuUsed > limits.cpu) {
      exceeded.push('cpu');
    }
    if (sandbox.resources.diskUsed > limits.disk) {
      exceeded.push('disk');
    }

    return { withinLimits: exceeded.length === 0, exceeded };
  }

  /**
   * Record security violation
   * @param sandboxId Sandbox ID
   * @param violation Security violation
   */
  private recordSecurityViolation(sandboxId: string, violation: SecurityViolation): void {
    const violations = this.securityViolations.get(sandboxId) || [];
    violations.push(violation);
    this.securityViolations.set(sandboxId, violations);

    this.logger.warn(`Security violation recorded for sandbox ${sandboxId}:`, violation);
  }

  /**
   * Start resource monitoring
   * @param sandboxId Sandbox ID
   */
  private startResourceMonitoring(sandboxId: string): void {
    const monitor = setInterval(() => {
      const sandbox = this.sandboxes.get(sandboxId);
      if (!sandbox) {
        this.stopResourceMonitoring(sandboxId);
        return;
      }

      const limitCheck = this.checkResourceLimits(sandboxId);
      if (!limitCheck.withinLimits) {
        this.logger.warn(`Resource limits exceeded for sandbox ${sandboxId}: ${limitCheck.exceeded.join(', ')}`);
      }
    }, 5000); // Check every 5 seconds

    this.resourceMonitors.set(sandboxId, monitor);
  }

  /**
   * Stop resource monitoring
   * @param sandboxId Sandbox ID
   */
  private stopResourceMonitoring(sandboxId: string): void {
    const monitor = this.resourceMonitors.get(sandboxId);
    if (monitor) {
      clearTimeout(monitor);
      this.resourceMonitors.delete(sandboxId);
    }
  }

  /**
   * Create empty resource usage
   * @returns Empty resource usage
   */
  private createEmptyResourceUsage(): ResourceUsage {
    return {
      memoryUsed: 0,
      cpuUsed: 0,
      diskUsed: 0,
      networkUsed: 0,
      executionTime: 0,
      operationCount: 0,
      errorCount: 0
    };
  }
}
