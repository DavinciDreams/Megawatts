/**
 * Feedback Repository
 * 
 * Repository for storing and retrieving feedback data.
 * Extends the base repository pattern with feedback-specific operations.
 */

import { BaseRepository, QueryOptions } from '../storage/repositories/base';
import { PostgresConnectionManager } from '../storage/database';
import { RepositoryError, RepositoryErrorCode } from '../storage/errors';
import {
  Feedback,
  FeedbackQueryOptions,
  FeedbackAggregation,
  ABTestExperiment,
  ABTestVariant,
  ABTestAssignment,
  ABTestResult,
  ImprovementSuggestion,
  FeedbackInsight,
} from './feedback-model';
import { Logger } from '../utils/logger';

// ============================================================================
// FEEDBACK REPOSITORY
// ============================================================================

/**
 * Repository for feedback operations
 */
export class FeedbackRepository extends BaseRepository<Feedback> {
  constructor(db: PostgresConnectionManager) {
    super(db, 'feedback');
  }

  protected mapRowToEntity(row: any): Feedback {
    return {
      id: row.id,
      userId: row.user_id,
      serverId: row.server_id,
      channelId: row.channel_id,
      type: row.type,
      content: row.content,
      rating: row.rating,
      status: row.status,
      priority: row.priority,
      metadata: row.metadata || {},
      tags: row.tags || [],
      aiAnalysis: row.ai_analysis ? {
        ...row.ai_analysis,
        analyzedAt: new Date(row.ai_analysis.analyzedAt),
      } : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected getEntityName(): string {
    return 'Feedback';
  }

  /**
   * Create a new feedback entry
   */
  async createFeedback(request: {
    userId: string;
    serverId?: string;
    channelId?: string;
    type: string;
    content: string;
    rating?: number;
    metadata?: Record<string, any>;
  }): Promise<Feedback> {
    try {
      const query = `
        INSERT INTO feedback (user_id, server_id, channel_id, type, content, rating, metadata, tags)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      const values = [
        request.userId,
        request.serverId || null,
        request.channelId || null,
        request.type,
        request.content,
        request.rating || null,
        JSON.stringify(request.metadata || {}),
        [],
      ];
      const result = await this.db.query(query, values);
      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create feedback:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.CREATE_FAILED,
        'Failed to create feedback',
        { request, error: error instanceof Error ? error.message : String(error) },
        'Feedback',
        undefined,
        'createFeedback'
      );
    }
  }

  /**
   * Query feedback with filters
   */
  async queryFeedback(options: FeedbackQueryOptions = {}): Promise<Feedback[]> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (options.userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        params.push(options.userId);
      }

      if (options.serverId) {
        conditions.push(`server_id = $${paramIndex++}`);
        params.push(options.serverId);
      }

      if (options.type) {
        conditions.push(`type = $${paramIndex++}`);
        params.push(options.type);
      }

      if (options.status) {
        conditions.push(`status = $${paramIndex++}`);
        params.push(options.status);
      }

      if (options.priority) {
        conditions.push(`priority = $${paramIndex++}`);
        params.push(options.priority);
      }

      if (options.tags && options.tags.length > 0) {
        conditions.push(`tags && $${paramIndex++}`);
        params.push(options.tags);
      }

      if (options.startDate) {
        conditions.push(`created_at >= $${paramIndex++}`);
        params.push(options.startDate);
      }

      if (options.endDate) {
        conditions.push(`created_at <= $${paramIndex++}`);
        params.push(options.endDate);
      }

      let query = `SELECT * FROM feedback`;
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ` ORDER BY created_at DESC`;

      if (options.limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(options.limit);
      }

      if (options.offset) {
        query += ` OFFSET $${paramIndex++}`;
        params.push(options.offset);
      }

      const result = await this.db.query(query, params);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      this.logger.error('Failed to query feedback:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.QUERY_FAILED,
        'Failed to query feedback',
        { options, error: error instanceof Error ? error.message : String(error) },
        'Feedback',
        undefined,
        'queryFeedback'
      );
    }
  }

  /**
   * Update feedback status
   */
  async updateStatus(id: string, status: string): Promise<Feedback | null> {
    try {
      const query = `
        UPDATE feedback
        SET status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      const result = await this.db.query(query, [status, id]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update feedback status:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to update feedback status',
        { id, status, error: error instanceof Error ? error.message : String(error) },
        'Feedback',
        id,
        'updateStatus'
      );
    }
  }

  /**
   * Update feedback priority
   */
  async updatePriority(id: string, priority: string): Promise<Feedback | null> {
    try {
      const query = `
        UPDATE feedback
        SET priority = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      const result = await this.db.query(query, [priority, id]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update feedback priority:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to update feedback priority',
        { id, priority, error: error instanceof Error ? error.message : String(error) },
        'Feedback',
        id,
        'updatePriority'
      );
    }
  }

  /**
   * Add tags to feedback
   */
  async addTags(id: string, tags: string[]): Promise<Feedback | null> {
    try {
      const query = `
        UPDATE feedback
        SET tags = array_cat(tags, $1), updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      const result = await this.db.query(query, [tags, id]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to add tags to feedback:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to add tags to feedback',
        { id, tags, error: error instanceof Error ? error.message : String(error) },
        'Feedback',
        id,
        'addTags'
      );
    }
  }

  /**
   * Update AI analysis for feedback
   */
  async updateAIAnalysis(id: string, aiAnalysis: any): Promise<Feedback | null> {
    try {
      const query = `
        UPDATE feedback
        SET ai_analysis = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      const result = await this.db.query(query, [JSON.stringify(aiAnalysis), id]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update AI analysis:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to update AI analysis',
        { id, aiAnalysis, error: error instanceof Error ? error.message : String(error) },
        'Feedback',
        id,
        'updateAIAnalysis'
      );
    }
  }

  /**
   * Get feedback aggregation statistics
   */
  async getAggregation(filters?: FeedbackQueryOptions): Promise<FeedbackAggregation> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (filters?.userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        params.push(filters.userId);
      }

      if (filters?.serverId) {
        conditions.push(`server_id = $${paramIndex++}`);
        params.push(filters.serverId);
      }

      if (filters?.startDate) {
        conditions.push(`created_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }

      if (filters?.endDate) {
        conditions.push(`created_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      let whereClause = '';
      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }

      const query = `
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE type = 'rating') as rating_count,
          COUNT(*) FILTER (WHERE type = 'feature_request') as feature_request_count,
          COUNT(*) FILTER (WHERE type = 'bug_report') as bug_report_count,
          COUNT(*) FILTER (WHERE type = 'general') as general_count,
          COUNT(*) FILTER (WHERE status = 'new') as new_count,
          COUNT(*) FILTER (WHERE status = 'reviewed') as reviewed_count,
          COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
          COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
          COUNT(*) FILTER (WHERE status = 'dismissed') as dismissed_count,
          COUNT(*) FILTER (WHERE priority = 'low') as low_count,
          COUNT(*) FILTER (WHERE priority = 'medium') as medium_count,
          COUNT(*) FILTER (WHERE priority = 'high') as high_count,
          COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_count,
          AVG(rating) as average_rating,
          COUNT(*) FILTER (WHERE ai_analysis->>'sentiment' = 'positive') as positive_count,
          COUNT(*) FILTER (WHERE ai_analysis->>'sentiment' = 'neutral') as neutral_count,
          COUNT(*) FILTER (WHERE ai_analysis->>'sentiment' = 'negative') as negative_count
        FROM feedback
        ${whereClause}
      `;

      const result = await this.db.query(query, params);
      const row = result.rows[0];

      return {
        total: parseInt(row.total),
        byType: {
          rating: parseInt(row.rating_count),
          feature_request: parseInt(row.feature_request_count),
          bug_report: parseInt(row.bug_report_count),
          general: parseInt(row.general_count),
        },
        byStatus: {
          new: parseInt(row.new_count),
          reviewed: parseInt(row.reviewed_count),
          in_progress: parseInt(row.in_progress_count),
          resolved: parseInt(row.resolved_count),
          dismissed: parseInt(row.dismissed_count),
        },
        byPriority: {
          low: parseInt(row.low_count),
          medium: parseInt(row.medium_count),
          high: parseInt(row.high_count),
          urgent: parseInt(row.urgent_count),
        },
        averageRating: parseFloat(row.average_rating) || 0,
        sentimentDistribution: {
          positive: parseInt(row.positive_count),
          neutral: parseInt(row.neutral_count),
          negative: parseInt(row.negative_count),
        },
      };
    } catch (error) {
      this.logger.error('Failed to get feedback aggregation:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.QUERY_FAILED,
        'Failed to get feedback aggregation',
        { filters, error: error instanceof Error ? error.message : String(error) },
        'Feedback',
        undefined,
        'getAggregation'
      );
    }
  }

  /**
   * Get recent feedback by user
   */
  async getRecentByUser(userId: string, limit: number = 10): Promise<Feedback[]> {
    return this.queryFeedback({ userId, limit });
  }

  /**
   * Get feedback by server
   */
  async getByServer(serverId: string, limit: number = 50): Promise<Feedback[]> {
    return this.queryFeedback({ serverId, limit });
  }
}

// ============================================================================
// A/B TEST REPOSITORY
// ============================================================================

/**
 * Repository for A/B test experiment operations
 */
export class ABTestRepository {
  private db: PostgresConnectionManager;
  private logger: Logger;

  constructor(db: PostgresConnectionManager) {
    this.db = db;
    this.logger = new Logger('ABTestRepository');
  }

  /**
   * Create a new A/B test experiment
   */
  async createExperiment(experiment: {
    name: string;
    description: string;
    hypothesis: string;
    successCriteria: string;
    targetSampleSize?: number;
  }): Promise<ABTestExperiment> {
    try {
      const query = `
        INSERT INTO ab_test_experiments (name, description, hypothesis, success_criteria, target_sample_size)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const values = [
        experiment.name,
        experiment.description,
        experiment.hypothesis,
        experiment.successCriteria,
        experiment.targetSampleSize || null,
      ];
      const result = await this.db.query(query, values);
      return this.mapExperimentRow(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create experiment:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.CREATE_FAILED,
        'Failed to create experiment',
        { experiment, error: error instanceof Error ? error.message : String(error) },
        'ABTestExperiment',
        undefined,
        'createExperiment'
      );
    }
  }

  /**
   * Get experiment by ID
   */
  async getExperimentById(id: string): Promise<ABTestExperiment | null> {
    try {
      const query = `SELECT * FROM ab_test_experiments WHERE id = $1`;
      const result = await this.db.query(query, [id]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapExperimentRow(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get experiment:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to get experiment',
        { id, error: error instanceof Error ? error.message : String(error) },
        'ABTestExperiment',
        id,
        'getExperimentById'
      );
    }
  }

  /**
   * Get experiment by name
   */
  async getExperimentByName(name: string): Promise<ABTestExperiment | null> {
    try {
      const query = `SELECT * FROM ab_test_experiments WHERE name = $1`;
      const result = await this.db.query(query, [name]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapExperimentRow(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get experiment by name:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to get experiment by name',
        { name, error: error instanceof Error ? error.message : String(error) },
        'ABTestExperiment',
        undefined,
        'getExperimentByName'
      );
    }
  }

  /**
   * Get all experiments with optional status filter
   */
  async getExperiments(status?: string): Promise<ABTestExperiment[]> {
    try {
      let query = `SELECT * FROM ab_test_experiments`;
      const params: any[] = [];

      if (status) {
        query += ` WHERE status = $1`;
        params.push(status);
      }

      query += ` ORDER BY created_at DESC`;

      const result = await this.db.query(query, params);
      return result.rows.map((row: any) => this.mapExperimentRow(row));
    } catch (error) {
      this.logger.error('Failed to get experiments:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to get experiments',
        { status, error: error instanceof Error ? error.message : String(error) },
        'ABTestExperiment',
        undefined,
        'getExperiments'
      );
    }
  }

  /**
   * Update experiment status
   */
  async updateExperimentStatus(id: string, status: string): Promise<void> {
    try {
      const query = `
        UPDATE ab_test_experiments
        SET status = $1, updated_at = NOW()
        WHERE id = $2
      `;
      await this.db.query(query, [status, id]);
    } catch (error) {
      this.logger.error('Failed to update experiment status:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to update experiment status',
        { id, status, error: error instanceof Error ? error.message : String(error) },
        'ABTestExperiment',
        id,
        'updateExperimentStatus'
      );
    }
  }

  /**
   * Start an experiment
   */
  async startExperiment(id: string): Promise<void> {
    try {
      const query = `
        UPDATE ab_test_experiments
        SET status = 'running', start_date = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'draft'
      `;
      await this.db.query(query, [id]);
    } catch (error) {
      this.logger.error('Failed to start experiment:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to start experiment',
        { id, error: error instanceof Error ? error.message : String(error) },
        'ABTestExperiment',
        id,
        'startExperiment'
      );
    }
  }

  /**
   * End an experiment
   */
  async endExperiment(id: string): Promise<void> {
    try {
      const query = `
        UPDATE ab_test_experiments
        SET status = 'completed', end_date = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'running'
      `;
      await this.db.query(query, [id]);
    } catch (error) {
      this.logger.error('Failed to end experiment:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to end experiment',
        { id, error: error instanceof Error ? error.message : String(error) },
        'ABTestExperiment',
        id,
        'endExperiment'
      );
    }
  }

  /**
   * Create a variant for an experiment
   */
  async createVariant(variant: {
    experimentId: string;
    name: string;
    description: string;
    config: Record<string, any>;
    allocationPercentage: number;
    isControl: boolean;
  }): Promise<ABTestVariant> {
    try {
      const query = `
        INSERT INTO ab_test_variants (experiment_id, name, description, config, allocation_percentage, is_control)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const values = [
        variant.experimentId,
        variant.name,
        variant.description,
        JSON.stringify(variant.config),
        variant.allocationPercentage,
        variant.isControl,
      ];
      const result = await this.db.query(query, values);
      return this.mapVariantRow(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create variant:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.CREATE_FAILED,
        'Failed to create variant',
        { variant, error: error instanceof Error ? error.message : String(error) },
        'ABTestVariant',
        undefined,
        'createVariant'
      );
    }
  }

  /**
   * Get variants for an experiment
   */
  async getVariants(experimentId: string): Promise<ABTestVariant[]> {
    try {
      const query = `SELECT * FROM ab_test_variants WHERE experiment_id = $1 ORDER BY is_control DESC, name`;
      const result = await this.db.query(query, [experimentId]);
      return result.rows.map((row: any) => this.mapVariantRow(row));
    } catch (error) {
      this.logger.error('Failed to get variants:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to get variants',
        { experimentId, error: error instanceof Error ? error.message : String(error) },
        'ABTestVariant',
        undefined,
        'getVariants'
      );
    }
  }

  /**
   * Assign user to a variant
   */
  async assignVariant(assignment: {
    experimentId: string;
    variantId: string;
    userId: string;
    serverId?: string;
  }): Promise<ABTestAssignment> {
    try {
      const query = `
        INSERT INTO ab_test_assignments (experiment_id, variant_id, user_id, server_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (experiment_id, user_id) DO NOTHING
        RETURNING *
      `;
      const values = [
        assignment.experimentId,
        assignment.variantId,
        assignment.userId,
        assignment.serverId || null,
      ];
      const result = await this.db.query(query, values);
      if (result.rows.length === 0) {
        // User already assigned, get existing assignment
        const existingQuery = `
          SELECT * FROM ab_test_assignments
          WHERE experiment_id = $1 AND user_id = $2
        `;
        const existingResult = await this.db.query(existingQuery, [assignment.experimentId, assignment.userId]);
        return this.mapAssignmentRow(existingResult.rows[0]);
      }
      return this.mapAssignmentRow(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to assign variant:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.CREATE_FAILED,
        'Failed to assign variant',
        { assignment, error: error instanceof Error ? error.message : String(error) },
        'ABTestAssignment',
        undefined,
        'assignVariant'
      );
    }
  }

  /**
   * Get user's assignment for an experiment
   */
  async getUserAssignment(experimentId: string, userId: string): Promise<ABTestAssignment | null> {
    try {
      const query = `
        SELECT * FROM ab_test_assignments
        WHERE experiment_id = $1 AND user_id = $2
      `;
      const result = await this.db.query(query, [experimentId, userId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapAssignmentRow(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get user assignment:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        'Failed to get user assignment',
        { experimentId, userId, error: error instanceof Error ? error.message : String(error) },
        'ABTestAssignment',
        undefined,
        'getUserAssignment'
      );
    }
  }

  /**
   * Track conversion for a variant
   */
  async trackConversion(variantId: string): Promise<void> {
    try {
      const query = `
        UPDATE ab_test_variants
        SET conversions = conversions + 1, updated_at = NOW()
        WHERE id = $1
      `;
      await this.db.query(query, [variantId]);
    } catch (error) {
      this.logger.error('Failed to track conversion:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        'Failed to track conversion',
        { variantId, error: error instanceof Error ? error.message : String(error) },
        'ABTestVariant',
        variantId,
        'trackConversion'
      );
    }
  }

  /**
   * Get experiment results
   */
  async getExperimentResults(experimentId: string): Promise<ABTestResult | null> {
    try {
      // Get experiment details
      const experiment = await this.getExperimentById(experimentId);
      if (!experiment) {
        return null;
      }

      // Get variants with their metrics
      const variants = await this.getVariants(experimentId);

      // Calculate results for each variant
      const variantResults = variants.map((variant) => {
        const conversionRate = variant.metrics.participants > 0
          ? (variant.metrics.conversions / variant.metrics.participants) * 100
          : 0;

        return {
          variantId: variant.id,
          variantName: variant.name,
          isControl: variant.isControl,
          participants: variant.metrics.participants,
          conversions: variant.metrics.conversions,
          conversionRate,
          conversionRateCI: [0, 0], // TODO: Calculate proper confidence interval
          averageRating: variant.metrics.averageRating,
          customMetrics: variant.metrics.customMetrics,
        };
      });

      // Find control variant
      const control = variantResults.find((v) => v.isControl);
      const winner = variantResults.reduce((best, current) => {
        if (!best) return current;
        return current.conversionRate > best.conversionRate ? current : best;
      }, variantResults[0]);

      // Calculate uplift for each variant
      if (control) {
        variantResults.forEach((variant) => {
          if (!variant.isControl) {
            const uplift = ((variant.conversionRate - control.conversionRate) / control.conversionRate) * 100;
            variant.uplift = uplift;
          }
        });
      }

      return {
        experimentId: experiment.id,
        experimentName: experiment.name,
        winner: winner?.variantId,
        significance: 0.95, // TODO: Calculate actual p-value
        confidence: 0.95,
        variantResults,
        recommendation: 'inconclusive', // TODO: Determine based on significance
        analyzedAt: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to get experiment results:', error as Error);
      throw new RepositoryError(
        RepositoryErrorCode.QUERY_FAILED,
        'Failed to get experiment results',
        { experimentId, error: error instanceof Error ? error.message : String(error) },
        'ABTestExperiment',
        experimentId,
        'getExperimentResults'
      );
    }
  }

  private mapExperimentRow(row: any): ABTestExperiment {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      hypothesis: row.hypothesis,
      successCriteria: row.success_criteria,
      startDate: row.start_date,
      endDate: row.end_date,
      targetSampleSize: row.target_sample_size,
      variants: [], // Loaded separately
      metrics: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapVariantRow(row: any): ABTestVariant {
    return {
      id: row.id,
      experimentId: row.experiment_id,
      name: row.name,
      description: row.description,
      config: row.config,
      allocationPercentage: row.allocation_percentage,
      isControl: row.is_control,
      metrics: {
        participants: row.participants,
        conversions: row.conversions,
        conversionRate: row.participants > 0 ? (row.conversions / row.participants) * 100 : 0,
        averageRating: row.average_rating ? parseFloat(row.average_rating) : undefined,
        customMetrics: row.custom_metrics || {},
        lastUpdated: row.updated_at,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapAssignmentRow(row: any): ABTestAssignment {
    return {
      id: row.id,
      experimentId: row.experiment_id,
      variantId: row.variant_id,
      userId: row.user_id,
      serverId: row.server_id,
      assignedAt: row.assigned_at,
      completedAt: row.completed_at,
    };
  }
}
