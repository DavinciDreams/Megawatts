export interface BotConfig {
  id: string;
  name: string;
  version: string;
  description?: string;
  avatar?: string;
  prefix: string;
  ownerId: string;
  guildId?: string;
  status: 'online' | 'idle' | 'dnd' | 'invisible';
  activity?: {
    type: 'playing' | 'streaming' | 'listening' | 'watching' | 'competing';
    name: string;
    url?: string;
  };
  permissions: {
    adminUsers: string[];
    adminRoles: string[];
    moderatorUsers: string[];
    moderatorRoles: string[];
  };
  features: {
    aiEnabled: boolean;
    selfEditingEnabled: boolean;
    analyticsEnabled: boolean;
    loggingEnabled: boolean;
    moderationEnabled: boolean;
  };
  settings: {
    maxMessageLength: number;
    commandCooldown: number;
    rateLimitEnabled: boolean;
    autoModEnabled: boolean;
    welcomeMessages: boolean;
    goodbyeMessages: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface BotCapability {
  id: string;
  name: string;
  description: string;
  category: 'ai' | 'moderation' | 'utility' | 'fun' | 'admin' | 'integration';
  isEnabled: boolean;
  config: Record<string, any>;
  permissions: string[];
  dependencies: string[];
  version: string;
  author: string;
  isCore: boolean;
  isBeta: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BotModification {
  id: string;
  type: 'code_change' | 'config_change' | 'feature_toggle' | 'bug_fix' | 'security_patch';
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  priority: 'low' | 'medium' | 'high' | 'critical';
  authorId: string;
  reviewerId?: string;
  changes: {
    files: Array<{
      path: string;
      oldContent?: string;
      newContent?: string;
      operation: 'create' | 'update' | 'delete';
    }>;
    dependencies?: string[];
    rollbackInstructions?: string;
  };
  metadata: {
    reason: string;
    impact: string;
    riskLevel: 'low' | 'medium' | 'high';
    estimatedTime?: number;
    actualTime?: number;
  };
  testing: {
    automatedTestsPassed: boolean;
    manualTestsPassed: boolean;
    testResults?: Record<string, any>;
  };
  deployment: {
    deployedAt?: Date;
    deployedBy?: string;
    rollbackAt?: Date;
    rollbackBy?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface BotState {
  id: string;
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  category: 'runtime' | 'config' | 'cache' | 'session' | 'analytics';
  isEncrypted: boolean;
  expiresAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BotPerformance {
  id: string;
  timestamp: Date;
  metrics: {
    memoryUsage: {
      used: number;
      total: number;
      percentage: number;
    };
    cpuUsage: {
      percentage: number;
      loadAverage: number[];
    };
    discordApi: {
      requests: number;
      errors: number;
      latency: number;
      rateLimitHits: number;
    };
    database: {
      connections: number;
      queries: number;
      errors: number;
      avgResponseTime: number;
    };
    cache: {
      hits: number;
      misses: number;
      hitRate: number;
      memoryUsage: number;
    };
    events: {
      processed: number;
      errors: number;
      avgProcessingTime: number;
    };
  };
  guildId?: string;
  userId?: string;
}

// Database schema definitions
export const BOT_CONFIG_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS bot_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    version VARCHAR(20) NOT NULL,
    description TEXT,
    avatar VARCHAR(255),
    prefix VARCHAR(10) NOT NULL,
    owner_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20),
    status VARCHAR(20) DEFAULT 'online' CHECK (status IN ('online', 'idle', 'dnd', 'invisible')),
    activity JSONB,
    permissions JSONB DEFAULT '{"adminUsers": [], "adminRoles": [], "moderatorUsers": [], "moderatorRoles": []}',
    features JSONB DEFAULT '{"aiEnabled": true, "selfEditingEnabled": true, "analyticsEnabled": true, "loggingEnabled": true, "moderationEnabled": false}',
    settings JSONB DEFAULT '{"maxMessageLength": 2000, "commandCooldown": 1000, "rateLimitEnabled": true, "autoModEnabled": false, "welcomeMessages": true, "goodbyeMessages": true}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_bot_config_owner_id ON bot_config(owner_id);
  CREATE INDEX IF NOT EXISTS idx_bot_config_guild_id ON bot_config(guild_id);
`;

export const BOT_CAPABILITY_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS bot_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL CHECK (category IN ('ai', 'moderation', 'utility', 'fun', 'admin', 'integration')),
    is_enabled BOOLEAN DEFAULT TRUE,
    config JSONB DEFAULT '{}',
    permissions JSONB DEFAULT '[]',
    dependencies JSONB DEFAULT '[]',
    version VARCHAR(20) NOT NULL,
    author VARCHAR(100) NOT NULL,
    is_core BOOLEAN DEFAULT FALSE,
    is_beta BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_bot_capabilities_name ON bot_capabilities(name);
  CREATE INDEX IF NOT EXISTS idx_bot_capabilities_category ON bot_capabilities(category);
  CREATE INDEX IF NOT EXISTS idx_bot_capabilities_is_enabled ON bot_capabilities(is_enabled);
  CREATE INDEX IF NOT EXISTS idx_bot_capabilities_is_core ON bot_capabilities(is_core);
`;

export const BOT_MODIFICATION_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS bot_modifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('code_change', 'config_change', 'feature_toggle', 'bug_fix', 'security_patch')),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'rolled_back')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    author_id VARCHAR(20) NOT NULL,
    reviewer_id VARCHAR(20),
    changes JSONB NOT NULL,
    metadata JSONB NOT NULL,
    testing JSONB DEFAULT '{"automatedTestsPassed": false, "manualTestsPassed": false}',
    deployment JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_bot_modifications_type ON bot_modifications(type);
  CREATE INDEX IF NOT EXISTS idx_bot_modifications_status ON bot_modifications(status);
  CREATE INDEX IF NOT EXISTS idx_bot_modifications_priority ON bot_modifications(priority);
  CREATE INDEX IF NOT EXISTS idx_bot_modifications_author_id ON bot_modifications(author_id);
  CREATE INDEX IF NOT EXISTS idx_bot_modifications_created_at ON bot_modifications(created_at);
`;

export const BOT_STATE_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS bot_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('string', 'number', 'boolean', 'object', 'array')),
    category VARCHAR(50) NOT NULL CHECK (category IN ('runtime', 'config', 'cache', 'session', 'analytics')),
    is_encrypted BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_bot_state_key ON bot_state(key);
  CREATE INDEX IF NOT EXISTS idx_bot_state_category ON bot_state(category);
  CREATE INDEX IF NOT EXISTS idx_bot_state_expires_at ON bot_state(expires_at);
  CREATE INDEX IF NOT EXISTS idx_bot_state_is_encrypted ON bot_state(is_encrypted);
`;

export const BOT_PERFORMANCE_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS bot_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metrics JSONB NOT NULL,
    guild_id VARCHAR(20),
    user_id VARCHAR(20)
  );

  CREATE INDEX IF NOT EXISTS idx_bot_performance_timestamp ON bot_performance(timestamp);
  CREATE INDEX IF NOT EXISTS idx_bot_performance_guild_id ON bot_performance(guild_id);
  CREATE INDEX IF NOT EXISTS idx_bot_performance_user_id ON bot_performance(user_id);
`;