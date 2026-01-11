import { Logger } from '../../utils/logger';
import { PluginError, ValidationError } from '../../utils/errors';
import { PluginLoader, LoadedPlugin, PluginManifest } from './plugin-loader';
import { PluginSandbox } from './plugin-sandbox';
import { PluginRegistry } from './plugin-registry';
import { EventEmitter } from 'events';

/**
 * Plugin state enum
 */
export enum PluginState {
  DISCOVERED = 'discovered',
  LOADING = 'loading',
  LOADED = 'loaded',
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  ERROR = 'error',
  UNLOADING = 'unloading',
  UNLOADED = 'unloaded'
}

/**
 * Plugin health status
 */
export enum PluginHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown'
}

/**
 * Plugin instance with state management
 */
export interface PluginInstance {
  id: string;
  manifest: PluginManifest;
  module: any;
  state: PluginState;
  health: PluginHealthStatus;
  enabled: boolean;
  loadedAt: Date;
  lastError?: Error;
  config: Record<string, any>;
  sandboxId?: string;
  metrics: PluginMetrics;
}

/**
 * Plugin metrics for health monitoring
 */
export interface PluginMetrics {
  executionCount: number;
  executionTime: number;
  errorCount: number;
  lastExecutionTime?: Date;
  averageExecutionTime: number;
  memoryUsage: number;
  cpuUsage: number;
}

/**
 * Plugin event types
 */
export enum PluginEventType {
  PLUGIN_DISCOVERED = 'plugin:discovered',
  PLUGIN_LOADING = 'plugin:loading',
  PLUGIN_LOADED = 'plugin:loaded',
  PLUGIN_ENABLED = 'plugin:enabled',
  PLUGIN_DISABLED = 'plugin:disabled',
  PLUGIN_ERROR = 'plugin:error',
  PLUGIN_UNLOADED = 'plugin:unloaded',
  PLUGIN_RELOADED = 'plugin:reloaded',
  PLUGIN_HEALTH_CHANGED = 'plugin:health-changed',
  PLUGIN_CONFIG_CHANGED = 'plugin:config-changed'
}

/**
 * Plugin event data
 */
export interface PluginEvent {
  type: PluginEventType;
  pluginId: string;
  timestamp: Date;
  data?: any;
  error?: Error;
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
  enabled: boolean;
  autoLoad: boolean;
  config: Record<string, any>;
  permissions: string[];
  sandbox: {
    enabled: boolean;
    resourceLimits: {
      memory: number;
      cpu: number;
      disk: number;
      networkBandwidth?: number;
      maxExecutionTime?: number;
    };
    networkAccess: boolean;
    fileSystemAccess: boolean;
  };
}

/**
 * Plugin health check result
 */
export interface PluginHealthCheck {
  pluginId: string;
  status: PluginHealthStatus;
  checks: Array<{
    name: string;
    passed: boolean;
    message?: string;
  }>;
  metrics: PluginMetrics;
  timestamp: Date;
}

/**
 * Plugin management system for lifecycle, state, events, and health monitoring
 */
export class PluginManager extends EventEmitter {
  private logger: Logger;
  private pluginLoader: PluginLoader;
  private pluginSandbox: PluginSandbox;
  private pluginRegistry: PluginRegistry;
  private plugins: Map<string, PluginInstance> = new Map();
  private defaultConfig: Partial<PluginConfig>;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthCheckMs: number = 60000; // 1 minute default

  constructor(
    logger: Logger,
    pluginLoader: PluginLoader,
    pluginSandbox: PluginSandbox,
    pluginRegistry: PluginRegistry,
    defaultConfig?: Partial<PluginConfig>
  ) {
    super();
    this.logger = logger;
    this.pluginLoader = pluginLoader;
    this.pluginSandbox = pluginSandbox;
    this.pluginRegistry = pluginRegistry;
    this.defaultConfig = defaultConfig || {};
    this.initializeHealthChecks();
  }

  /**
   * Load plugin
   * @param pluginId Plugin ID
   * @param pluginPath Plugin path
   * @param config Plugin configuration
   * @returns Load result
   */
  public async loadPlugin(
    pluginId: string,
    pluginPath: string,
    config?: Partial<PluginConfig>
  ): Promise<{
    success: boolean;
    plugin?: PluginInstance;
    error?: string;
  }> {
    try {
      this.logger.debug(`Loading plugin: ${pluginId}`);

      // Check if already loaded
      if (this.plugins.has(pluginId)) {
        throw new PluginError(`Plugin already loaded: ${pluginId}`, 'PLUGIN_ALREADY_LOADED');
      }

      this.emit(PluginEventType.PLUGIN_LOADING, this.createEvent(PluginEventType.PLUGIN_LOADING, pluginId));

      // Load plugin using loader
      const loadResult = await this.pluginLoader.loadFromSource(pluginPath, 'file');
      if (!loadResult.success || !loadResult.plugin) {
        throw new PluginError(`Failed to load plugin: ${loadResult.error}`, 'LOAD_FAILED');
      }

      // Resolve dependencies
      const resolution = await this.pluginLoader.resolveDependencies(loadResult.plugin.manifest);
      if (!resolution.resolved) {
        throw new PluginError(
          `Dependency resolution failed: ${resolution.missing.join(', ')}`,
          'DEPENDENCY_RESOLUTION_FAILED'
        );
      }

      // Merge configuration
      const mergedConfig = this.mergeConfig(config);

      // Create sandbox if enabled
      let sandboxId: string | undefined;
      if (mergedConfig.sandbox.enabled) {
        // Construct a SandboxPolicy object with all required properties
        const sandboxPolicy = {
          enabled: mergedConfig.sandbox.enabled,
          resourceLimits: {
            ...mergedConfig.sandbox.resourceLimits,
            networkBandwidth: mergedConfig.sandbox.resourceLimits.networkBandwidth ?? 10 * 1024 * 1024, // 10 MB/s default
            maxExecutionTime: mergedConfig.sandbox.resourceLimits.maxExecutionTime ?? 30000 // 30 seconds default
          },
          networkAccess: mergedConfig.sandbox.networkAccess,
          fileSystemAccess: mergedConfig.sandbox.fileSystemAccess,
          allowedOperations: [], // Provide sensible defaults or fetch from config
          executionTimeout: 30000, // 30 seconds default, adjust as needed
          maxMemoryUsage: mergedConfig.sandbox.resourceLimits.memory,
          maxCpuTime: mergedConfig.sandbox.resourceLimits.cpu
        };
        const sandboxResult = await this.pluginSandbox.createSandbox(pluginId, sandboxPolicy);
        if (!sandboxResult.success) {
          throw new PluginError(`Failed to create sandbox: ${sandboxResult.error}`, 'SANDBOX_ERROR');
        }
        sandboxId = sandboxResult.sandboxId;
      }

      // Create plugin instance
      const pluginInstance: PluginInstance = {
        id: pluginId,
        manifest: loadResult.plugin.manifest,
        module: loadResult.plugin.module,
        state: PluginState.LOADED,
        health: PluginHealthStatus.UNKNOWN,
        enabled: mergedConfig.enabled,
        loadedAt: new Date(),
        config: mergedConfig.config,
        sandboxId,
        metrics: {
          executionCount: 0,
          executionTime: 0,
          errorCount: 0,
          averageExecutionTime: 0,
          memoryUsage: 0,
          cpuUsage: 0
        }
      };

      this.plugins.set(pluginId, pluginInstance);

      // Initialize plugin
      await this.initializePlugin(pluginInstance);

      // Enable if configured
      if (mergedConfig.enabled) {
        await this.enablePlugin(pluginId);
      }

      this.emit(PluginEventType.PLUGIN_LOADED, this.createEvent(PluginEventType.PLUGIN_LOADED, pluginId));
      this.logger.info(`Plugin loaded successfully: ${pluginId}`);

      return { success: true, plugin: pluginInstance };
    } catch (error) {
      this.logger.error(`Plugin loading failed for ${pluginId}:`, error as Error);
      this.emit(PluginEventType.PLUGIN_ERROR, this.createEvent(PluginEventType.PLUGIN_ERROR, pluginId, undefined, error as Error));
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Unload plugin
   * @param pluginId Plugin ID
   * @returns Unload result
   */
  public async unloadPlugin(pluginId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.logger.debug(`Unloading plugin: ${pluginId}`);

      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
      }

      plugin.state = PluginState.UNLOADING;

      // Disable if enabled
      if (plugin.enabled) {
        await this.disablePlugin(pluginId);
      }

      // Cleanup plugin
      await this.cleanupPlugin(plugin);

      // Destroy sandbox if exists
      if (plugin.sandboxId) {
        await this.pluginSandbox.destroySandbox(plugin.sandboxId);
      }

      // Unload from loader
      await this.pluginLoader.unloadPlugin(pluginId);

      this.plugins.delete(pluginId);

      this.emit(PluginEventType.PLUGIN_UNLOADED, this.createEvent(PluginEventType.PLUGIN_UNLOADED, pluginId));
      this.logger.info(`Plugin unloaded successfully: ${pluginId}`);

      return { success: true };
    } catch (error) {
      this.logger.error(`Plugin unloading failed for ${pluginId}:`, error as Error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Reload plugin
   * @param pluginId Plugin ID
   * @returns Reload result
   */
  public async reloadPlugin(pluginId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.logger.debug(`Reloading plugin: ${pluginId}`);

      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
      }

      const pluginPath = this.pluginLoader.getLoadedPlugin(pluginId)?.path || '';
      const config = this.extractConfig(plugin);

      // Unload first
      const unloadResult = await this.unloadPlugin(pluginId);
      if (!unloadResult.success) {
        throw new PluginError(`Failed to unload plugin: ${unloadResult.error}`, 'UNLOAD_FAILED');
      }

      // Load again
      const loadResult = await this.loadPlugin(pluginId, pluginPath, config);

      if (loadResult.success) {
        this.emit(PluginEventType.PLUGIN_RELOADED, this.createEvent(PluginEventType.PLUGIN_RELOADED, pluginId));
        this.logger.info(`Plugin reloaded successfully: ${pluginId}`);
        return { success: true };
      } else {
        throw new PluginError(`Failed to reload plugin: ${loadResult.error}`, 'RELOAD_FAILED');
      }
    } catch (error) {
      this.logger.error(`Plugin reload failed for ${pluginId}:`, error as Error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Enable plugin
   * @param pluginId Plugin ID
   * @returns Enable result
   */
  public async enablePlugin(pluginId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.logger.debug(`Enabling plugin: ${pluginId}`);

      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
      }

      if (plugin.enabled) {
        return { success: true };
      }

      // Call plugin's enable method if exists
      if (plugin.module.enable && typeof plugin.module.enable === 'function') {
        await plugin.module.enable();
      }

      plugin.enabled = true;
      plugin.state = PluginState.ENABLED;

      this.emit(PluginEventType.PLUGIN_ENABLED, this.createEvent(PluginEventType.PLUGIN_ENABLED, pluginId));
      this.logger.info(`Plugin enabled: ${pluginId}`);

      return { success: true };
    } catch (error) {
      this.logger.error(`Plugin enable failed for ${pluginId}:`, error as Error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Disable plugin
   * @param pluginId Plugin ID
   * @returns Disable result
   */
  public async disablePlugin(pluginId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.logger.debug(`Disabling plugin: ${pluginId}`);

      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
      }

      if (!plugin.enabled) {
        return { success: true };
      }

      // Call plugin's disable method if exists
      if (plugin.module.disable && typeof plugin.module.disable === 'function') {
        await plugin.module.disable();
      }

      plugin.enabled = false;
      plugin.state = PluginState.DISABLED;

      this.emit(PluginEventType.PLUGIN_DISABLED, this.createEvent(PluginEventType.PLUGIN_DISABLED, pluginId));
      this.logger.info(`Plugin disabled: ${pluginId}`);

      return { success: true };
    } catch (error) {
      this.logger.error(`Plugin disable failed for ${pluginId}:`, error as Error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Get plugin
   * @param pluginId Plugin ID
   * @returns Plugin instance or undefined
   */
  public getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all plugins
   * @returns Array of plugin instances
   */
  public getAllPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugins by state
   * @param state Plugin state
   * @returns Array of plugin instances
   */
  public getPluginsByState(state: PluginState): PluginInstance[] {
    return Array.from(this.plugins.values()).filter(p => p.state === state);
  }

  /**
   * Get enabled plugins
   * @returns Array of enabled plugin instances
   */
  public getEnabledPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values()).filter(p => p.enabled);
  }

  /**
   * Get plugin state
   * @param pluginId Plugin ID
   * @returns Plugin state
   */
  public getPluginState(pluginId: string): PluginState {
    const plugin = this.plugins.get(pluginId);
    return plugin?.state ?? PluginState.UNLOADED;
  }

  /**
   * Execute plugin command
   * @param pluginId Plugin ID
   * @param command Command name
   * @param parameters Command parameters
   * @returns Execution result
   */
  public async executePluginCommand(
    pluginId: string,
    command: string,
    parameters: any = {}
  ): Promise<{
    success: boolean;
    result?: any;
    error?: string;
    executionTime: number;
  }> {
    const startTime = Date.now();
    const plugin = this.plugins.get(pluginId);

    try {
      if (!plugin) {
        throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
      }

      if (!plugin.enabled) {
        throw new PluginError(`Plugin is disabled: ${pluginId}`, 'PLUGIN_DISABLED');
      }

      if (!plugin.module.execute && !plugin.module[command]) {
        throw new PluginError(`Plugin does not support command: ${command}`, 'COMMAND_NOT_SUPPORTED');
      }

      let result: any;
      if (plugin.sandboxId) {
        // Execute in sandbox
        const sandboxResult = await this.pluginSandbox.executeInSandbox(
          plugin.sandboxId,
          plugin.module,
          command,
          parameters
        );
        if (!sandboxResult.success) {
          throw new PluginError(`Sandbox execution failed: ${sandboxResult.error}`, 'SANDBOX_EXECUTION_ERROR');
        }
        result = sandboxResult.result;
      } else {
        // Execute directly
        if (plugin.module[command]) {
          result = await plugin.module[command](parameters);
        } else if (plugin.module.execute) {
          result = await plugin.module.execute(command, parameters);
        }
      }

      const executionTime = Date.now() - startTime;

      // Update metrics
      plugin.metrics.executionCount++;
      plugin.metrics.executionTime += executionTime;
      plugin.metrics.averageExecutionTime = plugin.metrics.executionTime / plugin.metrics.executionCount;
      plugin.metrics.lastExecutionTime = new Date();

      this.logger.debug(`Plugin command executed: ${pluginId}.${command} (${executionTime}ms)`);
      return { success: true, result, executionTime };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (plugin) {
        plugin.metrics.errorCount++;
        plugin.lastError = error as Error;
      }

      this.logger.error(`Plugin command execution failed: ${pluginId}.${command}`, error as Error);
      return { success: false, error: error instanceof Error ? error.message : String(error), executionTime };
    }
  }

  /**
   * Send message to plugin
   * @param fromPluginId Source plugin ID
   * @param toPluginId Target plugin ID
   * @param message Message data
   * @returns Send result
   */
  public async sendPluginMessage(
    fromPluginId: string,
    toPluginId: string,
    message: any
  ): Promise<{
    success: boolean;
    response?: any;
    error?: string;
  }> {
    try {
      const fromPlugin = this.plugins.get(fromPluginId);
      const toPlugin = this.plugins.get(toPluginId);

      if (!toPlugin) {
        throw new PluginError(`Target plugin not found: ${toPluginId}`, 'PLUGIN_NOT_FOUND');
      }

      if (!toPlugin.enabled) {
        throw new PluginError(`Target plugin is disabled: ${toPluginId}`, 'PLUGIN_DISABLED');
      }

      // Check if target plugin supports message handling
      if (!toPlugin.module.onMessage || typeof toPlugin.module.onMessage !== 'function') {
        throw new PluginError(`Target plugin does not support messages: ${toPluginId}`, 'MESSAGES_NOT_SUPPORTED');
      }

      const response = await toPlugin.module.onMessage(fromPluginId, message);

      this.logger.debug(`Plugin message sent: ${fromPluginId} -> ${toPluginId}`);
      return { success: true, response };
    } catch (error) {
      this.logger.error(`Plugin message failed: ${fromPluginId} -> ${toPluginId}`, error as Error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Broadcast message to all enabled plugins
   * @param fromPluginId Source plugin ID
   * @param message Message data
   * @returns Array of results
   */
  public async broadcastPluginMessage(
    fromPluginId: string,
    message: any
  ): Promise<Array<{
    pluginId: string;
    success: boolean;
    response?: any;
    error?: string;
  }>> {
    const results: Array<{
      pluginId: string;
      success: boolean;
      response?: any;
      error?: string;
    }> = [];

    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.id === fromPluginId) continue;

      const result = await this.sendPluginMessage(fromPluginId, plugin.id, message);
      results.push({
        pluginId: plugin.id,
        ...result
      });
    }

    return results;
  }

  /**
   * Update plugin configuration
   * @param pluginId Plugin ID
   * @param config New configuration
   * @returns Update result
   */
  public async updatePluginConfig(
    pluginId: string,
    config: Partial<PluginConfig>
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
      }

      const oldConfig = this.extractConfig(plugin);
      const mergedConfig = this.mergeConfig(config);

      // Update plugin config
      plugin.config = mergedConfig.config;

      // Call plugin's config change handler if exists
      if (plugin.module.onConfigChange && typeof plugin.module.onConfigChange === 'function') {
        await plugin.module.onConfigChange(oldConfig, mergedConfig.config);
      }

      this.emit(PluginEventType.PLUGIN_CONFIG_CHANGED, this.createEvent(PluginEventType.PLUGIN_CONFIG_CHANGED, pluginId, {
        oldConfig,
        newConfig: mergedConfig.config
      }));

      this.logger.info(`Plugin configuration updated: ${pluginId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Plugin config update failed for ${pluginId}:`, error as Error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Get plugin configuration
   * @param pluginId Plugin ID
   * @returns Plugin configuration
   */
  public getPluginConfig(pluginId: string): PluginConfig | undefined {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return undefined;

    return this.extractConfig(plugin);
  }

  /**
   * Perform health check on plugin
   * @param pluginId Plugin ID
   * @returns Health check result
   */
  public async performHealthCheck(pluginId: string): Promise<PluginHealthCheck> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
    }

    const checks: Array<{
      name: string;
      passed: boolean;
      message?: string;
    }> = [];

    // Check if plugin is loaded
    checks.push({
      name: 'loaded',
      passed: plugin.state !== PluginState.UNLOADED,
      message: plugin.state === PluginState.UNLOADED ? 'Plugin is not loaded' : undefined
    });

    // Check if plugin is enabled
    checks.push({
      name: 'enabled',
      passed: plugin.enabled,
      message: !plugin.enabled ? 'Plugin is disabled' : undefined
    });

    // Check if plugin has no errors
    checks.push({
      name: 'no_errors',
      passed: plugin.lastError === undefined,
      message: plugin.lastError ? `Last error: ${plugin.lastError.message}` : undefined
    });

    // Check if plugin supports health check
    if (plugin.module.healthCheck && typeof plugin.module.healthCheck === 'function') {
      try {
        const healthResult = await plugin.module.healthCheck();
        checks.push({
          name: 'custom_health_check',
          passed: healthResult.healthy,
          message: healthResult.message
        });
      } catch (error) {
        checks.push({
          name: 'custom_health_check',
          passed: false,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Check sandbox health if applicable
    if (plugin.sandboxId) {
      const resourceUsage = this.pluginSandbox.checkResourceUsage(plugin.sandboxId);
      checks.push({
        name: 'sandbox_resources',
        passed: resourceUsage.withinLimits,
        message: !resourceUsage.withinLimits ? 'Resource limits exceeded' : undefined
      });
    }

    // Determine overall health
    const allPassed = checks.every(c => c.passed);
    const someFailed = checks.some(c => !c.passed);

    let health: PluginHealthStatus;
    if (allPassed) {
      health = PluginHealthStatus.HEALTHY;
    } else if (someFailed) {
      health = PluginHealthStatus.UNHEALTHY;
    } else {
      health = PluginHealthStatus.DEGRADED;
    }

    const healthCheck: PluginHealthCheck = {
      pluginId,
      status: health,
      checks,
      metrics: plugin.metrics,
      timestamp: new Date()
    };

    // Update plugin health
    if (plugin.health !== health) {
      const oldHealth = plugin.health;
      plugin.health = health;
      this.emit(PluginEventType.PLUGIN_HEALTH_CHANGED, this.createEvent(PluginEventType.PLUGIN_HEALTH_CHANGED, pluginId, {
        oldHealth,
        newHealth: health
      }));
    }

    return healthCheck;
  }

  /**
   * Get plugin statistics
   * @returns Statistics object
   */
  public getPluginStatistics(): {
    totalPlugins: number;
    enabledPlugins: number;
    disabledPlugins: number;
    pluginsByState: Record<string, number>;
    pluginsByHealth: Record<string, number>;
    totalExecutions: number;
    totalErrors: number;
    averageExecutionTime: number;
  } {
    const plugins = Array.from(this.plugins.values());
    const enabledPlugins = plugins.filter(p => p.enabled);
    const disabledPlugins = plugins.filter(p => !p.enabled);

    const pluginsByState: Record<string, number> = {};
    const pluginsByHealth: Record<string, number> = {};

    for (const plugin of plugins) {
      pluginsByState[plugin.state] = (pluginsByState[plugin.state] || 0) + 1;
      pluginsByHealth[plugin.health] = (pluginsByHealth[plugin.health] || 0) + 1;
    }

    const totalExecutions = plugins.reduce((sum, p) => sum + p.metrics.executionCount, 0);
    const totalErrors = plugins.reduce((sum, p) => sum + p.metrics.errorCount, 0);
    const averageExecutionTime = totalExecutions > 0
      ? plugins.reduce((sum, p) => sum + p.metrics.executionTime, 0) / totalExecutions
      : 0;

    return {
      totalPlugins: plugins.length,
      enabledPlugins: enabledPlugins.length,
      disabledPlugins: disabledPlugins.length,
      pluginsByState,
      pluginsByHealth,
      totalExecutions,
      totalErrors,
      averageExecutionTime
    };
  }

  /**
   * Unload all plugins
   * @returns Unload result
   */
  public async unloadAllPlugins(): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    const pluginIds = Array.from(this.plugins.keys());
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const pluginId of pluginIds) {
      const result = await this.unloadPlugin(pluginId);
      if (result.success) {
        success++;
      } else {
        failed++;
        errors.push(`${pluginId}: ${result.error}`);
      }
    }

    this.logger.info(`Unloaded ${success} plugins, ${failed} failed`);
    return { success, failed, errors };
  }

  /**
   * Check if plugin is loaded
   * @param pluginId Plugin ID
   * @returns True if loaded
   */
  public isPluginLoaded(pluginId: string): boolean {
    return this.plugins.has(pluginId) && this.plugins.get(pluginId)!.state !== PluginState.UNLOADED;
  }

  /**
   * Check if plugin is enabled
   * @param pluginId Plugin ID
   * @returns True if enabled
   */
  public isPluginEnabled(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    return plugin?.enabled ?? false;
  }

  /**
   * Register event listener
   * @param eventType Event type
   * @param listener Event listener
   */
  public onPluginEvent(eventType: PluginEventType, listener: (event: PluginEvent) => void): void {
    this.on(eventType, listener);
  }

  /**
   * Unregister event listener
   * @param eventType Event type
   * @param listener Event listener
   */
  public offPluginEvent(eventType: PluginEventType, listener: (event: PluginEvent) => void): void {
    this.off(eventType, listener);
  }

  /**
   * Set health check interval
   * @param ms Interval in milliseconds
   */
  public setHealthCheckInterval(ms: number): void {
    this.healthCheckMs = ms;
    this.initializeHealthChecks();
  }

  /**
   * Stop health checks
   */
  public stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Cleanup all resources
   */
  public async cleanup(): Promise<void> {
    this.logger.debug('Cleaning up plugin manager');

    this.stopHealthChecks();
    await this.unloadAllPlugins();

    this.removeAllListeners();
    this.logger.info('Plugin manager cleaned up');
  }

  /**
   * Initialize plugin
   * @param plugin Plugin instance
   */
  private async initializePlugin(plugin: PluginInstance): Promise<void> {
    if (plugin.module.initialize && typeof plugin.module.initialize === 'function') {
      await plugin.module.initialize(plugin.config);
    }
  }

  /**
   * Cleanup plugin
   * @param plugin Plugin instance
   */
  private async cleanupPlugin(plugin: PluginInstance): Promise<void> {
    if (plugin.module.cleanup && typeof plugin.module.cleanup === 'function') {
      try {
        await plugin.module.cleanup();
      } catch (error) {
        this.logger.warn(`Plugin cleanup failed for ${plugin.id}:`, error as Error);
      }
    }
  }

  /**
   * Merge configuration with defaults
   * @param config Partial configuration
   * @returns Merged configuration
   */
  private mergeConfig(config?: Partial<PluginConfig>): PluginConfig {
    return {
      enabled: config?.enabled ?? this.defaultConfig.enabled ?? true,
      autoLoad: config?.autoLoad ?? this.defaultConfig.autoLoad ?? false,
      config: { ...this.defaultConfig.config, ...config?.config },
      permissions: config?.permissions ?? this.defaultConfig.permissions ?? [],
      sandbox: {
        enabled: config?.sandbox?.enabled ?? this.defaultConfig.sandbox?.enabled ?? true,
        resourceLimits: {
          memory: config?.sandbox?.resourceLimits?.memory ?? this.defaultConfig.sandbox?.resourceLimits?.memory ?? 512 * 1024 * 1024, // 512MB
          cpu: config?.sandbox?.resourceLimits?.cpu ?? this.defaultConfig.sandbox?.resourceLimits?.cpu ?? 80, // 80%
          disk: config?.sandbox?.resourceLimits?.disk ?? this.defaultConfig.sandbox?.resourceLimits?.disk ?? 1024 * 1024 * 1024 // 1GB
        },
        networkAccess: config?.sandbox?.networkAccess ?? this.defaultConfig.sandbox?.networkAccess ?? false,
        fileSystemAccess: config?.sandbox?.fileSystemAccess ?? this.defaultConfig.sandbox?.fileSystemAccess ?? false
      }
    };
  }

  /**
   * Extract configuration from plugin instance
   * @param plugin Plugin instance
   * @returns Plugin configuration
   */
  private extractConfig(plugin: PluginInstance): PluginConfig {
    return {
      enabled: plugin.enabled,
      autoLoad: false,
      config: plugin.config,
      permissions: plugin.manifest.permissions || [],
      sandbox: {
        enabled: !!plugin.sandboxId,
        resourceLimits: {
          memory: 512 * 1024 * 1024,
          cpu: 80,
          disk: 1024 * 1024 * 1024
        },
        networkAccess: false,
        fileSystemAccess: false
      }
    };
  }

  /**
   * Create plugin event
   * @param type Event type
   * @param pluginId Plugin ID
   * @param data Event data
   * @param error Event error
   * @returns Plugin event
   */
  private createEvent(
    type: PluginEventType,
    pluginId: string,
    data?: any,
    error?: Error
  ): PluginEvent {
    return {
      type,
      pluginId,
      timestamp: new Date(),
      data,
      error
    };
  }

  /**
   * Initialize health checks
   */
  private initializeHealthChecks(): void {
    this.stopHealthChecks();

    if (this.healthCheckMs > 0) {
      this.healthCheckInterval = setInterval(async () => {
        for (const plugin of this.plugins.values()) {
          if (plugin.enabled) {
            try {
              await this.performHealthCheck(plugin.id);
            } catch (error) {
              this.logger.error(`Health check failed for plugin ${plugin.id}:`, error as Error);
            }
          }
        }
      }, this.healthCheckMs);
    }
  }
}
