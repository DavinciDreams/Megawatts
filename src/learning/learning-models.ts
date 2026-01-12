/**
 * Learning Models
 * 
 * TypeScript interfaces and types for the self-learning system.
 * Defines data structures for patterns, behaviors, knowledge entries,
 * learning events, and capability profiles.
 */

/**
 * Pattern type classification
 */
export enum PatternType {
  USER_BEHAVIOR = 'user_behavior',
  INTERACTION = 'interaction',
  SUCCESS_METRIC = 'success_metric',
  FAILURE_ANALYSIS = 'failure_analysis',
  CONTEXT_MAPPING = 'context_mapping'
}

/**
 * Pattern confidence levels
 */
export enum ConfidenceLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERY_HIGH = 'very_high'
}

/**
 * Pattern entity
 * Represents a discovered pattern in user behavior or system interactions
 */
export interface Pattern {
  id: string;
  type: PatternType;
  name: string;
  description: string;
  confidence: number; // 0-1
  frequency: number;
  last_observed: Date;
  first_observed: Date;
  context: Record<string, any>;
  examples: Array<{
    data: any;
    timestamp: Date;
    outcome: 'success' | 'failure' | 'neutral';
  }>;
  metadata: Record<string, any>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Behavior type classification
 */
export enum BehaviorType {
  STRATEGY = 'strategy',
  PARAMETER = 'parameter',
  RESPONSE = 'response',
  TOOL_USAGE = 'tool_usage'
}

/**
 * Behavior entity
 * Represents an adaptive behavior learned from patterns
 */
export interface Behavior {
  id: string;
  type: BehaviorType;
  name: string;
  description: string;
  config: Record<string, any>;
  effectiveness_score: number; // 0-1
  usage_count: number;
  success_count: number;
  failure_count: number;
  last_used: Date;
  last_modified: Date;
  requires_approval: boolean;
  safety_constraints: string[];
  metadata: Record<string, any>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Knowledge type classification
 */
export enum KnowledgeType {
  PATTERN = 'pattern',
  BEST_PRACTICE = 'best_practice',
  USER_PREFERENCE = 'user_preference',
  OPTIMIZATION = 'optimization',
  SAFETY_RULE = 'safety_rule'
}

/**
 * Knowledge privacy level
 */
export enum PrivacyLevel {
  PUBLIC = 'public',
  GUILD_ONLY = 'guild_only',
  USER_ONLY = 'user_only',
  PRIVATE = 'private'
}

/**
 * Knowledge entity
 * Represents learned knowledge stored in the knowledge base
 */
export interface Knowledge {
  id: string;
  type: KnowledgeType;
  title: string;
  content: string;
  source: string;
  confidence: number; // 0-1
  privacy_level: PrivacyLevel;
  user_id?: string;
  guild_id?: string;
  tags: string[];
  validation_status: 'pending' | 'validated' | 'rejected';
  validated_at?: Date;
  validated_by?: string;
  usage_count: number;
  last_used?: Date;
  expires_at?: Date;
  is_archived: boolean;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Learning event type
 */
export enum LearningEventType {
  PATTERN_DISCOVERED = 'pattern_discovered',
  PATTERN_UPDATED = 'pattern_updated',
  BEHAVIOR_ADAPTED = 'behavior_adapted',
  BEHAVIOR_VALIDATED = 'behavior_validated',
  KNOWLEDGE_CREATED = 'knowledge_created',
  KNOWLEDGE_VALIDATED = 'knowledge_validated',
  KNOWLEDGE_FORGOTTEN = 'knowledge_forgotten',
  CONSTRAINT_VIOLATION = 'constraint_violation',
  SAFETY_CHECK = 'safety_check',
  LEARNING_CYCLE_COMPLETED = 'learning_cycle_completed'
}

/**
 * Learning event entity
 * Represents a learning system event for audit and tracking
 */
export interface LearningEvent {
  id: string;
  event_type: LearningEventType;
  entity_type: 'pattern' | 'behavior' | 'knowledge' | 'capability';
  entity_id: string;
  description: string;
  details: Record<string, any>;
  user_id?: string;
  guild_id?: string;
  success: boolean;
  error_message?: string;
  metadata: Record<string, any>;
  created_at: Date;
}

/**
 * Capability profile entity
 * Represents the system's self-discovered capabilities and limitations
 */
export interface CapabilityProfile {
  id: string;
  name: string;
  description: string;
  capabilities: Array<{
    name: string;
    description: string;
    is_available: boolean;
    performance_score: number;
    limitations: string[];
  }>;
  integration_points: Array<{
    name: string;
    type: string;
    status: 'connected' | 'disconnected' | 'degraded';
    last_checked: Date;
  }>;
  performance_metrics: Record<string, number>;
  last_updated: Date;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

/**
 * A/B test variant
 */
export interface ABTestVariant {
  id: string;
  experiment_id: string;
  name: string;
  description: string;
  config: Record<string, any>;
  allocation_percentage: number;
  is_control: boolean;
  participants: number;
  conversions: number;
  average_rating: number;
  custom_metrics: Record<string, number>;
  created_at: Date;
  updated_at: Date;
}

/**
 * A/B test experiment
 */
export interface ABTestExperiment {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
  hypothesis: string;
  success_criteria: string;
  variants: ABTestVariant[];
  start_date?: Date;
  end_date?: Date;
  target_sample_size?: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * A/B test assignment
 */
export interface ABTestAssignment {
  id: string;
  experiment_id: string;
  variant_id: string;
  user_id: string;
  guild_id?: string;
  assigned_at: Date;
  completed_at?: Date;
  metrics: Record<string, any>;
}

/**
 * Learning constraints configuration
 */
export interface LearningConstraints {
  max_patterns_per_type: number;
  max_behaviors_per_type: number;
  max_knowledge_entries: number;
  min_confidence_threshold: number;
  min_effectiveness_threshold: number;
  require_approval_for: string[];
  forbidden_patterns: string[];
  safety_boundaries: string[];
  privacy_protection_enabled: boolean;
  bias_detection_enabled: boolean;
  explainability_enabled: boolean;
}

/**
 * Learning lifecycle state
 */
export enum LearningLifecycleState {
  IDLE = 'idle',
  DISCOVERING = 'discovering',
  RECOGNIZING = 'recognizing',
  ADAPTING = 'adapting',
  VALIDATING = 'validating',
  LEARNING = 'learning',
  ERROR = 'error'
}

/**
 * Learning cycle metrics
 */
export interface LearningCycleMetrics {
  cycle_id: string;
  start_time: Date;
  end_time?: Date;
  patterns_discovered: number;
  patterns_validated: number;
  behaviors_adapted: number;
  behaviors_validated: number;
  knowledge_created: number;
  knowledge_validated: number;
  knowledge_forgotten: number;
  safety_checks_passed: number;
  safety_checks_failed: number;
  total_duration_ms?: number;
  success: boolean;
  error_message?: string;
}

/**
 * Self-discovery result
 */
export interface SelfDiscoveryResult {
  capabilities: Array<{
    name: string;
    description: string;
    is_available: boolean;
    performance_score: number;
    limitations: string[];
  }>;
  integration_points: Array<{
    name: string;
    type: string;
    status: 'connected' | 'disconnected' | 'degraded';
    last_checked: Date;
  }>;
  performance_profile: Record<string, number>;
  optimization_opportunities: Array<{
    area: string;
    description: string;
    potential_impact: 'low' | 'medium' | 'high';
  }>;
  discovered_at: Date;
}

/**
 * Pattern recognition result
 */
export interface PatternRecognitionResult {
  patterns: Array<{
    id: string;
    type: PatternType;
    name: string;
    description: string;
    confidence: number;
    frequency: number;
    examples: any[];
  }>;
  insights: Array<{
    type: string;
    description: string;
    action: string;
    priority: number;
  }>;
  analyzed_at: Date;
}

/**
 * Behavior adaptation result
 */
export interface BehaviorAdaptationResult {
  adaptations: Array<{
    id: string;
    type: BehaviorType;
    name: string;
    description: string;
    config: Record<string, any>;
    expected_effectiveness: number;
  }>;
  modified_behaviors: string[];
  requires_approval: boolean;
  adapted_at: Date;
}

/**
 * Learning validation result
 */
export interface LearningValidationResult {
  validation_type: 'ab_test' | 'performance' | 'feedback' | 'safety';
  entity_id: string;
  entity_type: 'pattern' | 'behavior' | 'knowledge';
  is_valid: boolean;
  confidence: number;
  metrics: Record<string, number>;
  user_feedback?: {
    positive: number;
    negative: number;
    neutral: number;
    comments: string[];
  };
  safety_checks: Array<{
    check: string;
    passed: boolean;
    details: string;
  }>;
  validated_at: Date;
}

/**
 * Knowledge query options
 */
export interface KnowledgeQueryOptions {
  type?: KnowledgeType;
  privacy_level?: PrivacyLevel;
  user_id?: string;
  guild_id?: string;
  tags?: string[];
  min_confidence?: number;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Pattern query options
 */
export interface PatternQueryOptions {
  type?: PatternType;
  min_confidence?: number;
  min_frequency?: number;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Behavior query options
 */
export interface BehaviorQueryOptions {
  type?: BehaviorType;
  min_effectiveness?: number;
  requires_approval?: boolean;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Learning event query options
 */
export interface LearningEventQueryOptions {
  event_type?: LearningEventType;
  entity_type?: string;
  entity_id?: string;
  user_id?: string;
  guild_id?: string;
  success?: boolean;
  from_date?: Date;
  to_date?: Date;
  limit?: number;
  offset?: number;
}
