export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: 'core' | 'ai' | 'moderation' | 'utility' | 'fun' | 'integration' | 'custom';
  status: 'active' | 'inactive' | 'error' | 'updating' | 'installing' | 'uninstalling';
  isEnabled: boolean;
  isCore: boolean;
  isBeta: boolean;
  dependencies: string[];
  permissions: string[];
  config: Record<string, any>;
  metadata: {
    repository?: string;
    homepage?: string;
    documentation?: string;
    license?: string;
    keywords?: string[];
    installDate?: Date;
    lastUpdated?: Date;
    downloadCount?: number;
    rating?: number;
  };
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastCheck: Date;
    errorCount: number;
    lastError?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: 'ai' | 'moderation' | 'utility' | 'fun' | 'admin' | 'integration' | 'custom';
  pluginId: string;
  isEnabled: boolean;
  isBuiltIn: boolean;
  config: {
    parameters: Array<{
      name: string;
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required: boolean;
      description: string;
      default?: any;
      validation?: {
        min?: number;
        max?: number;
        pattern?: string;
        enum?: any[];
      };
    }>;
    permissions: string[];
    rateLimit?: {
      max: number;
      window: number;
      per?: 'user' | 'guild' | 'global';
    };
    timeout?: number;
  };
  usage: {
    totalUses: number;
    uniqueUsers: number;
    averageResponseTime: number;
    errorRate: number;
    lastUsed?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface PluginCommand {
  id: string;
  pluginId: string;
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  category: string;
  permissions: string[];
  cooldown: number;
  guildOnly: boolean;
  dmOnly: boolean;
  ownerOnly: boolean;
  nsfw: boolean;
  isEnabled: boolean;
  config: Record<string, any>;
  usageStats: {
    totalUses: number;
    uniqueUsers: number;
    averageResponseTime: number;
    errorRate: number;
    lastUsed?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface PluginEvent {
  id: string;
  pluginId: string;
  eventName: string;
  handler: string;
  priority: number;
  isEnabled: boolean;
  config: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PluginDependency {
  id: string;
  pluginId: string;
  dependencyId: string;
  version: string;
  isOptional: boolean;
  isSatisfied: boolean;
  installedVersion?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PluginPermission {
  id: string;
  pluginId: string;
  name: string;
  description: string;
  category: 'user' | 'guild' | 'bot' | 'system' | 'external';
  isRequired: boolean;
  isGranted: boolean;
  grantedBy?: string;
  grantedAt?: Date;
  expiresAt?: Date;
  conditions?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PluginConfig {
  id: string;
  pluginId: string;
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  isEncrypted: boolean;
  isPublic: boolean;
  description?: string;
  validation?: {
    required: boolean;
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
  defaultValue?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface PluginLog {
  id: string;
  pluginId: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  data?: Record<string, any>;
  stack?: string;
  timestamp: Date;
  guildId?: string;
  userId?: string;
  channelId?: string;
}

export interface PluginMetrics {
  id: string;
  pluginId: string;
  timestamp: Date;
  metrics: {
    memoryUsage: number;
    cpuUsage: number;
    requestCount: number;
    errorCount: number;
    averageResponseTime: number;
    activeConnections: number;
  };
  guildId?: string;
}

// Database schema definitions
export const PLUGIN_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS plugins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    version VARCHAR(20) NOT NULL,
    description TEXT,
    author VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('core', 'ai', 'moderation', 'utility', 'fun', 'integration', 'custom')),
    status VARCHAR(20) DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error', 'updating', 'installing', 'uninstalling')),
    is_enabled BOOLEAN DEFAULT FALSE,
    is_core BOOLEAN DEFAULT FALSE,
    is_beta BOOLEAN DEFAULT FALSE,
    dependencies JSONB DEFAULT '[]',
    permissions JSONB DEFAULT '[]',
    config JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    health JSONB DEFAULT '{"status": "healthy", "lastCheck": null, "errorCount": 0}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_plugins_name ON plugins(name);
  CREATE INDEX IF NOT EXISTS idx_plugins_category ON plugins(category);
  CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
  CREATE INDEX IF NOT EXISTS idx_plugins_is_enabled ON plugins(is_enabled);
  CREATE INDEX IF NOT EXISTS idx_plugins_is_core ON plugins(is_core);
`;

export const TOOL_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL CHECK (category IN ('ai', 'moderation', 'utility', 'fun', 'admin', 'integration', 'custom')),
    plugin_id UUID REFERENCES plugins(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT TRUE,
    is_built_in BOOLEAN DEFAULT FALSE,
    config JSONB NOT NULL,
    usage JSONB DEFAULT '{"totalUses": 0, "uniqueUsers": 0, "averageResponseTime": 0, "errorRate": 0}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(plugin_id, name)
  );

  CREATE INDEX IF NOT EXISTS idx_tools_plugin_id ON tools(plugin_id);
  CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(name);
  CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category);
  CREATE INDEX IF NOT EXISTS idx_tools_is_enabled ON tools(is_enabled);
  CREATE INDEX IF NOT EXISTS idx_tools_is_built_in ON tools(is_built_in);
`;

export const PLUGIN_COMMAND_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS plugin_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id UUID REFERENCES plugins(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    aliases JSONB DEFAULT '[]',
    description TEXT,
    usage TEXT,
    category VARCHAR(50),
    permissions JSONB DEFAULT '[]',
    cooldown INTEGER DEFAULT 0,
    guild_only BOOLEAN DEFAULT FALSE,
    dm_only BOOLEAN DEFAULT FALSE,
    owner_only BOOLEAN DEFAULT FALSE,
    nsfw BOOLEAN DEFAULT FALSE,
    is_enabled BOOLEAN DEFAULT TRUE,
    config JSONB DEFAULT '{}',
    usage_stats JSONB DEFAULT '{"totalUses": 0, "uniqueUsers": 0, "averageResponseTime": 0, "errorRate": 0}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(plugin_id, name)
  );

  CREATE INDEX IF NOT EXISTS idx_plugin_commands_plugin_id ON plugin_commands(plugin_id);
  CREATE INDEX IF NOT EXISTS idx_plugin_commands_name ON plugin_commands(name);
  CREATE INDEX IF NOT EXISTS idx_plugin_commands_category ON plugin_commands(category);
  CREATE INDEX IF NOT EXISTS idx_plugin_commands_is_enabled ON plugin_commands(is_enabled);
`;

export const PLUGIN_EVENT_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS plugin_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id UUID REFERENCES plugins(id) ON DELETE CASCADE,
    event_name VARCHAR(100) NOT NULL,
    handler VARCHAR(255) NOT NULL,
    priority INTEGER DEFAULT 0,
    is_enabled BOOLEAN DEFAULT TRUE,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(plugin_id, event_name)
  );

  CREATE INDEX IF NOT EXISTS idx_plugin_events_plugin_id ON plugin_events(plugin_id);
  CREATE INDEX IF NOT EXISTS idx_plugin_events_event_name ON plugin_events(event_name);
  CREATE INDEX IF NOT EXISTS idx_plugin_events_priority ON plugin_events(priority);
  CREATE INDEX IF NOT EXISTS idx_plugin_events_is_enabled ON plugin_events(is_enabled);
`;

export const PLUGIN_DEPENDENCY_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS plugin_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id UUID REFERENCES plugins(id) ON DELETE CASCADE,
    dependency_id UUID REFERENCES plugins(id) ON DELETE CASCADE,
    version VARCHAR(20) NOT NULL,
    is_optional BOOLEAN DEFAULT FALSE,
    is_satisfied BOOLEAN DEFAULT FALSE,
    installed_version VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(plugin_id, dependency_id)
  );

  CREATE INDEX IF NOT EXISTS idx_plugin_dependencies_plugin_id ON plugin_dependencies(plugin_id);
  CREATE INDEX IF NOT EXISTS idx_plugin_dependencies_dependency_id ON plugin_dependencies(dependency_id);
  CREATE INDEX IF NOT EXISTS idx_plugin_dependencies_is_satisfied ON plugin_dependencies(is_satisfied);
`;

export const PLUGIN_PERMISSION_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS plugin_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id UUID REFERENCES plugins(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL CHECK (category IN ('user', 'guild', 'bot', 'system', 'external')),
    is_required BOOLEAN DEFAULT FALSE,
    is_granted BOOLEAN DEFAULT FALSE,
    granted_by VARCHAR(20),
    granted_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    conditions JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(plugin_id, name)
  );

  CREATE INDEX IF NOT EXISTS idx_plugin_permissions_plugin_id ON plugin_permissions(plugin_id);
  CREATE INDEX IF NOT EXISTS idx_plugin_permissions_name ON plugin_permissions(name);
  CREATE INDEX IF NOT EXISTS idx_plugin_permissions_category ON plugin_permissions(category);
  CREATE INDEX IF NOT EXISTS idx_plugin_permissions_is_granted ON plugin_permissions(is_granted);
`;

export const PLUGIN_CONFIG_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS plugin_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id UUID REFERENCES plugins(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('string', 'number', 'boolean', 'object', 'array')),
    is_encrypted BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT TRUE,
    description TEXT,
    validation JSONB DEFAULT '{}',
    default_value JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(plugin_id, key)
  );

  CREATE INDEX IF NOT EXISTS idx_plugin_config_plugin_id ON plugin_config(plugin_id);
  CREATE INDEX IF NOT EXISTS idx_plugin_config_key ON plugin_config(key);
  CREATE INDEX IF NOT EXISTS idx_plugin_config_is_encrypted ON plugin_config(is_encrypted);
  CREATE INDEX IF NOT EXISTS idx_plugin_config_is_public ON plugin_config(is_public);
`;

export const PLUGIN_LOG_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS plugin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id UUID REFERENCES plugins(id) ON DELETE CASCADE,
    level VARCHAR(10) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    message TEXT NOT NULL,
    data JSONB,
    stack TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    guild_id VARCHAR(20),
    user_id VARCHAR(20),
    channel_id VARCHAR(20)
  );

  CREATE INDEX IF NOT EXISTS idx_plugin_logs_plugin_id ON plugin_logs(plugin_id);
  CREATE INDEX IF NOT EXISTS idx_plugin_logs_level ON plugin_logs(level);
  CREATE INDEX IF NOT EXISTS idx_plugin_logs_timestamp ON plugin_logs(timestamp);
  CREATE INDEX IF NOT EXISTS idx_plugin_logs_guild_id ON plugin_logs(guild_id);
`;

export const PLUGIN_METRICS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS plugin_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id UUID REFERENCES plugins(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metrics JSONB NOT NULL,
    guild_id VARCHAR(20)
  );

  CREATE INDEX IF NOT EXISTS idx_plugin_metrics_plugin_id ON plugin_metrics(plugin_id);
  CREATE INDEX IF NOT EXISTS idx_plugin_metrics_timestamp ON plugin_metrics(timestamp);
  CREATE INDEX IF NOT EXISTS idx_plugin_metrics_guild_id ON plugin_metrics(guild_id);
`;