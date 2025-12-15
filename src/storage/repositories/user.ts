import { BaseRepository } from './base';
import { PostgresConnectionManager } from '../database';
import { User, UserPreferences, UserStats, UserSession, UserActivity } from '../models';
import { RepositoryError, RepositoryErrorCode } from '../errors';

// Helper function for error logging
const logError = (logger: any, message: string, error: any) => {
  logger.error(message, error instanceof Error ? error : new Error(String(error)));
};

export class UserRepository extends BaseRepository<User> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'users');
  }

  protected mapRowToEntity(row: any): User {
    return {
      id: row.id,
      discordId: row.discord_id,
      username: row.username,
      discriminator: row.discriminator,
      avatar: row.avatar,
      email: row.email,
      isBot: row.is_bot,
      isSystem: row.is_system,
      status: row.status,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected getEntityName(): string {
    return 'User';
  }

  async findByDiscordId(discordId: string): Promise<User | null> {
    try {
      const query = `SELECT * FROM users WHERE discord_id = $1`;
      const result = await this.db.query(query, [discordId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logError(this.logger, 'Failed to find user by Discord ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find user by Discord ID',
        { discordId, error: error instanceof Error ? error.message : String(error) },
        'User',
        discordId,
        'findByDiscordId'
      );
    }
  }

  async findByUsername(username: string, discriminator?: string): Promise<User | null> {
    try {
      let query = `SELECT * FROM users WHERE username = $1`;
      const params: any[] = [username];

      if (discriminator) {
        query += ` AND discriminator = $2`;
        params.push(discriminator);
      }

      const result = await this.db.query(query, params);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logError(this.logger, 'Failed to find user by username:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find user by username',
        { username, discriminator, error: error instanceof Error ? error.message : String(error) },
        'User',
        username,
        'findByUsername'
      );
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      const query = `SELECT * FROM users WHERE email = $1`;
      const result = await this.db.query(query, [email]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logError(this.logger, 'Failed to find user by email:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find user by email',
        { email, error: error instanceof Error ? error.message : String(error) },
        'User',
        email,
        'findByEmail'
      );
    }
  }

  async updateLastSeen(id: string): Promise<void> {
    try {
      const query = `
        UPDATE users 
        SET last_seen_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `;
      await this.db.query(query, [id]);
    } catch (error) {
      logError(this.logger, 'Failed to update user last seen:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to update user last seen',
        { id, error: error instanceof Error ? error.message : String(error) },
        'User',
        id,
        'updateLastSeen'
      );
    }
  }

  async updateStatus(id: string, status: User['status']): Promise<void> {
    try {
      const query = `
        UPDATE users 
        SET status = $1, updated_at = NOW()
        WHERE id = $2
      `;
      await this.db.query(query, [status, id]);
    } catch (error) {
      logError(this.logger, 'Failed to update user status:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to update user status',
        { id, status, error: error instanceof Error ? error.message : String(error) },
        'User',
        id,
        'updateStatus'
      );
    }
  }

  async findActiveUsers(since: Date): Promise<User[]> {
    try {
      const query = `
        SELECT * FROM users 
        WHERE last_seen_at >= $1 
        ORDER BY last_seen_at DESC
      `;
      const result = await this.db.query(query, [since]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to find active users:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find active users',
        { since, error: error instanceof Error ? error.message : String(error) },
        'User',
        undefined,
        'findActiveUsers'
      );
    }
  }
}

export class UserPreferencesRepository extends BaseRepository<UserPreferences> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'user_preferences');
  }

  protected mapRowToEntity(row: any): UserPreferences {
    return {
      id: row.id,
      userId: row.user_id,
      timezone: row.timezone,
      language: row.language,
      theme: row.theme,
      notifications: row.notifications,
      privacy: row.privacy,
      botInteractions: row.bot_interactions,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected getEntityName(): string {
    return 'UserPreferences';
  }

  async findByUserId(userId: string): Promise<UserPreferences | null> {
    try {
      const query = `SELECT * FROM user_preferences WHERE user_id = $1`;
      const result = await this.db.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logError(this.logger, 'Failed to find user preferences by user ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find user preferences by user ID',
        { userId, error: error instanceof Error ? error.message : String(error) },
        'UserPreferences',
        userId,
        'findByUserId'
      );
    }
  }

  async updateByUserId(userId: string, updates: Partial<UserPreferences>): Promise<UserPreferences | null> {
    try {
      const fields = Object.keys(updates).filter(key => updates[key as keyof UserPreferences] !== undefined);
      if (fields.length === 0) {
        return this.findByUserId(userId);
      }

      const setClause = fields.map((key, index) => `${key} = $${index + 1}`).join(', ');
      const values = [...Object.values(updates), userId];

      const query = `
        UPDATE user_preferences
        SET ${setClause}, updated_at = NOW()
        WHERE user_id = $${values.length}
        RETURNING *
      `;

      const result = await this.db.query(query, values);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logError(this.logger, 'Failed to update user preferences:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to update user preferences',
        { userId, updates, error: error instanceof Error ? error.message : String(error) },
        'UserPreferences',
        userId,
        'updateByUserId'
      );
    }
  }
}

export class UserStatsRepository extends BaseRepository<UserStats> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'user_stats');
  }

  protected mapRowToEntity(row: any): UserStats {
    return {
      id: row.id,
      userId: row.user_id,
      messageCount: parseInt(row.message_count),
      commandCount: parseInt(row.command_count),
      reactionCount: parseInt(row.reaction_count),
      voiceMinutes: parseInt(row.voice_minutes),
      lastActiveAt: row.last_active_at,
      guildCount: parseInt(row.guild_count),
      friendCount: parseInt(row.friend_count),
      achievements: row.achievements,
      level: parseInt(row.level),
      experience: parseInt(row.experience),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected getEntityName(): string {
    return 'UserStats';
  }

  async findByUserId(userId: string): Promise<UserStats | null> {
    try {
      const query = `SELECT * FROM user_stats WHERE user_id = $1`;
      const result = await this.db.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logError(this.logger, 'Failed to find user stats by user ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find user stats by user ID',
        { userId, error: error instanceof Error ? error.message : String(error) },
        'UserStats',
        userId,
        'findByUserId'
      );
    }
  }

  async incrementMessageCount(userId: string): Promise<void> {
    try {
      const query = `
        INSERT INTO user_stats (user_id, message_count, last_active_at)
        VALUES ($1, 1, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          message_count = user_stats.message_count + 1,
          last_active_at = NOW(),
          updated_at = NOW()
      `;
      await this.db.query(query, [userId]);
    } catch (error) {
      logError(this.logger, 'Failed to increment message count:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to increment message count',
        { userId, error: error instanceof Error ? error.message : String(error) },
        'UserStats',
        userId,
        'incrementMessageCount'
      );
    }
  }

  async incrementCommandCount(userId: string): Promise<void> {
    try {
      const query = `
        INSERT INTO user_stats (user_id, command_count, last_active_at)
        VALUES ($1, 1, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          command_count = user_stats.command_count + 1,
          last_active_at = NOW(),
          updated_at = NOW()
      `;
      await this.db.query(query, [userId]);
    } catch (error) {
      logError(this.logger, 'Failed to increment command count:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to increment command count',
        { userId, error: error instanceof Error ? error.message : String(error) },
        'UserStats',
        userId,
        'incrementCommandCount'
      );
    }
  }

  async addExperience(userId: string, amount: number): Promise<void> {
    try {
      const query = `
        INSERT INTO user_stats (user_id, experience, last_active_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          experience = user_stats.experience + $2,
          last_active_at = NOW(),
          updated_at = NOW()
      `;
      await this.db.query(query, [userId, amount]);
    } catch (error) {
      logError(this.logger, 'Failed to add experience:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to add experience',
        { userId, amount, error: error instanceof Error ? error.message : String(error) },
        'UserStats',
        userId,
        'addExperience'
      );
    }
  }

  async getTopUsersByExperience(limit: number = 10): Promise<UserStats[]> {
    try {
      const query = `
        SELECT * FROM user_stats 
        ORDER BY experience DESC 
        LIMIT $1
      `;
      const result = await this.db.query(query, [limit]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to get top users by experience:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to get top users by experience',
        { limit, error: error instanceof Error ? error.message : String(error) },
        'UserStats',
        undefined,
        'getTopUsersByExperience'
      );
    }
  }
}

export class UserSessionRepository extends BaseRepository<UserSession> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'user_sessions');
  }

  protected mapRowToEntity(row: any): UserSession {
    return {
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      isActive: row.is_active,
      lastActivityAt: row.last_activity_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  protected getEntityName(): string {
    return 'UserSession';
  }

  async findBySessionId(sessionId: string): Promise<UserSession | null> {
    try {
      const query = `
        SELECT * FROM user_sessions 
        WHERE session_id = $1 AND is_active = TRUE AND expires_at > NOW()
      `;
      const result = await this.db.query(query, [sessionId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logError(this.logger, 'Failed to find session by ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find session by ID',
        { sessionId, error: error instanceof Error ? error.message : String(error) },
        'UserSession',
        sessionId,
        'findBySessionId'
      );
    }
  }

  async findByUserId(userId: string): Promise<UserSession[]> {
    try {
      const query = `
        SELECT * FROM user_sessions 
        WHERE user_id = $1 AND is_active = TRUE
        ORDER BY last_activity_at DESC
      `;
      const result = await this.db.query(query, [userId]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to find sessions by user ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find sessions by user ID',
        { userId, error: error instanceof Error ? error.message : String(error) },
        'UserSession',
        userId,
        'findByUserId'
      );
    }
  }

  async createSession(session: Partial<UserSession>): Promise<UserSession> {
    try {
      const query = `
        INSERT INTO user_sessions (user_id, session_id, ip_address, user_agent, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const values = [
        session.userId,
        session.sessionId,
        session.ipAddress,
        session.userAgent,
        session.expiresAt,
      ];
      const result = await this.db.query(query, values);
      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logError(this.logger, 'Failed to create session:', error);
      throw new RepositoryError(
        RepositoryErrorCode.CREATE_FAILED,
        'Failed to create session',
        { session, error: error instanceof Error ? error.message : String(error) },
        'UserSession',
        undefined,
        'createSession'
      );
    }
  }

  async deactivateSession(sessionId: string): Promise<void> {
    try {
      const query = `
        UPDATE user_sessions 
        SET is_active = FALSE, updated_at = NOW()
        WHERE session_id = $1
      `;
      await this.db.query(query, [sessionId]);
    } catch (error) {
      logError(this.logger, 'Failed to deactivate session:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to deactivate session',
        { sessionId, error: error instanceof Error ? error.message : String(error) },
        'UserSession',
        sessionId,
        'deactivateSession'
      );
    }
  }

  async deactivateExpiredSessions(): Promise<number> {
    try {
      const query = `
        UPDATE user_sessions 
        SET is_active = FALSE, updated_at = NOW()
        WHERE expires_at <= NOW() AND is_active = TRUE
      `;
      const result = await this.db.query(query);
      return result.rowCount || 0;
    } catch (error) {
      logError(this.logger, 'Failed to deactivate expired sessions:', error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to deactivate expired sessions',
        { error: error instanceof Error ? error.message : String(error) },
        'UserSession',
        undefined,
        'deactivateExpiredSessions'
      );
    }
  }
}

export class UserActivityRepository extends BaseRepository<UserActivity> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'user_activity');
  }

  protected mapRowToEntity(row: any): UserActivity {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      guildId: row.guild_id,
      channelId: row.channel_id,
      messageId: row.message_id,
      data: row.data,
      timestamp: row.timestamp,
    };
  }

  protected getEntityName(): string {
    return 'UserActivity';
  }

  async findByUserId(userId: string, limit: number = 100): Promise<UserActivity[]> {
    try {
      const query = `
        SELECT * FROM user_activity 
        WHERE user_id = $1 
        ORDER BY timestamp DESC 
        LIMIT $2
      `;
      const result = await this.db.query(query, [userId, limit]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      logError(this.logger, 'Failed to find activities by user ID:', error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to find activities by user ID',
        { userId, limit, error: error instanceof Error ? error.message : String(error) },
        'UserActivity',
        userId,
        'findByUserId'
      );
    }
  }

  async recordActivity(activity: Partial<UserActivity>): Promise<UserActivity> {
    try {
      const query = `
        INSERT INTO user_activity (user_id, type, guild_id, channel_id, message_id, data)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const values = [
        activity.userId,
        activity.type,
        activity.guildId,
        activity.channelId,
        activity.messageId,
        activity.data,
      ];
      const result = await this.db.query(query, values);
      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logError(this.logger, 'Failed to record activity:', error);
      throw new RepositoryError(
        RepositoryErrorCode.CREATE_FAILED,
        'Failed to record activity',
        { activity, error: error instanceof Error ? error.message : String(error) },
        'UserActivity',
        undefined,
        'recordActivity'
      );
    }
  }

  async deleteOldActivities(before: Date): Promise<number> {
    try {
      const query = `DELETE FROM user_activity WHERE timestamp < $1`;
      const result = await this.db.query(query, [before]);
      return result.rowCount || 0;
    } catch (error) {
      logError(this.logger, 'Failed to delete old activities:', error);
      throw new RepositoryError(
        RepositoryErrorCode.DELETE_FAILED,
        'Failed to delete old activities',
        { before, error: error instanceof Error ? error.message : String(error) },
        'UserActivity',
        undefined,
        'deleteOldActivities'
      );
    }
  }
}