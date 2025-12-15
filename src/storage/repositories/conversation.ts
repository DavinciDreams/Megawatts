import { BaseRepository } from './base';
import { PostgresConnectionManager } from '../database';
import { Conversation, Message, ConversationContext, ConversationThread, ConversationParticipant } from '../models';
import { RepositoryError, RepositoryErrorCode } from '../errors';

// Helper function for error logging
const logError = (logger: any, message: string, error: any) => {
  logger.error(message, error instanceof Error ? error : new Error(String(error)));
};

export class ConversationRepository extends BaseRepository<Conversation> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'conversations');
  }

  protected mapRowToEntity(row: any): Conversation {
    return {
      id: row.id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      topic: row.topic,
      isArchived: row.is_archived,
      isLocked: row.is_locked,
      messageCount: parseInt(row.message_count),
      lastMessageAt: row.last_message_at,
      lastMessageId: row.last_message_id,
      participants: row.participants,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected getEntityName(): string {
    return 'Conversation';
  }

  async findByChannelId(channelId: string): Promise<Conversation | null> {
    try {
      const query = `SELECT * FROM conversations WHERE channel_id = $1`;
      const result = await this.db.query(query, [channelId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logError(this.logger, 'Failed to find conversation by channel ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find conversation by channel ID',
        { channelId, error: error instanceof Error ? error.message : String(error) },
        'Conversation',
        channelId,
        'findByChannelId'
      );
    }
  }

  async findByUserId(userId: string): Promise<Conversation[]> {
    try {
      const query = `
        SELECT * FROM conversations 
        WHERE user_id = $1 OR $1 = ANY(participants)
        ORDER BY last_message_at DESC
      `;
      const result = await this.db.query(query, [userId]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to find conversations by user ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find conversations by user ID',
        { userId, error: error instanceof Error ? error.message : String(error) },
        'Conversation',
        userId,
        'findByUserId'
      );
    }
  }

  async findByGuildId(guildId: string): Promise<Conversation[]> {
    try {
      const query = `
        SELECT * FROM conversations 
        WHERE guild_id = $1 
        ORDER BY last_message_at DESC
      `;
      const result = await this.db.query(query, [guildId]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to find conversations by guild ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find conversations by guild ID',
        { guildId, error: error instanceof Error ? error.message : String(error) },
        'Conversation',
        guildId,
        'findByGuildId'
      );
    }
  }

  async updateMessageCount(conversationId: string, increment: number = 1): Promise<void> {
    try {
      const query = `
        UPDATE conversations 
        SET message_count = message_count + $1, last_message_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `;
      await this.db.query(query, [increment, conversationId]);
    } catch (error) {
      logError(this.logger, 'Failed to update message count:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to update message count',
        { conversationId, increment, error: error instanceof Error ? error.message : String(error) },
        'Conversation',
        conversationId,
        'updateMessageCount'
      );
    }
  }

  async addParticipant(conversationId: string, userId: string): Promise<void> {
    try {
      const query = `
        UPDATE conversations 
        SET participants = array_append(participants, $1), updated_at = NOW()
        WHERE id = $2 AND NOT ($1 = ANY(participants))
      `;
      await this.db.query(query, [userId, conversationId]);
    } catch (error) {
      logError(this.logger, 'Failed to add participant:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to add participant',
        { conversationId, userId, error: error instanceof Error ? error.message : String(error) },
        'Conversation',
        conversationId,
        'addParticipant'
      );
    }
  }

  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    try {
      const query = `
        UPDATE conversations 
        SET participants = array_remove(participants, $1), updated_at = NOW()
        WHERE id = $2
      `;
      await this.db.query(query, [userId, conversationId]);
    } catch (error) {
      logError(this.logger, 'Failed to remove participant:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to remove participant',
        { conversationId, userId, error: error instanceof Error ? error.message : String(error) },
        'Conversation',
        conversationId,
        'removeParticipant'
      );
    }
  }
}

export class MessageRepository extends BaseRepository<Message> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'messages');
  }

  protected mapRowToEntity(row: any): Message {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      authorId: row.author_id,
      content: row.content,
      type: row.type,
      messageType: row.message_type,
      embeds: row.embeds,
      attachments: row.attachments,
      mentions: row.mentions,
      reactions: row.reactions,
      isEdited: row.is_edited,
      editedAt: row.edited_at,
      isPinned: row.is_pinned,
      webhookId: row.webhook_id,
      reference: row.reference,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected getEntityName(): string {
    return 'Message';
  }

  async findByConversationId(
    conversationId: string,
    options: { limit?: number; before?: string; after?: string } = {}
  ): Promise<Message[]> {
    try {
      let query = `SELECT * FROM messages WHERE conversation_id = $1`;
      const params: any[] = [conversationId];

      if (options.before) {
        query += ` AND created_at < (SELECT created_at FROM messages WHERE id = $2)`;
        params.push(options.before);
      }

      if (options.after) {
        query += ` AND created_at > (SELECT created_at FROM messages WHERE id = $${params.length + 1})`;
        params.push(options.after);
      }

      query += ` ORDER BY created_at ASC`;

      if (options.limit) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(options.limit);
      }

      const result = await this.db.query(query, params);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to find messages by conversation ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find messages by conversation ID',
        { conversationId, options, error: error instanceof Error ? error.message : String(error) },
        'Message',
        conversationId,
        'findByConversationId'
      );
    }
  }

  async findByChannelId(
    channelId: string,
    options: { limit?: number; before?: string; after?: string } = {}
  ): Promise<Message[]> {
    try {
      let query = `SELECT * FROM messages WHERE channel_id = $1`;
      const params: any[] = [channelId];

      if (options.before) {
        query += ` AND created_at < (SELECT created_at FROM messages WHERE id = $2)`;
        params.push(options.before);
      }

      if (options.after) {
        query += ` AND created_at > (SELECT created_at FROM messages WHERE id = $${params.length + 1})`;
        params.push(options.after);
      }

      query += ` ORDER BY created_at ASC`;

      if (options.limit) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(options.limit);
      }

      const result = await this.db.query(query, params);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to find messages by channel ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find messages by channel ID',
        { channelId, options, error: error instanceof Error ? error.message : String(error) },
        'Message',
        channelId,
        'findByChannelId'
      );
    }
  }

  async findByAuthorId(authorId: string, limit: number = 50): Promise<Message[]> {
    try {
      const query = `
        SELECT * FROM messages 
        WHERE author_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `;
      const result = await this.db.query(query, [authorId, limit]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to find messages by author ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find messages by author ID',
        { authorId, limit, error: error instanceof Error ? error.message : String(error) },
        'Message',
        authorId,
        'findByAuthorId'
      );
    }
  }

  async searchMessages(
    conversationId: string,
    query: string,
    options: { limit?: number; authorId?: string } = {}
  ): Promise<Message[]> {
    try {
      let sql = `
        SELECT * FROM messages 
        WHERE conversation_id = $1 AND to_tsvector('english', content) @@ plainto_tsquery($2)
      `;
      const params: any[] = [conversationId, query];

      if (options.authorId) {
        sql += ` AND author_id = $3`;
        params.push(options.authorId);
      }

      sql += ` ORDER BY ts_rank(to_tsvector('english', content), plainto_tsquery($2)) DESC, created_at DESC`;

      if (options.limit) {
        sql += ` LIMIT $${params.length + 1}`;
        params.push(options.limit);
      }

      const result = await this.db.query(sql, params);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to search messages:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to search messages',
        { conversationId, query, options, error: error instanceof Error ? error.message : String(error) },
        'Message',
        conversationId,
        'searchMessages'
      );
    }
  }

  async updateEditedStatus(messageId: string, content: string): Promise<void> {
    try {
      const query = `
        UPDATE messages 
        SET content = $1, is_edited = TRUE, edited_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `;
      await this.db.query(query, [content, messageId]);
    } catch (error) {
      logError(this.logger, 'Failed to update edited status:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to update edited status',
        { messageId, content, error: error instanceof Error ? error.message : String(error) },
        'Message',
        messageId,
        'updateEditedStatus'
      );
    }
  }

  async addReaction(messageId: string, emoji: string, userId: string): Promise<void> {
    try {
      const query = `
        UPDATE messages 
        SET reactions = jsonb_set(
          COALESCE(reactions, '{}'), 
          $1, 
          COALESCE(
            (reactions->$1)->'users', 
            '[]'
          ) || $2::jsonb
        ),
        updated_at = NOW()
        WHERE id = $3
      `;
      await this.db.query(query, [emoji, JSON.stringify([userId]), messageId]);
    } catch (error) {
      logError(this.logger, 'Failed to add reaction:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to add reaction',
        { messageId, emoji, userId, error: error instanceof Error ? error.message : String(error) },
        'Message',
        messageId,
        'addReaction'
      );
    }
  }

  async removeReaction(messageId: string, emoji: string, userId: string): Promise<void> {
    try {
      const query = `
        UPDATE messages 
        SET reactions = CASE 
          WHEN jsonb_array_length(reactions->$1->'users') > 1 THEN
            jsonb_set(
              reactions, 
              $1, 
              jsonb_set(
                reactions->$1, 
                'users', 
                (reactions->$1->'users') - $2::jsonb
              )
            )
          ELSE jsonb_remove(reactions, $1)
        END,
        updated_at = NOW()
        WHERE id = $3
      `;
      await this.db.query(query, [emoji, userId, messageId]);
    } catch (error) {
      logError(this.logger, 'Failed to remove reaction:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to remove reaction',
        { messageId, emoji, userId, error: error instanceof Error ? error.message : String(error) },
        'Message',
        messageId,
        'removeReaction'
      );
    }
  }
}

export class ConversationContextRepository extends BaseRepository<ConversationContext> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'conversation_context');
  }

  protected mapRowToEntity(row: any): ConversationContext {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      contextType: row.context_type,
      data: row.data,
      priority: row.priority,
      expiresAt: row.expires_at,
      isTemporary: row.is_temporary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected getEntityName(): string {
    return 'ConversationContext';
  }

  async findByConversationId(conversationId: string): Promise<ConversationContext[]> {
    try {
      const query = `
        SELECT * FROM conversation_context 
        WHERE conversation_id = $1 
        ORDER BY priority DESC, created_at DESC
      `;
      const result = await this.db.query(query, [conversationId]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to find context by conversation ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find context by conversation ID',
        { conversationId, error: error instanceof Error ? error.message : String(error) },
        'ConversationContext',
        conversationId,
        'findByConversationId'
      );
    }
  }

  async findByUserId(userId: string): Promise<ConversationContext[]> {
    try {
      const query = `
        SELECT * FROM conversation_context 
        WHERE user_id = $1 
        ORDER BY priority DESC, created_at DESC
      `;
      const result = await this.db.query(query, [userId]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to find context by user ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find context by user ID',
        { userId, error: error instanceof Error ? error.message : String(error) },
        'ConversationContext',
        userId,
        'findByUserId'
      );
    }
  }

  async upsertContext(context: Partial<ConversationContext>): Promise<ConversationContext> {
    try {
      const query = `
        INSERT INTO conversation_context (conversation_id, user_id, context_type, data, priority, expires_at, is_temporary)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (conversation_id, user_id, context_type)
        DO UPDATE SET
          data = EXCLUDED.data,
          priority = EXCLUDED.priority,
          expires_at = EXCLUDED.expires_at,
          is_temporary = EXCLUDED.is_temporary,
          updated_at = NOW()
        RETURNING *
      `;
      const values = [
        context.conversationId,
        context.userId,
        context.contextType,
        context.data,
        context.priority,
        context.expiresAt,
        context.isTemporary,
      ];
      const result = await this.db.query(query, values);
      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logError(this.logger, 'Failed to upsert context:', error);
      throw new RepositoryError(
        RepositoryErrorCode.CREATE_FAILED,
        'Failed to upsert context',
        { context, error: error instanceof Error ? error.message : String(error) },
        'ConversationContext',
        undefined,
        'upsertContext'
      );
    }
  }

  async deleteExpiredContext(): Promise<number> {
    try {
      const query = `DELETE FROM conversation_context WHERE expires_at <= NOW()`;
      const result = await this.db.query(query);
      return result.rowCount || 0;
    } catch (error) {
      logError(this.logger, 'Failed to delete expired context:', error);
      throw new RepositoryError(
        RepositoryErrorCode.DELETE_FAILED,
        'Failed to delete expired context',
        { error: error instanceof Error ? error.message : String(error) },
        'ConversationContext',
        undefined,
        'deleteExpiredContext'
      );
    }
  }
}

export class ConversationThreadRepository extends BaseRepository<ConversationThread> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'conversation_threads');
  }

  protected mapRowToEntity(row: any): ConversationThread {
    return {
      id: row.id,
      parentMessageId: row.parent_message_id,
      conversationId: row.conversation_id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      authorId: row.author_id,
      title: row.title,
      messageCount: parseInt(row.message_count),
      isArchived: row.is_archived,
      isLocked: row.is_locked,
      lastMessageAt: row.last_message_at,
      autoArchiveDuration: row.auto_archive_duration,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected getEntityName(): string {
    return 'ConversationThread';
  }

  async findByParentMessageId(parentMessageId: string): Promise<ConversationThread[]> {
    try {
      const query = `
        SELECT * FROM conversation_threads 
        WHERE parent_message_id = $1 
        ORDER BY created_at DESC
      `;
      const result = await this.db.query(query, [parentMessageId]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to find threads by parent message ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find threads by parent message ID',
        { parentMessageId, error: error instanceof Error ? error.message : String(error) },
        'ConversationThread',
        parentMessageId,
        'findByParentMessageId'
      );
    }
  }

  async findByChannelId(channelId: string): Promise<ConversationThread[]> {
    try {
      const query = `
        SELECT * FROM conversation_threads 
        WHERE channel_id = $1 
        ORDER BY last_message_at DESC
      `;
      const result = await this.db.query(query, [channelId]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to find threads by channel ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find threads by channel ID',
        { channelId, error: error instanceof Error ? error.message : String(error) },
        'ConversationThread',
        channelId,
        'findByChannelId'
      );
    }
  }

  async updateMessageCount(threadId: string, increment: number = 1): Promise<void> {
    try {
      const query = `
        UPDATE conversation_threads 
        SET message_count = message_count + $1, last_message_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `;
      await this.db.query(query, [increment, threadId]);
    } catch (error) {
      logError(this.logger, 'Failed to update thread message count:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to update thread message count',
        { threadId, increment, error: error instanceof Error ? error.message : String(error) },
        'ConversationThread',
        threadId,
        'updateMessageCount'
      );
    }
  }
}

export class ConversationParticipantRepository extends BaseRepository<ConversationParticipant> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'conversation_participants');
  }

  protected mapRowToEntity(row: any): ConversationParticipant {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
      role: row.role,
      permissions: row.permissions,
      isMuted: row.is_muted,
      isBanned: row.is_banned,
      lastReadAt: row.last_read_at,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected getEntityName(): string {
    return 'ConversationParticipant';
  }

  async findByConversationId(conversationId: string): Promise<ConversationParticipant[]> {
    try {
      const query = `
        SELECT * FROM conversation_participants 
        WHERE conversation_id = $1 AND left_at IS NULL
        ORDER BY joined_at ASC
      `;
      const result = await this.db.query(query, [conversationId]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to find participants by conversation ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find participants by conversation ID',
        { conversationId, error: error instanceof Error ? error.message : String(error) },
        'ConversationParticipant',
        conversationId,
        'findByConversationId'
      );
    }
  }

  async findByUserId(userId: string): Promise<ConversationParticipant[]> {
    try {
      const query = `
        SELECT * FROM conversation_participants 
        WHERE user_id = $1 AND left_at IS NULL
        ORDER BY joined_at DESC
      `;
      const result = await this.db.query(query, [userId]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to find participations by user ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find participations by user ID',
        { userId, error: error instanceof Error ? error.message : String(error) },
        'ConversationParticipant',
        userId,
        'findByUserId'
      );
    }
  }

  async addParticipant(participant: Partial<ConversationParticipant>): Promise<ConversationParticipant> {
    try {
      const query = `
        INSERT INTO conversation_participants (conversation_id, user_id, role, permissions, is_muted, is_banned, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (conversation_id, user_id)
        DO UPDATE SET
          left_at = NULL,
          role = EXCLUDED.role,
          permissions = EXCLUDED.permissions,
          is_muted = EXCLUDED.is_muted,
          is_banned = EXCLUDED.is_banned,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING *
      `;
      const values = [
        participant.conversationId,
        participant.userId,
        participant.role || 'member',
        participant.permissions || [],
        participant.isMuted || false,
        participant.isBanned || false,
        participant.metadata || {},
      ];
      const result = await this.db.query(query, values);
      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logError(this.logger, 'Failed to add participant:', error);
      throw new RepositoryError(
        RepositoryErrorCode.CREATE_FAILED,
        'Failed to add participant',
        { participant, error: error instanceof Error ? error.message : String(error) },
        'ConversationParticipant',
        undefined,
        'addParticipant'
      );
    }
  }

  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    try {
      const query = `
        UPDATE conversation_participants 
        SET left_at = NOW(), updated_at = NOW()
        WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL
      `;
      await this.db.query(query, [conversationId, userId]);
    } catch (error) {
      logError(this.logger, 'Failed to remove participant:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to remove participant',
        { conversationId, userId, error: error instanceof Error ? error.message : String(error) },
        'ConversationParticipant',
        userId,
        'removeParticipant'
      );
    }
  }

  async updateLastReadAt(conversationId: string, userId: string): Promise<void> {
    try {
      const query = `
        UPDATE conversation_participants 
        SET last_read_at = NOW(), updated_at = NOW()
        WHERE conversation_id = $1 AND user_id = $2
      `;
      await this.db.query(query, [conversationId, userId]);
    } catch (error) {
      logError(this.logger, 'Failed to update last read at:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to update last read at',
        { conversationId, userId, error: error instanceof Error ? error.message : String(error) },
        'ConversationParticipant',
        userId,
        'updateLastReadAt'
      );
    }
  }
}