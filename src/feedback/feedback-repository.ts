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

        // Calculate confidence interval for conversion rate using Wilson score interval
        const conversionRateCI = this.calculateConfidenceInterval(
          variant.metrics.conversions,
          variant.metrics.participants,
          0.95
        );

        return {
          variantId: variant.id,
          variantName: variant.name,
          isControl: variant.isControl,
          participants: variant.metrics.participants,
          conversions: variant.metrics.conversions,
          conversionRate,
          conversionRateCI,
          averageRating: variant.metrics.averageRating,
          customMetrics: variant.metrics.customMetrics,
          uplift: undefined, // Will be calculated later
        } as any;
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

      // Calculate p-value comparing winner against control
      let significance = 0.95; // Default confidence level
      let pValue = 1; // Default p-value (not significant)

      if (control && winner) {
        const winnerVariant = variantResults.find((v) => v.variantId === winner.variantId);
        if (winnerVariant && !winnerVariant.isControl) {
          pValue = this.calculatePValue(
            control.conversions,
            control.participants,
            winnerVariant.conversions,
            winnerVariant.participants
          );
          // Convert p-value to significance (1 - pValue)
          significance = 1 - pValue;
        }
      }

      // Determine recommendation based on p-value and uplift
      const winnerUplift = winner && control
        ? ((winner.conversionRate - control.conversionRate) / control.conversionRate) * 100
        : 0;

      const recommendation = this.determineRecommendation(pValue, winnerUplift, 0.95);

      return {
        experimentId: experiment.id,
        experimentName: experiment.name,
        winner: winner?.variantId,
        significance,
        confidence: 0.95,
        variantResults,
        recommendation,
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

  /**
   * Calculate confidence interval for a proportion (conversion rate)
   * Uses Wilson score interval for better accuracy, especially for small samples
   *
   * @param conversions - Number of conversions
   * @param participants - Total number of participants
   * @param confidenceLevel - Confidence level (e.g., 0.95 for 95%)
   * @returns Confidence interval as [lower, upper] in percentage
   */
  private calculateConfidenceInterval(
    conversions: number,
    participants: number,
    confidenceLevel: number = 0.95
  ): [number, number] {
    // Handle edge cases
    if (participants === 0 || conversions < 0) {
      return [0, 0];
    }

    const p = conversions / participants;
    const z = this.getZScoreForConfidence(confidenceLevel);
    const zSquared = z * z;

    // Wilson score interval formula
    // CI = (p + z²/(2n) ± z*sqrt((p(1-p) + z²/(4n))/n)) / (1 + z²/n)
    const n = participants;
    const center = (p + zSquared / (2 * n)) / (1 + zSquared / n);
    const margin = z * Math.sqrt((p * (1 - p) + zSquared / (4 * n)) / n) / (1 + zSquared / n);

    const lower = Math.max(0, (center - margin) * 100);
    const upper = Math.min(100, (center + margin) * 100);

    return [lower, upper];
  }

  /**
   * Get z-score for a given confidence level
   *
   * @param confidenceLevel - Confidence level (e.g., 0.95 for 95%)
   * @returns Z-score
   */
  private getZScoreForConfidence(confidenceLevel: number): number {
    // Common z-scores for confidence levels
    const zScores: Record<number, number> = {
      0.90: 1.645,
      0.95: 1.96,
      0.99: 2.576,
    };

    if (zScores[confidenceLevel] !== undefined) {
      return zScores[confidenceLevel];
    }

    // For other levels, use inverse error function approximation
    const alpha = 1 - confidenceLevel;
    const twoTailAlpha = alpha / 2;
    return this.inverseNormalCDF(1 - twoTailAlpha);
  }

  /**
   * Calculate p-value for comparing two proportions using z-test
   *
   * @param conversionsA - Conversions in group A
   * @param participantsA - Participants in group A
   * @param conversionsB - Conversions in group B
   * @param participantsB - Participants in group B
   * @returns P-value (two-tailed)
   */
  private calculatePValue(
    conversionsA: number,
    participantsA: number,
    conversionsB: number,
    participantsB: number
  ): number {
    // Handle edge cases
    if (participantsA === 0 || participantsB === 0) {
      return 1;
    }

    const rateA = conversionsA / participantsA;
    const rateB = conversionsB / participantsB;

    // If rates are identical, p-value is 1
    if (rateA === rateB) {
      return 1;
    }

    // Calculate pooled proportion
    const pooledRate = (conversionsA + conversionsB) / (participantsA + participantsB);

    // Calculate standard error for the difference
    const varianceA = pooledRate * (1 - pooledRate) / participantsA;
    const varianceB = pooledRate * (1 - pooledRate) / participantsB;
    const standardError = Math.sqrt(varianceA + varianceB);

    if (standardError === 0) {
      return 1;
    }

    // Calculate z-score
    const zScore = Math.abs(rateB - rateA) / standardError;

    // Calculate p-value using standard normal distribution
    return this.calculatePValueFromZScore(zScore);
  }

  /**
   * Calculate p-value from z-score (two-tailed)
   * Uses error function approximation for standard normal CDF
   *
   * @param zScore - Z-score
   * @returns P-value
   */
  private calculatePValueFromZScore(zScore: number): number {
    // Abramowitz and Stegun approximation 7.1.26
    const absZ = Math.abs(zScore);
    const t = 1 / (1 + 0.2316419 * absZ);
    
    const coeffs = [0.3989422804, 0.319381530, -0.356563782, 1.781477937, -1.821255978, 1.330274429];
    
    // Build polynomial step by step to avoid parsing issues
    const term1 = coeffs[0];
    const term2 = t * (coeffs[1] + t * (coeffs[2] + t * (coeffs[3] + t * (coeffs[4] + t * coeffs[5]))));
    
    const poly = t * (term1 + term2);
    
    // CDF of standard normal
    const cdf = 1 - poly * Math.exp(-zScore * zScore / 2);
    
    // Two-tailed p-value
    return 2 * (1 - cdf);
  }

  /**
   * Approximation of inverse normal CDF (quantile function)
   * Uses Beasley-Springer-Moro algorithm
   *
   * @param p - Probability (0 < p < 1)
   * @returns Z-score
   */
  private inverseNormalCDF(p: number): number {
    if (p <= 0 || p >= 1) {
      return 0;
    }

    const a = [-3.969683028665376e+01, 2.209460984245205e+02,
               -2.759285104469687e+02, 1.383577518672690e+02,
               -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02,
               -1.556989798598866e+02, 6.680131188771972e+01,
               -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01,
               -2.400758277161838e+00, -2.549732539343734e+00,
                 4.374664141464968e+00, 2.938163982698783e+00];
    const dCoeffs = [7.784695709041462e-03, 3.224671290700398e-01,
               2.445134137142996e+00, 3.754408661907416e+00];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;
    let q: number;
    let r: number;

    if (p < pLow) {
      // Rational approximation for lower region
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
             ((((dCoeffs[0] * q + dCoeffs[1]) * q + dCoeffs[2]) * q + dCoeffs[3]) * q + 1);
    } else if (p <= pHigh) {
      // Rational approximation for central region
      q = p - 0.5;
      r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
             (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
      // Rational approximation for upper region
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
              ((((dCoeffs[0] * q + dCoeffs[1]) * q + dCoeffs[2]) * q + dCoeffs[3]) * q + 1);
    }
  }

  /**
   * Determine recommendation based on statistical significance and uplift
   *
   * @param pValue - P-value from statistical test
   * @param uplift - Uplift percentage (positive means improvement)
   * @param confidenceLevel - Confidence level (e.g., 0.95)
   * @returns Recommendation string
   */
  private determineRecommendation(
    pValue: number,
    uplift: number,
    confidenceLevel: number = 0.95
  ): 'rollout_winner' | 'continue_test' | 'inconclusive' | 'rollback' {
    const alpha = 1 - confidenceLevel;

    // If p-value is less than alpha, result is statistically significant
    if (pValue < alpha) {
      if (uplift > 0) {
        return 'rollout_winner';
      } else if (uplift < 0) {
        return 'rollback';
      }
    }

    // Not statistically significant
    return 'continue_test';
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
