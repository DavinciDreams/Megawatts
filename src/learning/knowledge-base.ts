/**
 * Knowledge Base
 * 
 * Manages structured storage, validation, indexing, retrieval,
 * sharing with privacy controls, selective forgetting, and auditing
 * of learned knowledge.
 */

import { Logger } from '../utils/logger.js';
import { LearningRepository } from './learning-repository.js';
import { LearningConstraints } from './learning-models.js';
import {
  Knowledge,
  KnowledgeType,
  PrivacyLevel,
  KnowledgeQueryOptions
} from './learning-models.js';

/**
 * Knowledge entry data
 */
interface KnowledgeEntryData {
  type: KnowledgeType;
  title: string;
  content: string;
  source: string;
  confidence: number;
  privacy_level: PrivacyLevel;
  user_id?: string;
  guild_id?: string;
  tags: string[];
  metadata?: Record<string, any>;
  expires_at?: Date;
}

/**
 * Knowledge validation result
 */
interface ValidationResult {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Knowledge index entry
 */
interface KnowledgeIndex {
  knowledge_id: string;
  keywords: string[];
  tags: string[];
  type: KnowledgeType;
  confidence: number;
  created_at: Date;
}

/**
 * Knowledge audit record
 */
interface KnowledgeAuditRecord {
  id: string;
  knowledge_id: string;
  action: 'created' | 'updated' | 'validated' | 'rejected' | 'archived' | 'forgotten' | 'accessed';
  user_id?: string;
  timestamp: Date;
  details: Record<string, any>;
}

/**
 * Knowledge Base class
 * Manages knowledge storage, retrieval, and lifecycle
 */
export class KnowledgeBase {
  private logger: Logger;
  private repository: LearningRepository;
  private constraints: LearningConstraints;
  private knowledgeCache: Map<string, Knowledge> = new Map();
  private knowledgeIndex: Map<string, KnowledgeIndex> = new Map();
  private auditLog: KnowledgeAuditRecord[] = [];

  constructor(
    repository: LearningRepository,
    constraints?: Partial<LearningConstraints>
  ) {
    this.repository = repository;
    this.logger = new Logger('KnowledgeBase');
    
    // Default constraints
    this.constraints = {
      max_patterns_per_type: 1000,
      max_behaviors_per_type: 500,
      max_knowledge_entries: 10000,
      min_confidence_threshold: 0.5,
      min_effectiveness_threshold: 0.6,
      require_approval_for: ['strategy', 'parameter'],
      forbidden_patterns: [],
      safety_boundaries: [
        'no_user_data_exposure',
        'no_unauthorized_modifications',
        'no_privilege_escalation'
      ],
      privacy_protection_enabled: true,
      bias_detection_enabled: true,
      explainability_enabled: true,
      ...constraints
    };

    this.logger.info('Knowledge Base initialized');
  }

  /**
   * Create a new knowledge entry
   * @param data - Knowledge entry data
   * @returns Created knowledge entry
   */
  async create(data: KnowledgeEntryData): Promise<Knowledge> {
    try {
      this.logger.info(`Creating knowledge entry: ${data.title}`);

      // Validate data
      const validation = this.validateKnowledgeData(data);
      if (!validation.is_valid) {
        throw new Error(`Invalid knowledge data: ${validation.errors.join(', ')}`);
      }

      // Check constraints
      await this.checkConstraints(data);

      // Create knowledge
      const knowledge: Knowledge = {
        id: `knowledge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: data.type,
        title: data.title,
        content: data.content,
        source: data.source,
        confidence: data.confidence,
        privacy_level: data.privacy_level,
        user_id: data.user_id,
        guild_id: data.guild_id,
        tags: data.tags || [],
        validation_status: 'pending',
        usage_count: 0,
        expires_at: data.expires_at,
        is_archived: false,
        metadata: data.metadata || {},
        created_at: new Date(),
        updated_at: new Date()
      };

      const created = await this.repository.knowledge.create(knowledge);

      // Cache knowledge
      this.knowledgeCache.set(created.id, created);

      // Index knowledge
      this.indexKnowledge(created);

      // Audit log
      this.auditLog.push({
        id: `audit_${Date.now()}`,
        knowledge_id: created.id,
        action: 'created',
        timestamp: new Date(),
        details: { type: data.type, source: data.source }
      });

      // Keep audit log manageable
      if (this.auditLog.length > 5000) {
        this.auditLog = this.auditLog.slice(-2500);
      }

      this.logger.info(`Knowledge entry created: ${created.id}`);
      return created;
    } catch (error) {
      this.logger.error(`Failed to create knowledge entry: ${data.title}`, error);
      throw error;
    }
  }

  /**
   * Retrieve knowledge by ID
   * @param knowledgeId - Knowledge ID
   * @returns Knowledge entry or null
   */
  async retrieve(knowledgeId: string, userId?: string, guildId?: string): Promise<Knowledge | null> {
    try {
      // Check cache first
      const cached = this.knowledgeCache.get(knowledgeId);
      if (cached) {
        // Check privacy
        if (!this.hasAccess(cached, userId, guildId)) {
          this.logger.warn(`Access denied to knowledge ${knowledgeId}`);
          return null;
        }

        // Record access in audit log
        this.auditLog.push({
          id: `audit_${Date.now()}`,
          knowledge_id: knowledgeId,
          action: 'accessed',
          user_id: userId,
          timestamp: new Date(),
          details: {}
        });

        // Update usage
        await this.repository.knowledge.recordUsage(knowledgeId);
        cached.usage_count++;
        cached.last_used = new Date();

        return cached;
      }

      // Fetch from repository
      const knowledge = await this.repository.knowledge.findById(knowledgeId);
      if (!knowledge) {
        return null;
      }

      // Check privacy
      if (!this.hasAccess(knowledge, userId, guildId)) {
        this.logger.warn(`Access denied to knowledge ${knowledgeId}`);
        return null;
      }

      // Cache knowledge
      this.knowledgeCache.set(knowledgeId, knowledge);

      // Record access in audit log
      this.auditLog.push({
        id: `audit_${Date.now()}`,
        knowledge_id: knowledgeId,
        action: 'accessed',
        user_id: userId,
        timestamp: new Date(),
        details: {}
      });

      // Update usage
      await this.repository.knowledge.recordUsage(knowledgeId);
      knowledge.usage_count++;
      knowledge.last_used = new Date();

      return knowledge;
    } catch (error) {
      this.logger.error(`Failed to retrieve knowledge ${knowledgeId}:`, error);
      throw error;
    }
  }

  /**
   * Search knowledge
   * @param query - Search query
   * @param options - Query options
   * @returns Array of matching knowledge entries
   */
  async search(
    query: string,
    options: KnowledgeQueryOptions = {},
    userId?: string,
    guildId?: string
  ): Promise<Knowledge[]> {
    try {
      this.logger.debug(`Searching knowledge for: ${query}`);

      // Search by content
      const results = await this.repository.knowledge.searchContent(query, options.limit || 50);

      // Filter by privacy and options
      const filtered = results.filter(knowledge => {
        // Check privacy
        if (!this.hasAccess(knowledge, userId, guildId)) {
          return false;
        }

        // Apply filters
        if (options.type && knowledge.type !== options.type) {
          return false;
        }
        if (options.privacy_level && knowledge.privacy_level !== options.privacy_level) {
          return false;
        }
        if (options.min_confidence && knowledge.confidence < options.min_confidence) {
          return false;
        }
        if (options.is_active !== undefined && knowledge.is_archived !== !options.is_active) {
          return false;
        }

        return true;
      });

      this.logger.debug(`Found ${filtered.length} knowledge entries`);
      return filtered;
    } catch (error) {
      this.logger.error(`Failed to search knowledge: ${query}`, error);
      throw error;
    }
  }

  /**
   * Query knowledge with options
   * @param options - Query options
   * @returns Array of knowledge entries
   */
  async query(options: KnowledgeQueryOptions = {}, userId?: string, guildId?: string): Promise<Knowledge[]> {
    try {
      this.logger.debug('Querying knowledge with options');

      const results = await this.repository.knowledge.findByOptions(options);

      // Filter by privacy
      const filtered = results.filter(knowledge => 
        this.hasAccess(knowledge, userId, guildId)
      );

      this.logger.debug(`Found ${filtered.length} knowledge entries`);
      return filtered;
    } catch (error) {
      this.logger.error('Failed to query knowledge:', error);
      throw error;
    }
  }

  /**
   * Validate knowledge
   * @param knowledgeId - Knowledge ID
   * @param validatedBy - User ID of validator
   * @returns Validated knowledge
   */
  async validate(knowledgeId: string, validatedBy: string): Promise<Knowledge | null> {
    try {
      this.logger.info(`Validating knowledge: ${knowledgeId}`);

      const knowledge = await this.repository.knowledge.findById(knowledgeId);
      if (!knowledge) {
        throw new Error(`Knowledge not found: ${knowledgeId}`);
      }

      // Validate knowledge
      const validation = this.validateKnowledgeContent(knowledge);
      if (!validation.is_valid) {
        await this.repository.knowledge.reject(knowledgeId);
        this.logger.warn(`Knowledge rejected: ${validation.errors.join(', ')}`);
        return null;
      }

      // Mark as validated
      const validated = await this.repository.knowledge.validate(knowledgeId, validatedBy);

      // Update cache
      this.knowledgeCache.set(knowledgeId, validated);

      // Audit log
      this.auditLog.push({
        id: `audit_${Date.now()}`,
        knowledge_id: knowledgeId,
        action: 'validated',
        user_id: validatedBy,
        timestamp: new Date(),
        details: { warnings: validation.warnings }
      });

      this.logger.info(`Knowledge validated: ${knowledgeId}`);
      return validated;
    } catch (error) {
      this.logger.error(`Failed to validate knowledge ${knowledgeId}:`, error);
      throw error;
    }
  }

  /**
   * Update knowledge
   * @param knowledgeId - Knowledge ID
   * @param updates - Updates to apply
   * @returns Updated knowledge
   */
  async update(knowledgeId: string, updates: Partial<KnowledgeEntryData>): Promise<Knowledge | null> {
    try {
      this.logger.info(`Updating knowledge: ${knowledgeId}`);

      const knowledge = await this.repository.knowledge.findById(knowledgeId);
      if (!knowledge) {
        return null;
      }

      // Apply updates
      const updated = await this.repository.knowledge.update(knowledgeId, {
        ...updates,
        updated_at: new Date()
      });

      if (!updated) {
        return null;
      }

      // Update cache
      this.knowledgeCache.set(knowledgeId, updated);

      // Re-index if tags or content changed
      if (updates.tags || updates.content) {
        this.indexKnowledge(updated);
      }

      // Audit log
      this.auditLog.push({
        id: `audit_${Date.now()}`,
        knowledge_id: knowledgeId,
        action: 'updated',
        timestamp: new Date(),
        details: { updates }
      });

      this.logger.info(`Knowledge updated: ${knowledgeId}`);
      return updated;
    } catch (error) {
      this.logger.error(`Failed to update knowledge ${knowledgeId}:`, error);
      throw error;
    }
  }

  /**
   * Archive knowledge
   * @param knowledgeId - Knowledge ID
   * @returns Archived knowledge
   */
  async archive(knowledgeId: string): Promise<Knowledge | null> {
    try {
      this.logger.info(`Archiving knowledge: ${knowledgeId}`);

      const archived = await this.repository.knowledge.archive(knowledgeId);
      if (!archived) {
        return null;
      }

      // Update cache
      this.knowledgeCache.set(knowledgeId, archived);

      // Audit log
      this.auditLog.push({
        id: `audit_${Date.now()}`,
        knowledge_id: knowledgeId,
        action: 'archived',
        timestamp: new Date(),
        details: {}
      });

      this.logger.info(`Knowledge archived: ${knowledgeId}`);
      return archived;
    } catch (error) {
      this.logger.error(`Failed to archive knowledge ${knowledgeId}:`, error);
      throw error;
    }
  }

  /**
   * Forget (delete) knowledge
   * @param knowledgeId - Knowledge ID
   * @param reason - Reason for forgetting
   * @returns Success status
   */
  async forget(knowledgeId: string, reason?: string): Promise<boolean> {
    try {
      this.logger.info(`Forgetting knowledge: ${knowledgeId}`);

      const knowledge = await this.repository.knowledge.findById(knowledgeId);
      if (!knowledge) {
        return false;
      }

      // Delete from repository
      const deleted = await this.repository.knowledge.delete(knowledgeId);

      if (deleted) {
        // Remove from cache
        this.knowledgeCache.delete(knowledgeId);
        this.knowledgeIndex.delete(knowledgeId);

        // Audit log
        this.auditLog.push({
          id: `audit_${Date.now()}`,
          knowledge_id: knowledgeId,
          action: 'forgotten',
          timestamp: new Date(),
          details: { reason }
        });

        this.logger.info(`Knowledge forgotten: ${knowledgeId}`);
      }

      return deleted;
    } catch (error) {
      this.logger.error(`Failed to forget knowledge ${knowledgeId}:`, error);
      throw error;
    }
  }

  /**
   * Selectively forget outdated knowledge
   * @param criteria - Forgetting criteria
   * @returns Number of forgotten entries
   */
  async selectiveForgetting(criteria: {
    older_than_days?: number;
    below_confidence?: number;
    below_usage_count?: number;
    expired_only?: boolean;
  }): Promise<number> {
    try {
      this.logger.info('Starting selective forgetting');

      let forgotten = 0;

      // Get all knowledge
      const allKnowledge = await this.repository.knowledge.findByOptions({});

      for (const knowledge of allKnowledge) {
        let shouldForget = false;

        // Check age
        if (criteria.older_than_days) {
          const age = Date.now() - knowledge.created_at.getTime();
          const days = age / (1000 * 60 * 60 * 24);
          if (days > criteria.older_than_days) {
            shouldForget = true;
          }
        }

        // Check confidence
        if (criteria.below_confidence && knowledge.confidence < criteria.below_confidence) {
          shouldForget = true;
        }

        // Check usage count
        if (criteria.below_usage_count && knowledge.usage_count < criteria.below_usage_count) {
          shouldForget = true;
        }

        // Check expiration
        if (criteria.expired_only && knowledge.expires_at && knowledge.expires_at < new Date()) {
          shouldForget = true;
        }

        if (shouldForget) {
          await this.forget(knowledge.id, 'Selective forgetting');
          forgotten++;
        }
      }

      this.logger.info(`Selective forgetting completed: ${forgotten} entries forgotten`);
      return forgotten;
    } catch (error) {
      this.logger.error('Selective forgetting failed:', error);
      throw error;
    }
  }

  /**
   * Get audit log
   * @param options - Query options
   * @returns Audit log entries
   */
  getAuditLog(options?: {
    knowledge_id?: string;
    action?: string;
    from_date?: Date;
    to_date?: Date;
    limit?: number;
  }): KnowledgeAuditRecord[] {
    let filtered = [...this.auditLog];

    // Apply filters
    if (options?.knowledge_id) {
      filtered = filtered.filter(log => log.knowledge_id === options.knowledge_id);
    }
    if (options?.action) {
      filtered = filtered.filter(log => log.action === options.action);
    }
    if (options?.from_date) {
      filtered = filtered.filter(log => log.timestamp >= options.from_date);
    }
    if (options?.to_date) {
      filtered = filtered.filter(log => log.timestamp <= options.to_date);
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply limit
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * Get knowledge statistics
   * @returns Statistics
   */
  async getStatistics(): Promise<{
    total: number;
    by_type: Record<KnowledgeType, number>;
    by_privacy_level: Record<PrivacyLevel, number>;
    validation_status: Record<string, number>;
    average_confidence: number;
    average_usage_count: number;
    expired_count: number;
  }> {
    const allKnowledge = await this.repository.knowledge.findByOptions({});

    const stats = {
      total: allKnowledge.length,
      by_type: {} as Record<KnowledgeType, number>,
      by_privacy_level: {} as Record<PrivacyLevel, number>,
      validation_status: {} as Record<string, number>,
      average_confidence: 0,
      average_usage_count: 0,
      expired_count: 0
    };

    // Calculate statistics
    let totalConfidence = 0;
    let totalUsage = 0;

    for (const knowledge of allKnowledge) {
      // By type
      stats.by_type[knowledge.type] = (stats.by_type[knowledge.type] || 0) + 1;

      // By privacy level
      stats.by_privacy_level[knowledge.privacy_level] = (stats.by_privacy_level[knowledge.privacy_level] || 0) + 1;

      // By validation status
      stats.validation_status[knowledge.validation_status] = (stats.validation_status[knowledge.validation_status] || 0) + 1;

      // Confidence and usage
      totalConfidence += knowledge.confidence;
      totalUsage += knowledge.usage_count;

      // Expired
      if (knowledge.expires_at && knowledge.expires_at < new Date()) {
        stats.expired_count++;
      }
    }

    // Calculate averages
    if (allKnowledge.length > 0) {
      stats.average_confidence = totalConfidence / allKnowledge.length;
      stats.average_usage_count = totalUsage / allKnowledge.length;
    }

    return stats;
  }

  /**
   * Validate knowledge data
   * @param data - Knowledge entry data
   * @returns Validation result
   */
  private validateKnowledgeData(data: KnowledgeEntryData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!data.title || data.title.trim() === '') {
      errors.push('Title is required');
    }
    if (!data.content || data.content.trim() === '') {
      errors.push('Content is required');
    }
    if (!data.source || data.source.trim() === '') {
      errors.push('Source is required');
    }

    // Confidence range
    if (data.confidence < 0 || data.confidence > 1) {
      errors.push('Confidence must be between 0 and 1');
    }

    // Privacy level
    if (!Object.values(PrivacyLevel).includes(data.privacy_level)) {
      errors.push('Invalid privacy level');
    }

    // Privacy level consistency
    if (data.privacy_level === PrivacyLevel.USER_ONLY && !data.user_id) {
      warnings.push('User-only privacy level requires user_id');
    }
    if (data.privacy_level === PrivacyLevel.GUILD_ONLY && !data.guild_id) {
      warnings.push('Guild-only privacy level requires guild_id');
    }

    return {
      is_valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate knowledge content
   * @param knowledge - Knowledge entry
   * @returns Validation result
   */
  private validateKnowledgeContent(knowledge: Knowledge): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Content length
    if (knowledge.content.length < 10) {
      warnings.push('Content is very short');
    }
    if (knowledge.content.length > 10000) {
      warnings.push('Content is very long');
    }

    // Check for sensitive data
    const sensitivePatterns = [
      /password/i,
      /api[_-]?key/i,
      /secret/i,
      /token/i
    ];

    const hasSensitiveData = sensitivePatterns.some(pattern => pattern.test(knowledge.content));
    if (hasSensitiveData && knowledge.privacy_level !== PrivacyLevel.PRIVATE) {
      errors.push('Content contains sensitive data but privacy level is not private');
    }

    // Check for bias
    if (this.constraints.bias_detection_enabled) {
      const biasedPatterns = [
        /always.*\b(he|she)\b/i,
        /never.*\b(he|she)\b/i,
        /inferior.*race/i
      ];

      const hasBiasedContent = biasedPatterns.some(pattern => pattern.test(knowledge.content));
      if (hasBiasedContent) {
        warnings.push('Content may contain biased language');
      }
    }

    return {
      is_valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check constraints
   * @param data - Knowledge entry data
   */
  private async checkConstraints(data: KnowledgeEntryData): Promise<void> {
    // Check max entries
    const count = await this.repository.knowledge.count();
    if (count >= this.constraints.max_knowledge_entries) {
      throw new Error(`Maximum knowledge entries (${this.constraints.max_knowledge_entries}) reached`);
    }

    // Check forbidden patterns
    for (const pattern of this.constraints.forbidden_patterns) {
      if (data.content.includes(pattern)) {
        throw new Error(`Content contains forbidden pattern: ${pattern}`);
      }
    }
  }

  /**
   * Index knowledge for fast retrieval
   * @param knowledge - Knowledge entry to index
   */
  private indexKnowledge(knowledge: Knowledge): void {
    // Extract keywords from title and content
    const words = [
      ...knowledge.title.toLowerCase().split(/\s+/),
      ...knowledge.content.toLowerCase().split(/\s+/)
    ];

    // Remove duplicates and short words
    const keywords = [...new Set(words.filter(w => w.length > 3))];

    this.knowledgeIndex.set(knowledge.id, {
      knowledge_id: knowledge.id,
      keywords,
      tags: knowledge.tags,
      type: knowledge.type,
      confidence: knowledge.confidence,
      created_at: knowledge.created_at
    });
  }

  /**
   * Check if user has access to knowledge
   * @param knowledge - Knowledge entry
   * @param userId - User ID
   * @param guildId - Guild ID
   * @returns Whether user has access
   */
  private hasAccess(knowledge: Knowledge, userId?: string, guildId?: string): boolean {
    switch (knowledge.privacy_level) {
      case PrivacyLevel.PUBLIC:
        return true;
      case PrivacyLevel.GUILD_ONLY:
        return knowledge.guild_id === guildId;
      case PrivacyLevel.USER_ONLY:
        return knowledge.user_id === userId;
      case PrivacyLevel.PRIVATE:
        return false;
      default:
        return false;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.knowledgeCache.clear();
    this.logger.debug('Knowledge cache cleared');
  }

  /**
   * Get cache size
   * @returns Current cache size
   */
  getCacheSize(): number {
    return this.knowledgeCache.size;
  }

  /**
   * Update constraints
   * @param constraints - New constraints
   */
  updateConstraints(constraints: Partial<LearningConstraints>): void {
    this.constraints = { ...this.constraints, ...constraints };
    this.logger.info('Knowledge Base constraints updated', constraints);
  }
}
