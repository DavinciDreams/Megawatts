/**
 * Self-Learning System - Phase 5 Advanced Capabilities
 * 
 * This module provides advanced self-learning capabilities for the Discord bot,
 * including self-discovery, pattern recognition, behavior adaptation,
 * validation, and knowledge management.
 */

// Core orchestrator
export { MetaLearningEngine } from './meta-learning-engine.js';

// Layer 1: Self-Discovery
export { SelfDiscovery } from './self-discovery.js';

// Layer 1: Pattern Recognition
export { PatternRecognizer } from './pattern-recognizer.js';

// Layer 2: Adaptation
export { BehaviorAdapter } from './behavior-adapter.js';

// Layer 3: Validation
export { LearningValidator } from './learning-validator.js';

// Knowledge Management
export { KnowledgeBase } from './knowledge-base.js';

// Data repository
export {
  LearningRepository,
  PatternRepository,
  BehaviorRepository,
  KnowledgeRepository,
  LearningEventRepository,
  CapabilityProfileRepository
} from './learning-repository.js';

// Data models and types
export {
  // Enums
  PatternType,
  BehaviorType,
  KnowledgeType,
  LearningEventType,
  PrivacyLevel,
  ConfidenceLevel,
  LearningLifecycleState,

  // Entities
  Pattern,
  Behavior,
  Knowledge,
  LearningEvent,
  CapabilityProfile,
  ABTestExperiment,
  ABTestVariant,
  ABTestAssignment,

  // Configuration
  LearningConstraints,

  // Results
  SelfDiscoveryResult,
  PatternRecognitionResult,
  BehaviorAdaptationResult,
  LearningValidationResult,
  LearningCycleMetrics,

  // Query options
  KnowledgeQueryOptions,
  PatternQueryOptions,
  BehaviorQueryOptions,
  LearningEventQueryOptions
} from './learning-models.js';
