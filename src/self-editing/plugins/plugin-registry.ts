import { Logger } from '../../../utils/logger';

/**
 * Plugin registry for version management and dependency resolution
 */
export class PluginRegistry {
  private logger: Logger;
  private plugins: Map<string, {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    dependencies: Array<{
      name: string;
      version: string;
      optional: boolean;
    }>;
    metadata: any;
    registeredAt: Date;
    updatedAt: Date;
  }> = new Map();

  private dependencyGraph: Map<string, string[]> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register plugin
   */
  public async registerPlugin(plugin: {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    dependencies?: Array<{
      name: string;
      version: string;
      optional: boolean;
    }>;
    metadata?: any;
  }): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.logger.debug(`Registering plugin: ${plugin.id}`);
      
      // Validate plugin
      const validation = this.validatePlugin(plugin);
      if (!validation.valid) {
        throw new Error(`Plugin validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Check dependencies
      if (plugin.dependencies) {
        const depCheck = this.checkDependencies(plugin.dependencies);
        if (!depCheck.satisfied) {
          throw new Error(`Dependencies not satisfied: ${depCheck.missing.join(', ')}`);
        }
      }
      
      const now = new Date();
      const pluginEntry = {
        ...plugin,
        dependencies: plugin.dependencies || [],
        metadata: plugin.metadata || {},
        registeredAt: now,
        updatedAt: now
      };
      
      this.plugins.set(plugin.id, pluginEntry);
      this.updateDependencyGraph(plugin.id, plugin.dependencies);
      
      this.logger.info(`Plugin registered successfully: ${plugin.id}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Plugin registration failed for ${plugin.id}:`, error);
      return { success: false, error: error.toString() };
    }
  }

  /**
   * Unregister plugin
   */
  public async unregisterPlugin(pluginId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.logger.debug(`Unregistering plugin: ${pluginId}`);
      
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }
      
      // Check if other plugins depend on this one
      const dependents = this.getDependents(pluginId);
      if (dependents.length > 0) {
        throw new Error(`Cannot unregister plugin: ${pluginId} - required by: ${dependents.join(', ')}`);
      }
      
      this.plugins.delete(pluginId);
      this.removeFromDependencyGraph(pluginId);
      
      this.logger.info(`Plugin unregistered successfully: ${pluginId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Plugin unregistration failed for ${pluginId}:`, error);
      return { success: false, error: error.toString() };
    }
  }

  /**
   * Get plugin
   */
  public getPlugin(pluginId: string): any {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all plugins
   */
  public getAllPlugins(): Array<{
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    dependencies: any[];
    metadata: any;
    registeredAt: Date;
    updatedAt: Date;
  }> {
    return Array.from(this.plugins.values());
  }

  /**
   * Search plugins
   */
  public searchPlugins(query: {
    name?: string;
    author?: string;
    tags?: string[];
  }): Array<{
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    matchScore: number;
  }> {
    const results = [];
    
    for (const plugin of this.plugins.values()) {
      let score = 0;
      
      if (query.name && plugin.name.toLowerCase().includes(query.name.toLowerCase())) {
        score += 50;
      }
      
      if (query.author && plugin.author.toLowerCase().includes(query.author.toLowerCase())) {
        score += 30;
      }
      
      if (query.tags && plugin.metadata.tags) {
        for (const tag of query.tags) {
          if (plugin.metadata.tags.includes(tag)) {
            score += 20;
          }
        }
      }
      
      if (score > 0) {
        results.push({
          id: plugin.id,
          name: plugin.name,
          version: plugin.version,
          description: plugin.description,
          author: plugin.author,
          matchScore: score
        });
      }
    }
    
    return results.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Get dependency tree
   */
  public getDependencyTree(pluginId: string): {
    plugin: any;
    dependencies: Array<{
      plugin: any;
      dependencies: any[];
    }>;
  } {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    const dependencies = [];
    for (const dep of plugin.dependencies) {
      const depPlugin = this.plugins.get(dep.name);
      if (depPlugin) {
        dependencies.push({
          plugin: depPlugin,
          dependencies: this.getDirectDependencies(dep.name)
        });
      }
    }
    
    return { plugin, dependencies };
  }

  /**
   * Check for updates
   */
  public async checkForUpdates(pluginId: string): Promise<{
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion?: string;
    updateInfo?: any;
  }> {
    try {
      this.logger.debug(`Checking for updates: ${pluginId}`);
      
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }
      
      // Mock update check
      const hasUpdate = Math.random() > 0.7; // 30% chance of update
      const latestVersion = hasUpdate ? this.generateNewVersion(plugin.version) : plugin.version;
      
      this.logger.debug(`Update check completed for ${pluginId}: ${hasUpdate ? 'update available' : 'up to date'}`);
      return {
        hasUpdate,
        currentVersion: plugin.version,
        latestVersion: hasUpdate ? latestVersion : undefined,
        updateInfo: hasUpdate ? {
          version: latestVersion,
          releaseDate: new Date(),
          changelog: ['Bug fixes', 'Performance improvements']
        } : undefined
      };
    } catch (error) {
      this.logger.error(`Update check failed for ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Validate plugin
   */
  private validatePlugin(plugin: any): {
    valid: boolean;
    errors: string[];
  } {
    const errors = [];
    
    if (!plugin.id) errors.push('Plugin ID is required');
    if (!plugin.name) errors.push('Plugin name is required');
    if (!plugin.version) errors.push('Plugin version is required');
    if (!plugin.author) errors.push('Plugin author is required');
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Check dependencies
   */
  private checkDependencies(dependencies: any[]): {
    satisfied: boolean;
    missing: string[];
  } {
    const missing = [];
    
    for (const dep of dependencies) {
      if (!dep.optional && !this.plugins.has(dep.name)) {
        missing.push(dep.name);
      }
    }
    
    return { satisfied: missing.length === 0, missing };
  }

  /**
   * Update dependency graph
   */
  private updateDependencyGraph(pluginId: string, dependencies: any[]): void {
    const depNames = dependencies.map(dep => dep.name);
    this.dependencyGraph.set(pluginId, depNames);
  }

  /**
   * Remove from dependency graph
   */
  private removeFromDependencyGraph(pluginId: string): void {
    this.dependencyGraph.delete(pluginId);
  }

  /**
   * Get dependents
   */
  private getDependents(pluginId: string): string[] {
    const dependents = [];
    
    for (const [id, deps] of this.dependencyGraph.entries()) {
      if (deps.includes(pluginId)) {
        dependents.push(id);
      }
    }
    
    return dependents;
  }

  /**
   * Get direct dependencies
   */
  private getDirectDependencies(pluginId: string): any[] {
    const deps = this.dependencyGraph.get(pluginId);
    if (!deps) return [];
    
    return deps.map(depId => this.plugins.get(depId)).filter(p => p);
  }

  /**
   * Generate new version
   */
  private generateNewVersion(currentVersion: string): string {
    const parts = currentVersion.split('.').map(Number);
    parts[2]++; // Increment patch version
    return parts.join('.');
  }

  /**
   * Get registry statistics
   */
  public getRegistryStatistics(): {
    totalPlugins: number;
    totalDependencies: number;
    averageDependencies: number;
    mostRecent: Date;
  } {
    const plugins = Array.from(this.plugins.values());
    const totalDependencies = plugins.reduce((sum, p) => sum + p.dependencies.length, 0);
    
    return {
      totalPlugins: plugins.length,
      totalDependencies,
      averageDependencies: plugins.length > 0 ? totalDependencies / plugins.length : 0,
      mostRecent: plugins.reduce((latest, p) => 
        p.registeredAt > latest ? p.registeredAt : latest, new Date(0)
      )
    };
  }

  /**
   * Clear registry
   */
  public clearRegistry(): void {
    this.plugins.clear();
    this.dependencyGraph.clear();
    this.logger.debug('Plugin registry cleared');
  }
}