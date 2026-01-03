/**
 * Plugin System Module
 * 
 * This module provides a comprehensive plugin loading and management system
 * for the Megawatts self-editing Discord bot.
 * 
 * Features:
 * - Dynamic plugin discovery from filesystem
 * - Plugin validation and security scanning
 * - Hot-reloading support
 * - Dependency resolution
 * - Version compatibility checking
 * - Sandboxed plugin execution
 * - Resource limiting and isolation
 * - Plugin lifecycle management
 * - Event-driven inter-plugin communication
 * - Health monitoring
 * - Plugin registry with metadata storage
 */

// Plugin Loader
export {
  PluginLoader,
  type PluginManifest,
  type PluginDependency,
  type LoadedPlugin,
  type PluginValidationResult,
  type SecurityIssue,
  type PluginDiscoveryResult,
  type HotReloadConfig,
  type VersionCompatibilityResult,
  type LoadingStrategy
} from './plugin-loader';

// Plugin Manager
export {
  PluginManager,
  type PluginInstance,
  type PluginState,
  type PluginHealthStatus,
  type PluginMetrics,
  type PluginEvent,
  type PluginEventType,
  type PluginConfig,
  type PluginHealthCheck
} from './plugin-manager';

// Plugin Registry
export {
  PluginRegistry,
  type RegistryEntry,
  type PluginMetadata,
  type DependencyNode,
  type VersionConstraint,
  type VersionCompatibility,
  type MarketplacePlugin,
  type MarketplaceSearchResult,
  type MarketplaceCategory
} from './plugin-registry';

// Plugin Sandbox
export {
  PluginSandbox,
  type SandboxPolicy,
  type ResourceLimits,
  type SandboxInstance,
  type ResourceUsage,
  type SandboxState,
  type SandboxExecutionResult,
  type SecurityViolation,
  type FileSystemOperation,
  type NetworkOperation
} from './plugin-sandbox';

/**
 * Plugin system factory for creating and initializing all components
 */
export class PluginSystemFactory {
  /**
   * Create a complete plugin system with all components
   * @param logger Logger instance
   * @param pluginDirectory Directory to scan for plugins
   * @param defaultConfig Default plugin configuration
   * @returns Object containing all plugin system components
   */
  public static createPluginSystem(
    logger: any,
    pluginDirectory: string = './plugins',
    defaultConfig?: any
  ) {
    const { PluginLoader } = require('./plugin-loader');
    const { PluginManager } = require('./plugin-manager');
    const { PluginSandbox } = require('./plugin-sandbox');
    const { PluginRegistry } = require('./plugin-registry');

    const pluginLoader = new PluginLoader(logger, pluginDirectory);
    const pluginSandbox = new PluginSandbox(logger);
    const pluginRegistry = new PluginRegistry(logger);
    const pluginManager = new PluginManager(
      logger,
      pluginLoader,
      pluginSandbox,
      pluginRegistry,
      defaultConfig
    );

    return {
      pluginLoader,
      pluginManager,
      pluginSandbox,
      pluginRegistry
    };
  }
}

/**
 * Default plugin system configuration
 */
export const DEFAULT_PLUGIN_CONFIG = {
  enabled: true,
  autoLoad: false,
  config: {},
  permissions: [],
  sandbox: {
    enabled: true,
    resourceLimits: {
      memory: 512 * 1024 * 1024, // 512MB
      cpu: 80, // 80%
      disk: 1024 * 1024 * 1024 // 1GB
    },
    networkAccess: false,
    fileSystemAccess: false
  }
};

/**
 * Default hot reload configuration
 */
export const DEFAULT_HOT_RELOAD_CONFIG = {
  enabled: false,
  watchPaths: ['./plugins'],
  debounceMs: 500,
  reloadOnFileChange: true
};

/**
 * Default sandbox policy
 */
export const DEFAULT_SANDBOX_POLICY = {
  allowedOperations: ['execute', 'initialize', 'cleanup'],
  resourceLimits: {
    memory: 512 * 1024 * 1024, // 512MB
    cpu: 80, // 80%
    disk: 1024 * 1024 * 1024, // 1GB
    networkBandwidth: 1024 * 1024, // 1MB/s
    maxExecutionTime: 30000 // 30 seconds
  },
  networkAccess: false,
  fileSystemAccess: false,
  executionTimeout: 30000, // 30 seconds
  maxMemoryUsage: 512 * 1024 * 1024, // 512MB
  maxCpuTime: 30000 // 30 seconds
};
