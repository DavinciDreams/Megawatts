/**
 * Feedback Prioritizer
 * 
 * Data-driven prioritization system for improvements based on
 * user impact, development effort, and feedback frequency.
 */

import { FeedbackRepository } from './feedback-repository';
import {
  Feedback,
  ImprovementSuggestion,
  FeedbackPriority,
  PriorityCalculationParams,
  FeedbackQueryOptions,
} from './feedback-model';
import { Logger } from '../utils/logger';

// ============================================================================
// PRIORITIZATION CONFIGURATION
// ============================================================================

/**
 * Configuration for feedback prioritizer
 */
export interface FeedbackPrioritizerConfig {
  userImpactWeight: number; // 0-1
  effortWeight: number; // 0-1
  frequencyWeight: number; // 0-1
  recencyWeight: number; // 0-1
  recencyDecayDays: number; // number of days for recency decay
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FeedbackPrioritizerConfig = {
  userImpactWeight: 0.4,
  effortWeight: 0.3,
  frequencyWeight: 0.2,
  recencyWeight: 0.1,
  recencyDecayDays: 30,
};

/**
 * Effort estimates in hours
 */
const EFFORT_ESTIMATES: Record<string, number> = {
  xs: 2, // Extra small
  s: 4, // Small
  m: 16, // Medium
  l: 40, // Large
  xl: 80, // Extra large
};

// ============================================================================
// PRIORITIZATION RESULT TYPES
// ============================================================================

/**
 * Priority score breakdown
 */
export interface PriorityScoreBreakdown {
  userImpactScore: number; // 0-100
  effortScore: number; // 0-100 (lower is better)
  frequencyScore: number; // 0-100
  recencyScore: number; // 0-100
  totalScore: number; // 0-100
  priority: FeedbackPriority;
}

/**
 * Prioritized improvement list
 */
export interface PrioritizedImprovementList {
  suggestions: Array<ImprovementSuggestion & { priorityBreakdown: PriorityScoreBreakdown }>;
  summary: {
    total: number;
    byPriority: Record<FeedbackPriority, number>;
    byEffort: Record<string, number>;
    totalEstimatedHours: number;
  };
  generatedAt: Date;
}

// ============================================================================
// FEEDBACK PRIORITIZER CLASS
// ============================================================================

/**
 * Data-driven feedback prioritizer
 */
export class FeedbackPrioritizer {
  private repository: FeedbackRepository;
  private logger: Logger;
  private config: FeedbackPrioritizerConfig;

  constructor(repository: FeedbackRepository, config?: Partial<FeedbackPrioritizerConfig>) {
    this.repository = repository;
    this.logger = new Logger('FeedbackPrioritizer');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate prioritized improvement suggestions from feedback
   * 
   * @param options - Query options for feedback
   * @returns Prioritized improvement suggestions
   */
  async generatePrioritizedSuggestions(
    options?: FeedbackQueryOptions
  ): Promise<PrioritizedImprovementList> {
    try {
      // Get feedback data
      const feedback = await this.repository.queryFeedback(options || {});

      if (feedback.length === 0) {
        return {
          suggestions: [],
          summary: {
            total: 0,
            byPriority: { low: 0, medium: 0, high: 0, urgent: 0 },
            byEffort: { xs: 0, s: 0, m: 0, l: 0, xl: 0 },
            totalEstimatedHours: 0,
          },
          generatedAt: new Date(),
        };
      }

      // Group feedback into potential improvements
      const groupedFeedback = this.groupFeedback(feedback);

      // Generate suggestions from groups
      const suggestions = await this.generateSuggestions(groupedFeedback);

      // Calculate priority scores
      const prioritizedSuggestions = suggestions.map((suggestion) => ({
        ...suggestion,
        priorityBreakdown: this.calculatePriorityScore(suggestion),
      }));

      // Sort by priority score
      prioritizedSuggestions.sort((a, b) => b.priorityBreakdown.totalScore - a.priorityBreakdown.totalScore);

      // Assign priorities based on scores
      for (const suggestion of prioritizedSuggestions) {
        suggestion.priority = this.scoreToPriority(suggestion.priorityBreakdown.totalScore);
      }

      // Generate summary
      const summary = this.generateSummary(prioritizedSuggestions);

      this.logger.info(`Generated ${prioritizedSuggestions.length} prioritized suggestions`);

      return {
        suggestions: prioritizedSuggestions,
        summary,
        generatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to generate prioritized suggestions:', error as Error);
      throw error;
    }
  }

  /**
   * Calculate priority score for a suggestion
   * 
   * @param suggestion - Improvement suggestion
   * @returns Priority score breakdown
   */
  calculatePriorityScore(suggestion: ImprovementSuggestion): PriorityScoreBreakdown {
    // User impact score (0-100)
    const userImpactScore = suggestion.userImpactScore;

    // Effort score (0-100, lower is better)
    const effortHours = EFFORT_ESTIMATES[suggestion.estimatedEffort] || 16;
    const effortScore = this.normalizeEffortScore(effortHours);

    // Frequency score (0-100)
    const frequencyScore = this.normalizeFrequencyScore(suggestion.feedbackCount);

    // Recency score (0-100)
    const recencyScore = this.calculateRecencyScore(suggestion.createdAt);

    // Calculate weighted total
    const totalScore =
      userImpactScore * this.config.userImpactWeight +
      (100 - effortScore) * this.config.effortWeight +
      frequencyScore * this.config.frequencyWeight +
      recencyScore * this.config.recencyWeight;

    return {
      userImpactScore,
      effortScore,
      frequencyScore,
      recencyScore,
      totalScore,
      priority: this.scoreToPriority(totalScore),
    };
  }

  /**
   * Prioritize existing suggestions
   * 
   * @param limit - Maximum number of suggestions to return
   * @returns Prioritized suggestions
   */
  async reprioritizeSuggestions(limit: number = 50): Promise<PrioritizedImprovementList> {
    try {
      // Generate new suggestions from feedback
      // Note: This regenerates suggestions rather than reprioritizing existing ones
      // because suggestions are generated on-demand from feedback data
      const feedback = await this.repository.queryFeedback({});

      if (feedback.length === 0) {
        return {
          suggestions: [],
          summary: {
            total: 0,
            byPriority: { low: 0, medium: 0, high: 0, urgent: 0 },
            byEffort: { xs: 0, s: 0, m: 0, l: 0, xl: 0 },
            totalEstimatedHours: 0,
          },
          generatedAt: new Date(),
        };
      }

      // Group feedback into potential improvements
      const groupedFeedback = this.groupFeedback(feedback);

      // Generate suggestions from groups
      const suggestions = await this.generateSuggestions(groupedFeedback);

      // Calculate priority scores
      const prioritized = suggestions.map((suggestion) => ({
        ...suggestion,
        priorityBreakdown: this.calculatePriorityScore(suggestion),
      }));

      // Sort by priority score
      prioritized.sort((a, b) => b.priorityBreakdown.totalScore - a.priorityBreakdown.totalScore);

      // Assign priorities based on scores
      for (const suggestion of prioritized) {
        suggestion.priority = this.scoreToPriority(suggestion.priorityBreakdown.totalScore);
      }

      // Return top N
      const topSuggestions = prioritized.slice(0, limit);
      const summary = this.generateSummary(topSuggestions);

      return {
        suggestions: topSuggestions,
        summary,
        generatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to reprioritize suggestions:', error as Error);
      throw error;
    }
  }

  /**
   * Update priority calculation parameters
   * 
   * @param params - New priority calculation parameters
   */
  updatePriorityParams(params: Partial<PriorityCalculationParams>): void {
    if (params.userImpactWeight !== undefined) {
      this.config.userImpactWeight = params.userImpactWeight;
    }
    if (params.effortWeight !== undefined) {
      this.config.effortWeight = params.effortWeight;
    }
    if (params.frequencyWeight !== undefined) {
      this.config.frequencyWeight = params.frequencyWeight;
    }
    if (params.recencyWeight !== undefined) {
      this.config.recencyWeight = params.recencyWeight;
    }

    this.logger.info('Priority calculation parameters updated', { config: this.config });
  }

  /**
   * Get current priority calculation parameters
   * 
   * @returns Current parameters
   */
  getPriorityParams(): PriorityCalculationParams {
    return {
      userImpactWeight: this.config.userImpactWeight,
      effortWeight: this.config.effortWeight,
      frequencyWeight: this.config.frequencyWeight,
      recencyWeight: this.config.recencyWeight,
    };
  }

  /**
   * Group feedback by category/keywords
   * 
   * @param feedback - Feedback data
   * @returns Grouped feedback
   */
  private groupFeedback(feedback: Feedback[]): Record<string, Feedback[]> {
    const grouped: Record<string, Feedback[]> = {};

    for (const f of feedback) {
      // Determine category
      let category = f.aiAnalysis?.category || f.type;

      // Use tags as additional grouping
      if (f.tags && f.tags.length > 0) {
        category = `${category}:${f.tags[0]}`;
      }

      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(f);
    }

    return grouped;
  }

  /**
   * Generate suggestions from grouped feedback
   * 
   * @param groupedFeedback - Grouped feedback data
   * @returns Improvement suggestions
   */
  private async generateSuggestions(
    groupedFeedback: Record<string, Feedback[]>
  ): Promise<ImprovementSuggestion[]> {
    const suggestions: ImprovementSuggestion[] = [];

    for (const [category, items] of Object.entries(groupedFeedback)) {
      if (items.length < 2) continue;

      // Calculate metrics for this group
      const feedbackCount = items.length;
      const avgRating = this.calculateAverageRating(items);
      const negativeCount = items.filter((f) => f.aiAnalysis?.sentiment === 'negative').length;
      const userImpactScore = this.calculateUserImpactScore(items);

      // Determine estimated effort
      const estimatedEffort = this.estimateEffortFromCategory(category);

      // Generate title and description
      const { title, description } = this.generateSuggestionText(category, items);

      // Calculate priority score
      const suggestion: ImprovementSuggestion = {
        id: `suggestion-${category}-${Date.now()}`,
        title,
        description,
        category,
        priorityScore: 0, // Will be calculated
        userImpactScore,
        effortScore: 0, // Will be calculated
        feedbackCount,
        relatedFeedbackIds: items.map((f) => f.id),
        estimatedEffort,
        status: 'suggested',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      suggestions.push(suggestion);
    }

    return suggestions;
  }

  /**
   * Calculate user impact score
   * 
   * @param feedback - Feedback items
   * @returns User impact score (0-100)
   */
  private calculateUserImpactScore(feedback: Feedback[]): number {
    let score = 0;

    // Factor 1: Number of unique users affected
    const uniqueUsers = new Set(feedback.map((f) => f.userId)).size;
    const userScore = Math.min(100, uniqueUsers * 10); // Max 100 at 10 users

    // Factor 2: Average rating (if available)
    const avgRating = this.calculateAverageRating(feedback);
    const ratingScore = avgRating > 0 ? avgRating * 20 : 50; // 1-5 -> 20-100, default 50

    // Factor 3: Sentiment distribution
    const negativeRatio = feedback.filter((f) => f.aiAnalysis?.sentiment === 'negative').length / feedback.length;
    const sentimentScore = (1 - negativeRatio) * 100;

    // Factor 4: Type weight
    const typeWeight = this.getTypeWeight(feedback[0].type);

    // Combine factors
    score = (userScore * 0.3 + ratingScore * 0.3 + sentimentScore * 0.4) * typeWeight;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Normalize effort score
   * 
   * @param hours - Estimated hours
   * @returns Effort score (0-100, lower is better)
   */
  private normalizeEffortScore(hours: number): number {
    // Logarithmic scale: more effort = higher score
    // 2 hours -> 0, 4 hours -> 20, 16 hours -> 60, 40 hours -> 80, 80 hours -> 100
    const normalized = Math.log10(hours + 1) * 50;
    return Math.min(100, Math.max(0, normalized));
  }

  /**
   * Normalize frequency score
   * 
   * @param count - Number of feedback items
   * @returns Frequency score (0-100)
   */
  private normalizeFrequencyScore(count: number): number {
    // Logarithmic scale: more feedback = higher score
    // 2 -> 30, 5 -> 50, 10 -> 70, 20 -> 85, 50+ -> 100
    const normalized = Math.log10(count) * 35;
    return Math.min(100, Math.max(0, normalized));
  }

  /**
   * Calculate recency score
   * 
   * @param createdAt - Creation date
   * @returns Recency score (0-100)
   */
  private calculateRecencyScore(createdAt: Date): number {
    const now = new Date();
    const ageInDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    // Decay over time: newer = higher score
    const decay = Math.exp(-ageInDays / this.config.recencyDecayDays);
    return decay * 100;
  }

  /**
   * Estimate effort from category
   * 
   * @param category - Category name
   * @returns Effort estimate
   */
  private estimateEffortFromCategory(category: string): 'xs' | 's' | 'm' | 'l' | 'xl' {
    const lowerCategory = category.toLowerCase();

    // Simple heuristic based on category keywords
    if (lowerCategory.includes('bug') || lowerCategory.includes('error')) {
      return 's'; // Bugs are usually quick fixes
    }
    if (lowerCategory.includes('ui') || lowerCategory.includes('design')) {
      return 'm'; // UI changes take medium effort
    }
    if (lowerCategory.includes('performance') || lowerCategory.includes('optimization')) {
      return 'l'; // Performance work is complex
    }
    if (lowerCategory.includes('feature') || lowerCategory.includes('new')) {
      return 'xl'; // New features are most effort
    }

    return 'm'; // Default to medium
  }

  /**
   * Get type weight for priority calculation
   * 
   * @param type - Feedback type
   * @returns Weight multiplier (0-1)
   */
  private getTypeWeight(type: string): number {
    const weights: Record<string, number> = {
      bug_report: 1.2, // Bugs get higher priority
      rating: 0.9, // Ratings are slightly lower priority
      feature_request: 1.0,
      general: 1.0,
    };

    return weights[type] || 1.0;
  }

  /**
   * Calculate average rating
   * 
   * @param feedback - Feedback items
   * @returns Average rating
   */
  private calculateAverageRating(feedback: Feedback[]): number {
    const ratings = feedback.filter((f) => f.rating !== undefined).map((f) => f.rating!);
    if (ratings.length === 0) return 0;
    return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  }

  /**
   * Generate suggestion text
   * 
   * @param category - Category name
   * @param items - Feedback items
   * @returns Title and description
   */
  private generateSuggestionText(
    category: string,
    items: Feedback[]
  ): { title: string; description: string } {
    const [type, subcategory] = category.split(':');
    const itemCount = items.length;

    let title = '';
    let description = '';

    switch (type) {
      case 'bug_report':
        title = `Fix: ${subcategory || 'Multiple Issues'} (${itemCount} reports)`;
        description = `Address ${itemCount} reported ${subcategory || 'issues'}. Priority based on severity and user impact.`;
        break;

      case 'feature_request':
        title = `Implement: ${subcategory || 'Feature Request'} (${itemCount} requests)`;
        description = `Implement requested ${subcategory || 'feature'}. ${itemCount} users have requested this functionality.`;
        break;

      case 'rating':
        title = `Improve: ${subcategory || 'User Experience'} (${itemCount} ratings)`;
        const avgRating = this.calculateAverageRating(items);
        description = `Improve user experience. Current average rating: ${avgRating.toFixed(1)}/5 based on ${itemCount} ratings.`;
        break;

      default:
        title = `Address: ${category} (${itemCount} feedback items)`;
        description = `Review and address ${itemCount} feedback items in the ${category} category.`;
    }

    return { title, description };
  }

  /**
   * Convert score to priority level
   * 
   * @param score - Priority score (0-100)
   * @returns Priority level
   */
  private scoreToPriority(score: number): FeedbackPriority {
    if (score >= 80) return 'urgent';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  /**
   * Generate summary for prioritized list
   * 
   * @param suggestions - Prioritized suggestions
   * @returns Summary statistics
   */
  private generateSummary(
    suggestions: Array<ImprovementSuggestion & { priorityBreakdown: PriorityScoreBreakdown }>
  ): PrioritizedImprovementList['summary'] {
    const byPriority: Record<FeedbackPriority, number> = {
      low: 0,
      medium: 0,
      high: 0,
      urgent: 0,
    };

    const byEffort: Record<string, number> = {
      xs: 0,
      s: 0,
      m: 0,
      l: 0,
      xl: 0,
    };

    let totalEstimatedHours = 0;

    for (const suggestion of suggestions) {
      byPriority[suggestion.priority]++;
      byEffort[suggestion.estimatedEffort]++;
      totalEstimatedHours += EFFORT_ESTIMATES[suggestion.estimatedEffort] || 16;
    }

    return {
      total: suggestions.length,
      byPriority,
      byEffort,
      totalEstimatedHours,
    };
  }

  /**
   * Update prioritizer configuration
   * 
   * @param config - New configuration
   */
  updateConfig(config: Partial<FeedbackPrioritizerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Feedback prioritizer configuration updated', { config: this.config });
  }

  /**
   * Get current configuration
   * 
   * @returns Current configuration
   */
  getConfig(): FeedbackPrioritizerConfig {
    return { ...this.config };
  }
}
