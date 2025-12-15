export interface Metric {
  id: string;
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  category: 'bot' | 'discord' | 'database' | 'cache' | 'ai' | 'moderation' | 'custom';
  tags?: Record<string, string>;
  timestamp: Date;
  guildId?: string;
  userId?: string;
  channelId?: string;
}

export interface Event {
  id: string;
  type: string;
  category: 'user_action' | 'bot_action' | 'system_event' | 'error' | 'performance' | 'security';
  data: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  guildId?: string;
  userId?: string;
  channelId?: string;
  sessionId?: string;
}

export interface PerformanceMetric {
  id: string;
  operation: string;
  category: 'database' | 'api' | 'cache' | 'ai' | 'discord' | 'internal';
  duration: number;
  success: boolean;
  errorCode?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  guildId?: string;
  userId?: string;
}

export interface UserAnalytics {
  id: string;
  userId: string;
  guildId?: string;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  metrics: {
    messageCount: number;
    commandCount: number;
    reactionCount: number;
    voiceMinutes: number;
    activeMinutes: number;
    uniqueChannels: number;
    uniqueUsersInteracted: number;
  };
  engagement: {
    score: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    rank: number;
  };
  timestamp: Date;
  createdAt: Date;
}

export interface GuildAnalytics {
  id: string;
  guildId: string;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  metrics: {
    totalUsers: number;
    activeUsers: number;
    messageCount: number;
    commandCount: number;
    voiceMinutes: number;
    newUsers: number;
    leftUsers: number;
  };
  activity: {
    peakHour: number;
    averageMessagesPerHour: number;
    mostActiveChannel: string;
    mostActiveUser: string;
  };
  botUsage: {
    commandsUsed: Record<string, number>;
    featuresUsed: Record<string, number>;
    errorRate: number;
    responseTime: number;
  };
  timestamp: Date;
  createdAt: Date;
}

export interface SystemHealth {
  id: string;
  timestamp: Date;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  checks: {
    database: {
      status: 'pass' | 'fail' | 'warn';
      responseTime: number;
      errorRate: number;
    };
    cache: {
      status: 'pass' | 'fail' | 'warn';
      hitRate: number;
      memoryUsage: number;
    };
    discord: {
      status: 'pass' | 'fail' | 'warn';
      latency: number;
      rateLimitHits: number;
    };
    ai: {
      status: 'pass' | 'fail' | 'warn';
      responseTime: number;
      errorRate: number;
    };
    memory: {
      status: 'pass' | 'fail' | 'warn';
      usage: number;
      available: number;
    };
    cpu: {
      status: 'pass' | 'fail' | 'warn';
      usage: number;
      loadAverage: number;
    };
  };
  alerts: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: Date;
  }>;
}

export interface AnalyticsReport {
  id: string;
  type: 'user' | 'guild' | 'bot' | 'performance' | 'security' | 'custom';
  period: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  startDate: Date;
  endDate: Date;
  data: Record<string, any>;
  charts: Array<{
    type: 'line' | 'bar' | 'pie' | 'area';
    title: string;
    data: any[];
    config: Record<string, any>;
  }>;
  insights: Array<{
    type: string;
    title: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
    recommendation?: string;
  }>;
  generatedAt: Date;
  generatedBy: string;
  isScheduled: boolean;
}

// Database schema definitions
export const METRICS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    value NUMERIC NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('counter', 'gauge', 'histogram', 'timer')),
    category VARCHAR(50) NOT NULL CHECK (category IN ('bot', 'discord', 'database', 'cache', 'ai', 'moderation', 'custom')),
    tags JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    guild_id VARCHAR(20),
    user_id VARCHAR(20),
    channel_id VARCHAR(20)
  );

  CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(name);
  CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(type);
  CREATE INDEX IF NOT EXISTS idx_metrics_category ON metrics(category);
  CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
  CREATE INDEX IF NOT EXISTS idx_metrics_guild_id ON metrics(guild_id);
  CREATE INDEX IF NOT EXISTS idx_metrics_user_id ON metrics(user_id);
`;

export const EVENTS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('user_action', 'bot_action', 'system_event', 'error', 'performance', 'security')),
    data JSONB NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    guild_id VARCHAR(20),
    user_id VARCHAR(20),
    channel_id VARCHAR(20),
    session_id VARCHAR(255)
  );

  CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
  CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_guild_id ON events(guild_id);
  CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
`;

export const PERFORMANCE_METRICS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('database', 'api', 'cache', 'ai', 'discord', 'internal')),
    duration NUMERIC NOT NULL,
    success BOOLEAN NOT NULL,
    error_code VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    guild_id VARCHAR(20),
    user_id VARCHAR(20)
  );

  CREATE INDEX IF NOT EXISTS idx_performance_metrics_operation ON performance_metrics(operation);
  CREATE INDEX IF NOT EXISTS idx_performance_metrics_category ON performance_metrics(category);
  CREATE INDEX IF NOT EXISTS idx_performance_metrics_success ON performance_metrics(success);
  CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp);
  CREATE INDEX IF NOT EXISTS idx_performance_metrics_guild_id ON performance_metrics(guild_id);
`;

export const USER_ANALYTICS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS user_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20),
    period VARCHAR(20) NOT NULL CHECK (period IN ('hourly', 'daily', 'weekly', 'monthly')),
    metrics JSONB NOT NULL,
    engagement JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, guild_id, period, timestamp)
  );

  CREATE INDEX IF NOT EXISTS idx_user_analytics_user_id ON user_analytics(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_analytics_guild_id ON user_analytics(guild_id);
  CREATE INDEX IF NOT EXISTS idx_user_analytics_period ON user_analytics(period);
  CREATE INDEX IF NOT EXISTS idx_user_analytics_timestamp ON user_analytics(timestamp);
`;

export const GUILD_ANALYTICS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS guild_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id VARCHAR(20) NOT NULL,
    period VARCHAR(20) NOT NULL CHECK (period IN ('hourly', 'daily', 'weekly', 'monthly')),
    metrics JSONB NOT NULL,
    activity JSONB NOT NULL,
    bot_usage JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(guild_id, period, timestamp)
  );

  CREATE INDEX IF NOT EXISTS idx_guild_analytics_guild_id ON guild_analytics(guild_id);
  CREATE INDEX IF NOT EXISTS idx_guild_analytics_period ON guild_analytics(period);
  CREATE INDEX IF NOT EXISTS idx_guild_analytics_timestamp ON guild_analytics(timestamp);
`;

export const SYSTEM_HEALTH_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS system_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'critical')),
    checks JSONB NOT NULL,
    alerts JSONB DEFAULT '[]'
  );

  CREATE INDEX IF NOT EXISTS idx_system_health_timestamp ON system_health(timestamp);
  CREATE INDEX IF NOT EXISTS idx_system_health_status ON system_health(status);
`;

export const ANALYTICS_REPORTS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS analytics_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('user', 'guild', 'bot', 'performance', 'security', 'custom')),
    period VARCHAR(20) NOT NULL CHECK (period IN ('hourly', 'daily', 'weekly', 'monthly', 'custom')),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    data JSONB NOT NULL,
    charts JSONB DEFAULT '[]',
    insights JSONB DEFAULT '[]',
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    generated_by VARCHAR(20) NOT NULL,
    is_scheduled BOOLEAN DEFAULT FALSE
  );

  CREATE INDEX IF NOT EXISTS idx_analytics_reports_type ON analytics_reports(type);
  CREATE INDEX IF NOT EXISTS idx_analytics_reports_period ON analytics_reports(period);
  CREATE INDEX IF NOT EXISTS idx_analytics_reports_generated_at ON analytics_reports(generated_at);
  CREATE INDEX IF NOT EXISTS idx_analytics_reports_is_scheduled ON analytics_reports(is_scheduled);
`;