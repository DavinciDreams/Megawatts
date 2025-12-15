export interface Conversation {
  id: string;
  guildId?: string;
  channelId: string;
  userId?: string;
  type: 'dm' | 'group_dm' | 'text_channel' | 'voice_channel' | 'thread';
  title?: string;
  topic?: string;
  isArchived: boolean;
  isLocked: boolean;
  messageCount: number;
  lastMessageAt?: Date;
  lastMessageId?: string;
  participants: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  guildId?: string;
  channelId: string;
  authorId: string;
  content: string;
  type: 'default' | 'system' | 'command' | 'response' | 'error';
  messageType: number;
  embeds?: Record<string, any>[];
  attachments?: Record<string, any>[];
  mentions: {
    users: string[];
    roles: string[];
    channels: string[];
    everyone: boolean;
  };
  reactions: Record<string, { count: number; users: string[] }>;
  isEdited: boolean;
  editedAt?: Date;
  isPinned: boolean;
  webhookId?: string;
  reference?: {
    messageId: string;
    channelId: string;
    guildId?: string;
  };
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationContext {
  id: string;
  conversationId: string;
  userId: string;
  contextType: 'user_preferences' | 'conversation_history' | 'guild_context' | 'bot_memory' | 'custom_data';
  data: Record<string, any>;
  priority: number;
  expiresAt?: Date;
  isTemporary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationThread {
  id: string;
  parentMessageId: string;
  conversationId: string;
  guildId?: string;
  channelId: string;
  authorId: string;
  title?: string;
  messageCount: number;
  isArchived: boolean;
  isLocked: boolean;
  lastMessageAt?: Date;
  autoArchiveDuration?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationParticipant {
  id: string;
  conversationId: string;
  userId: string;
  joinedAt: Date;
  leftAt?: Date;
  role: 'owner' | 'admin' | 'moderator' | 'member';
  permissions: string[];
  isMuted: boolean;
  isBanned: boolean;
  lastReadAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Database schema definitions
export const CONVERSATION_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id VARCHAR(20),
    channel_id VARCHAR(20) NOT NULL,
    user_id VARCHAR(20),
    type VARCHAR(20) NOT NULL CHECK (type IN ('dm', 'group_dm', 'text_channel', 'voice_channel', 'thread')),
    title VARCHAR(255),
    topic TEXT,
    is_archived BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    message_count BIGINT DEFAULT 0,
    last_message_at TIMESTAMP WITH TIME ZONE,
    last_message_id VARCHAR(20),
    participants JSONB DEFAULT '[]',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_guild_id ON conversations(guild_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_channel_id ON conversations(channel_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type);
  CREATE INDEX IF NOT EXISTS idx_conversations_is_archived ON conversations(is_archived);
  CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at);
`;

export const MESSAGE_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    guild_id VARCHAR(20),
    channel_id VARCHAR(20) NOT NULL,
    author_id VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'default' CHECK (type IN ('default', 'system', 'command', 'response', 'error')),
    message_type INTEGER DEFAULT 0,
    embeds JSONB DEFAULT '[]',
    attachments JSONB DEFAULT '[]',
    mentions JSONB DEFAULT '{"users": [], "roles": [], "channels": [], "everyone": false}',
    reactions JSONB DEFAULT '{}',
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMP WITH TIME ZONE,
    is_pinned BOOLEAN DEFAULT FALSE,
    webhook_id VARCHAR(20),
    reference JSONB,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_messages_guild_id ON messages(guild_id);
  CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
  CREATE INDEX IF NOT EXISTS idx_messages_author_id ON messages(author_id);
  CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_edited_at ON messages(edited_at);
`;

export const CONVERSATION_CONTEXT_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS conversation_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    context_type VARCHAR(50) NOT NULL CHECK (context_type IN ('user_preferences', 'conversation_history', 'guild_context', 'bot_memory', 'custom_data')),
    data JSONB NOT NULL,
    priority INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_temporary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_conversation_context_conversation_id ON conversation_context(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_context_user_id ON conversation_context(user_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_context_type ON conversation_context(context_type);
  CREATE INDEX IF NOT EXISTS idx_conversation_context_priority ON conversation_context(priority);
  CREATE INDEX IF NOT EXISTS idx_conversation_context_expires_at ON conversation_context(expires_at);
`;

export const CONVERSATION_THREAD_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS conversation_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_message_id VARCHAR(20) NOT NULL,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    guild_id VARCHAR(20),
    channel_id VARCHAR(20) NOT NULL,
    author_id VARCHAR(20) NOT NULL,
    title VARCHAR(255),
    message_count BIGINT DEFAULT 0,
    is_archived BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    last_message_at TIMESTAMP WITH TIME ZONE,
    auto_archive_duration INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_conversation_threads_parent_message_id ON conversation_threads(parent_message_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_threads_conversation_id ON conversation_threads(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_threads_guild_id ON conversation_threads(guild_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_threads_channel_id ON conversation_threads(channel_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_threads_author_id ON conversation_threads(author_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_threads_is_archived ON conversation_threads(is_archived);
`;

export const CONVERSATION_PARTICIPANT_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
    permissions JSONB DEFAULT '[]',
    is_muted BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    last_read_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON conversation_participants(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_participants_role ON conversation_participants(role);
  CREATE INDEX IF NOT EXISTS idx_conversation_participants_is_muted ON conversation_participants(is_muted);
  CREATE INDEX IF NOT EXISTS idx_conversation_participants_is_banned ON conversation_participants(is_banned);
`;