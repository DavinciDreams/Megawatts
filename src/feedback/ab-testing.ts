/**
 * A/B Testing Infrastructure
 * 
 * Framework for running A/B tests, tracking variants,
 * collecting metrics, and rolling out winning variants.
 */

import { ABTestRepository } from './feedback-repository';
import {
  ABTestExperiment,
  ABTestVariant,
  ABTestAssignment,
  ABTestConfig,
  ABTestResult,
  ExperimentStatus,
  VariantResult,
} from './feedback-model';
import { Logger } from '../utils/logger';

// ============================================================================
// A/B TESTING CONFIGURATION
// ============================================================================

/**
 * Configuration for A/B testing framework
 */
export interface ABTestingConfig {
  enableAutoAssignment: boolean;
  defaultAllocationStrategy: 'random' | 'round_robin' | 'hash';
  minSampleSizeForSignificance: number;
  significanceLevel: number; // 0-1, typically 0.95
  autoRolloutThreshold: number; // percentage improvement required for auto rollout
  maxExperimentDuration: number; // in days
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ABTestingConfig = {
  enableAutoAssignment: true,
  defaultAllocationStrategy: 'random',
  minSampleSizeForSignificance: 100,
  significanceLevel: 0.95,
  autoRolloutThreshold: 10, // 10% improvement
  maxExperimentDuration: 30, // 30 days
};

// ============================================================================
// STATISTICAL ANALYSIS TYPES
// ============================================================================

/**
 * Statistical test result
 */
export interface StatisticalTestResult {
  testType: 'z_test' | 't_test' | 'chi_square';
  statistic: number;
  pValue: number;
  isSignificant: boolean;
  confidenceInterval: [number, number];
  recommendation: 'rollout_winner' | 'continue_test' | 'inconclusive';
}

/**
 * Variant comparison result
 */
export interface VariantComparison {
  variantA: string;
  variantB: string;
  metric: string;
  difference: number;
  relativeDifference: number; // percentage
  isSignificant: boolean;
  confidence: number;
  pValue?: number;
}

// ============================================================================
// A/B TESTING CLASS
// ============================================================================

/**
 * A/B testing framework
 */
export class ABTestingFramework {
  private repository: ABTestRepository;
  private logger: Logger;
  private config: ABTestingConfig;

  constructor(repository: ABTestRepository, config?: Partial<ABTestingConfig>) {
    this.repository = repository;
    this.logger = new Logger('ABTestingFramework');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new A/B test experiment
   * 
   * @param config - Experiment configuration
   * @returns Created experiment
   */
  async createExperiment(config: ABTestConfig): Promise<ABTestExperiment> {
    try {
      // Validate variant allocations sum to 100
      const totalAllocation = config.variants.reduce((sum, v) => sum + v.allocationPercentage, 0);
      if (Math.abs(totalAllocation - 100) > 0.01) {
        throw new Error('Variant allocations must sum to 100%');
      }

      // Create experiment
      const experiment = await this.repository.createExperiment({
        name: config.name,
        description: config.description,
        hypothesis: config.hypothesis,
        successCriteria: config.successCriteria,
        targetSampleSize: config.targetSampleSize,
      });

      this.logger.info(`Created A/B test experiment: ${config.name}`);

      // Create variants
      for (const variant of config.variants) {
        await this.repository.createVariant({
          experimentId: experiment.id,
          name: variant.name,
          description: variant.description,
          config: variant.config,
          allocationPercentage: variant.allocationPercentage,
          isControl: variant.isControl || false,
        });
      }

      // Reload experiment with variants
      const fullExperiment = await this.repository.getExperimentById(experiment.id);
      return fullExperiment!;
    } catch (error) {
      this.logger.error('Failed to create experiment:', error as Error);
      throw error;
    }
  }

  /**
   * Start an experiment
   * 
   * @param experimentId - Experiment ID
   * @returns Updated experiment
   */
  async startExperiment(experimentId: string): Promise<ABTestExperiment> {
    await this.repository.startExperiment(experimentId);
    const experiment = await this.repository.getExperimentById(experimentId);
    if (!experiment) {
      throw new Error('Experiment not found after starting');
    }
    this.logger.info(`Started A/B test experiment: ${experimentId}`);
    return experiment;
  }

  /**
   * End an experiment
   * 
   * @param experimentId - Experiment ID
   * @returns Updated experiment
   */
  async endExperiment(experimentId: string): Promise<ABTestExperiment> {
    await this.repository.endExperiment(experimentId);
    const experiment = await this.repository.getExperimentById(experimentId);
    if (!experiment) {
      throw new Error('Experiment not found after ending');
    }
    this.logger.info(`Ended A/B test experiment: ${experimentId}`);
    return experiment;
  }

  /**
   * Assign a user to a variant
   * 
   * @param experimentId - Experiment ID
   * @param userId - User ID
   * @param serverId - Optional server ID
   * @returns Assignment result
   */
  async assignVariant(
    experimentId: string,
    userId: string,
    serverId?: string
  ): Promise<{ variant: ABTestVariant; isNewAssignment: boolean }> {
    try {
      // Check if user already has an assignment
      const existingAssignment = await this.repository.getUserAssignment(experimentId, userId);
      if (existingAssignment) {
        const variants = await this.repository.getVariants(experimentId);
        const variant = variants.find((v) => v.id === existingAssignment.variantId);
        return { variant: variant!, isNewAssignment: false };
      }

      // Get variants for this experiment
      const variants = await this.repository.getVariants(experimentId);
      if (variants.length === 0) {
        throw new Error('No variants found for experiment');
      }

      // Select variant based on allocation strategy
      const selectedVariant = this.selectVariant(variants, userId);
      if (!selectedVariant) {
        throw new Error('Failed to select variant');
      }

      // Create assignment
      await this.repository.assignVariant({
        experimentId,
        variantId: selectedVariant.id,
        userId,
        serverId,
      });

      this.logger.debug(`Assigned user ${userId} to variant ${selectedVariant.name} in experiment ${experimentId}`);

      return { variant: selectedVariant, isNewAssignment: true };
    } catch (error) {
      this.logger.error('Failed to assign variant:', error as Error);
      throw error;
    }
  }

  /**
   * Select a variant for a user based on allocation strategy
   * 
   * @param variants - Available variants
   * @param userId - User ID for deterministic allocation
   * @returns Selected variant
   */
  private selectVariant(variants: ABTestVariant[], userId: string): ABTestVariant | null {
    const strategy = this.config.defaultAllocationStrategy;

    switch (strategy) {
      case 'random':
        return this.selectRandomVariant(variants);

      case 'round_robin':
        return this.selectRoundRobinVariant(variants);

      case 'hash':
        return this.selectHashBasedVariant(variants, userId);

      default:
        return this.selectRandomVariant(variants);
    }
  }

  /**
   * Select variant randomly
   * 
   * @param variants - Available variants
   * @returns Selected variant
   */
  private selectRandomVariant(variants: ABTestVariant[]): ABTestVariant | null {
    if (variants.length === 0) return null;

    const rand = Math.random() * 100;
    let cumulative = 0;

    for (const variant of variants) {
      cumulative += variant.allocationPercentage;
      if (rand < cumulative) {
        return variant;
      }
    }

    // Fallback to first variant
    return variants[0];
  }

  /**
   * Select variant using round-robin (for deterministic testing)
   * 
   * @param variants - Available variants
   * @returns Selected variant
   */
  private selectRoundRobinVariant(variants: ABTestVariant[]): ABTestVariant | null {
    if (variants.length === 0) return null;

    // Use timestamp for round-robin
    const timestamp = Date.now();
    const index = timestamp % variants.length;
    return variants[index];
  }

  /**
   * Select variant using hash-based allocation
   * 
   * @param variants - Available variants
   * @param userId - User ID for hashing
   * @returns Selected variant
   */
  private selectHashBasedVariant(variants: ABTestVariant[], userId: string): ABTestVariant | null {
    if (variants.length === 0) return null;

    // Simple hash of user ID
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash;
    }

    const index = Math.abs(hash) % variants.length;
    return variants[index];
  }

  /**
   * Track a conversion for a user
   * 
   * @param experimentId - Experiment ID
   * @param userId - User ID
   * @param variantId - Variant ID (optional, will be looked up if not provided)
   */
  async trackConversion(experimentId: string, userId: string, variantId?: string): Promise<void> {
    try {
      // Get variant ID if not provided
      let targetVariantId = variantId;
      if (!targetVariantId) {
        const assignment = await this.repository.getUserAssignment(experimentId, userId);
        targetVariantId = assignment?.variantId;
      }

      if (!targetVariantId) {
        throw new Error('No assignment found for user');
      }

      await this.repository.trackConversion(targetVariantId);
      this.logger.debug(`Tracked conversion for user ${userId} in variant ${targetVariantId}`);
    } catch (error) {
      this.logger.error('Failed to track conversion:', error as Error);
      throw error;
    }
  }

  /**
   * Get experiment results
   * 
   * @param experimentId - Experiment ID
   * @returns Experiment results
   */
  async getExperimentResults(experimentId: string): Promise<ABTestResult> {
    try {
      const results = await this.repository.getExperimentResults(experimentId);
      if (!results) {
        throw new Error('Experiment not found');
      }

      // Perform statistical analysis
      const statisticalTest = this.performStatisticalTest(results);

      // Determine recommendation
      const recommendation = this.determineRecommendation(results, statisticalTest);

      // Update recommendation in results
      results.recommendation = recommendation;

      this.logger.info(`Generated results for experiment ${experimentId}`, { recommendation });

      return results;
    } catch (error) {
      this.logger.error('Failed to get experiment results:', error as Error);
      throw error;
    }
  }

  /**
   * Perform statistical significance test
   * 
   * @param results - Experiment results
   * @returns Statistical test result
   */
  private performStatisticalTest(results: ABTestResult): StatisticalTestResult {
    const variantResults = results.variantResults;
    if (variantResults.length < 2) {
      return {
        testType: 'z_test',
        statistic: 0,
        pValue: 1,
        isSignificant: false,
        confidenceInterval: [0, 0],
        recommendation: 'inconclusive',
      };
    }

    // Find control variant
    const control = variantResults.find((v) => v.isControl);
    if (!control) {
      return {
        testType: 'z_test',
        statistic: 0,
        pValue: 1,
        isSignificant: false,
        confidenceInterval: [0, 0],
        recommendation: 'inconclusive',
      };
    }

    // Compare each variant against control
    let bestPValue = 1;
    let bestVariant: typeof variantResults[0] | null = null;

    for (const variant of variantResults) {
      if (variant.isControl) continue;

      const comparison = this.compareVariants(control, variant);
      if (comparison.pValue !== undefined && comparison.pValue < bestPValue) {
        bestPValue = comparison.pValue;
        bestVariant = variant;
      }
    }

    return {
      testType: 'z_test',
      statistic: bestVariant ? bestVariant.conversionRate - control.conversionRate : 0,
      pValue: bestPValue,
      isSignificant: bestPValue < (1 - this.config.significanceLevel),
      confidenceInterval: [0, 0], // TODO: Calculate proper CI
      recommendation: bestPValue < (1 - this.config.significanceLevel) ? 'rollout_winner' : 'continue_test',
    };
  }

  /**
   * Compare two variants
   * 
   * @param variantA - First variant
   * @param variantB - Second variant
   * @returns Comparison result
   */
  private compareVariants(
    variantA: VariantResult,
    variantB: VariantResult
  ): VariantComparison {
    const rateA = variantA.conversionRate;
    const rateB = variantB.conversionRate;
    const participantsA = variantA.participants;
    const participantsB = variantB.participants;

    // Calculate pooled conversion rate
    const pooledRate = (rateA * participantsA + rateB * participantsB) / (participantsA + participantsB);

    // Calculate standard error
    const varianceA = (rateA * (100 - rateA)) / participantsA;
    const varianceB = (rateB * (100 - rateB)) / participantsB;
    const pooledVariance = (varianceA * participantsA + varianceB * participantsB) / (participantsA + participantsB);
    const standardError = Math.sqrt(pooledVariance * (1 / participantsA + 1 / participantsB));

    // Calculate z-score
    const zScore = standardError > 0 ? (rateB - rateA) / standardError : 0;

    // Calculate p-value (two-tailed)
    const pValue = this.calculatePValue(Math.abs(zScore));

    // Calculate relative difference
    const relativeDifference = rateA > 0 ? ((rateB - rateA) / rateA) * 100 : 0;

    return {
      variantA: variantA.variantName,
      variantB: variantB.variantName,
      metric: 'conversion_rate',
      difference: rateB - rateA,
      relativeDifference,
      isSignificant: pValue < (1 - this.config.significanceLevel),
      confidence: this.config.significanceLevel,
      pValue,
    };
  }

  /**
   * Calculate p-value from z-score
   * 
   * @param zScore - Z-score
   * @returns P-value
   */
  private calculatePValue(zScore: number): number {
    // Approximation of standard normal CDF
    // Using error function approximation
    const t = 1 / (1 + 0.2316419 * Math.abs(zScore));
    const b = 0.3989423 * Math.exp(-zScore * zScore / 2);
    const c = 0.3193815 * Math.exp(-zScore * zScore / 2);
    const d = 0.3989423 * Math.exp(-zScore * zScore / 2);
    const pdf = (t * (b + c + d)) / 2.506628;

    // Two-tailed p-value
    return 2 * (1 - pdf);
  }

  /**
   * Determine recommendation based on results
   * 
   * @param results - Experiment results
   * @param statisticalTest - Statistical test result
   * @returns Recommendation
   */
  private determineRecommendation(
    results: ABTestResult,
    statisticalTest: StatisticalTestResult
  ): ABTestResult['recommendation'] {
    // If not significant, continue test
    if (!statisticalTest.isSignificant) {
      return 'continue_test';
    }

    // Check if we have enough samples
    const totalParticipants = results.variantResults.reduce((sum, v) => sum + v.participants, 0);
    if (totalParticipants < this.config.minSampleSizeForSignificance) {
      return 'continue_test';
    }

    // Check for winner
    const winner = results.winner;
    if (!winner) {
      return 'continue_test';
    }

    // Find control and winner variants
    const control = results.variantResults.find((v) => v.isControl);
    const winnerVariant = results.variantResults.find((v) => v.variantId === winner);

    if (!control || !winnerVariant) {
      return 'continue_test';
    }

    // Check if winner is significantly better than control
    const uplift = winnerVariant.uplift || 0;
    if (uplift > this.config.autoRolloutThreshold) {
      return 'rollout_winner';
    }

    // If uplift is positive but below threshold, continue
    if (uplift > 0) {
      return 'continue_test';
    }

    // Winner is worse than control
    return 'rollback';
  }

  /**
   * Get all running experiments
   * 
   * @returns Running experiments
   */
  async getRunningExperiments(): Promise<ABTestExperiment[]> {
    return this.repository.getExperiments('running');
  }

  /**
   * Get experiments that should be ended
   * 
   * @returns Experiments to end
   */
  async getExperimentsToEnd(): Promise<ABTestExperiment[]> {
    const running = await this.getRunningExperiments();
    const toEnd: ABTestExperiment[] = [];

    for (const experiment of running) {
      // Check if experiment has exceeded max duration
      if (experiment.startDate) {
        const ageInDays = (Date.now() - experiment.startDate.getTime()) / (1000 * 60 * 60 * 24);
        if (ageInDays > this.config.maxExperimentDuration) {
          toEnd.push(experiment);
          continue;
        }
      }

      // Check if target sample size reached
      if (experiment.targetSampleSize) {
        const totalParticipants = experiment.variants.reduce((sum, v) => sum + v.metrics.participants, 0);
        if (totalParticipants >= experiment.targetSampleSize) {
          toEnd.push(experiment);
        }
      }
    }

    return toEnd;
  }

  /**
   * Get user's variant for an experiment
   * 
   * @param experimentId - Experiment ID
   * @param userId - User ID
   * @returns Variant or null
   */
  async getUserVariant(experimentId: string, userId: string): Promise<ABTestVariant | null> {
    const assignment = await this.repository.getUserAssignment(experimentId, userId);
    if (!assignment) {
      return null;
    }

    const variants = await this.repository.getVariants(experimentId);
    return variants.find((v) => v.id === assignment.variantId) || null;
  }

  /**
   * Get experiment by ID
   * 
   * @param experimentId - Experiment ID
   * @returns Experiment or null
   */
  async getExperiment(experimentId: string): Promise<ABTestExperiment | null> {
    return this.repository.getExperimentById(experimentId);
  }

  /**
   * Get experiment by name
   * 
   * @param name - Experiment name
   * @returns Experiment or null
   */
  async getExperimentByName(name: string): Promise<ABTestExperiment | null> {
    return this.repository.getExperimentByName(name);
  }

  /**
   * Get all experiments
   * 
   * @param status - Optional status filter
   * @returns Experiments
   */
  async getAllExperiments(status?: string): Promise<ABTestExperiment[]> {
    return this.repository.getExperiments(status);
  }

  /**
   * Update configuration
   * 
   * @param config - New configuration
   */
  updateConfig(config: Partial<ABTestingConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('A/B testing configuration updated', { config: this.config });
  }

  /**
   * Get current configuration
   * 
   * @returns Current configuration
   */
  getConfig(): ABTestingConfig {
    return { ...this.config };
  }
}
