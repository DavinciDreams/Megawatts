import { Logger } from '../../utils/logger';
import { PluginError, ValidationError } from '../../utils/errors';
import { PluginManifest } from './plugin-loader';

/**
 * Plugin registry entry
 */
export interface RegistryEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  dependencies: PluginDependency[];
  peerDependencies: PluginDependency[];
  metadata: PluginMetadata;
  registeredAt: Date;
  updatedAt: Date;
  installed: boolean;
  enabled: boolean;
  source?: string;
}

/**
 * Plugin dependency
 */
export interface PluginDependency {
  name: string;
  version: string;
  optional: boolean;
}

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  keywords?: string[];
  tags?: string[];
  categories?: string[];
  license?: string;
  homepage?: string;
  repository?: string;
  bugs?: string;
  icon?: string;
  screenshots?: string[];
  minMegawattsVersion?: string;
  maxMegawattsVersion?: string;
  permissions?: string[];
  capabilities?: string[];
}

/**
 * Dependency graph node
 */
export interface DependencyNode {
  pluginId: string;
  version: string;
  dependencies: string[];
  dependents: string[];
  depth: number;
}

/**
 * Version constraint
 */
export interface VersionConstraint {
  operator: '^' | '~' | '>' | '>=' | '<' | '<=' | '=';
  version: string;
}

/**
 * Version compatibility result
 */
export interface VersionCompatibility {
  compatible: boolean;
  currentVersion: string;
  requiredVersion: string;
  issues: string[];
}

/**
 * Marketplace plugin info
 */
export interface MarketplacePlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  downloads: number;
  rating: number;
  reviews: number;
  tags: string[];
  categories: string[];
  homepage?: string;
  repository?: string;
  icon?: string;
  screenshots?: string[];
  publishedAt: Date;
  updatedAt: Date;
}

/**
 * Marketplace search result
 */
export interface MarketplaceSearchResult {
  plugins: MarketplacePlugin[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Marketplace category
 */
export interface MarketplaceCategory {
  id: string;
  name: string;
  description: string;
  icon?: string;
  pluginCount: number;
}

/**
 * Plugin registry for version management, dependency resolution, and marketplace integration
 */
export class PluginRegistry {
  private logger: Logger;
  private plugins: Map<string, RegistryEntry> = new Map();
  private dependencyGraph: Map<string, DependencyNode> = new Map();
  private versionHistory: Map<string, string[]> = new Map();
  private marketplaceCache: Map<string, MarketplacePlugin[]> = new Map();
  private marketplaceCacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register plugin
   * @param manifest Plugin manifest
   * @param source Plugin source path
   * @returns Registration result
   */
  public async registerPlugin(
    manifest: PluginManifest,
    source?: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.logger.debug(`Registering plugin: ${manifest.id}`);

      // Validate plugin
      const validation = this.validatePlugin(manifest);
      if (!validation.valid) {
        throw new ValidationError(
          `Plugin validation failed: ${validation.errors.join(', ')}`,
          'id',
          'PLUGIN_VALIDATION'
        );
      }

      // Check if plugin already exists
      const existing = this.plugins.get(manifest.id);
      if (existing) {
        // Update existing
        await this.updatePlugin(manifest.id, manifest);
      } else {
        // Register new
        const entry: RegistryEntry = {
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          author: manifest.author,
          dependencies: manifest.dependencies || [],
          peerDependencies: manifest.peerDependencies || [],
          metadata: {
            keywords: manifest.keywords,
            license: manifest.license,
            homepage: manifest.homepage,
            repository: manifest.repository,
            minMegawattsVersion: manifest.minMegawattsVersion,
            maxMegawattsVersion: manifest.maxMegawattsVersion,
            permissions: manifest.permissions
          },
          registeredAt: new Date(),
          updatedAt: new Date(),
          installed: true,
          enabled: false,
          source
        };

        this.plugins.set(manifest.id, entry);

        // Add to version history
        if (!this.versionHistory.has(manifest.id)) {
          this.versionHistory.set(manifest.id, []);
        }
        this.versionHistory.get(manifest.id)!.push(manifest.version);

        // Update dependency graph
        this.updateDependencyGraph(manifest.id, manifest.dependencies || []);
      }

      this.logger.info(`Plugin registered successfully: ${manifest.id} v${manifest.version}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Plugin registration failed for ${manifest.id}:`, error as Error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Unregister plugin
   * @param pluginId Plugin ID
   * @returns Unregistration result
   */
  public async unregisterPlugin(pluginId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.logger.debug(`Unregistering plugin: ${pluginId}`);

      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
      }

      // Check if other plugins depend on this one
      const dependents = this.getDependents(pluginId);
      if (dependents.length > 0) {
        throw new PluginError(
          `Cannot unregister plugin: ${pluginId} - required by: ${dependents.join(', ')}`,
          'DEPENDENCY_CONFLICT'
        );
      }

      this.plugins.delete(pluginId);
      this.removeFromDependencyGraph(pluginId);
      this.versionHistory.delete(pluginId);

      this.logger.info(`Plugin unregistered successfully: ${pluginId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Plugin unregistration failed for ${pluginId}:`, error as Error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Update plugin
   * @param pluginId Plugin ID
   * @param manifest Updated manifest
   * @returns Update result
   */
  public async updatePlugin(
    pluginId: string,
    manifest: PluginManifest
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
      }

      // Update entry
      plugin.name = manifest.name;
      plugin.version = manifest.version;
      plugin.description = manifest.description;
      plugin.author = manifest.author;
      plugin.dependencies = manifest.dependencies || [];
      plugin.peerDependencies = manifest.peerDependencies || [];
      plugin.metadata = {
        keywords: manifest.keywords,
        license: manifest.license,
        homepage: manifest.homepage,
        repository: manifest.repository,
        minMegawattsVersion: manifest.minMegawattsVersion,
        maxMegawattsVersion: manifest.maxMegawattsVersion,
        permissions: manifest.permissions
      };
      plugin.updatedAt = new Date();

      // Add to version history
      if (!this.versionHistory.has(pluginId)) {
        this.versionHistory.set(pluginId, []);
      }
      const versions = this.versionHistory.get(pluginId)!;
      if (!versions.includes(manifest.version)) {
        versions.push(manifest.version);
      }

      // Update dependency graph
      this.updateDependencyGraph(pluginId, manifest.dependencies || []);

      this.logger.info(`Plugin updated successfully: ${pluginId} v${manifest.version}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Plugin update failed for ${pluginId}:`, error as Error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Get plugin
   * @param pluginId Plugin ID
   * @returns Plugin entry or undefined
   */
  public getPlugin(pluginId: string): RegistryEntry | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all plugins
   * @returns Array of plugin entries
   */
  public getAllPlugins(): RegistryEntry[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get installed plugins
   * @returns Array of installed plugin entries
   */
  public getInstalledPlugins(): RegistryEntry[] {
    return Array.from(this.plugins.values()).filter(p => p.installed);
  }

  /**
   * Get enabled plugins
   * @returns Array of enabled plugin entries
   */
  public getEnabledPlugins(): RegistryEntry[] {
    return Array.from(this.plugins.values()).filter(p => p.enabled);
  }

  /**
   * Search plugins
   * @param query Search query
   * @returns Search results
   */
  public searchPlugins(query: {
    name?: string;
    author?: string;
    tags?: string[];
    categories?: string[];
    keywords?: string[];
  }): Array<{
    plugin: RegistryEntry;
    matchScore: number;
  }> {
    const results: Array<{ plugin: RegistryEntry; matchScore: number }> = [];

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

      if (query.categories && plugin.metadata.categories) {
        for (const category of query.categories) {
          if (plugin.metadata.categories.includes(category)) {
            score += 25;
          }
        }
      }

      if (query.keywords && plugin.metadata.keywords) {
        for (const keyword of query.keywords) {
          if (plugin.metadata.keywords.includes(keyword)) {
            score += 15;
          }
        }
      }

      if (score > 0) {
        results.push({ plugin, matchScore: score });
      }
    }

    return results.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Get dependency tree
   * @param pluginId Plugin ID
   * @returns Dependency tree
   */
  public getDependencyTree(pluginId: string): {
    plugin: RegistryEntry;
    dependencies: Array<{
      plugin: RegistryEntry;
      dependencies: Array<{
        plugin: RegistryEntry;
        dependencies: RegistryEntry[];
      }>;
    }>;
  } {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
    }

    const buildDependencyTree = (pluginId: string): { plugin: RegistryEntry; dependencies: any[] } => {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
      }
      const dependencies = [];
      for (const dep of plugin.dependencies) {
        const depPlugin = this.plugins.get(dep.name);
        if (depPlugin) {
          dependencies.push(buildDependencyTree(dep.name));
        }
      }
      return { plugin, dependencies };
    };

    return buildDependencyTree(pluginId);
  }

  /**
   * Get dependency graph
   * @returns Dependency graph
   */
  public getDependencyGraph(): Map<string, DependencyNode> {
    return new Map(this.dependencyGraph);
  }

  /**
   * Get dependents
   * @param pluginId Plugin ID
   * @returns Array of dependent plugin IDs
   */
  public getDependents(pluginId: string): string[] {
    const node = this.dependencyGraph.get(pluginId);
    return node?.dependents || [];
  }

  /**
   * Get direct dependencies
   * @param pluginId Plugin ID
   * @returns Array of dependent plugin entries
   */
  public getDirectDependencies(pluginId: string): RegistryEntry[] {
    const node = this.dependencyGraph.get(pluginId);
    if (!node) return [];

    return node.dependencies
      .map(depId => this.plugins.get(depId))
      .filter((p): p is RegistryEntry => p !== undefined);
  }

  /**
   * Get version history
   * @param pluginId Plugin ID
   * @returns Array of versions
   */
  public getVersionHistory(pluginId: string): string[] {
    return this.versionHistory.get(pluginId) || [];
  }

  /**
   * Check version compatibility
   * @param pluginId Plugin ID
   * @param targetVersion Target version
   * @returns Compatibility result
   */
  public checkVersionCompatibility(
    pluginId: string,
    targetVersion: string
  ): VersionCompatibility {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
    }

    const issues: string[] = [];

    // Check min version
    if (plugin.metadata.minMegawattsVersion) {
      const minValid = this.checkVersionConstraint(
        targetVersion,
        `>=${plugin.metadata.minMegawattsVersion}`
      );
      if (!minValid) {
        issues.push(
          `Version ${targetVersion} is below minimum required ${plugin.metadata.minMegawattsVersion}`
        );
      }
    }

    // Check max version
    if (plugin.metadata.maxMegawattsVersion) {
      const maxValid = this.checkVersionConstraint(
        targetVersion,
        `<=${plugin.metadata.maxMegawattsVersion}`
      );
      if (!maxValid) {
        issues.push(
          `Version ${targetVersion} is above maximum allowed ${plugin.metadata.maxMegawattsVersion}`
        );
      }
    }

    return {
      compatible: issues.length === 0,
      currentVersion: plugin.version,
      requiredVersion: targetVersion,
      issues
    };
  }

  /**
   * Resolve dependencies
   * @param pluginId Plugin ID
   * @returns Resolution result
   */
  public resolveDependencies(pluginId: string): {
    resolved: boolean;
    missing: string[];
    conflicts: string[];
    resolutionOrder: string[];
  } {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginError(`Plugin not found: ${pluginId}`, 'PLUGIN_NOT_FOUND');
    }

    const missing: string[] = [];
    const conflicts: string[] = [];
    const resolutionOrder: string[] = [];

    if (plugin.dependencies.length === 0) {
      return { resolved: true, missing: [], conflicts: [], resolutionOrder: [pluginId] };
    }

    // Build dependency graph
    const graph = new Map<string, string[]>();
    const allPlugins = new Set<string>();

    allPlugins.add(pluginId);
    graph.set(pluginId, plugin.dependencies.map(d => d.name));

    for (const dep of plugin.dependencies) {
      allPlugins.add(dep.name);

      const depPlugin = this.plugins.get(dep.name);
      if (!depPlugin && !dep.optional) {
        missing.push(dep.name);
      } else if (depPlugin) {
        const versionMatch = this.checkVersionConstraint(
          depPlugin.version,
          dep.version
        );
        if (!versionMatch) {
          conflicts.push(
            `${dep.name}: required ${dep.version}, found ${depPlugin.version}`
          );
        }

        if (depPlugin.dependencies.length > 0) {
          graph.set(dep.name, depPlugin.dependencies.map(d => d.name));
          for (const subDep of depPlugin.dependencies) {
            allPlugins.add(subDep.name);
          }
        }
      }
    }

    // Topological sort
    try {
      const sorted = this.topologicalSort(graph);
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

    return { resolved, missing, conflicts, resolutionOrder };
  }

  /**
   * Search marketplace (placeholder)
   * @param query Search query
   * @param page Page number
   * @param pageSize Page size
   * @returns Search result
   */
  public async searchMarketplace(
    query: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<MarketplaceSearchResult> {
    this.logger.debug(`Searching marketplace: ${query}`);

    // Placeholder implementation
    // In a real implementation, this would call an API
    return {
      plugins: [],
      total: 0,
      page,
      pageSize
    };
  }

  /**
   * Get marketplace plugin (placeholder)
   * @param pluginId Plugin ID
   * @returns Marketplace plugin or undefined
   */
  public async getMarketplacePlugin(
    pluginId: string
  ): Promise<MarketplacePlugin | undefined> {
    this.logger.debug(`Getting marketplace plugin: ${pluginId}`);

    // Placeholder implementation
    // In a real implementation, this would call an API
    return undefined;
  }

  /**
   * Get marketplace categories (placeholder)
   * @returns Array of categories
   */
  public async getMarketplaceCategories(): Promise<MarketplaceCategory[]> {
    this.logger.debug('Getting marketplace categories');

    // Placeholder implementation
    // In a real implementation, this would call an API
    return [];
  }

  /**
   * Get registry statistics
   * @returns Statistics object
   */
  public getRegistryStatistics(): {
    totalPlugins: number;
    installedPlugins: number;
    enabledPlugins: number;
    totalDependencies: number;
    averageDependencies: number;
    mostRecent: Date;
    categories: Record<string, number>;
  } {
    const plugins = Array.from(this.plugins.values());
    const installedPlugins = plugins.filter(p => p.installed);
    const enabledPlugins = plugins.filter(p => p.enabled);
    const totalDependencies = plugins.reduce((sum, p) => sum + p.dependencies.length, 0);
    const categories: Record<string, number> = {};

    for (const plugin of plugins) {
      if (plugin.metadata.categories) {
        for (const category of plugin.metadata.categories) {
          categories[category] = (categories[category] || 0) + 1;
        }
      }
    }

    return {
      totalPlugins: plugins.length,
      installedPlugins: installedPlugins.length,
      enabledPlugins: enabledPlugins.length,
      totalDependencies,
      averageDependencies: plugins.length > 0 ? totalDependencies / plugins.length : 0,
      mostRecent: plugins.reduce(
        (latest, p) => (p.registeredAt > latest ? p.registeredAt : latest),
        new Date(0)
      ),
      categories
    };
  }

  /**
   * Clear registry
   */
  public clearRegistry(): void {
    this.plugins.clear();
    this.dependencyGraph.clear();
    this.versionHistory.clear();
    this.marketplaceCache.clear();
    this.marketplaceCacheExpiry.clear();
    this.logger.debug('Plugin registry cleared');
  }

  /**
   * Validate plugin
   * @param manifest Plugin manifest
   * @returns Validation result
   */
  private validatePlugin(manifest: PluginManifest): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!manifest.id) errors.push('Plugin ID is required');
    if (!manifest.name) errors.push('Plugin name is required');
    if (!manifest.version) errors.push('Plugin version is required');
    if (!manifest.author) errors.push('Plugin author is required');
    if (!manifest.main) errors.push('Plugin main file is required');

    // Validate version format
    if (manifest.version && !this.isValidVersion(manifest.version)) {
      errors.push(`Invalid version format: ${manifest.version}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Update dependency graph
   * @param pluginId Plugin ID
   * @param dependencies Dependencies array
   */
  private updateDependencyGraph(pluginId: string, dependencies: PluginDependency[]): void {
    const depNames = dependencies.map(dep => dep.name);

    // Update or create node
    let node = this.dependencyGraph.get(pluginId);
    if (!node) {
      node = {
        pluginId,
        version: this.plugins.get(pluginId)?.version || '0.0.0',
        dependencies: depNames,
        dependents: [],
        depth: 0
      };
      this.dependencyGraph.set(pluginId, node);
    } else {
      node.dependencies = depNames;
    }

    // Update dependents for each dependency
    for (const depName of depNames) {
      let depNode = this.dependencyGraph.get(depName);
      if (!depNode) {
        depNode = {
          pluginId: depName,
          version: this.plugins.get(depName)?.version || '0.0.0',
          dependencies: [],
          dependents: [],
          depth: 0
        };
        this.dependencyGraph.set(depName, depNode);
      }

      if (!depNode.dependents.includes(pluginId)) {
        depNode.dependents.push(pluginId);
      }
    }

    // Calculate depths
    this.calculateDepths();
  }

  /**
   * Remove from dependency graph
   * @param pluginId Plugin ID
   */
  private removeFromDependencyGraph(pluginId: string): void {
    const node = this.dependencyGraph.get(pluginId);
    if (!node) return;

    // Remove from dependents
    for (const depName of node.dependencies) {
      const depNode = this.dependencyGraph.get(depName);
      if (depNode) {
        depNode.dependents = depNode.dependents.filter(id => id !== pluginId);
      }
    }

    this.dependencyGraph.delete(pluginId);
    this.calculateDepths();
  }

  /**
   * Calculate depths for all nodes in the graph
   */
  private calculateDepths(): void {
    const visited = new Set<string>();
    const calculating = new Set<string>();

    const calculateDepth = (pluginId: string): number => {
      if (calculating.has(pluginId)) {
        throw new Error('Circular dependency detected');
      }
      if (visited.has(pluginId)) {
        return this.dependencyGraph.get(pluginId)?.depth || 0;
      }

      calculating.add(pluginId);
      const node = this.dependencyGraph.get(pluginId);
      if (!node) {
        calculating.delete(pluginId);
        visited.add(pluginId);
        return 0;
      }

      let maxDepDepth = 0;
      for (const depId of node.dependencies) {
        const depDepth = calculateDepth(depId);
        if (depDepth > maxDepDepth) {
          maxDepDepth = depDepth;
        }
      }

      node.depth = maxDepDepth + 1;
      calculating.delete(pluginId);
      visited.add(pluginId);

      return node.depth;
    };

    for (const pluginId of this.dependencyGraph.keys()) {
      if (!visited.has(pluginId)) {
        calculateDepth(pluginId);
      }
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
   * Check if version matches constraint
   * @param version Version string
   * @param constraint Version constraint
   * @returns True if matches
   */
  private checkVersionConstraint(version: string, constraint: string): boolean {
    const cleanVersion = version.replace(/-.*$/, '');
    const cleanConstraint = constraint.replace(/[\^~>=<]/, '');

    const vParts = cleanVersion.split('.').map(Number);
    const cParts = cleanConstraint.split('.').map(Number);

    if (constraint.startsWith('^')) {
      return vParts[0] === cParts[0] && vParts[1] >= cParts[1];
    } else if (constraint.startsWith('~')) {
      return vParts[0] === cParts[0] && vParts[1] === cParts[1] && vParts[2] >= cParts[2];
    } else if (constraint.startsWith('>=')) {
      return (
        vParts[0] > cParts[0] ||
        (vParts[0] === cParts[0] && vParts[1] > cParts[1]) ||
        (vParts[0] === cParts[0] && vParts[1] === cParts[1] && vParts[2] >= cParts[2])
      );
    } else if (constraint.startsWith('<=')) {
      return (
        vParts[0] < cParts[0] ||
        (vParts[0] === cParts[0] && vParts[1] < cParts[1]) ||
        (vParts[0] === cParts[0] && vParts[1] === cParts[1] && vParts[2] <= cParts[2])
      );
    } else {
      return version === constraint;
    }
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
