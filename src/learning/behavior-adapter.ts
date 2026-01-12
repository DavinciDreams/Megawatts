/**
 * Behavior Adapter - Layer 2 of Self-Learning System
 * 
 * Optimizes strategies based on successful approaches,
 * tunes parameters dynamically, modifies response patterns safely,
 * and enhances tool effectiveness.
 */

import { Logger } from '../utils/logger.js';
import { LearningRepository } from './learning-repository.js';
import { Pattern, PatternType } from './learning-models.js';
import { LearningConstraints } from './learning-models.js';
import { BehaviorAdaptationResult } from './learning-models.js';
import { Behavior, BehaviorType } from './learning-models.js';

/**
 * Adaptation strategy definition
 */
interface AdaptationStrategy {
  id: string;
  type: BehaviorType;
  name: string;
  description: string;
  apply: (context: Record<string, any>) => Promise<Record<string, any>>;
  validate: (config: Record<string, any>) => boolean;
  safetyCheck: (config: Record<string, any>) => boolean;
}

/**
 * Behavior Adapter class
 * Handles behavior adaptation based on learned patterns
 */
export class BehaviorAdapter {
  private logger: Logger;
  private repository: LearningRepository;
  private constraints: LearningConstraints;
  private adaptationStrategies: Map<string, AdaptationStrategy> = new Map();
  private activeBehaviors: Map<string, Behavior> = new Map();
  private adaptationHistory: Array<{
    id: string;
    behavior_id: string;
    timestamp: Date;
    success: boolean;
    effectiveness: number;
  }> = [];

  constructor(
    repository: LearningRepository,
    constraints?: Partial<LearningConstraints>
  ) {
    this.repository = repository;
    this.logger = new Logger('BehaviorAdapter');
    
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

    this.initializeAdaptationStrategies();
    this.logger.info('Behavior Adapter initialized');
  }

  /**
   * Initialize built-in adaptation strategies
   */
  private initializeAdaptationStrategies(): void {
    // Strategy optimization
    this.adaptationStrategies.set('response_length_optimization', {
      id: 'response_length_optimization',
      type: BehaviorType.STRATEGY,
      name: 'Response Length Optimization',
      description: 'Optimizes response length based on user engagement',
      apply: async (context) => {
        const avgEngagement = context.average_engagement || 0.5;
        return {
          max_response_length: Math.floor(200 + avgEngagement * 800),
          min_response_length: Math.floor(50 + avgEngagement * 100)
        };
      },
      validate: (config) => {
        return config.max_response_length > config.min_response_length &&
               config.max_response_length <= 2000 &&
               config.min_response_length >= 10;
      },
      safetyCheck: (config) => {
        return config.max_response_length <= 2000;
      }
    });

    this.adaptationStrategies.set('tone_adaptation', {
      id: 'tone_adaptation',
      type: BehaviorType.STRATEGY,
      name: 'Tone Adaptation',
      description: 'Adapts response tone based on user feedback',
      apply: async (context) => {
        const positiveFeedbackRatio = context.positive_feedback_ratio || 0.5;
        return {
          formality_level: positiveFeedbackRatio > 0.7 ? 'casual' : 'professional',
          emoji_usage: positiveFeedbackRatio > 0.6 ? 'moderate' : 'minimal',
          humor_level: positiveFeedbackRatio > 0.8 ? 'low' : 'none'
        };
      },
      validate: (config) => {
        return ['casual', 'professional'].includes(config.formality_level) &&
               ['minimal', 'moderate', 'high'].includes(config.emoji_usage);
      },
      safetyCheck: (config) => {
        return true;
      }
    });

    // Parameter tuning
    this.adaptationStrategies.set('timeout_adjustment', {
      id: 'timeout_adjustment',
      type: BehaviorType.PARAMETER,
      name: 'Timeout Adjustment',
      description: 'Adjusts operation timeouts based on performance',
      apply: async (context) => {
        const avgResponseTime = context.avg_response_time || 500;
        const successRate = context.success_rate || 0.9;
        return {
          operation_timeout: Math.min(30000, Math.max(5000, avgResponseTime * 3)),
          retry_attempts: successRate > 0.95 ? 2 : 3,
          backoff_multiplier: 1.5
        };
      },
      validate: (config) => {
        return config.operation_timeout >= 1000 &&
               config.operation_timeout <= 60000 &&
               config.retry_attempts >= 1 &&
               config.retry_attempts <= 5;
      },
      safetyCheck: (config) => {
        return config.operation_timeout <= 60000;
      }
    });

    this.adaptationStrategies.set('cache_ttl_tuning', {
      id: 'cache_ttl_tuning',
      type: BehaviorType.PARAMETER,
      name: 'Cache TTL Tuning',
      description: 'Adjusts cache time-to-live based on hit rate',
      apply: async (context) => {
        const cacheHitRate = context.cache_hit_rate || 0.8;
        return {
          default_ttl: Math.floor(300 + cacheHitRate * 2700),
          max_ttl: Math.floor(3600 + cacheHitRate * 7200),
          stale_threshold: 0.1
        };
      },
      validate: (config) => {
        return config.default_ttl > 0 &&
               config.default_ttl <= config.max_ttl &&
               config.max_ttl <= 10800;
      },
      safetyCheck: (config) => {
        return config.max_ttl <= 10800;
      }
    });

    // Response modification
    this.adaptationStrategies.set('personalization_level', {
      id: 'personalization_level',
      type: BehaviorType.RESPONSE,
      name: 'Personalization Level',
      description: 'Adjusts personalization based on user preferences',
      apply: async (context) => {
        const userEngagement = context.user_engagement || 0.5;
        return {
          include_user_name: userEngagement > 0.7,
          reference_history: userEngagement > 0.6,
          adapt_to_style: userEngagement > 0.8,
          privacy_level: userEngagement > 0.5 ? 'standard' : 'high'
        };
      },
      validate: (config) => {
        return typeof config.include_user_name === 'boolean' &&
               typeof config.reference_history === 'boolean' &&
               typeof config.adapt_to_style === 'boolean';
      },
      safetyCheck: (config) => {
        return config.privacy_level !== 'low';
      }
    });

    // Tool enhancement
    this.adaptationStrategies.set('tool_selection_optimization', {
      id: 'tool_selection_optimization',
      type: BehaviorType.TOOL_USAGE,
      name: 'Tool Selection Optimization',
      description: 'Optimizes tool selection based on success rates',
      apply: async (context) => {
        const toolSuccessRates = context.tool_success_rates || {};
        return {
          prefer_high_success: true,
          fallback_enabled: true,
          max_parallel_tools: 3,
          timeout_override: {}
        };
      },
      validate: (config) => {
        return typeof config.prefer_high_success === 'boolean' &&
               typeof config.fallback_enabled === 'boolean' &&
               config.max_parallel_tools >= 1 &&
               config.max_parallel_tools <= 5;
      },
      safetyCheck: (config) => {
        return config.max_parallel_tools <= 5;
      }
    });

    this.adaptationStrategies.set('tool_parameter_tuning', {
      id: 'tool_parameter_tuning',
      type: BehaviorType.TOOL_USAGE,
      name: 'Tool Parameter Tuning',
      description: 'Tunes tool parameters based on historical performance',
      apply: async (context) => {
        const avgExecutionTime = context.avg_execution_time || 1000;
        return {
          default_timeout: Math.min(30000, Math.max(5000, avgExecutionTime * 2)),
          max_retries: 2,
          result_cache_enabled: true,
          result_cache_ttl: 300
        };
      },
      validate: (config) => {
        return config.default_timeout >= 1000 &&
               config.default_timeout <= 60000 &&
               config.max_retries >= 0 &&
               config.max_retries <= 5;
      },
      safetyCheck: (config) => {
        return config.default_timeout <= 60000;
      }
    });

    this.logger.debug(`Initialized ${this.adaptationStrategies.size} adaptation strategies`);
  }

  /**
   * Adapt behaviors based on patterns
   * @param patterns - Recognized patterns
   * @param context - Current context
   * @returns Behavior adaptation result
   */
  async adapt(
    patterns: Pattern[],
    context: Record<string, any>
  ): Promise<BehaviorAdaptationResult> {
    try {
      this.logger.info(`Adapting behaviors based on ${patterns.length} patterns`);

      const adaptations: Array<{
        id: string;
        type: BehaviorType;
        name: string;
        description: string;
        config: Record<string, any>;
        expected_effectiveness: number;
      }> = [];

      const modifiedBehaviors: string[] = [];
      let requiresApproval = false;

      // Analyze patterns and determine adaptations
      for (const pattern of patterns) {
        if (!pattern.is_active || pattern.confidence < this.constraints.min_confidence_threshold) {
          continue;
        }

        // Find relevant adaptation strategies
        const relevantStrategies = this.findRelevantStrategies(pattern);

        for (const strategy of relevantStrategies) {
          // Check if adaptation requires approval
          if (this.constraints.require_approval_for.includes(strategy.type)) {
            requiresApproval = true;
          }

          // Apply adaptation
          const config = await strategy.apply(context);

          // Validate adaptation
          if (!strategy.validate(config)) {
            this.logger.warn(`Adaptation validation failed: ${strategy.id}`);
            continue;
          }

          // Safety check
          if (!strategy.safetyCheck(config)) {
            this.logger.warn(`Adaptation safety check failed: ${strategy.id}`);
            continue;
          }

          // Calculate expected effectiveness
          const expectedEffectiveness = this.calculateExpectedEffectiveness(pattern, strategy);

          adaptations.push({
            id: strategy.id,
            type: strategy.type,
            name: strategy.name,
            description: strategy.description,
            config,
            expected_effectiveness: expectedEffectiveness
          });

          // Create or update behavior
          const behavior = await this.createOrUpdateBehavior(
            strategy,
            config,
            expectedEffectiveness
          );

          if (behavior) {
            modifiedBehaviors.push(behavior.id);
            this.activeBehaviors.set(behavior.id, behavior);
          }
        }
      }

      this.logger.info(`Behavior adaptation completed: ${adaptations.length} adaptations`);
      return {
        adaptations,
        modified_behaviors: modifiedBehaviors,
        requires_approval: requiresApproval,
        adapted_at: new Date()
      };
    } catch (error) {
      this.logger.error('Behavior adaptation failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Find relevant adaptation strategies for a pattern
   * @param pattern - Pattern to analyze
   * @returns Relevant strategies
   */
  private findRelevantStrategies(pattern: Pattern): AdaptationStrategy[] {
    const relevant: AdaptationStrategy[] = [];

    // Map pattern types to behavior types
    const patternToBehaviorMap: Record<string, BehaviorType[]> = {
      [PatternType.USER_BEHAVIOR]: [BehaviorType.STRATEGY, BehaviorType.RESPONSE],
      [PatternType.INTERACTION]: [BehaviorType.STRATEGY, BehaviorType.RESPONSE],
      [PatternType.SUCCESS_METRIC]: [BehaviorType.STRATEGY, BehaviorType.TOOL_USAGE],
      [PatternType.FAILURE_ANALYSIS]: [BehaviorType.PARAMETER, BehaviorType.TOOL_USAGE],
      [PatternType.CONTEXT_MAPPING]: [BehaviorType.STRATEGY, BehaviorType.RESPONSE]
    };

    const relevantTypes = patternToBehaviorMap[pattern.type] || [];

    for (const [strategyId, strategy] of this.adaptationStrategies.entries()) {
      if (relevantTypes.includes(strategy.type)) {
        relevant.push(strategy);
      }
    }

    return relevant;
  }

  /**
   * Calculate expected effectiveness of an adaptation
   * @param pattern - Source pattern
   * @param strategy - Adaptation strategy
   * @returns Expected effectiveness score
   */
  private calculateExpectedEffectiveness(
    pattern: Pattern,
    strategy: AdaptationStrategy
  ): number {
    // Base effectiveness from pattern confidence
    let effectiveness = pattern.confidence * 0.7;

    // Boost based on pattern frequency
    effectiveness += Math.min(pattern.frequency / 100, 0.2);

    // Boost based on strategy type match
    const typeMatch = this.getTypeMatchScore(pattern.type, strategy.type);
    effectiveness += typeMatch * 0.1;

    return Math.min(effectiveness, 1);
  }

  /**
   * Get type match score
   * @param patternType - Pattern type
   * @param behaviorType - Behavior type
   * @returns Match score
   */
  private getTypeMatchScore(patternType: string, behaviorType: BehaviorType): number {
    const matches: Record<string, BehaviorType[]> = {
      [PatternType.USER_BEHAVIOR]: [BehaviorType.STRATEGY, BehaviorType.RESPONSE],
      [PatternType.INTERACTION]: [BehaviorType.STRATEGY, BehaviorType.RESPONSE],
      [PatternType.SUCCESS_METRIC]: [BehaviorType.STRATEGY, BehaviorType.TOOL_USAGE],
      [PatternType.FAILURE_ANALYSIS]: [BehaviorType.PARAMETER, BehaviorType.TOOL_USAGE],
      [PatternType.CONTEXT_MAPPING]: [BehaviorType.STRATEGY, BehaviorType.RESPONSE]
    };

    const compatibleTypes = matches[patternType] || [];
    return compatibleTypes.includes(behaviorType) ? 1 : 0;
  }

  /**
   * Create or update a behavior
   * @param strategy - Adaptation strategy
   * @param config - Behavior configuration
   * @param effectiveness - Expected effectiveness
   * @returns Created or updated behavior
   */
  private async createOrUpdateBehavior(
    strategy: AdaptationStrategy,
    config: Record<string, any>,
    effectiveness: number
  ): Promise<Behavior | null> {
    try {
      const behaviorId = `behavior_${strategy.id}`;

      // Check if behavior exists
      const existing = await this.repository.behaviors.findById(behaviorId);

      if (existing) {
        // Update existing behavior
        const updated = await this.repository.behaviors.update(behaviorId, {
          config,
          effectiveness_score: (existing.effectiveness_score + effectiveness) / 2,
          last_modified: new Date(),
          updated_at: new Date()
        });

        return updated;
      } else {
        // Create new behavior
        const behavior: Behavior = {
          id: behaviorId,
          type: strategy.type,
          name: strategy.name,
          description: strategy.description,
          config,
          effectiveness_score: effectiveness,
          usage_count: 0,
          success_count: 0,
          failure_count: 0,
          last_used: new Date(),
          last_modified: new Date(),
          requires_approval: this.constraints.require_approval_for.includes(strategy.type),
          safety_constraints: this.constraints.safety_boundaries,
          metadata: {},
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        };

        return await this.repository.behaviors.create(behavior);
      }
    } catch (error) {
      this.logger.warn(`Failed to create/update behavior ${strategy.id}:`, error);
      return null;
    }
  }

  /**
   * Apply a specific behavior
   * @param behaviorId - Behavior ID
   * @param context - Application context
   * @returns Application result
   */
  async applyBehavior(
    behaviorId: string,
    context: Record<string, any> = {}
  ): Promise<{
    success: boolean;
    config?: Record<string, any>;
    error?: string;
  }> {
    try {
      const behavior = this.activeBehaviors.get(behaviorId);

      if (!behavior) {
        return {
          success: false,
          error: 'Behavior not found'
        };
      }

      if (!behavior.is_active) {
        return {
          success: false,
          error: 'Behavior is not active'
        };
      }

      if (behavior.requires_approval) {
        return {
          success: false,
          error: 'Behavior requires approval'
        };
      }

      // Record usage
      await this.repository.behaviors.recordUsage(behaviorId, true);

      this.logger.debug(`Applied behavior: ${behaviorId}`);
      return {
        success: true,
        config: behavior.config
      };
    } catch (error) {
      this.logger.error(`Failed to apply behavior ${behaviorId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Record behavior outcome
   * @param behaviorId - Behavior ID
   * @param success - Whether the behavior succeeded
   * @param effectiveness - Effectiveness score
   */
  async recordOutcome(
    behaviorId: string,
    success: boolean,
    effectiveness?: number
  ): Promise<void> {
    try {
      await this.repository.behaviors.recordUsage(behaviorId, success);

      this.adaptationHistory.push({
        id: `outcome_${Date.now()}`,
        behavior_id: behaviorId,
        timestamp: new Date(),
        success,
        effectiveness: effectiveness || (success ? 1 : 0)
      });

      // Keep history manageable
      if (this.adaptationHistory.length > 1000) {
        this.adaptationHistory = this.adaptationHistory.slice(-500);
      }

      this.logger.debug(`Recorded outcome for behavior ${behaviorId}: ${success}`);
    } catch (error) {
      this.logger.error(`Failed to record outcome for behavior ${behaviorId}:`, error);
    }
  }

  /**
   * Get active behaviors
   * @returns Array of active behaviors
   */
  getActiveBehaviors(): Behavior[] {
    return Array.from(this.activeBehaviors.values()).filter(b => b.is_active);
  }

  /**
   * Get behaviors by type
   * @param type - Behavior type
   * @returns Array of behaviors of specified type
   */
  getBehaviorsByType(type: BehaviorType): Behavior[] {
    return this.getActiveBehaviors().filter(b => b.type === type);
  }

  /**
   * Get adaptation history
   * @returns Adaptation history
   */
  getAdaptationHistory(): Array<{
    id: string;
    behavior_id: string;
    timestamp: Date;
    success: boolean;
    effectiveness: number;
  }> {
    return [...this.adaptationHistory];
  }

  /**
   * Get behavior effectiveness
   * @param behaviorId - Behavior ID
   * @returns Effectiveness score or null
   */
  getBehaviorEffectiveness(behaviorId: string): number | null {
    const behavior = this.activeBehaviors.get(behaviorId);
    return behavior?.effectiveness_score ?? null;
  }

  /**
   * Add custom adaptation strategy
   * @param strategy - Adaptation strategy
   */
  addAdaptationStrategy(strategy: AdaptationStrategy): void {
    this.adaptationStrategies.set(strategy.id, strategy);
    this.logger.info(`Added custom adaptation strategy: ${strategy.id}`);
  }

  /**
   * Remove adaptation strategy
   * @param strategyId - Strategy ID to remove
   */
  removeAdaptationStrategy(strategyId: string): void {
    this.adaptationStrategies.delete(strategyId);
    this.logger.info(`Removed adaptation strategy: ${strategyId}`);
  }

  /**
   * Clear adaptation history
   */
  clearHistory(): void {
    this.adaptationHistory = [];
    this.logger.debug('Adaptation history cleared');
  }

  /**
   * Update constraints
   * @param constraints - New constraints
   */
  updateConstraints(constraints: Partial<LearningConstraints>): void {
    this.constraints = { ...this.constraints, ...constraints };
    this.logger.info('Behavior Adapter constraints updated', constraints);
  }
}
