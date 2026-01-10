/**
 * Feedback Model
 * 
 * Database model and TypeScript interfaces for user feedback collection.
 * Defines the structure for storing feedback, A/B test experiments, and variants.
 */

// ============================================================================
// FEEDBACK TYPES
// ============================================================================

/**
 * Type of feedback submitted by users
 */
export type FeedbackType = 'rating' | 'feature_request' | 'bug_report' | 'general';

/**
 * Status of feedback in the processing pipeline
 */
export type FeedbackStatus = 'new' | 'reviewed' | 'in_progress' | 'resolved' | 'dismissed';

/**
 * Priority level for feedback items
 */
export type FeedbackPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Main feedback entity
 */
export interface Feedback {
  id: string;
  userId: string;
  serverId?: string;
  channelId?: string;
  type: FeedbackType;
  content: string;
  rating?: number; // 1-5 stars for rating type
  status: FeedbackStatus;
  priority: FeedbackPriority;
  metadata: FeedbackMetadata;
  tags: string[];
  aiAnalysis?: FeedbackAIAnalysis;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Metadata associated with feedback
 */
export interface FeedbackMetadata {
  messageId?: string;
  command?: string;
  interactionType?: 'command' | 'message' | 'reaction' | 'dm';
  userAgent?: string;
  platform?: string;
  version?: string;
  additionalContext?: Record<string, any>;
}

/**
 * AI analysis results for feedback
 */
export interface FeedbackAIAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number; // -1 to 1
  category?: string;
  keywords: string[];
  summary?: string;
  suggestedPriority?: FeedbackPriority;
  analyzedAt: Date;
}

/**
 * Feedback collection request
 */
export interface FeedbackCollectionRequest {
  userId: string;
  serverId?: string;
  channelId?: string;
  type: FeedbackType;
  content: string;
  rating?: number;
  metadata?: Partial<FeedbackMetadata>;
}

/**
 * Feedback query options
 */
export interface FeedbackQueryOptions {
  userId?: string;
  serverId?: string;
  type?: FeedbackType;
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  tags?: string[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Feedback aggregation result
 */
export interface FeedbackAggregation {
  total: number;
  byType: Record<FeedbackType, number>;
  byStatus: Record<FeedbackStatus, number>;
  byPriority: Record<FeedbackPriority, number>;
  averageRating: number;
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
}

// ============================================================================
// A/B TESTING TYPES
// ============================================================================

/**
 * Status of an A/B test experiment
 */
export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';

/**
 * A/B test experiment entity
 */
export interface ABTestExperiment {
  id: string;
  name: string;
  description: string;
  status: ExperimentStatus;
  hypothesis: string;
  successCriteria: string;
  startDate?: Date;
  endDate?: Date;
  targetSampleSize?: number;
  variants: ABTestVariant[];
  metrics: ABTestMetric[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A/B test variant
 */
export interface ABTestVariant {
  id: string;
  experimentId: string;
  name: string;
  description: string;
  config: Record<string, any>;
  allocationPercentage: number; // 0-100
  isControl: boolean;
  metrics: VariantMetrics;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Metrics for a variant
 */
export interface VariantMetrics {
  participants: number;
  conversions: number;
  conversionRate: number;
  averageRating?: number;
  customMetrics: Record<string, number>;
  lastUpdated: Date;
}

/**
 * A/B test metric definition
 */
export interface ABTestMetric {
  id: string;
  experimentId: string;
  name: string;
  type: 'conversion' | 'rating' | 'custom';
  description: string;
  aggregationMethod: 'sum' | 'average' | 'count';
  primary: boolean;
  createdAt: Date;
}

/**
 * A/B test assignment for a user
 */
export interface ABTestAssignment {
  id: string;
  experimentId: string;
  variantId: string;
  userId: string;
  serverId?: string;
  assignedAt: Date;
  completedAt?: Date;
}

/**
 * A/B test result analysis
 */
export interface ABTestResult {
  experimentId: string;
  experimentName: string;
  winner?: string;
  significance: number; // p-value
  confidence: number; // confidence interval
  variantResults: VariantResult[];
  recommendation: 'rollout_winner' | 'continue_test' | 'inconclusive' | 'rollback';
  analyzedAt: Date;
}

/**
 * Result for a single variant
 */
export interface VariantResult {
  variantId: string;
  variantName: string;
  name: string;
  isControl: boolean;
  participants: number;
  conversions: number;
  conversionRate: number;
  conversionRateCI: [number, number]; // confidence interval
  uplift?: number; // percentage improvement over control
  upliftCI?: [number, number];
  averageRating?: number;
  customMetrics: Record<string, number>;
}

/**
 * A/B test configuration
 */
export interface ABTestConfig {
  name: string;
  description: string;
  hypothesis: string;
  successCriteria: string;
  variants: Omit<ABTestVariant, 'id' | 'experimentId' | 'createdAt' | 'updatedAt' | 'metrics'>[];
  metrics: Omit<ABTestMetric, 'id' | 'experimentId' | 'createdAt'>[];
  targetSampleSize?: number;
  duration?: number; // in days
}

// ============================================================================
// PRIORITIZATION TYPES
// ============================================================================

/**
 * Improvement suggestion based on feedback analysis
 */
export interface ImprovementSuggestion {
  id: string;
  title: string;
  description: string;
  category: string;
  priorityScore: number;
  userImpactScore: number;
  effortScore: number;
  feedbackCount: number;
  relatedFeedbackIds: string[];
  estimatedEffort: 'xs' | 's' | 'm' | 'l' | 'xl';
  status: 'suggested' | 'planned' | 'in_progress' | 'completed';
  priority?: FeedbackPriority;
  priorityBreakdown?: {
    userImpactScore: number;
    effortScore: number;
    frequencyScore: number;
    recencyScore: number;
    totalScore: number;
    priority: FeedbackPriority;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Priority calculation parameters
 */
export interface PriorityCalculationParams {
  userImpactWeight: number; // 0-1
  effortWeight: number; // 0-1
  frequencyWeight: number; // 0-1
  recencyWeight: number; // 0-1
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

/**
 * Insight generated from feedback analysis
 */
export interface FeedbackInsight {
  id: string;
  type: 'trend' | 'pain_point' | 'opportunity' | 'pattern';
  title: string;
  description: string;
  evidence: string[];
  confidence: number; // 0-1
  affectedUsers: number;
  relatedFeedbackIds: string[];
  recommendations: string[];
  createdAt: Date;
}

// ============================================================================
// DATABASE SCHEMA DEFINITIONS
// ============================================================================

/**
 * SQL schema for feedback table
 */
export const FEEDBACK_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(20) NOT NULL,
    server_id VARCHAR(20),
    channel_id VARCHAR(20),
    type VARCHAR(20) NOT NULL CHECK (type IN ('rating', 'feature_request', 'bug_report', 'general')),
    content TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'in_progress', 'resolved', 'dismissed')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    ai_analysis JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_server_id ON feedback(server_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
  CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
  CREATE INDEX IF NOT EXISTS idx_feedback_priority ON feedback(priority);
  CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feedback_tags ON feedback USING GIN(tags);
`;

/**
 * SQL schema for A/B test experiments table
 */
export const AB_TEST_EXPERIMENTS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS ab_test_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled')),
    hypothesis TEXT NOT NULL,
    success_criteria TEXT NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    target_sample_size INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_ab_experiments_status ON ab_test_experiments(status);
  CREATE INDEX IF NOT EXISTS idx_ab_experiments_dates ON ab_test_experiments(start_date, end_date);
`;

/**
 * SQL schema for A/B test variants table
 */
export const AB_TEST_VARIANTS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS ab_test_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES ab_test_experiments(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    config JSONB NOT NULL,
    allocation_percentage INTEGER NOT NULL CHECK (allocation_percentage >= 0 AND allocation_percentage <= 100),
    is_control BOOLEAN DEFAULT FALSE,
    participants INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    average_rating NUMERIC(3, 2),
    custom_metrics JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(experiment_id, name)
  );

  CREATE INDEX IF NOT EXISTS idx_ab_variants_experiment_id ON ab_test_variants(experiment_id);
  CREATE INDEX IF NOT EXISTS idx_ab_variants_is_control ON ab_test_variants(is_control);
`;

/**
 * SQL schema for A/B test assignments table
 */
export const AB_TEST_ASSIGNMENTS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS ab_test_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES ab_test_experiments(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    server_id VARCHAR(20),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(experiment_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_ab_assignments_experiment_id ON ab_test_assignments(experiment_id);
  CREATE INDEX IF NOT EXISTS idx_ab_assignments_user_id ON ab_test_assignments(user_id);
  CREATE INDEX IF NOT EXISTS idx_ab_assignments_variant_id ON ab_test_assignments(variant_id);
`;

/**
 * SQL schema for improvement suggestions table
 */
export const IMPROVEMENT_SUGGESTIONS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS improvement_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    priority_score NUMERIC(5, 2) NOT NULL,
    user_impact_score NUMERIC(3, 2) NOT NULL,
    effort_score NUMERIC(3, 2) NOT NULL,
    feedback_count INTEGER DEFAULT 0,
    related_feedback_ids UUID[] DEFAULT '{}',
    estimated_effort VARCHAR(10) CHECK (estimated_effort IN ('xs', 's', 'm', 'l', 'xl')),
    status VARCHAR(20) DEFAULT 'suggested' CHECK (status IN ('suggested', 'planned', 'in_progress', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_improvements_priority_score ON improvement_suggestions(priority_score DESC);
  CREATE INDEX IF NOT EXISTS idx_improvements_status ON improvement_suggestions(status);
  CREATE INDEX IF NOT EXISTS idx_improvements_category ON improvement_suggestions(category);
`;

/**
 * SQL schema for feedback insights table
 */
export const FEEDBACK_INSIGHTS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS feedback_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('trend', 'pain_point', 'opportunity', 'pattern')),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    evidence TEXT[] DEFAULT '{}',
    confidence NUMERIC(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    affected_users INTEGER DEFAULT 0,
    related_feedback_ids UUID[] DEFAULT '{}',
    recommendations TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_insights_type ON feedback_insights(type);
  CREATE INDEX IF NOT EXISTS idx_insights_confidence ON feedback_insights(confidence DESC);
  CREATE INDEX IF NOT EXISTS idx_insights_created_at ON feedback_insights(created_at DESC);
`;
