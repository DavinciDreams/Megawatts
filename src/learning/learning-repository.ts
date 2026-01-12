/**
 * Learning Repository
 * 
 * Repository for learning data persistence.
 * Extends the base repository pattern and provides CRUD operations
 * for patterns, behaviors, knowledge entries, learning events, and capability profiles.
 */

import { BaseRepository, QueryOptions } from '../storage/repositories/base.js';
import { PostgresConnectionManager } from '../storage/database/postgres.js';
import { Logger } from '../utils/logger.js';
import {
  Pattern,
  Behavior,
  Knowledge,
  LearningEvent,
  CapabilityProfile,
  ABTestExperiment,
  ABTestVariant,
  ABTestAssignment,
  PatternQueryOptions,
  BehaviorQueryOptions,
  KnowledgeQueryOptions,
  LearningEventQueryOptions,
  PatternType,
  BehaviorType,
  KnowledgeType,
  LearningEventType
} from './learning-models.js';

/**
 * Repository for Pattern entities
 */
export class PatternRepository extends BaseRepository<Pattern> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'learning_patterns', 'id');
  }

  protected mapRowToEntity(row: any): Pattern {
    return {
      id: row.id,
      type: row.type as PatternType,
      name: row.name,
      description: row.description,
      confidence: row.confidence,
      frequency: row.frequency,
      last_observed: row.last_observed,
      first_observed: row.first_observed,
      context: row.context,
      examples: row.examples,
      metadata: row.metadata,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  protected getEntityName(): string {
    return 'Pattern';
  }

  /**
   * Find patterns by query options
   */
  async findByOptions(options: PatternQueryOptions = {}): Promise<Pattern[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.type) {
      conditions.push(`type = $${paramIndex++}`);
      params.push(options.type);
    }

    if (options.min_confidence !== undefined) {
      conditions.push(`confidence >= $${paramIndex++}`);
      params.push(options.min_confidence);
    }

    if (options.min_frequency !== undefined) {
      conditions.push(`frequency >= $${paramIndex++}`);
      params.push(options.min_frequency);
    }

    if (options.is_active !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(options.is_active);
    }

    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : undefined;

    return this.findMany({
      where: whereClause,
      params,
      limit: options.limit,
      offset: options.offset,
      orderBy: 'confidence',
      orderDirection: 'DESC'
    });
  }

  /**
   * Find patterns by type
   */
  async findByType(type: PatternType): Promise<Pattern[]> {
    return this.findByOptions({ type });
  }

  /**
   * Find active patterns
   */
  async findActive(): Promise<Pattern[]> {
    return this.findByOptions({ is_active: true });
  }

  /**
   * Update pattern frequency
   */
  async incrementFrequency(id: string): Promise<Pattern | null> {
    const pattern = await this.findById(id);
    if (!pattern) {
      return null;
    }

    return this.update(id, {
      frequency: pattern.frequency + 1,
      last_observed: new Date(),
      updated_at: new Date()
    });
  }

  /**
   * Deactivate pattern
   */
  async deactivate(id: string): Promise<Pattern | null> {
    return this.update(id, { is_active: false, updated_at: new Date() });
  }

  /**
   * Activate pattern
   */
  async activate(id: string): Promise<Pattern | null> {
    return this.update(id, { is_active: true, updated_at: new Date() });
  }
}

/**
 * Repository for Behavior entities
 */
export class BehaviorRepository extends BaseRepository<Behavior> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'learning_behaviors', 'id');
  }

  protected mapRowToEntity(row: any): Behavior {
    return {
      id: row.id,
      type: row.type as BehaviorType,
      name: row.name,
      description: row.description,
      config: row.config,
      effectiveness_score: row.effectiveness_score,
      usage_count: row.usage_count,
      success_count: row.success_count,
      failure_count: row.failure_count,
      last_used: row.last_used,
      last_modified: row.last_modified,
      requires_approval: row.requires_approval,
      safety_constraints: row.safety_constraints,
      metadata: row.metadata,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  protected getEntityName(): string {
    return 'Behavior';
  }

  /**
   * Find behaviors by query options
   */
  async findByOptions(options: BehaviorQueryOptions = {}): Promise<Behavior[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.type) {
      conditions.push(`type = $${paramIndex++}`);
      params.push(options.type);
    }

    if (options.min_effectiveness !== undefined) {
      conditions.push(`effectiveness_score >= $${paramIndex++}`);
      params.push(options.min_effectiveness);
    }

    if (options.requires_approval !== undefined) {
      conditions.push(`requires_approval = $${paramIndex++}`);
      params.push(options.requires_approval);
    }

    if (options.is_active !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(options.is_active);
    }

    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : undefined;

    return this.findMany({
      where: whereClause,
      params,
      limit: options.limit,
      offset: options.offset,
      orderBy: 'effectiveness_score',
      orderDirection: 'DESC'
    });
  }

  /**
   * Find behaviors by type
   */
  async findByType(type: BehaviorType): Promise<Behavior[]> {
    return this.findByOptions({ type });
  }

  /**
   * Find behaviors requiring approval
   */
  async findRequiringApproval(): Promise<Behavior[]> {
    return this.findByOptions({ requires_approval: true });
  }

  /**
   * Record behavior usage
   */
  async recordUsage(id: string, success: boolean): Promise<Behavior | null> {
    const behavior = await this.findById(id);
    if (!behavior) {
      return null;
    }

    const updates: Partial<Behavior> = {
      usage_count: behavior.usage_count + 1,
      last_used: new Date(),
      updated_at: new Date()
    };

    if (success) {
      updates.success_count = behavior.success_count + 1;
      updates.effectiveness_score = (behavior.success_count + 1) / (behavior.usage_count + 1);
    } else {
      updates.failure_count = behavior.failure_count + 1;
      updates.effectiveness_score = behavior.success_count / (behavior.usage_count + 1);
    }

    return this.update(id, updates);
  }

  /**
   * Update behavior config
   */
  async updateConfig(id: string, config: Record<string, any>): Promise<Behavior | null> {
    return this.update(id, {
      config,
      last_modified: new Date(),
      updated_at: new Date()
    });
  }
}

/**
 * Repository for Knowledge entities
 */
export class KnowledgeRepository extends BaseRepository<Knowledge> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'learning_knowledge', 'id');
  }

  protected mapRowToEntity(row: any): Knowledge {
    return {
      id: row.id,
      type: row.type as KnowledgeType,
      title: row.title,
      content: row.content,
      source: row.source,
      confidence: row.confidence,
      privacy_level: row.privacy_level,
      user_id: row.user_id,
      guild_id: row.guild_id,
      tags: row.tags,
      validation_status: row.validation_status,
      validated_at: row.validated_at,
      validated_by: row.validated_by,
      usage_count: row.usage_count,
      last_used: row.last_used,
      expires_at: row.expires_at,
      is_archived: row.is_archived,
      metadata: row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  protected getEntityName(): string {
    return 'Knowledge';
  }

  /**
   * Find knowledge by query options
   */
  async findByOptions(options: KnowledgeQueryOptions = {}): Promise<Knowledge[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.type) {
      conditions.push(`type = $${paramIndex++}`);
      params.push(options.type);
    }

    if (options.privacy_level) {
      conditions.push(`privacy_level = $${paramIndex++}`);
      params.push(options.privacy_level);
    }

    if (options.user_id) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(options.user_id);
    }

    if (options.guild_id) {
      conditions.push(`guild_id = $${paramIndex++}`);
      params.push(options.guild_id);
    }

    if (options.min_confidence !== undefined) {
      conditions.push(`confidence >= $${paramIndex++}`);
      params.push(options.min_confidence);
    }

    if (options.is_active !== undefined) {
      conditions.push(`is_archived = $${paramIndex++}`);
      params.push(!options.is_active);
    }

    if (options.tags && options.tags.length > 0) {
      const tagConditions = options.tags.map(() => `$${paramIndex++}`).join(', ');
      conditions.push(`tags && ARRAY[${tagConditions}]::TEXT[]`);
      params.push(...options.tags);
    }

    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : undefined;

    return this.findMany({
      where: whereClause,
      params,
      limit: options.limit,
      offset: options.offset,
      orderBy: 'confidence',
      orderDirection: 'DESC'
    });
  }

  /**
   * Find knowledge by tags
   */
  async findByTags(tags: string[]): Promise<Knowledge[]> {
    return this.findByOptions({ tags });
  }

  /**
   * Find validated knowledge
   */
  async findValidated(): Promise<Knowledge[]> {
    const result = await this.executeCustomQuery<Knowledge>(
      `SELECT * FROM ${this.tableName} WHERE validation_status = 'validated' AND is_archived = false ORDER BY confidence DESC`
    );
    return result.map(row => this.mapRowToEntity(row));
  }

  /**
   * Find expired knowledge
   */
  async findExpired(): Promise<Knowledge[]> {
    const result = await this.executeCustomQuery<Knowledge>(
      `SELECT * FROM ${this.tableName} WHERE expires_at < NOW() AND is_archived = false`
    );
    return result.map(row => this.mapRowToEntity(row));
  }

  /**
   * Validate knowledge
   */
  async validate(id: string, validatedBy: string): Promise<Knowledge | null> {
    return this.update(id, {
      validation_status: 'validated',
      validated_at: new Date(),
      validated_by: validatedBy,
      updated_at: new Date()
    });
  }

  /**
   * Reject knowledge
   */
  async reject(id: string): Promise<Knowledge | null> {
    return this.update(id, {
      validation_status: 'rejected',
      updated_at: new Date()
    });
  }

  /**
   * Archive knowledge
   */
  async archive(id: string): Promise<Knowledge | null> {
    return this.update(id, { is_archived: true, updated_at: new Date() });
  }

  /**
   * Record knowledge usage
   */
  async recordUsage(id: string): Promise<Knowledge | null> {
    const knowledge = await this.findById(id);
    if (!knowledge) {
      return null;
    }

    return this.update(id, {
      usage_count: knowledge.usage_count + 1,
      last_used: new Date(),
      updated_at: new Date()
    });
  }

  /**
   * Search knowledge by content
   */
  async searchContent(query: string, limit: number = 10): Promise<Knowledge[]> {
    const result = await this.executeCustomQuery<Knowledge>(
      `SELECT * FROM ${this.tableName} 
       WHERE (title ILIKE $1 OR content ILIKE $1) 
       AND is_archived = false 
       ORDER BY confidence DESC 
       LIMIT $2`,
      [`%${query}%`, limit]
    );
    return result.map(row => this.mapRowToEntity(row));
  }
}

/**
 * Repository for LearningEvent entities
 */
export class LearningEventRepository extends BaseRepository<LearningEvent> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'learning_events', 'id');
  }

  protected mapRowToEntity(row: any): LearningEvent {
    return {
      id: row.id,
      event_type: row.event_type as LearningEventType,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      description: row.description,
      details: row.details,
      user_id: row.user_id,
      guild_id: row.guild_id,
      success: row.success,
      error_message: row.error_message,
      metadata: row.metadata,
      created_at: row.created_at
    };
  }

  protected getEntityName(): string {
    return 'LearningEvent';
  }

  /**
   * Find events by query options
   */
  async findByOptions(options: LearningEventQueryOptions = {}): Promise<LearningEvent[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.event_type) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(options.event_type);
    }

    if (options.entity_type) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(options.entity_type);
    }

    if (options.entity_id) {
      conditions.push(`entity_id = $${paramIndex++}`);
      params.push(options.entity_id);
    }

    if (options.user_id) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(options.user_id);
    }

    if (options.guild_id) {
      conditions.push(`guild_id = $${paramIndex++}`);
      params.push(options.guild_id);
    }

    if (options.success !== undefined) {
      conditions.push(`success = $${paramIndex++}`);
      params.push(options.success);
    }

    if (options.from_date) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(options.from_date);
    }

    if (options.to_date) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(options.to_date);
    }

    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : undefined;

    return this.findMany({
      where: whereClause,
      params,
      limit: options.limit,
      offset: options.offset,
      orderBy: 'created_at',
      orderDirection: 'DESC'
    });
  }

  /**
   * Find events by entity
   */
  async findByEntity(entityType: string, entityId: string): Promise<LearningEvent[]> {
    return this.findByOptions({ entity_type: entityType, entity_id: entityId });
  }

  /**
   * Find events by type
   */
  async findByType(eventType: LearningEventType): Promise<LearningEvent[]> {
    return this.findByOptions({ event_type: eventType });
  }

  /**
   * Find failed events
   */
  async findFailed(): Promise<LearningEvent[]> {
    return this.findByOptions({ success: false });
  }

  /**
   * Get event statistics
   */
  async getStatistics(fromDate?: Date): Promise<{
    total: number;
    successful: number;
    failed: number;
    by_type: Record<string, number>;
  }> {
    let query = 'SELECT event_type, success, COUNT(*) as count FROM learning_events';
    const params: any[] = [];

    if (fromDate) {
      query += ' WHERE created_at >= $1';
      params.push(fromDate);
    }

    query += ' GROUP BY event_type, success';

    const result = await this.executeCustomQuery<{ event_type: string; success: boolean; count: number }>(query, params);

    const stats = {
      total: 0,
      successful: 0,
      failed: 0,
      by_type: {} as Record<string, number>
    };

    for (const row of result) {
      stats.total += row.count;
      if (row.success) {
        stats.successful += row.count;
      } else {
        stats.failed += row.count;
      }
      stats.by_type[row.event_type] = (stats.by_type[row.event_type] || 0) + row.count;
    }

    return stats;
  }
}

/**
 * Repository for CapabilityProfile entities
 */
export class CapabilityProfileRepository extends BaseRepository<CapabilityProfile> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'capability_profiles', 'id');
  }

  protected mapRowToEntity(row: any): CapabilityProfile {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      capabilities: row.capabilities,
      integration_points: row.integration_points,
      performance_metrics: row.performance_metrics,
      last_updated: row.last_updated,
      metadata: row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  protected getEntityName(): string {
    return 'CapabilityProfile';
  }

  /**
   * Find latest profile
   */
  async findLatest(): Promise<CapabilityProfile | null> {
    return this.findOne({
      orderBy: 'last_updated',
      orderDirection: 'DESC'
    });
  }

  /**
   * Update profile
   */
  async updateProfile(id: string, profile: Partial<CapabilityProfile>): Promise<CapabilityProfile | null> {
    return this.update(id, {
      ...profile,
      last_updated: new Date(),
      updated_at: new Date()
    });
  }
}

/**
 * Main Learning Repository
 * Exports all sub-repositories for unified access
 */
export class LearningRepository {
  public readonly patterns: PatternRepository;
  public readonly behaviors: BehaviorRepository;
  public readonly knowledge: KnowledgeRepository;
  public readonly events: LearningEventRepository;
  public readonly capabilities: CapabilityProfileRepository;

  constructor(db: PostgresConnectionManager, logger: Logger) {
    this.patterns = new PatternRepository(db);
    this.behaviors = new BehaviorRepository(db);
    this.knowledge = new KnowledgeRepository(db);
    this.events = new LearningEventRepository(db);
    this.capabilities = new CapabilityProfileRepository(db);

    logger.info('Learning repository initialized');
  }

  /**
   * Initialize database tables
   */
  async initialize(): Promise<void> {
    // Tables are created via migrations, this is for any additional setup
    // Could include creating indexes, triggers, etc.
  }
}
