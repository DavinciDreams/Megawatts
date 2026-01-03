import { Logger } from '../../utils/logger';
import { PluginError, ValidationError } from '../../utils/errors';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Plugin manifest interface defining the structure of plugin metadata
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  main: string;
  dependencies?: PluginDependency[];
  peerDependencies?: PluginDependency[];
  permissions?: string[];
  minMegawattsVersion?: string;
  maxMegawattsVersion?: string;
  keywords?: string[];
  license?: string;
  homepage?: string;
  repository?: string;
}

/**
 * Plugin dependency interface
 */
export interface PluginDependency {
  name: string;
  version: string;
  optional: boolean;
}

/**
 * Loaded plugin interface
 */
export interface LoadedPlugin {
  manifest: PluginManifest;
  module: any;
  path: string;
  loadedAt: Date;
  enabled: boolean;
}

/**
 * Plugin validation result
 */
export interface PluginValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  securityIssues: SecurityIssue[];
}

/**
 * Security issue found during plugin scanning
 */
export interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  location?: string;
  recommendation: string;
}

/**
 * Plugin discovery result
 */
export interface PluginDiscoveryResult {
  discovered: PluginManifest[];
  failed: Array<{ path: string; error: string }>;
}

/**
 * Hot reload configuration
 */
export interface HotReloadConfig {
  enabled: boolean;
  watchPaths: string[];
  debounceMs: number;
  reloadOnFileChange: boolean;
}

/**
 * Version compatibility check result
 */
export interface VersionCompatibilityResult {
  compatible: boolean;
  currentVersion: string;
  requiredVersion: string;
  issues: string[];
}

/**
 * Dynamic plugin loading system with discovery, validation, and hot-reloading
 */
export class PluginLoader {
  private logger: Logger;
  private loadedPlugins: Map<string, LoadedPlugin> = new Map();
  private loadingStrategies: Map<string, LoadingStrategy> = new Map();
  private hotReloadConfig: HotReloadConfig;
  private hotReloadWatchers: Map<string, fs.FSWatcher> = new Map();
  private pluginDirectory: string;

  constructor(logger: Logger, pluginDirectory: string = './plugins', hotReloadConfig?: Partial<HotReloadConfig>) {
    this.logger = logger;
    this.pluginDirectory = pluginDirectory;
    this.hotReloadConfig = {
      enabled: hotReloadConfig?.enabled ?? false,
      watchPaths: hotReloadConfig?.watchPaths ?? [pluginDirectory],
      debounceMs: hotReloadConfig?.debounceMs ?? 500,
      reloadOnFileChange: hotReloadConfig?.reloadOnFileChange ?? true
    };
    this.initializeStrategies();
  }

  /**
   * Discover plugins from the filesystem
   * @param searchPath Directory to search for plugins
   * @returns Discovered plugins and any failures
   */
  public async discoverPlugins(searchPath?: string): Promise<PluginDiscoveryResult> {
    const targetPath = searchPath || this.pluginDirectory;
    this.logger.debug(`Discovering plugins in: ${targetPath}`);

    const discovered: PluginManifest[] = [];
    const failed: Array<{ path: string; error: string }> = [];

    try {
      const entries = await fs.readdir(targetPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pluginPath = path.join(targetPath, entry.name);
        const manifestPath = path.join(pluginPath, 'plugin.json');
        const packagePath = path.join(pluginPath, 'package.json');

        try {
          let manifestPathToUse = '';
          if (await this.fileExists(manifestPath)) {
            manifestPathToUse = manifestPath;
          } else if (await this.fileExists(packagePath)) {
            manifestPathToUse = packagePath;
          } else {
            failed.push({ path: pluginPath, error: 'No plugin.json or package.json found' });
            continue;
          }

          const manifestContent = await fs.readFile(manifestPathToUse, 'utf-8');
          const manifest: PluginManifest = JSON.parse(manifestContent);

          // Validate manifest structure
          const validation = this.validateManifest(manifest);
          if (!validation.valid) {
            failed.push({ path: pluginPath, error: validation.errors.join(', ') });
            continue;
          }

          // Add path to manifest
          (manifest as any).path = pluginPath;
          discovered.push(manifest);

          this.logger.debug(`Discovered plugin: ${manifest.id} v${manifest.version}`);
        } catch (error) {
          failed.push({ path: pluginPath, error: error instanceof Error ? error.message : String(error) });
          this.logger.warn(`Failed to discover plugin at ${pluginPath}:`, error);
        }
      }

      this.logger.info(`Discovered ${discovered.length} plugins, ${failed.length} failed`);
      return { discovered, failed };
    } catch (error) {
      this.logger.error(`Plugin discovery failed for ${targetPath}:`, error);
      throw new PluginError('Plugin discovery failed', 'DISCOVERY_ERROR', { path: targetPath });
    }
  }

  /**
   * Load plugin from source
   * @param source Source path or identifier
   * @param type Type of source (file, url, package)
   * @returns Loaded plugin result
   */
  public async loadFromSource(
    source: string,
    type: 'file' | 'url' | 'package' = 'file'
  ): Promise<{
    success: boolean;
    plugin?: LoadedPlugin;
    error?: string;
  }> {
    try {
      this.logger.debug(`Loading plugin from ${type}: ${source}`);

      const strategy = this.loadingStrategies.get(type);
      if (!strategy) {
        throw new PluginError(`Loading strategy not found: ${type}`, 'STRATEGY_NOT_FOUND');
      }

      const loadResult = await strategy.load(source);
      if (!loadResult.success) {
        return { success: false, error: loadResult.error };
      }

      // Validate plugin
      const validation = await this.validatePlugin(loadResult.manifest, loadResult.code);
      if (!validation.valid) {
        return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };
      }

      // Check version compatibility
      const compatibility = this.checkVersionCompatibility(loadResult.manifest);
      if (!compatibility.compatible) {
        return { success: false, error: `Version compatibility check failed: ${compatibility.issues.join(', ')}` };
      }

      // Load module
      const module = await this.loadModule(loadResult.manifest, loadResult.code);

      const loadedPlugin: LoadedPlugin = {
        manifest: loadResult.manifest,
        module,
        path: source,
        loadedAt: new Date(),
        enabled: true
      };

      this.loadedPlugins.set(loadResult.manifest.id, loadedPlugin);

      this.logger.info(`Plugin loaded successfully: ${loadResult.manifest.id} v${loadResult.manifest.version}`);
      return { success: true, plugin: loadedPlugin };
    } catch (error) {
      this.logger.error(`Plugin loading failed from ${type} ${source}:`, error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Validate plugin manifest and code
   * @param manifest Plugin manifest
   * @param code Optional plugin code for security scanning
   * @returns Validation result
   */
  public async validatePlugin(manifest: PluginManifest, code?: string): Promise<PluginValidationResult> {
    try {
      this.logger.debug(`Validating plugin: ${manifest.id}`);

      const errors: string[] = [];
      const warnings: string[] = [];
      const securityIssues: SecurityIssue[] = [];

      // Validate manifest
      const manifestValidation = this.validateManifest(manifest);
      errors.push(...manifestValidation.errors);
      warnings.push(...manifestValidation.warnings);

      // Security scan if code provided
      if (code) {
        const securityScan = this.performSecurityScan(code);
        securityIssues.push(...securityScan);

        // Treat critical and high security issues as errors
        for (const issue of securityIssues) {
          if (issue.severity === 'critical' || issue.severity === 'high') {
            errors.push(`Security issue: ${issue.type} - ${issue.description}`);
          }
        }
      }

      // Validate dependencies
      if (manifest.dependencies) {
        const depValidation = this.validateDependencies(manifest.dependencies);
        errors.push(...depValidation.errors);
        warnings.push(...depValidation.warnings);
      }

      const valid = errors.length === 0;

      this.logger.debug(`Plugin validation completed for ${manifest.id}: ${valid ? 'valid' : 'invalid'}`);
      return { valid, errors, warnings, securityIssues };
    } catch (error) {
      this.logger.error(`Plugin validation failed for ${manifest.id}:`, error);
      throw error;
    }
  }

  /**
   * Resolve plugin dependencies
   * @param manifest Plugin manifest with dependencies
   * @returns Resolution result
   */
  public async resolveDependencies(manifest: PluginManifest): Promise<{
    resolved: boolean;
    missing: string[];
    conflicts: string[];
    resolutionOrder: string[];
  }> {
    this.logger.debug(`Resolving dependencies for: ${manifest.id}`);

    const missing: string[] = [];
    const conflicts: string[] = [];
    const resolutionOrder: string[] = [];

    if (!manifest.dependencies || manifest.dependencies.length === 0) {
      return { resolved: true, missing: [], conflicts: [], resolutionOrder: [manifest.id] };
    }

    // Build dependency graph
    const dependencyGraph = new Map<string, string[]>();
    const allPlugins = new Set<string>();

    // Add current plugin
    allPlugins.add(manifest.id);
    dependencyGraph.set(manifest.id, manifest.dependencies.map(d => d.name));

    // Add dependencies to graph
    for (const dep of manifest.dependencies) {
      allPlugins.add(dep.name);

      // Check if dependency is already loaded
      const loadedDep = this.loadedPlugins.get(dep.name);
      if (!loadedDep && !dep.optional) {
        missing.push(dep.name);
      } else if (loadedDep) {
        // Check version compatibility
        const versionMatch = this.checkVersionConstraint(loadedDep.manifest.version, dep.version);
        if (!versionMatch) {
          conflicts.push(`${dep.name}: required ${dep.version}, found ${loadedDep.manifest.version}`);
        }

        // Add dependencies of dependency
        if (loadedDep.manifest.dependencies) {
          dependencyGraph.set(dep.name, loadedDep.manifest.dependencies.map(d => d.name));
          for (const subDep of loadedDep.manifest.dependencies) {
            allPlugins.add(subDep.name);
          }
        }
      }
    }

    // Topological sort for resolution order
    try {
      const sorted = this.topologicalSort(dependencyGraph);
      resolutionOrder.push(...sorted);
    } catch (error) {
      return {
        resolved: false,
        missing,
        conflicts: [...conflicts, 'Circular dependency detected'],
        resolutionOrder: []
      };
    }

    const resolved = missing.length === 0 && conflicts.length === 0;

    this.logger.debug(`Dependency resolution for ${manifest.id}: ${resolved ? 'resolved' : 'failed'}`);
    return { resolved, missing, conflicts, resolutionOrder };
  }

  /**
   * Check version compatibility
   * @param manifest Plugin manifest
   * @returns Compatibility result
   */
  public checkVersionCompatibility(manifest: PluginManifest): VersionCompatibilityResult {
    const currentVersion = this.getCurrentMegawattsVersion();
    const issues: string[] = [];

    if (manifest.minMegawattsVersion) {
      const minValid = this.checkVersionConstraint(currentVersion, `>=${manifest.minMegawattsVersion}`);
      if (!minValid) {
        issues.push(`Current version ${currentVersion} is below minimum required ${manifest.minMegawattsVersion}`);
      }
    }

    if (manifest.maxMegawattsVersion) {
      const maxValid = this.checkVersionConstraint(currentVersion, `<=${manifest.maxMegawattsVersion}`);
      if (!maxValid) {
        issues.push(`Current version ${currentVersion} is above maximum allowed ${manifest.maxMegawattsVersion}`);
      }
    }

    return {
      compatible: issues.length === 0,
      currentVersion,
      requiredVersion: `${manifest.minMegawattsVersion || '0.0.0'} - ${manifest.maxMegawattsVersion || '*'}`,
      issues
    };
  }

  /**
   * Enable hot-reloading for plugins
   * @param pluginId Plugin to watch for changes
   */
  public async enableHotReload(pluginId: string): Promise<void> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin) {
      throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
    }

    if (!this.hotReloadConfig.enabled) {
      throw new PluginError('Hot reload is not enabled', 'HOT_RELOAD_DISABLED');
    }

    this.logger.debug(`Enabling hot reload for plugin: ${pluginId}`);

    try {
      // Watch for file changes
      const watcher = fs.watch(plugin.path, { recursive: true }, async (eventType, filename) => {
        if (filename && this.hotReloadConfig.reloadOnFileChange) {
          this.logger.debug(`File changed for plugin ${pluginId}: ${filename}`);

          // Debounce reload
          setTimeout(async () => {
            try {
              await this.reloadPlugin(pluginId);
              this.logger.info(`Hot reload successful for plugin: ${pluginId}`);
            } catch (error) {
              this.logger.error(`Hot reload failed for plugin ${pluginId}:`, error);
            }
          }, this.hotReloadConfig.debounceMs);
        }
      });

      this.hotReloadWatchers.set(pluginId, watcher);
      this.logger.info(`Hot reload enabled for plugin: ${pluginId}`);
    } catch (error) {
      this.logger.error(`Failed to enable hot reload for ${pluginId}:`, error);
      throw new PluginError(`Failed to enable hot reload: ${error}`, 'HOT_RELOAD_ERROR');
    }
  }

  /**
   * Disable hot-reloading for a plugin
   * @param pluginId Plugin to stop watching
   */
  public async disableHotReload(pluginId: string): Promise<void> {
    const watcher = this.hotReloadWatchers.get(pluginId);
    if (watcher) {
      await watcher.close();
      this.hotReloadWatchers.delete(pluginId);
      this.logger.debug(`Hot reload disabled for plugin: ${pluginId}`);
    }
  }

  /**
   * Reload a plugin
   * @param pluginId Plugin to reload
   */
  public async reloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin) {
      throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
    }

    this.logger.debug(`Reloading plugin: ${pluginId}`);

    // Unload first
    await this.unloadPlugin(pluginId);

    // Reload from source
    const loadResult = await this.loadFromSource(plugin.path, 'file');
    if (!loadResult.success || !loadResult.plugin) {
      throw new PluginError(`Failed to reload plugin: ${loadResult.error}`, 'RELOAD_ERROR');
    }

    this.logger.info(`Plugin reloaded successfully: ${pluginId}`);
  }

  /**
   * Unload a plugin
   * @param pluginId Plugin to unload
   */
  public async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin) {
      throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
    }

    this.logger.debug(`Unloading plugin: ${pluginId}`);

    // Call cleanup if available
    if (plugin.module && typeof plugin.module.cleanup === 'function') {
      try {
        await plugin.module.cleanup();
      } catch (error) {
        this.logger.warn(`Plugin cleanup failed for ${pluginId}:`, error);
      }
    }

    // Disable hot reload if active
    await this.disableHotReload(pluginId);

    this.loadedPlugins.delete(pluginId);
    this.logger.info(`Plugin unloaded: ${pluginId}`);
  }

  /**
   * Get loaded plugin
   * @param pluginId Plugin ID
   * @returns Loaded plugin or undefined
   */
  public getLoadedPlugin(pluginId: string): LoadedPlugin | undefined {
    return this.loadedPlugins.get(pluginId);
  }

  /**
   * Get all loaded plugins
   * @returns Array of loaded plugins
   */
  public getAllLoadedPlugins(): LoadedPlugin[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Check if plugin is loaded
   * @param pluginId Plugin ID
   * @returns True if loaded
   */
  public isPluginLoaded(pluginId: string): boolean {
    return this.loadedPlugins.has(pluginId);
  }

  /**
   * Get supported loading types
   * @returns Array of supported types
   */
  public getSupportedTypes(): string[] {
    return Array.from(this.loadingStrategies.keys());
  }

  /**
   * Add custom loading strategy
   * @param type Type identifier
   * @param strategy Loading strategy
   */
  public addLoadingStrategy(type: string, strategy: LoadingStrategy): void {
    this.loadingStrategies.set(type, strategy);
    this.logger.debug(`Added loading strategy: ${type}`);
  }

  /**
   * Remove loading strategy
   * @param type Type identifier
   * @returns True if removed
   */
  public removeLoadingStrategy(type: string): boolean {
    const removed = this.loadingStrategies.delete(type);
    if (removed) {
      this.logger.debug(`Removed loading strategy: ${type}`);
    }
    return removed;
  }

  /**
   * Update hot reload configuration
   * @param config New configuration
   */
  public updateHotReloadConfig(config: Partial<HotReloadConfig>): void {
    this.hotReloadConfig = { ...this.hotReloadConfig, ...config };
    this.logger.debug('Hot reload configuration updated');
  }

  /**
   * Cleanup all resources
   */
  public async cleanup(): Promise<void> {
    this.logger.debug('Cleaning up plugin loader');

    // Unload all plugins
    for (const pluginId of this.loadedPlugins.keys()) {
      await this.unloadPlugin(pluginId);
    }

    // Close all watchers
    for (const watcher of this.hotReloadWatchers.values()) {
      await watcher.close();
    }
    this.hotReloadWatchers.clear();

    this.logger.info('Plugin loader cleaned up');
  }

  /**
   * Initialize loading strategies
   */
  private initializeStrategies(): void {
    // File loading strategy
    this.loadingStrategies.set('file', {
      load: async (source: string) => {
        const pluginPath = path.resolve(source);
        const manifestPath = path.join(pluginPath, 'plugin.json');
        const packagePath = path.join(pluginPath, 'package.json');
        const mainPath = path.join(pluginPath, 'index.js');

        // Read manifest
        let manifestPathToUse = '';
        if (await this.fileExists(manifestPath)) {
          manifestPathToUse = manifestPath;
        } else if (await this.fileExists(packagePath)) {
          manifestPathToUse = packagePath;
        } else {
          throw new PluginError('No plugin.json or package.json found', 'MANIFEST_NOT_FOUND');
        }

        const manifestContent = await fs.readFile(manifestPathToUse, 'utf-8');
        const manifest: PluginManifest = JSON.parse(manifestContent);

        // Read main file
        const code = await fs.readFile(mainPath, 'utf-8');

        return { success: true, manifest, code, error: undefined };
      }
    });

    // URL loading strategy
    this.loadingStrategies.set('url', {
      load: async (source: string) => {
        // Placeholder for URL loading
        throw new PluginError('URL loading not yet implemented', 'NOT_IMPLEMENTED');
      }
    });

    // Package loading strategy
    this.loadingStrategies.set('package', {
      load: async (source: string) => {
        // Placeholder for package loading
        throw new PluginError('Package loading not yet implemented', 'NOT_IMPLEMENTED');
      }
    });

    this.logger.debug('Loading strategies initialized');
  }

  /**
   * Validate manifest structure
   * @param manifest Plugin manifest
   * @returns Validation result
   */
  private validateManifest(manifest: PluginManifest): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!manifest.id) errors.push('Plugin ID is required');
    if (!manifest.name) errors.push('Plugin name is required');
    if (!manifest.version) errors.push('Plugin version is required');
    if (!manifest.author) errors.push('Plugin author is required');
    if (!manifest.main) errors.push('Plugin main file is required');

    // Validate version format
    if (manifest.version && !this.isValidVersion(manifest.version)) {
      errors.push(`Invalid version format: ${manifest.version}`);
    }

    // Validate dependencies
    if (manifest.dependencies) {
      const depValidation = this.validateDependencies(manifest.dependencies);
      errors.push(...depValidation.errors);
      warnings.push(...depValidation.warnings);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate dependencies
   * @param dependencies Dependencies array
   * @returns Validation result
   */
  private validateDependencies(dependencies: PluginDependency[]): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const dep of dependencies) {
      if (!dep.name) {
        errors.push('Dependency missing name');
      }
      if (!dep.version) {
        warnings.push(`Dependency ${dep.name} missing version constraint`);
      }
      if (dep.version && !this.isValidVersionConstraint(dep.version)) {
        errors.push(`Invalid version constraint for ${dep.name}: ${dep.version}`);
      }
    }

    return { errors, warnings };
  }

  /**
   * Perform security scan on plugin code
   * @param code Plugin code
   * @returns Security issues found
   */
  private performSecurityScan(code: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    // Check for dangerous patterns
    const dangerousPatterns = [
      { pattern: /eval\s*\(/i, type: 'eval_usage', severity: 'critical' as const, desc: 'Use of eval() function' },
      { pattern: /Function\s*\(/i, type: 'function_constructor', severity: 'critical' as const, desc: 'Use of Function constructor' },
      { pattern: /require\s*\(\s*['"`]child_process['"`]\s*\)/i, type: 'child_process', severity: 'high' as const, desc: 'Use of child_process module' },
      { pattern: /require\s*\(\s*['"`]fs['"`]\s*\)/i, type: 'filesystem_access', severity: 'medium' as const, desc: 'Use of filesystem module' },
      { pattern: /require\s*\(\s*['"`]net['"`]\s*\)/i, type: 'network_access', severity: 'medium' as const, desc: 'Use of network module' },
      { pattern: /require\s*\(\s*['"`]http['"`]\s*\)/i, type: 'http_access', severity: 'medium' as const, desc: 'Use of HTTP module' },
      { pattern: /require\s*\(\s*['"`]https['"`]\s*\)/i, type: 'https_access', severity: 'medium' as const, desc: 'Use of HTTPS module' },
      { pattern: /process\.env/i, type: 'env_access', severity: 'low' as const, desc: 'Access to environment variables' },
      { pattern: /__dirname|__filename/i, type: 'path_exposure', severity: 'low' as const, desc: 'Exposure of file paths' }
    ];

    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const check of dangerousPatterns) {
        if (check.pattern.test(line)) {
          issues.push({
            severity: check.severity,
            type: check.type,
            description: check.desc,
            location: `Line ${i + 1}`,
            recommendation: this.getSecurityRecommendation(check.type)
          });
        }
      }
    }

    return issues;
  }

  /**
   * Get security recommendation for issue type
   * @param type Issue type
   * @returns Recommendation string
   */
  private getSecurityRecommendation(type: string): string {
    const recommendations: Record<string, string> = {
      eval_usage: 'Avoid using eval(). Use safer alternatives like JSON.parse() or function calls.',
      function_constructor: 'Avoid using Function constructor. Use regular function declarations or arrow functions.',
      child_process: 'Avoid direct child process usage. Use sandboxed execution environment.',
      filesystem_access: 'Limit filesystem access to specific directories. Use sandboxed file operations.',
      network_access: 'Restrict network access to specific endpoints. Use sandboxed network operations.',
      http_access: 'Use provided HTTP client with proper security headers and validation.',
      https_access: 'Use provided HTTP client with proper security headers and validation.',
      env_access: 'Use configuration system instead of direct environment variable access.',
      path_exposure: 'Avoid exposing file paths. Use relative paths or configured directories.'
    };
    return recommendations[type] || 'Review and ensure this operation is safe and necessary.';
  }

  /**
   * Load plugin module
   * @param manifest Plugin manifest
   * @param code Plugin code
   * @returns Loaded module
   */
  private async loadModule(manifest: PluginManifest, code: string): Promise<any> {
    try {
      const pluginPath = path.join((manifest as any).path || this.pluginDirectory, manifest.main);
      const absolutePath = path.resolve(pluginPath);

      // Dynamic import
      const module = await import(absolutePath);

      // Validate module structure
      if (!module.default && !module.initialize) {
        throw new PluginError('Plugin must export a default export or initialize function', 'INVALID_PLUGIN_STRUCTURE');
      }

      return module;
    } catch (error) {
      this.logger.error(`Failed to load module for ${manifest.id}:`, error);
      throw new PluginError(`Module load failed: ${error}`, 'MODULE_LOAD_ERROR');
    }
  }

  /**
   * Check if file exists
   * @param filePath File path
   * @returns True if exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if version string is valid
   * @param version Version string
   * @returns True if valid
   */
  private isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version);
  }

  /**
   * Check if version constraint is valid
   * @param constraint Version constraint
   * @returns True if valid
   */
  private isValidVersionConstraint(constraint: string): boolean {
    return /^[\^~><=]*\d+\.\d+\.\d+/.test(constraint);
  }

  /**
   * Check if version matches constraint
   * @param version Version string
   * @param constraint Version constraint
   * @returns True if matches
   */
  private checkVersionConstraint(version: string, constraint: string): boolean {
    // Simplified version constraint checking
    const cleanVersion = version.replace(/-.*$/, '');
    const cleanConstraint = constraint.replace(/[\^~>=<]/, '');

    const vParts = cleanVersion.split('.').map(Number);
    const cParts = cleanConstraint.split('.').map(Number);

    if (constraint.startsWith('^')) {
      // Caret: compatible with changes that don't break backwards compatibility
      return vParts[0] === cParts[0] && vParts[1] >= cParts[1];
    } else if (constraint.startsWith('~')) {
      // Tilde: compatible with changes in the last digit
      return vParts[0] === cParts[0] && vParts[1] === cParts[1] && vParts[2] >= cParts[2];
    } else if (constraint.startsWith('>=')) {
      // Greater than or equal
      return vParts[0] > cParts[0] || (vParts[0] === cParts[0] && vParts[1] > cParts[1]) || (vParts[0] === cParts[0] && vParts[1] === cParts[1] && vParts[2] >= cParts[2]);
    } else if (constraint.startsWith('<=')) {
      // Less than or equal
      return vParts[0] < cParts[0] || (vParts[0] === cParts[0] && vParts[1] < cParts[1]) || (vParts[0] === cParts[0] && vParts[1] === cParts[1] && vParts[2] <= cParts[2]);
    } else {
      // Exact match
      return version === constraint;
    }
  }

  /**
   * Get current Megawatts version
   * @returns Version string
   */
  private getCurrentMegawattsVersion(): string {
    // In a real implementation, this would read from package.json
    return '1.0.0';
  }

  /**
   * Topological sort for dependency resolution
   * @param graph Dependency graph
   * @returns Sorted array of plugin IDs
   */
  private topologicalSort(graph: Map<string, string[]>): string[] {
    const visited = new Set<string>();
    const temp = new Set<string>();
    const result: string[] = [];

    const visit = (node: string) => {
      if (temp.has(node)) {
        throw new Error('Circular dependency detected');
      }
      if (visited.has(node)) {
        return;
      }

      temp.add(node);
      const deps = graph.get(node) || [];
      for (const dep of deps) {
        visit(dep);
      }
      temp.delete(node);
      visited.add(node);
      result.push(node);
    };

    for (const node of graph.keys()) {
      visit(node);
    }

    return result;
  }
}

/**
 * Loading strategy interface
 */
export interface LoadingStrategy {
  load: (source: string) => Promise<{
    success: boolean;
    manifest?: PluginManifest;
    code?: string;
    error?: string;
  }>;
}
