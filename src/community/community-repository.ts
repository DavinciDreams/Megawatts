/**
 * Community Repository
 *
 * Repository for community data operations.
 * Extends base repository pattern with community-specific operations.
 */

import { BaseRepository, QueryOptions, PaginationResult } from '../storage/repositories/base';
import { PostgresConnectionManager } from '../storage/database';
import { Logger } from '../utils/logger';
import {
  CommunityMember,
  CommunityEvent,
  CommunityGuideline,
  SupportTicket,
  KnowledgeArticle,
  FAQEntry,
  DeveloperProfile,
  Contribution,
  MemberSearchOptions,
  EventSearchOptions,
  TicketSearchOptions,
  ArticleSearchOptions,
  DeveloperSearchOptions,
  PaginationOptions,
  TicketResponse,
  EventAgendaItem,
  DeveloperSkill,
  DeveloperProject
} from './community-models';

/**
 * Community repository for managing community data
 */
export class CommunityRepository extends BaseRepository<CommunityMember> {
  constructor(db: PostgresConnectionManager, logger: Logger) {
    super(db, 'community_members', 'id');
  }

  /**
   * Map database row to CommunityMember entity
   */
  protected mapRowToEntity(row: any): CommunityMember {
    return {
      id: row.id,
      userId: row.user_id,
      guildId: row.guild_id,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar,
      email: row.email,
      role: row.role,
      status: row.status,
      bio: row.bio,
      skills: row.skills || [],
      interests: row.interests || [],
      joinedAt: row.joined_at,
      lastActiveAt: row.last_active_at,
      warningCount: row.warning_count,
      banCount: row.ban_count,
      contributionCount: row.contribution_count,
      reputation: row.reputation,
      metadata: row.metadata || {
        notificationPreferences: {
          email: true,
          dm: true,
          mentions: true,
          events: true,
          announcements: true,
          updates: true
        },
        badges: [],
        isVerified: false,
        isSponsor: false
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Get entity name for error messages
   */
  protected getEntityName(): string {
    return 'CommunityMember';
  }

  // ============================================================================
  // COMMUNITY MEMBER OPERATIONS
  // ============================================================================

  /**
   * Find community member by user ID and guild ID
   */
  async findMember(userId: string, guildId: string): Promise<CommunityMember | null> {
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE user_id = $1 AND guild_id = $2`;
      const result = await this.db.query(query, [userId, guildId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to find member:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Search community members with filters
   */
  async searchMembers(options: MemberSearchOptions & PaginationOptions = {}): Promise<PaginationResult<CommunityMember>> {
    try {
      const {
        page = 1,
        pageSize = 20,
        sortBy = 'createdAt',
        sortOrder = 'DESC',
        query,
        role,
        status,
        skills,
        interests,
        guildId,
        minReputation,
        isVerified
      } = options;

      const offset = (page - 1) * pageSize;
      const params: any[] = [];
      const whereConditions: string[] = [];

      // Build WHERE clause
      if (query) {
        whereConditions.push(`(
          username ILIKE $${params.length + 1} OR
          display_name ILIKE $${params.length + 2} OR
          bio ILIKE $${params.length + 3}
        )`);
        const queryPattern = `%${query}%`;
        params.push(queryPattern, queryPattern, queryPattern);
      }

      if (role) {
        params.push(role);
        whereConditions.push(`role = $${params.length}`);
      }

      if (status) {
        params.push(status);
        whereConditions.push(`status = $${params.length}`);
      }

      if (skills && skills.length > 0) {
        params.push(skills);
        whereConditions.push(`skills && $${params.length}`);
      }

      if (interests && interests.length > 0) {
        params.push(interests);
        whereConditions.push(`interests && $${params.length}`);
      }

      if (guildId) {
        params.push(guildId);
        whereConditions.push(`guild_id = $${params.length}`);
      }

      if (minReputation !== undefined) {
        params.push(minReputation);
        whereConditions.push(`reputation >= $${params.length}`);
      }

      if (isVerified !== undefined) {
        params.push(isVerified);
        whereConditions.push(`(metadata->>'isVerified')::boolean = $${params.length}`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Map sort field to database column
      const sortFieldMap: Record<string, string> = {
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        reputation: 'reputation',
        lastActiveAt: 'last_active_at',
        username: 'username',
        displayName: 'display_name'
      };

      const sortField = sortFieldMap[sortBy] || 'created_at';

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM ${this.tableName} ${whereClause}`;
      const countResult = await this.db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // Get data
      const dataQuery = `
        SELECT * FROM ${this.tableName}
        ${whereClause}
        ORDER BY ${sortField} ${sortOrder}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(pageSize, offset);

      const dataResult = await this.db.query(dataQuery, params);
      const data = dataResult.rows.map((row: any) => this.mapRowToEntity(row));

      return {
        data,
        total,
        page,
        pageSize,
        hasNext: offset + pageSize < total,
        hasPrevious: page > 1
      };
    } catch (error) {
      this.logger.error('Failed to search members:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update member's last active timestamp
   */
  async updateLastActive(userId: string, guildId: string): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET last_active_at = NOW(), updated_at = NOW()
        WHERE user_id = $1 AND guild_id = $2
      `;

      await this.db.query(query, [userId, guildId]);
    } catch (error) {
      this.logger.error('Failed to update last active:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update member reputation
   */
  async updateReputation(userId: string, guildId: string, delta: number): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET reputation = GREATEST(reputation + $1, 0), updated_at = NOW()
        WHERE user_id = $2 AND guild_id = $3
      `;

      await this.db.query(query, [delta, userId, guildId]);
      this.logger.debug(`Updated reputation for user ${userId} by ${delta}`);
    } catch (error) {
      this.logger.error('Failed to update reputation:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Increment member contribution count
   */
  async incrementContributionCount(userId: string, guildId: string): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET contribution_count = contribution_count + 1, updated_at = NOW()
        WHERE user_id = $1 AND guild_id = $2
      `;

      await this.db.query(query, [userId, guildId]);
    } catch (error) {
      this.logger.error('Failed to increment contribution count:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Increment member warning count
   */
  async incrementWarningCount(userId: string, guildId: string): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET warning_count = warning_count + 1, updated_at = NOW()
        WHERE user_id = $1 AND guild_id = $2
      `;

      await this.db.query(query, [userId, guildId]);
      this.logger.debug(`Incremented warning count for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to increment warning count:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Increment member ban count
   */
  async incrementBanCount(userId: string, guildId: string): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET ban_count = ban_count + 1, updated_at = NOW()
        WHERE user_id = $1 AND guild_id = $2
      `;

      await this.db.query(query, [userId, guildId]);
      this.logger.debug(`Incremented ban count for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to increment ban count:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(userId: string, guildId: string, role: string): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET role = $1, updated_at = NOW()
        WHERE user_id = $2 AND guild_id = $3
      `;

      await this.db.query(query, [role, userId, guildId]);
      this.logger.info(`Updated role for user ${userId} to ${role}`);
    } catch (error) {
      this.logger.error('Failed to update member role:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update member status
   */
  async updateMemberStatus(userId: string, guildId: string, status: string): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET status = $1, updated_at = NOW()
        WHERE user_id = $2 AND guild_id = $3
      `;

      await this.db.query(query, [status, userId, guildId]);
      this.logger.info(`Updated status for user ${userId} to ${status}`);
    } catch (error) {
      this.logger.error('Failed to update member status:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // ============================================================================
  // COMMUNITY EVENT OPERATIONS
  // ============================================================================

  /**
   * Create community event
   */
  async createEvent(event: Omit<CommunityEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<CommunityEvent> {
    try {
      const query = `
        INSERT INTO community_events (
          title, description, type, status, start_time, end_time, location,
          platform, max_attendees, current_attendees, organizer_id, organizer_name,
          image, tags, requirements, agenda, attendees, waitlist, recurring, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *
      `;

      const params = [
        event.title,
        event.description,
        event.type,
        event.status,
        event.startTime,
        event.endTime,
        event.location,
        event.platform,
        event.maxAttendees,
        event.currentAttendees,
        event.organizerId,
        event.organizerName,
        event.image,
        event.tags,
        event.requirements,
        JSON.stringify(event.agenda || []),
        event.attendees,
        event.waitlist,
        event.recurring ? JSON.stringify(event.recurring) : null,
        JSON.stringify(event.metadata)
      ];

      const result = await this.db.query(query, params);
      return this.mapRowToEvent(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create event:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get event by ID
   */
  async getEvent(eventId: string): Promise<CommunityEvent | null> {
    try {
      const query = `SELECT * FROM community_events WHERE id = $1`;
      const result = await this.db.query(query, [eventId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEvent(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get event:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Search community events with filters
   */
  async searchEvents(options: EventSearchOptions & PaginationOptions = {}): Promise<PaginationResult<CommunityEvent>> {
    try {
      const {
        page = 1,
        pageSize = 20,
        sortBy = 'startTime',
        sortOrder = 'ASC',
        query,
        type,
        status,
        category,
        organizerId,
        startDate,
        endDate,
        tags
      } = options;

      const offset = (page - 1) * pageSize;
      const params: any[] = [];
      const whereConditions: string[] = [];

      if (query) {
        whereConditions.push(`(
          title ILIKE $${params.length + 1} OR
          description ILIKE $${params.length + 2}
        )`);
        const queryPattern = `%${query}%`;
        params.push(queryPattern, queryPattern);
      }

      if (type) {
        params.push(type);
        whereConditions.push(`type = $${params.length}`);
      }

      if (status) {
        params.push(status);
        whereConditions.push(`status = $${params.length}`);
      }

      if (organizerId) {
        params.push(organizerId);
        whereConditions.push(`organizer_id = $${params.length}`);
      }

      if (startDate) {
        params.push(startDate);
        whereConditions.push(`start_time >= $${params.length}`);
      }

      if (endDate) {
        params.push(endDate);
        whereConditions.push(`start_time <= $${params.length}`);
      }

      if (tags && tags.length > 0) {
        params.push(tags);
        whereConditions.push(`tags && $${params.length}`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const sortFieldMap: Record<string, string> = {
        startTime: 'start_time',
        endTime: 'end_time',
        createdAt: 'created_at',
        title: 'title'
      };

      const sortField = sortFieldMap[sortBy] || 'start_time';

      const countQuery = `SELECT COUNT(*) FROM community_events ${whereClause}`;
      const countResult = await this.db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      const dataQuery = `
        SELECT * FROM community_events
        ${whereClause}
        ORDER BY ${sortField} ${sortOrder}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(pageSize, offset);

      const dataResult = await this.db.query(dataQuery, params);
      const data = dataResult.rows.map((row: any) => this.mapRowToEvent(row));

      return {
        data,
        total,
        page,
        pageSize,
        hasNext: offset + pageSize < total,
        hasPrevious: page > 1
      };
    } catch (error) {
      this.logger.error('Failed to search events:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Add attendee to event
   */
  async addEventAttendee(eventId: string, userId: string): Promise<void> {
    try {
      const query = `
        UPDATE community_events
        SET attendees = array_append(attendees, $1),
            current_attendees = current_attendees + 1,
            updated_at = NOW()
        WHERE id = $2 AND NOT ($1 = ANY(attendees))
      `;

      await this.db.query(query, [userId, eventId]);
    } catch (error) {
      this.logger.error('Failed to add event attendee:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Remove attendee from event
   */
  async removeEventAttendee(eventId: string, userId: string): Promise<void> {
    try {
      const query = `
        UPDATE community_events
        SET attendees = array_remove(attendees, $1),
            current_attendees = GREATEST(current_attendees - 1, 0),
            updated_at = NOW()
        WHERE id = $2
      `;

      await this.db.query(query, [userId, eventId]);
    } catch (error) {
      this.logger.error('Failed to remove event attendee:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update event status
   */
  async updateEventStatus(eventId: string, status: string): Promise<void> {
    try {
      const query = `
        UPDATE community_events
        SET status = $1, updated_at = NOW()
        WHERE id = $2
      `;

      await this.db.query(query, [status, eventId]);
      this.logger.info(`Updated event ${eventId} status to ${status}`);
    } catch (error) {
      this.logger.error('Failed to update event status:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Delete event
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      const query = `DELETE FROM community_events WHERE id = $1`;
      const result = await this.db.query(query, [eventId]);
      return result.rowCount > 0;
    } catch (error) {
      this.logger.error('Failed to delete event:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Map database row to CommunityEvent entity
   */
  private mapRowToEvent(row: any): CommunityEvent {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      type: row.type,
      status: row.status,
      startTime: row.start_time,
      endTime: row.end_time,
      location: row.location,
      platform: row.platform,
      maxAttendees: row.max_attendees,
      currentAttendees: row.current_attendees,
      organizerId: row.organizer_id,
      organizerName: row.organizer_name,
      image: row.image,
      tags: row.tags || [],
      requirements: row.requirements,
      agenda: row.agenda ? (row.agenda as EventAgendaItem[]) : [],
      attendees: row.attendees || [],
      waitlist: row.waitlist || [],
      recurring: row.recurring,
      metadata: row.metadata || { feedbackEnabled: true, feedbackCollected: 0 },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // ============================================================================
  // COMMUNITY GUIDELINE OPERATIONS
  // ============================================================================

  /**
   * Get active community guidelines
   */
  async getActiveGuidelines(): Promise<CommunityGuideline[]> {
    try {
      const query = `
        SELECT * FROM community_guidelines
        WHERE is_active = TRUE
        ORDER BY priority DESC, created_at ASC
      `;

      const result = await this.db.query(query);
      return result.rows.map((row: any) => this.mapRowToGuideline(row));
    } catch (error) {
      this.logger.error('Failed to get active guidelines:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Create community guideline
   */
  async createGuideline(guideline: Omit<CommunityGuideline, 'id' | 'createdAt' | 'updatedAt'>): Promise<CommunityGuideline> {
    try {
      const query = `
        INSERT INTO community_guidelines (
          title, description, category, priority, severity, is_active, content,
          examples, consequences, version, effective_from, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;

      const params = [
        guideline.title,
        guideline.description,
        guideline.category,
        guideline.priority,
        guideline.severity,
        guideline.isActive,
        guideline.content,
        guideline.examples,
        guideline.consequences,
        guideline.version,
        guideline.effectiveFrom,
        guideline.createdBy
      ];

      const result = await this.db.query(query, params);
      return this.mapRowToGuideline(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create guideline:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update guideline
   */
  async updateGuideline(guidelineId: string, updates: Partial<CommunityGuideline>): Promise<CommunityGuideline | null> {
    try {
      const fields = Object.keys(updates).filter(key => updates[key as keyof CommunityGuideline] !== undefined);
      if (fields.length === 0) {
        return this.getGuideline(guidelineId);
      }

      const setClauses: string[] = [];
      const params: any[] = [];

      for (const field of fields) {
        const camelToSnake = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        const snakeField = camelToSnake(field);
        setClauses.push(`${snakeField} = $${params.length + 1}`);
        params.push(updates[field as keyof CommunityGuideline]);
      }

      setClauses.push('updated_at = NOW()');
      params.push(guidelineId);

      const query = `
        UPDATE community_guidelines
        SET ${setClauses.join(', ')}
        WHERE id = $${params.length}
        RETURNING *
      `;

      const result = await this.db.query(query, params);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToGuideline(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update guideline:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get guideline by ID
   */
  async getGuideline(guidelineId: string): Promise<CommunityGuideline | null> {
    try {
      const query = `SELECT * FROM community_guidelines WHERE id = $1`;
      const result = await this.db.query(query, [guidelineId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToGuideline(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get guideline:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Map database row to CommunityGuideline entity
   */
  private mapRowToGuideline(row: any): CommunityGuideline {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      priority: row.priority,
      severity: row.severity,
      isActive: row.is_active,
      content: row.content,
      examples: row.examples,
      consequences: row.consequences,
      version: row.version,
      effectiveFrom: row.effective_from,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // ============================================================================
  // SUPPORT TICKET OPERATIONS
  // ============================================================================

  /**
   * Create support ticket
   */
  async createTicket(ticket: Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt' | 'ticketNumber'>): Promise<SupportTicket> {
    try {
      const ticketNumber = await this.generateTicketNumber();
      
      const query = `
        INSERT INTO support_tickets (
          ticket_number, user_id, user_name, user_avatar, guild_id, category,
          priority, status, subject, description, attachments, assigned_to,
          assigned_to_name, responses, resolution, resolution_time, satisfaction,
          tags, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING *
      `;

      const params = [
        ticketNumber,
        ticket.userId,
        ticket.userName,
        ticket.userAvatar,
        ticket.guildId,
        ticket.category,
        ticket.priority,
        ticket.status,
        ticket.subject,
        ticket.description,
        ticket.attachments,
        ticket.assignedTo,
        ticket.assignedToName,
        JSON.stringify(ticket.responses || []),
        ticket.resolution,
        ticket.resolutionTime,
        ticket.satisfaction,
        ticket.tags,
        JSON.stringify(ticket.metadata || { source: 'discord' })
      ];

      const result = await this.db.query(query, params);
      return this.mapRowToTicket(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create ticket:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Generate unique ticket number
   */
  private async generateTicketNumber(): Promise<string> {
    try {
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      return `TKT-${timestamp}-${random}`;
    } catch (error) {
      this.logger.error('Failed to generate ticket number:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get ticket by ID
   */
  async getTicket(ticketId: string): Promise<SupportTicket | null> {
    try {
      const query = `SELECT * FROM support_tickets WHERE id = $1`;
      const result = await this.db.query(query, [ticketId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToTicket(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get ticket:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get ticket by ticket number
   */
  async getTicketByNumber(ticketNumber: string): Promise<SupportTicket | null> {
    try {
      const query = `SELECT * FROM support_tickets WHERE ticket_number = $1`;
      const result = await this.db.query(query, [ticketNumber]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToTicket(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get ticket by number:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Search support tickets with filters
   */
  async searchTickets(options: TicketSearchOptions & PaginationOptions = {}): Promise<PaginationResult<SupportTicket>> {
    try {
      const {
        page = 1,
        pageSize = 20,
        sortBy = 'createdAt',
        sortOrder = 'DESC',
        query,
        userId,
        category,
        priority,
        status,
        assignedTo,
        guildId,
        startDate,
        endDate,
        tags
      } = options;

      const offset = (page - 1) * pageSize;
      const params: any[] = [];
      const whereConditions: string[] = [];

      if (query) {
        whereConditions.push(`(
          subject ILIKE $${params.length + 1} OR
          description ILIKE $${params.length + 2}
        )`);
        const queryPattern = `%${query}%`;
        params.push(queryPattern, queryPattern);
      }

      if (userId) {
        params.push(userId);
        whereConditions.push(`user_id = $${params.length}`);
      }

      if (category) {
        params.push(category);
        whereConditions.push(`category = $${params.length}`);
      }

      if (priority) {
        params.push(priority);
        whereConditions.push(`priority = $${params.length}`);
      }

      if (status) {
        params.push(status);
        whereConditions.push(`status = $${params.length}`);
      }

      if (assignedTo) {
        params.push(assignedTo);
        whereConditions.push(`assigned_to = $${params.length}`);
      }

      if (guildId) {
        params.push(guildId);
        whereConditions.push(`guild_id = $${params.length}`);
      }

      if (startDate) {
        params.push(startDate);
        whereConditions.push(`created_at >= $${params.length}`);
      }

      if (endDate) {
        params.push(endDate);
        whereConditions.push(`created_at <= $${params.length}`);
      }

      if (tags && tags.length > 0) {
        params.push(tags);
        whereConditions.push(`tags && $${params.length}`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const sortFieldMap: Record<string, string> = {
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        priority: 'priority',
        status: 'status'
      };

      const sortField = sortFieldMap[sortBy] || 'created_at';

      const countQuery = `SELECT COUNT(*) FROM support_tickets ${whereClause}`;
      const countResult = await this.db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      const dataQuery = `
        SELECT * FROM support_tickets
        ${whereClause}
        ORDER BY ${sortField} ${sortOrder}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(pageSize, offset);

      const dataResult = await this.db.query(dataQuery, params);
      const data = dataResult.rows.map((row: any) => this.mapRowToTicket(row));

      return {
        data,
        total,
        page,
        pageSize,
        hasNext: offset + pageSize < total,
        hasPrevious: page > 1
      };
    } catch (error) {
      this.logger.error('Failed to search tickets:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Add response to ticket
   */
  async addTicketResponse(ticketId: string, response: Omit<TicketResponse, 'id' | 'createdAt'>): Promise<void> {
    try {
      const query = `
        UPDATE support_tickets
        SET responses = responses || $1::jsonb,
            updated_at = NOW()
        WHERE id = $2
      `;

      const responseObj = {
        id: `resp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        ...response,
        createdAt: new Date().toISOString()
      };

      await this.db.query(query, [JSON.stringify(responseObj), ticketId]);
    } catch (error) {
      this.logger.error('Failed to add ticket response:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update ticket status
   */
  async updateTicketStatus(ticketId: string, status: string): Promise<void> {
    try {
      const updates: string[] = ['status = $1', 'updated_at = NOW()'];
      const params: any[] = [status, ticketId];

      if (status === 'resolved') {
        updates.push('resolved_at = NOW()');
      } else if (status === 'closed') {
        updates.push('closed_at = NOW()');
      }

      const query = `
        UPDATE support_tickets
        SET ${updates.join(', ')}
        WHERE id = $${params.length}
      `;

      await this.db.query(query, params);
      this.logger.info(`Updated ticket ${ticketId} status to ${status}`);
    } catch (error) {
      this.logger.error('Failed to update ticket status:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Assign ticket to staff member
   */
  async assignTicket(ticketId: string, assignedTo: string, assignedToName: string): Promise<void> {
    try {
      const query = `
        UPDATE support_tickets
        SET assigned_to = $1, assigned_to_name = $2, updated_at = NOW()
        WHERE id = $3
      `;

      await this.db.query(query, [assignedTo, assignedToName, ticketId]);
      this.logger.info(`Assigned ticket ${ticketId} to ${assignedToName}`);
    } catch (error) {
      this.logger.error('Failed to assign ticket:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Resolve ticket
   */
  async resolveTicket(ticketId: string, resolution: string, resolutionTime: number): Promise<void> {
    try {
      const query = `
        UPDATE support_tickets
        SET status = 'resolved',
            resolution = $1,
            resolution_time = $2,
            resolved_at = NOW(),
            updated_at = NOW()
        WHERE id = $3
      `;

      await this.db.query(query, [resolution, resolutionTime, ticketId]);
      this.logger.info(`Resolved ticket ${ticketId}`);
    } catch (error) {
      this.logger.error('Failed to resolve ticket:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Map database row to SupportTicket entity
   */
  private mapRowToTicket(row: any): SupportTicket {
    return {
      id: row.id,
      ticketNumber: row.ticket_number,
      userId: row.user_id,
      userName: row.user_name,
      userAvatar: row.user_avatar,
      guildId: row.guild_id,
      category: row.category,
      priority: row.priority,
      status: row.status,
      subject: row.subject,
      description: row.description,
      attachments: row.attachments,
      assignedTo: row.assigned_to,
      assignedToName: row.assigned_to_name,
      responses: row.responses ? (row.responses as TicketResponse[]) : [],
      resolution: row.resolution,
      resolutionTime: row.resolution_time,
      satisfaction: row.satisfaction,
      tags: row.tags || [],
      metadata: row.metadata || { source: 'discord' },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
      closedAt: row.closed_at
    };
  }

  // ============================================================================
  // KNOWLEDGE BASE OPERATIONS
  // ============================================================================

  /**
   * Create knowledge article
   */
  async createArticle(article: Omit<KnowledgeArticle, 'id' | 'createdAt' | 'updatedAt'>): Promise<KnowledgeArticle> {
    try {
      const query = `
        INSERT INTO knowledge_articles (
          title, slug, summary, content, category, tags, status, author_id,
          author_name, reviewer_id, reviewer_name, version, related_articles,
          attachments, view_count, helpful_count, not_helpful_count, last_reviewed_at, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING *
      `;

      const params = [
        article.title,
        article.slug,
        article.summary,
        article.content,
        article.category,
        article.tags,
        article.status,
        article.authorId,
        article.authorName,
        article.reviewerId,
        article.reviewerName,
        article.version,
        article.relatedArticles,
        article.attachments,
        article.viewCount,
        article.helpfulCount,
        article.notHelpfulCount,
        article.lastReviewedAt,
        JSON.stringify(article.metadata || { difficulty: 'intermediate', readingTime: 5, featured: false, verified: false })
      ];

      const result = await this.db.query(query, params);
      return this.mapRowToArticle(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create article:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get article by ID
   */
  async getArticle(articleId: string): Promise<KnowledgeArticle | null> {
    try {
      const query = `SELECT * FROM knowledge_articles WHERE id = $1`;
      const result = await this.db.query(query, [articleId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToArticle(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get article:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get article by slug
   */
  async getArticleBySlug(slug: string): Promise<KnowledgeArticle | null> {
    try {
      const query = `SELECT * FROM knowledge_articles WHERE slug = $1`;
      const result = await this.db.query(query, [slug]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToArticle(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get article by slug:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Search knowledge articles with filters
   */
  async searchArticles(options: ArticleSearchOptions & PaginationOptions = {}): Promise<PaginationResult<KnowledgeArticle>> {
    try {
      const {
        page = 1,
        pageSize = 20,
        sortBy = 'createdAt',
        sortOrder = 'DESC',
        query,
        category,
        tags,
        status,
        authorId,
        difficulty,
        language,
        featured
      } = options;

      const offset = (page - 1) * pageSize;
      const params: any[] = [];
      const whereConditions: string[] = [];

      if (query) {
        whereConditions.push(`(
          title ILIKE $${params.length + 1} OR
          summary ILIKE $${params.length + 2} OR
          content ILIKE $${params.length + 3}
        )`);
        const queryPattern = `%${query}%`;
        params.push(queryPattern, queryPattern, queryPattern);
      }

      if (category) {
        params.push(category);
        whereConditions.push(`category = $${params.length}`);
      }

      if (tags && tags.length > 0) {
        params.push(tags);
        whereConditions.push(`tags && $${params.length}`);
      }

      if (status) {
        params.push(status);
        whereConditions.push(`status = $${params.length}`);
      }

      if (authorId) {
        params.push(authorId);
        whereConditions.push(`author_id = $${params.length}`);
      }

      if (difficulty) {
        params.push(difficulty);
        whereConditions.push(`(metadata->>'difficulty') = $${params.length}`);
      }

      if (language) {
        params.push(language);
        whereConditions.push(`(metadata->>'language') = $${params.length}`);
      }

      if (featured !== undefined) {
        params.push(featured);
        whereConditions.push(`(metadata->>'featured')::boolean = $${params.length}`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const sortFieldMap: Record<string, string> = {
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        viewCount: 'view_count',
        helpfulCount: 'helpful_count',
        title: 'title'
      };

      const sortField = sortFieldMap[sortBy] || 'created_at';

      const countQuery = `SELECT COUNT(*) FROM knowledge_articles ${whereClause}`;
      const countResult = await this.db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      const dataQuery = `
        SELECT * FROM knowledge_articles
        ${whereClause}
        ORDER BY ${sortField} ${sortOrder}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(pageSize, offset);

      const dataResult = await this.db.query(dataQuery, params);
      const data = dataResult.rows.map((row: any) => this.mapRowToArticle(row));

      return {
        data,
        total,
        page,
        pageSize,
        hasNext: offset + pageSize < total,
        hasPrevious: page > 1
      };
    } catch (error) {
      this.logger.error('Failed to search articles:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Increment article view count
   */
  async incrementArticleViewCount(articleId: string): Promise<void> {
    try {
      const query = `
        UPDATE knowledge_articles
        SET view_count = view_count + 1, updated_at = NOW()
        WHERE id = $1
      `;

      await this.db.query(query, [articleId]);
    } catch (error) {
      this.logger.error('Failed to increment article view count:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Mark article as helpful
   */
  async markArticleHelpful(articleId: string, helpful: boolean): Promise<void> {
    try {
      const field = helpful ? 'helpful_count' : 'not_helpful_count';
      const query = `
        UPDATE knowledge_articles
        SET ${field} = ${field} + 1, updated_at = NOW()
        WHERE id = $1
      `;

      await this.db.query(query, [articleId]);
    } catch (error) {
      this.logger.error('Failed to mark article helpful:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update article status
   */
  async updateArticleStatus(articleId: string, status: string): Promise<void> {
    try {
      const updates: string[] = ['status = $1', 'updated_at = NOW()'];
      const params: any[] = [status, articleId];

      if (status === 'published') {
        updates.push('published_at = NOW()');
      }

      const query = `
        UPDATE knowledge_articles
        SET ${updates.join(', ')}
        WHERE id = $${params.length}
      `;

      await this.db.query(query, params);
      this.logger.info(`Updated article ${articleId} status to ${status}`);
    } catch (error) {
      this.logger.error('Failed to update article status:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Map database row to KnowledgeArticle entity
   */
  private mapRowToArticle(row: any): KnowledgeArticle {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      summary: row.summary,
      content: row.content,
      category: row.category,
      tags: row.tags || [],
      status: row.status,
      authorId: row.author_id,
      authorName: row.author_name,
      reviewerId: row.reviewer_id,
      reviewerName: row.reviewer_name,
      version: row.version,
      relatedArticles: row.related_articles || [],
      attachments: row.attachments,
      viewCount: row.view_count,
      helpfulCount: row.helpful_count,
      notHelpfulCount: row.not_helpful_count,
      lastReviewedAt: row.last_reviewed_at,
      metadata: row.metadata || { difficulty: 'intermediate', readingTime: 5, featured: false, verified: false },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at
    };
  }

  // ============================================================================
  // FAQ OPERATIONS
  // ============================================================================

  /**
   * Get active FAQ entries
   */
  async getActiveFAQs(category?: string): Promise<FAQEntry[]> {
    try {
      let query = `
        SELECT * FROM faq_entries
        WHERE is_active = TRUE
      `;
      const params: any[] = [];

      if (category) {
        query += ` AND category = $1`;
        params.push(category);
      }

      query += ` ORDER BY "order" ASC, created_at ASC`;

      const result = await this.db.query(query, params);
      return result.rows.map((row: any) => this.mapRowToFAQ(row));
    } catch (error) {
      this.logger.error('Failed to get active FAQs:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Create FAQ entry
   */
  async createFAQ(faq: Omit<FAQEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<FAQEntry> {
    try {
      const query = `
        INSERT INTO faq_entries (
          question, answer, category, "order", is_active, view_count,
          helpful_count, tags, related_articles, related_faqs, language
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const params = [
        faq.question,
        faq.answer,
        faq.category,
        faq.order,
        faq.isActive,
        faq.viewCount,
        faq.helpfulCount,
        faq.tags,
        faq.relatedArticles,
        faq.relatedFaqs,
        faq.language || 'en'
      ];

      const result = await this.db.query(query, params);
      return this.mapRowToFAQ(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create FAQ:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update FAQ entry
   */
  async updateFAQ(faqId: string, updates: Partial<FAQEntry>): Promise<FAQEntry | null> {
    try {
      const fields = Object.keys(updates).filter(key => updates[key as keyof FAQEntry] !== undefined);
      if (fields.length === 0) {
        return this.getFAQ(faqId);
      }

      const setClauses: string[] = [];
      const params: any[] = [];

      for (const field of fields) {
        const camelToSnake = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        const snakeField = camelToSnake(field);
        setClauses.push(`${snakeField} = $${params.length + 1}`);
        params.push(updates[field as keyof FAQEntry]);
      }

      setClauses.push('updated_at = NOW()');
      params.push(faqId);

      const query = `
        UPDATE faq_entries
        SET ${setClauses.join(', ')}
        WHERE id = $${params.length}
        RETURNING *
      `;

      const result = await this.db.query(query, params);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToFAQ(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update FAQ:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get FAQ by ID
   */
  async getFAQ(faqId: string): Promise<FAQEntry | null> {
    try {
      const query = `SELECT * FROM faq_entries WHERE id = $1`;
      const result = await this.db.query(query, [faqId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToFAQ(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get FAQ:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Map database row to FAQEntry entity
   */
  private mapRowToFAQ(row: any): FAQEntry {
    return {
      id: row.id,
      question: row.question,
      answer: row.answer,
      category: row.category,
      order: row.order,
      isActive: row.is_active,
      viewCount: row.view_count,
      helpfulCount: row.helpful_count,
      tags: row.tags || [],
      relatedArticles: row.related_articles,
      relatedFaqs: row.related_faqs,
      language: row.language,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // ============================================================================
  // DEVELOPER PROFILE OPERATIONS
  // ============================================================================

  /**
   * Create developer profile
   */
  async createDeveloperProfile(profile: Omit<DeveloperProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeveloperProfile> {
    try {
      const query = `
        INSERT INTO developer_profiles (
          user_id, username, display_name, avatar, bio, skills, projects,
          social_links, availability, hourly_rate, location, timezone, languages,
          rating_summary, stats, is_verified, is_hireable
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *
      `;

      const params = [
        profile.userId,
        profile.username,
        profile.displayName,
        profile.avatar,
        profile.bio,
        JSON.stringify(profile.skills || []),
        JSON.stringify(profile.projects || []),
        JSON.stringify(profile.socialLinks || {}),
        profile.availability,
        profile.hourlyRate,
        profile.location,
        profile.timezone,
        profile.languages,
        JSON.stringify(profile.ratingSummary || { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }),
        JSON.stringify(profile.stats || { contributions: 0, pullRequests: 0, issuesResolved: 0, projectsCompleted: 0, hoursContributed: 0, lastActiveAt: new Date() }),
        profile.isVerified,
        profile.isHireable
      ];

      const result = await this.db.query(query, params);
      return this.mapRowToDeveloperProfile(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create developer profile:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get developer profile by user ID
   */
  async getDeveloperProfile(userId: string): Promise<DeveloperProfile | null> {
    try {
      const query = `SELECT * FROM developer_profiles WHERE user_id = $1`;
      const result = await this.db.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToDeveloperProfile(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get developer profile:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Search developer profiles with filters
   */
  async searchDeveloperProfiles(options: DeveloperSearchOptions & PaginationOptions = {}): Promise<PaginationResult<DeveloperProfile>> {
    try {
      const {
        page = 1,
        pageSize = 20,
        sortBy = 'rating',
        sortOrder = 'DESC',
        query,
        skills,
        availability,
        location,
        timezone,
        languages,
        minRating,
        isVerified,
        isHireable
      } = options;

      const offset = (page - 1) * pageSize;
      const params: any[] = [];
      const whereConditions: string[] = [];

      if (query) {
        whereConditions.push(`(
          username ILIKE $${params.length + 1} OR
          display_name ILIKE $${params.length + 2} OR
          bio ILIKE $${params.length + 3}
        )`);
        const queryPattern = `%${query}%`;
        params.push(queryPattern, queryPattern, queryPattern);
      }

      if (skills && skills.length > 0) {
        whereConditions.push(`(skills->>'name')::text = ANY($${params.length + 1})`);
        params.push(skills);
      }

      if (availability) {
        params.push(availability);
        whereConditions.push(`availability = $${params.length}`);
      }

      if (location) {
        params.push(`%${location}%`);
        whereConditions.push(`location ILIKE $${params.length}`);
      }

      if (timezone) {
        params.push(timezone);
        whereConditions.push(`timezone = $${params.length}`);
      }

      if (languages && languages.length > 0) {
        params.push(languages);
        whereConditions.push(`languages && $${params.length}`);
      }

      if (minRating !== undefined) {
        params.push(minRating);
        whereConditions.push(`(rating_summary->>'average')::numeric >= $${params.length}`);
      }

      if (isVerified !== undefined) {
        params.push(isVerified);
        whereConditions.push(`is_verified = $${params.length}`);
      }

      if (isHireable !== undefined) {
        params.push(isHireable);
        whereConditions.push(`is_hireable = $${params.length}`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const sortFieldMap: Record<string, string> = {
        rating: '(rating_summary->>"average")::numeric',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        username: 'username'
      };

      const sortField = sortFieldMap[sortBy] || '(rating_summary->>"average")::numeric';

      const countQuery = `SELECT COUNT(*) FROM developer_profiles ${whereClause}`;
      const countResult = await this.db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      const dataQuery = `
        SELECT * FROM developer_profiles
        ${whereClause}
        ORDER BY ${sortField} ${sortOrder}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(pageSize, offset);

      const dataResult = await this.db.query(dataQuery, params);
      const data = dataResult.rows.map((row: any) => this.mapRowToDeveloperProfile(row));

      return {
        data,
        total,
        page,
        pageSize,
        hasNext: offset + pageSize < total,
        hasPrevious: page > 1
      };
    } catch (error) {
      this.logger.error('Failed to search developer profiles:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update developer profile
   */
  async updateDeveloperProfile(userId: string, updates: Partial<DeveloperProfile>): Promise<DeveloperProfile | null> {
    try {
      const fields = Object.keys(updates).filter(key => updates[key as keyof DeveloperProfile] !== undefined);
      if (fields.length === 0) {
        return this.getDeveloperProfile(userId);
      }

      const setClauses: string[] = [];
      const params: any[] = [];

      for (const field of fields) {
        const camelToSnake = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        const snakeField = camelToSnake(field);
        setClauses.push(`${snakeField} = $${params.length + 1}`);
        params.push(updates[field as keyof DeveloperProfile]);
      }

      setClauses.push('updated_at = NOW()');
      params.push(userId);

      const query = `
        UPDATE developer_profiles
        SET ${setClauses.join(', ')}
        WHERE user_id = $${params.length}
        RETURNING *
      `;

      const result = await this.db.query(query, params);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToDeveloperProfile(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update developer profile:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Map database row to DeveloperProfile entity
   */
  private mapRowToDeveloperProfile(row: any): DeveloperProfile {
    return {
      id: row.id,
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar,
      bio: row.bio,
      skills: row.skills ? (row.skills as DeveloperSkill[]) : [],
      projects: row.projects ? (row.projects as DeveloperProject[]) : [],
      socialLinks: row.social_links || {},
      availability: row.availability,
      hourlyRate: row.hourly_rate,
      location: row.location,
      timezone: row.timezone,
      languages: row.languages || [],
      ratingSummary: row.rating_summary || { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
      stats: row.stats || { contributions: 0, pullRequests: 0, issuesResolved: 0, projectsCompleted: 0, hoursContributed: 0, lastActiveAt: new Date() },
      isVerified: row.is_verified,
      isHireable: row.is_hireable,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // ============================================================================
  // CONTRIBUTION OPERATIONS
  // ============================================================================

  /**
   * Create contribution
   */
  async createContribution(contribution: Omit<Contribution, 'id' | 'createdAt' | 'updatedAt'>): Promise<Contribution> {
    try {
      const query = `
        INSERT INTO contributions (
          contributor_id, contributor_name, contributor_avatar, type, title,
          description, repository, pull_request_url, issue_url, status,
          review_status, reviewers, labels, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;

      const params = [
        contribution.contributorId,
        contribution.contributorName,
        contribution.contributorAvatar,
        contribution.type,
        contribution.title,
        contribution.description,
        contribution.repository,
        contribution.pullRequestUrl,
        contribution.issueUrl,
        contribution.status,
        contribution.reviewStatus,
        contribution.reviewers,
        contribution.labels,
        JSON.stringify(contribution.metadata || {})
      ];

      const result = await this.db.query(query, params);
      return this.mapRowToContribution(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create contribution:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get contribution by ID
   */
  async getContribution(contributionId: string): Promise<Contribution | null> {
    try {
      const query = `SELECT * FROM contributions WHERE id = $1`;
      const result = await this.db.query(query, [contributionId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToContribution(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get contribution:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get contributions by contributor
   */
  async getContributionsByContributor(contributorId: string, options: QueryOptions = {}): Promise<Contribution[]> {
    try {
      const params: any[] = [contributorId];
      let query = `SELECT * FROM contributions WHERE contributor_id = $1`;

      if (options.where) {
        query += ` AND ${options.where}`;
        if (options.params) {
          params.push(...options.params);
        }
      }

      if (options.orderBy) {
        query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
      } else {
        query += ` ORDER BY created_at DESC`;
      }

      if (options.limit) {
        query += ` LIMIT ${options.limit}`;
      }

      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }

      const result = await this.db.query(query, params);
      return result.rows.map((row: any) => this.mapRowToContribution(row));
    } catch (error) {
      this.logger.error('Failed to get contributions by contributor:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update contribution status
   */
  async updateContributionStatus(contributionId: string, status: string): Promise<void> {
    try {
      const updates: string[] = ['status = $1', 'updated_at = NOW()'];
      const params: any[] = [status, contributionId];

      if (status === 'merged') {
        updates.push('merged_at = NOW()');
      }

      const query = `
        UPDATE contributions
        SET ${updates.join(', ')}
        WHERE id = $${params.length}
      `;

      await this.db.query(query, params);
      this.logger.info(`Updated contribution ${contributionId} status to ${status}`);
    } catch (error) {
      this.logger.error('Failed to update contribution status:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update contribution review status
   */
  async updateContributionReviewStatus(contributionId: string, reviewStatus: string): Promise<void> {
    try {
      const query = `
        UPDATE contributions
        SET review_status = $1, updated_at = NOW()
        WHERE id = $2
      `;

      await this.db.query(query, [reviewStatus, contributionId]);
      this.logger.info(`Updated contribution ${contributionId} review status to ${reviewStatus}`);
    } catch (error) {
      this.logger.error('Failed to update contribution review status:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Map database row to Contribution entity
   */
  private mapRowToContribution(row: any): Contribution {
    return {
      id: row.id,
      contributorId: row.contributor_id,
      contributorName: row.contributor_name,
      contributorAvatar: row.contributor_avatar,
      type: row.type,
      title: row.title,
      description: row.description,
      repository: row.repository,
      pullRequestUrl: row.pull_request_url,
      issueUrl: row.issue_url,
      status: row.status,
      reviewStatus: row.review_status,
      reviewers: row.reviewers || [],
      labels: row.labels || [],
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      mergedAt: row.merged_at
    };
  }
}
