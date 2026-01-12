/**
 * Feedback Module
 * 
 * User Feedback Collection System for Phase 5.
 * Provides comprehensive feedback collection, AI-powered analysis,
 * data-driven prioritization, and A/B testing infrastructure.
 */

import {
  FeedbackType,
  FeedbackStatus,
  FeedbackPriority,
  Feedback,
  FeedbackMetadata,
  FeedbackAIAnalysis,
  FeedbackCollectionRequest,
  FeedbackQueryOptions,
  FeedbackAggregation,
  ExperimentStatus,
  ABTestExperiment,
  ABTestVariant,
  VariantMetrics,
  ABTestMetric,
  ABTestAssignment,
  ABTestResult,
  VariantResult,
  ABTestConfig,
  ImprovementSuggestion,
  PriorityCalculationParams,
  FeedbackInsight,
  FEEDBACK_TABLE_SCHEMA,
  AB_TEST_EXPERIMENTS_TABLE_SCHEMA,
  AB_TEST_VARIANTS_TABLE_SCHEMA,
  AB_TEST_ASSIGNMENTS_TABLE_SCHEMA,
  IMPROVEMENT_SUGGESTIONS_TABLE_SCHEMA,
  FEEDBACK_INSIGHTS_TABLE_SCHEMA,
} from './feedback-model';

import {
  FeedbackRepository,
  ABTestRepository,
} from './feedback-repository';

import {
  FeedbackCollector,
  FeedbackCollectorConfig,
  FeedbackCollectionInterface,
} from './feedback-collector';

import {
  FeedbackAnalyzer,
  FeedbackAnalyzerConfig,
  TrendAnalysis,
  PainPointAnalysis,
  OpportunityAnalysis,
  ComprehensiveAnalysis,
} from './feedback-analyzer';

import {
  FeedbackPrioritizer,
  FeedbackPrioritizerConfig,
  PriorityScoreBreakdown,
  PrioritizedImprovementList,
} from './feedback-prioritizer';

import {
  ABTestingFramework,
  ABTestingConfig,
  StatisticalTestResult,
} from './ab-testing';

// ============================================================================
// MODULE INFORMATION
// ============================================================================

/**
 * Feedback module information
 */
export const FEEDBACK_MODULE_INFO = {
  name: 'User Feedback Collection System',
  version: '1.0.0',
  description: 'Comprehensive feedback collection, AI-powered analysis, data-driven prioritization, and A/B testing infrastructure for Phase 5.',
  features: [
    'Feedback collection (ratings, feature requests, bug reports)',
    'AI-powered sentiment analysis and categorization',
    'Data-driven improvement prioritization',
    'A/B testing framework with statistical analysis',
    'Automated experiment management',
    'Conversion tracking and significance testing',
    'Rollout control for winning variants',
  ],
  components: [
    'FeedbackCollector',
    'FeedbackAnalyzer',
    'FeedbackPrioritizer',
    'ABTestingFramework',
    'FeedbackRepository',
    'ABTestRepository',
  ],
} as const;

/**
 * Initialize feedback system
 *
 * @param feedbackRepository - Feedback repository instance
 * @param abTestRepository - A/B test repository instance
 * @param aiProvider - AI provider for analysis
 * @param configs - Optional configuration objects
 * @returns Initialized feedback system components
 */
export function initializeFeedbackSystem(
  feedbackRepository: FeedbackRepository,
  abTestRepository: ABTestRepository,
  aiProvider: any,
  configs?: {
    collector?: Partial<FeedbackCollectorConfig>;
    analyzer?: Partial<FeedbackAnalyzerConfig>;
    prioritizer?: Partial<FeedbackPrioritizerConfig>;
    abTesting?: Partial<ABTestingConfig>;
  }
) {
  const collector = new FeedbackCollector(feedbackRepository, configs?.collector);
  const analyzer = new FeedbackAnalyzer(feedbackRepository, aiProvider, configs?.analyzer);
  const prioritizer = new FeedbackPrioritizer(feedbackRepository, configs?.prioritizer);
  const abTesting = new ABTestingFramework(abTestRepository, configs?.abTesting);

  return {
    collector,
    analyzer,
    prioritizer,
    abTesting,
  };
}
