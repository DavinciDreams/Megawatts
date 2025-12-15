export interface User {
  id: string;
  discordId: string;
  username: string;
  discriminator?: string;
  avatar?: string;
  email?: string;
  isBot: boolean;
  isSystem: boolean;
  status: 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  id: string;
  userId: string;
  timezone: string;
  language: string;
  theme: 'light' | 'dark' | 'auto';
  notifications: {
    enabled: boolean;
    mentions: boolean;
    dms: boolean;
    guildUpdates: boolean;
  };
  privacy: {
    showOnlineStatus: boolean;
    showActivity: boolean;
    allowDirectMessages: boolean;
  };
  botInteractions: {
    autoRespond: boolean;
    customCommands: boolean;
    aiFeatures: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface UserStats {
  id: string;
  userId: string;
  messageCount: number;
  commandCount: number;
  reactionCount: number;
  voiceMinutes: number;
  lastActiveAt: Date;
  guildCount: number;
  friendCount: number;
  achievements: string[];
  level: number;
  experience: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSession {
  id: string;
  userId: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
  lastActivityAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface UserActivity {
  id: string;
  userId: string;
  type: 'message' | 'command' | 'reaction' | 'voice_join' | 'voice_leave' | 'presence_change';
  guildId?: string;
  channelId?: string;
  messageId?: string;
  data?: Record<string, any>;
  timestamp: Date;
}

// Database schema definitions
export const USER_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id VARCHAR(20) UNIQUE NOT NULL,
    username VARCHAR(32) NOT NULL,
    discriminator VARCHAR(4),
    avatar VARCHAR(100),
    email VARCHAR(255),
    is_bot BOOLEAN DEFAULT FALSE,
    is_system BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'idle', 'dnd', 'invisible', 'offline')),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
  CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users(last_seen_at);
`;

export const USER_PREFERENCES_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    timezone VARCHAR(50) DEFAULT 'UTC',
    language VARCHAR(10) DEFAULT 'en',
    theme VARCHAR(10) DEFAULT 'auto' CHECK (theme IN ('light', 'dark', 'auto')),
    notifications JSONB DEFAULT '{"enabled": true, "mentions": true, "dms": true, "guildUpdates": false}',
    privacy JSONB DEFAULT '{"showOnlineStatus": true, "showActivity": true, "allowDirectMessages": true}',
    bot_interactions JSONB DEFAULT '{"autoRespond": true, "customCommands": true, "aiFeatures": true}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
`;

export const USER_STATS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS user_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_count BIGINT DEFAULT 0,
    command_count BIGINT DEFAULT 0,
    reaction_count BIGINT DEFAULT 0,
    voice_minutes BIGINT DEFAULT 0,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    guild_count INTEGER DEFAULT 0,
    friend_count INTEGER DEFAULT 0,
    achievements JSONB DEFAULT '[]',
    level INTEGER DEFAULT 1,
    experience BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_stats_level ON user_stats(level);
  CREATE INDEX IF NOT EXISTS idx_user_stats_experience ON user_stats(experience);
`;

export const USER_SESSIONS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON user_sessions(is_active);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
`;

export const USER_ACTIVITY_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS user_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('message', 'command', 'reaction', 'voice_join', 'voice_leave', 'presence_change')),
    guild_id VARCHAR(20),
    channel_id VARCHAR(20),
    message_id VARCHAR(20),
    data JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_activity_type ON user_activity(type);
  CREATE INDEX IF NOT EXISTS idx_user_activity_timestamp ON user_activity(timestamp);
  CREATE INDEX IF NOT EXISTS idx_user_activity_guild_id ON user_activity(guild_id);
`;