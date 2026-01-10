/**
 * Learning Validator - Layer 3 of Self-Learning System
 * 
 * Performs A/B testing for controlled experiment validation,
 * monitors performance for impact assessment,
 * integrates user feedback for satisfaction measurement,
 * and runs safety checks for constraint compliance verification.
 */

import { Logger } from '../utils/logger.js';
import { LearningRepository } from './learning-repository.js';
import { LearningConstraints } from './learning-models.js';
import {
  LearningValidationResult,
  ABTestExperiment,
  ABTestVariant,
  ABTestAssignment,
  Pattern,
  Behavior,
  Knowledge
} from './learning-models.js';

/**
 * A/B test configuration
 */
interface ABTestConfig {
  name: string;
  description: string;
  hypothesis: string;
  success_criteria: string;
  variants: Array<{
    name: string;
    description: string;
    config: Record<string, any>;
    allocation_percentage: number;
    is_control: boolean;
  }>;
  target_sample_size?: number;
  duration_days?: number;
}

/**
 * Safety check result
 */
interface SafetyCheckResult {
  check: string;
  passed: boolean;
  details: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Learning Validator class
 * Handles validation of learned patterns and behaviors
 */
export class LearningValidator {
  private logger: Logger;
  private repository: LearningRepository;
  private constraints: LearningConstraints;
  private activeExperiments: Map<string, ABTestExperiment> = new Map();
  private validationHistory: Map<string, LearningValidationResult> = new Map();

  constructor(
    repository: LearningRepository,
    constraints?: Partial<LearningConstraints>
  ) {
    this.repository = repository;
    this.logger = new Logger('LearningValidator');
    
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

    this.logger.info('Learning Validator initialized');
  }

  /**
   * Validate a pattern
   * @param pattern - Pattern to validate
   * @returns Validation result
   */
  async validatePattern(pattern: Pattern): Promise<LearningValidationResult> {
    this.logger.info(`Validating pattern: ${pattern.id}`);

    const startTime = Date.now();

    try {
      // Run safety checks
      const safetyChecks = await this.runSafetyChecks('pattern', pattern);

      // Check confidence threshold
      const meetsConfidenceThreshold = pattern.confidence >= this.constraints.min_confidence_threshold;

      // Check if pattern is forbidden
      const isForbidden = this.constraints.forbidden_patterns.includes(pattern.id);

      // Check bias
      const biasCheck = this.constraints.bias_detection_enabled 
        ? await this.checkBias(pattern) 
        : { has_bias: false, details: 'Bias detection disabled' };

      // Calculate overall validity
      const allSafetyPassed = safetyChecks.every(check => check.passed);
      const isValid = allSafetyPassed && 
                     meetsConfidenceThreshold && 
                     !isForbidden && 
                     !biasCheck.has_bias;

      // Calculate confidence
      const confidence = this.calculateValidationConfidence(
        safetyChecks,
        meetsConfidenceThreshold,
        !isForbidden,
        !biasCheck.has_bias
      );

      const result: LearningValidationResult = {
        validation_type: 'safety',
        entity_id: pattern.id,
        entity_type: 'pattern',
        is_valid: isValid,
        confidence,
        metrics: {
          safety_checks_passed: safetyChecks.filter(c => c.passed).length,
          safety_checks_total: safetyChecks.length,
          confidence_score: pattern.confidence,
          frequency: pattern.frequency
        },
        safety_checks: safetyChecks,
        validated_at: new Date()
      };

      // Store validation result
      this.validationHistory.set(`pattern_${pattern.id}_${Date.now()}`, result);

      const duration = Date.now() - startTime;
      this.logger.info(`Pattern validation completed in ${duration}ms: ${isValid ? 'valid' : 'invalid'}`);

      return result;
    } catch (error) {
      this.logger.error(`Pattern validation failed for ${pattern.id}:`, error);
      throw error;
    }
  }

  /**
   * Validate a behavior
   * @param behavior - Behavior to validate
   * @returns Validation result
   */
  async validateBehavior(behavior: Behavior): Promise<LearningValidationResult> {
    this.logger.info(`Validating behavior: ${behavior.id}`);

    const startTime = Date.now();

    try {
      // Run safety checks
      const safetyChecks = await this.runSafetyChecks('behavior', behavior);

      // Check effectiveness threshold
      const meetsEffectivenessThreshold = behavior.effectiveness_score >= this.constraints.min_effectiveness_threshold;

      // Check if behavior requires approval
      const requiresApproval = this.constraints.require_approval_for.includes(behavior.type);

      // Check bias
      const biasCheck = this.constraints.bias_detection_enabled 
        ? await this.checkBias(behavior) 
        : { has_bias: false, details: 'Bias detection disabled' };

      // Calculate overall validity
      const allSafetyPassed = safetyChecks.every(check => check.passed);
      const isValid = allSafetyPassed && 
                     meetsEffectivenessThreshold && 
                     !biasCheck.has_bias;

      // Calculate confidence
      const confidence = this.calculateValidationConfidence(
        safetyChecks,
        meetsEffectivenessThreshold,
        true,
        !biasCheck.has_bias
      );

      const result: LearningValidationResult = {
        validation_type: 'safety',
        entity_id: behavior.id,
        entity_type: 'behavior',
        is_valid: isValid,
        confidence,
        metrics: {
          safety_checks_passed: safetyChecks.filter(c => c.passed).length,
          safety_checks_total: safetyChecks.length,
          effectiveness_score: behavior.effectiveness_score,
          usage_count: behavior.usage_count,
          success_rate: behavior.usage_count > 0 
            ? behavior.success_count / behavior.usage_count 
            : 0
        },
        safety_checks: safetyChecks,
        validated_at: new Date()
      };

      // Store validation result
      this.validationHistory.set(`behavior_${behavior.id}_${Date.now()}`, result);

      const duration = Date.now() - startTime;
      this.logger.info(`Behavior validation completed in ${duration}ms: ${isValid ? 'valid' : 'invalid'}`);

      return result;
    } catch (error) {
      this.logger.error(`Behavior validation failed for ${behavior.id}:`, error);
      throw error;
    }
  }

  /**
   * Validate knowledge entry
   * @param knowledge - Knowledge to validate
   * @returns Validation result
   */
  async validateKnowledge(knowledge: Knowledge): Promise<LearningValidationResult> {
    this.logger.info(`Validating knowledge: ${knowledge.id}`);

    const startTime = Date.now();

    try {
      // Run safety checks
      const safetyChecks = await this.runSafetyChecks('knowledge', knowledge);

      // Check confidence threshold
      const meetsConfidenceThreshold = knowledge.confidence >= this.constraints.min_confidence_threshold;

      // Check privacy level
      const privacyCompliant = this.constraints.privacy_protection_enabled 
        ? this.checkPrivacyCompliance(knowledge)
        : true;

      // Check bias
      const biasCheck = this.constraints.bias_detection_enabled 
        ? await this.checkBias(knowledge) 
        : { has_bias: false, details: 'Bias detection disabled' };

      // Calculate overall validity
      const allSafetyPassed = safetyChecks.every(check => check.passed);
      const isValid = allSafetyPassed && 
                     meetsConfidenceThreshold && 
                     privacyCompliant && 
                     !biasCheck.has_bias;

      // Calculate confidence
      const confidence = this.calculateValidationConfidence(
        safetyChecks,
        meetsConfidenceThreshold,
        privacyCompliant,
        !biasCheck.has_bias
      );

      const result: LearningValidationResult = {
        validation_type: 'safety',
        entity_id: knowledge.id,
        entity_type: 'knowledge',
        is_valid: isValid,
        confidence,
        metrics: {
          safety_checks_passed: safetyChecks.filter(c => c.passed).length,
          safety_checks_total: safetyChecks.length,
          confidence_score: knowledge.confidence,
          usage_count: knowledge.usage_count
        },
        safety_checks: safetyChecks,
        validated_at: new Date()
      };

      // Store validation result
      this.validationHistory.set(`knowledge_${knowledge.id}_${Date.now()}`, result);

      const duration = Date.now() - startTime;
      this.logger.info(`Knowledge validation completed in ${duration}ms: ${isValid ? 'valid' : 'invalid'}`);

      return result;
    } catch (error) {
      this.logger.error(`Knowledge validation failed for ${knowledge.id}:`, error);
      throw error;
    }
  }

  /**
   * Create and start an A/B test
   * @param config - A/B test configuration
   * @returns Created experiment
   */
  async createABTest(config: ABTestConfig): Promise<ABTestExperiment> {
    this.logger.info(`Creating A/B test: ${config.name}`);

    try {
      // Validate configuration
      this.validateABTestConfig(config);

      // Create experiment
      const experiment: ABTestExperiment = {
        id: `ab_test_${Date.now()}`,
        name: config.name,
        description: config.description,
        status: 'draft',
        hypothesis: config.hypothesis,
        success_criteria: config.success_criteria,
        variants: [],
        start_date: undefined,
        end_date: undefined,
        target_sample_size: config.target_sample_size,
        created_at: new Date(),
        updated_at: new Date()
      };

      // Create variants
      for (const variantConfig of config.variants) {
        const variant: ABTestVariant = {
          id: `variant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          experiment_id: experiment.id,
          name: variantConfig.name,
          description: variantConfig.description,
          config: variantConfig.config,
          allocation_percentage: variantConfig.allocation_percentage,
          is_control: variantConfig.is_control,
          participants: 0,
          conversions: 0,
          average_rating: 0,
          custom_metrics: {},
          created_at: new Date(),
          updated_at: new Date()
        };

        await this.repository.events.create({
          id: `event_${Date.now()}`,
          event_type: 'knowledge_created' as any,
          entity_type: 'knowledge',
          entity_id: variant.id,
          description: `Created A/B test variant: ${variantConfig.name}`,
          details: variantConfig,
          success: true,
          metadata: {},
          created_at: new Date()
        });

        experiment.variants.push(variant);
      }

      // Save experiment
      await this.repository.events.create({
        id: `event_${Date.now()}`,
        event_type: 'knowledge_created' as any,
        entity_type: 'knowledge',
        entity_id: experiment.id,
        description: `Created A/B test experiment: ${config.name}`,
        details: config,
        success: true,
        metadata: {},
        created_at: new Date()
      });

      this.activeExperiments.set(experiment.id, experiment);
      this.logger.info(`A/B test created: ${experiment.id}`);
      return experiment;
    } catch (error) {
      this.logger.error(`Failed to create A/B test: ${config.name}`, error);
      throw error;
    }
  }

  /**
   * Start an A/B test
   * @param experimentId - Experiment ID
   * @returns Started experiment
   */
  async startABTest(experimentId: string): Promise<ABTestExperiment> {
    const experiment = this.activeExperiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    experiment.status = 'running';
    experiment.start_date = new Date();
    experiment.updated_at = new Date();

    this.activeExperiments.set(experimentId, experiment);
    this.logger.info(`A/B test started: ${experimentId}`);
    return experiment;
  }

  /**
   * Assign user to A/B test variant
   * @param experimentId - Experiment ID
   * @param userId - User ID
   * @returns Assigned variant
   */
  async assignVariant(experimentId: string, userId: string, guildId?: string): Promise<ABTestVariant | null> {
    const experiment = this.activeExperiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') {
      return null;
    }

    // Check if user already assigned
    const existingAssignments = await this.repository.events.findByOptions({
      event_type: 'knowledge_created' as any,
      entity_type: 'knowledge',
      entity_id: experimentId,
      user_id: userId
    });

    if (existingAssignments.length > 0) {
      // Return existing assignment
      const assignmentId = existingAssignments[0].details?.variant_id;
      return experiment.variants.find(v => v.id === assignmentId) || null;
    }

    // Select variant based on allocation
    const variant = this.selectVariant(experiment);

    if (!variant) {
      return null;
    }

    // Record assignment
    const assignment: ABTestAssignment = {
      id: `assignment_${Date.now()}`,
      experiment_id: experimentId,
      variant_id: variant.id,
      user_id: userId,
      guild_id: guildId,
      assigned_at: new Date(),
      metrics: {}
    };

    await this.repository.events.create({
      id: `event_${Date.now()}`,
      event_type: 'knowledge_created' as any,
      entity_type: 'knowledge',
      entity_id: assignment.id,
      description: `Assigned user to variant: ${variant.name}`,
      details: assignment,
      success: true,
      user_id: userId,
      guild_id: guildId,
      metadata: {},
      created_at: new Date()
    });

    // Update variant participants
    variant.participants++;
    variant.updated_at = new Date();

    this.logger.debug(`Assigned user ${userId} to variant ${variant.name}`);
    return variant;
  }

  /**
   * Record A/B test conversion
   * @param experimentId - Experiment ID
   * @param variantId - Variant ID
   * @param userId - User ID
   * @param rating - User rating
   * @param metrics - Custom metrics
   */
  async recordConversion(
    experimentId: string,
    variantId: string,
    userId: string,
    rating?: number,
    metrics?: Record<string, number>
  ): Promise<void> {
    const experiment = this.activeExperiments.get(experimentId);
    if (!experiment) {
      return;
    }

    const variant = experiment.variants.find(v => v.id === variantId);
    if (!variant) {
      return;
    }

    // Update variant metrics
    variant.conversions++;
    if (rating !== undefined) {
      const totalRating = variant.average_rating * (variant.conversions - 1) + rating;
      variant.average_rating = totalRating / variant.conversions;
    }
    if (metrics) {
      for (const [key, value] of Object.entries(metrics)) {
        variant.custom_metrics[key] = (variant.custom_metrics[key] || 0) + value;
      }
    }
    variant.updated_at = new Date();

    this.logger.debug(`Recorded conversion for variant ${variant.name}`);
  }

  /**
   * Analyze A/B test results
   * @param experimentId - Experiment ID
   * @returns Analysis results
   */
  async analyzeABTest(experimentId: string): Promise<{
    is_significant: boolean;
    winner?: ABTestVariant;
    confidence: number;
    recommendations: string[];
  }> {
    const experiment = this.activeExperiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    // Calculate conversion rates
    const variantStats = experiment.variants.map(variant => ({
      variant,
      conversion_rate: variant.participants > 0 
        ? variant.conversions / variant.participants 
        : 0,
      average_rating: variant.average_rating
    }));

    // Find winner
    const sortedByConversion = [...variantStats].sort((a, b) => b.conversion_rate - a.conversion_rate);
    const winner = sortedByConversion[0];

    // Calculate statistical significance (simplified)
    const isSignificant = this.calculateSignificance(variantStats);

    // Generate recommendations
    const recommendations: string[] = [];
    if (isSignificant && winner) {
      recommendations.push(`Variant "${winner.variant.name}" shows statistically significant improvement`);
    } else if (!isSignificant) {
      recommendations.push('No statistically significant difference detected');
      recommendations.push('Consider extending test duration or increasing sample size');
    }

    if (winner) {
      recommendations.push(`Consider adopting variant: ${winner.variant.name}`);
    }

    this.logger.info(`A/B test analysis completed for ${experimentId}`);
    return {
      is_significant: isSignificant,
      winner: winner?.variant,
      confidence: winner?.average_rating || 0,
      recommendations
    };
  }

  /**
   * Run safety checks on an entity
   * @param entityType - Type of entity
   * @param entity - Entity to check
   * @returns Array of safety check results
   */
  private async runSafetyChecks(
    entityType: string,
    entity: Pattern | Behavior | Knowledge
  ): Promise<SafetyCheckResult[]> {
    const checks: SafetyCheckResult[] = [];

    // Check for user data exposure
    const hasUserDataExposure = this.checkUserDataExposure(entity);
    checks.push({
      check: 'no_user_data_exposure',
      passed: !hasUserDataExposure,
      details: hasUserDataExposure 
        ? 'Entity may expose user data' 
        : 'No user data exposure detected',
      severity: 'high'
    });

    // Check for unauthorized modifications
    const hasUnauthorizedMods = this.checkUnauthorizedModifications(entity);
    checks.push({
      check: 'no_unauthorized_modifications',
      passed: !hasUnauthorizedMods,
      details: hasUnauthorizedMods 
        ? 'Entity may cause unauthorized modifications' 
        : 'No unauthorized modifications detected',
      severity: 'high'
    });

    // Check for privilege escalation
    const hasPrivilegeEscalation = this.checkPrivilegeEscalation(entity);
    checks.push({
      check: 'no_privilege_escalation',
      passed: !hasPrivilegeEscalation,
      details: hasPrivilegeEscalation 
        ? 'Entity may cause privilege escalation' 
        : 'No privilege escalation detected',
      severity: 'high'
    });

    return checks;
  }

  /**
   * Check for user data exposure
   * @param entity - Entity to check
   * @returns Whether user data is exposed
   */
  private checkUserDataExposure(entity: Pattern | Behavior | Knowledge): boolean {
    const content = JSON.stringify(entity);
    const sensitivePatterns = [
      /user_id/i,
      /personal.*info/i,
      /private.*key/i,
      /password/i,
      /token/i
    ];

    return sensitivePatterns.some(pattern => pattern.test(content));
  }

  /**
   * Check for unauthorized modifications
   * @param entity - Entity to check
   * @returns Whether entity causes unauthorized modifications
   */
  private checkUnauthorizedModifications(entity: Pattern | Behavior | Knowledge): boolean {
    const content = JSON.stringify(entity);
    const unauthorizedPatterns = [
      /system.*root/i,
      /admin.*access/i,
      /sudo/i,
      /bypass.*auth/i
    ];

    return unauthorizedPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Check for privilege escalation
   * @param entity - Entity to check
   * @returns Whether entity causes privilege escalation
   */
  private checkPrivilegeEscalation(entity: Pattern | Behavior | Knowledge): boolean {
    const content = JSON.stringify(entity);
    const escalationPatterns = [
      /elevate.*privilege/i,
      /grant.*admin/i,
      /escalate.*role/i,
      /bypass.*permission/i
    ];

    return escalationPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Check for bias in entity
   * @param entity - Entity to check
   * @returns Bias check result
   */
  private async checkBias(entity: Pattern | Behavior | Knowledge): Promise<{
    has_bias: boolean;
    details: string;
  }> {
    // Simplified bias detection
    const content = JSON.stringify(entity);
    
    // Check for biased language patterns
    const biasedPatterns = [
      /always.*men/i,
      /only.*women/i,
      /never.*\b(he|she)\b/i,
      /inferior.*race/i
    ];

    const hasBiasedLanguage = biasedPatterns.some(pattern => pattern.test(content));

    if (hasBiasedLanguage) {
      return {
        has_bias: true,
        details: 'Potential biased language detected'
      };
    }

    return {
      has_bias: false,
      details: 'No bias detected'
    };
  }

  /**
   * Check privacy compliance
   * @param knowledge - Knowledge to check
   * @returns Whether privacy compliant
   */
  private checkPrivacyCompliance(knowledge: Knowledge): boolean {
    // Knowledge with private privacy level must have user_id
    if (knowledge.privacy_level === 'private' && !knowledge.user_id) {
      return false;
    }

    // Knowledge with guild_only privacy level must have guild_id
    if (knowledge.privacy_level === 'guild_only' && !knowledge.guild_id) {
      return false;
    }

    return true;
  }

  /**
   * Calculate validation confidence
   * @param safetyChecks - Safety check results
   * @param meetsThreshold - Whether threshold is met
   * @param privacyCompliant - Whether privacy compliant
   * @param noBias - Whether no bias detected
   * @returns Confidence score
   */
  private calculateValidationConfidence(
    safetyChecks: SafetyCheckResult[],
    meetsThreshold: boolean,
    privacyCompliant: boolean,
    noBias: boolean
  ): number {
    let confidence = 0;

    // Safety checks contribute 40%
    const safetyPassed = safetyChecks.filter(c => c.passed).length;
    const safetyScore = safetyChecks.length > 0 ? safetyPassed / safetyChecks.length : 1;
    confidence += safetyScore * 0.4;

    // Threshold contributes 30%
    if (meetsThreshold) {
      confidence += 0.3;
    }

    // Privacy contributes 15%
    if (privacyCompliant) {
      confidence += 0.15;
    }

    // Bias contributes 15%
    if (noBias) {
      confidence += 0.15;
    }

    return Math.min(confidence, 1);
  }

  /**
   * Validate A/B test configuration
   * @param config - Configuration to validate
   */
  private validateABTestConfig(config: ABTestConfig): void {
    if (!config.name || config.name.trim() === '') {
      throw new Error('A/B test name is required');
    }

    if (!config.hypothesis || config.hypothesis.trim() === '') {
      throw new Error('A/B test hypothesis is required');
    }

    if (!config.success_criteria || config.success_criteria.trim() === '') {
      throw new Error('A/B test success criteria is required');
    }

    if (!config.variants || config.variants.length < 2) {
      throw new Error('A/B test must have at least 2 variants');
    }

    const totalAllocation = config.variants.reduce((sum, v) => sum + v.allocation_percentage, 0);
    if (Math.abs(totalAllocation - 100) > 0.01) {
      throw new Error('Variant allocation percentages must sum to 100');
    }

    const controlCount = config.variants.filter(v => v.is_control).length;
    if (controlCount !== 1) {
      throw new Error('A/B test must have exactly 1 control variant');
    }
  }

  /**
   * Select variant for assignment
   * @param experiment - Experiment
   * @returns Selected variant
   */
  private selectVariant(experiment: ABTestExperiment): ABTestVariant | null {
    const random = Math.random() * 100;
    let cumulative = 0;

    for (const variant of experiment.variants) {
      cumulative += variant.allocation_percentage;
      if (random <= cumulative) {
        return variant;
      }
    }

    return experiment.variants[0] || null;
  }

  /**
   * Calculate statistical significance
   * @param variantStats - Variant statistics
   * @returns Whether results are significant
   */
  private calculateSignificance(variantStats: Array<{
    variant: ABTestVariant;
    conversion_rate: number;
    average_rating: number;
  }>): boolean {
    if (variantStats.length < 2) {
      return false;
    }

    // Simplified significance test
    const sorted = [...variantStats].sort((a, b) => b.conversion_rate - a.conversion_rate);
    const winner = sorted[0];
    const runnerUp = sorted[1];

    if (!winner || !runnerUp) {
      return false;
    }

    // Check if difference is at least 5%
    const difference = winner.conversion_rate - runnerUp.conversion_rate;
    const isSignificant = difference >= 0.05 && winner.variant.conversions >= 10;

    return isSignificant;
  }

  /**
   * Get validation history
   * @returns Validation history
   */
  getValidationHistory(): LearningValidationResult[] {
    return Array.from(this.validationHistory.values());
  }

  /**
   * Get active experiments
   * @returns Active A/B test experiments
   */
  getActiveExperiments(): ABTestExperiment[] {
    return Array.from(this.activeExperiments.values());
  }

  /**
   * Get experiment by ID
   * @param experimentId - Experiment ID
   * @returns Experiment or null
   */
  getExperiment(experimentId: string): ABTestExperiment | null {
    return this.activeExperiments.get(experimentId) || null;
  }

  /**
   * Update constraints
   * @param constraints - New constraints
   */
  updateConstraints(constraints: Partial<LearningConstraints>): void {
    this.constraints = { ...this.constraints, ...constraints };
    this.logger.info('Learning Validator constraints updated', constraints);
  }
}
