-- ============================================================================
-- Learning System Migration for Phase5
-- Advanced Self-Learning Capabilities Tables
-- ============================================================================

-- Enable pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Patterns table
CREATE TABLE IF NOT EXISTS learning_patterns (
  id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'user_behavior',
    'interaction',
    'success_metric',
    'failure_analysis',
    'context_mapping'
  )),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  frequency INTEGER NOT NULL DEFAULT 0,
  last_observed TIMESTAMP WITH TIME ZONE NOT NULL,
  first_observed TIMESTAMP WITH TIME ZONE NOT NULL,
  context JSONB DEFAULT '{}',
  examples JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for patterns
CREATE INDEX IF NOT EXISTS idx_learning_patterns_type ON learning_patterns(type);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_confidence ON learning_patterns(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_frequency ON learning_patterns(frequency DESC);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_last_observed ON learning_patterns(last_observed DESC);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_is_active ON learning_patterns(is_active);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_context ON learning_patterns USING GIN(context);

-- Behaviors table
CREATE TABLE IF NOT EXISTS learning_behaviors (
  id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'strategy',
    'parameter',
    'response',
    'tool_usage'
  )),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  effectiveness_score NUMERIC(3,2) NOT NULL CHECK (effectiveness_score >= 0 AND effectiveness_score <= 1),
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_used TIMESTAMP WITH TIME ZONE NOT NULL,
  last_modified TIMESTAMP WITH TIME ZONE NOT NULL,
  requires_approval BOOLEAN DEFAULT false,
  safety_constraints TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for behaviors
CREATE INDEX IF NOT EXISTS idx_learning_behaviors_type ON learning_behaviors(type);
CREATE INDEX IF NOT EXISTS idx_learning_behaviors_effectiveness ON learning_behaviors(effectiveness_score DESC);
CREATE INDEX IF NOT EXISTS idx_learning_behaviors_usage_count ON learning_behaviors(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_learning_behaviors_last_used ON learning_behaviors(last_used DESC);
CREATE INDEX IF NOT EXISTS idx_learning_behaviors_requires_approval ON learning_behaviors(requires_approval);
CREATE INDEX IF NOT EXISTS idx_learning_behaviors_is_active ON learning_behaviors(is_active);
CREATE INDEX IF NOT EXISTS idx_learning_behaviors_config ON learning_behaviors USING GIN(config);

-- Knowledge table
CREATE TABLE IF NOT EXISTS learning_knowledge (
  id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'pattern',
    'best_practice',
    'user_preference',
    'optimization',
    'safety_rule'
  )),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  source VARCHAR(255) NOT NULL,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  privacy_level VARCHAR(20) NOT NULL CHECK (privacy_level IN (
    'public',
    'guild_only',
    'user_only',
    'private'
  )),
  user_id VARCHAR(20),
  guild_id VARCHAR(20),
  tags TEXT[] DEFAULT '{}',
  validation_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (validation_status IN (
    'pending',
    'validated',
    'rejected'
  )),
  validated_at TIMESTAMP WITH TIME ZONE,
  validated_by VARCHAR(20),
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_archived BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for knowledge
CREATE INDEX IF NOT EXISTS idx_learning_knowledge_type ON learning_knowledge(type);
CREATE INDEX IF NOT EXISTS idx_learning_knowledge_confidence ON learning_knowledge(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_learning_knowledge_privacy_level ON learning_knowledge(privacy_level);
CREATE INDEX IF NOT EXISTS idx_learning_knowledge_user_id ON learning_knowledge(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_knowledge_guild_id ON learning_knowledge(guild_id);
CREATE INDEX IF NOT EXISTS idx_learning_knowledge_validation_status ON learning_knowledge(validation_status);
CREATE INDEX IF NOT EXISTS idx_learning_knowledge_usage_count ON learning_knowledge(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_learning_knowledge_expires_at ON learning_knowledge(expires_at);
CREATE INDEX IF NOT EXISTS idx_learning_knowledge_is_archived ON learning_knowledge(is_archived);
CREATE INDEX IF NOT EXISTS idx_learning_knowledge_tags ON learning_knowledge USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_learning_knowledge_content ON learning_knowledge USING GIN(to_tsvector('content', 'english'));

-- Learning Events table
CREATE TABLE IF NOT EXISTS learning_events (
  id VARCHAR(255) PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'pattern_discovered',
    'pattern_updated',
    'behavior_adapted',
    'behavior_validated',
    'knowledge_created',
    'knowledge_validated',
    'knowledge_forgotten',
    'constraint_violation',
    'safety_check',
    'learning_cycle_completed'
  )),
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN (
    'pattern',
    'behavior',
    'knowledge',
    'capability'
  )),
  entity_id VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  user_id VARCHAR(20),
  guild_id VARCHAR(20),
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for learning events
CREATE INDEX IF NOT EXISTS idx_learning_events_event_type ON learning_events(event_type);
CREATE INDEX IF NOT EXISTS idx_learning_events_entity_type ON learning_events(entity_type);
CREATE INDEX IF NOT EXISTS idx_learning_events_entity_id ON learning_events(entity_id);
CREATE INDEX IF NOT EXISTS idx_learning_events_user_id ON learning_events(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_events_guild_id ON learning_events(guild_id);
CREATE INDEX IF NOT EXISTS idx_learning_events_success ON learning_events(success);
CREATE INDEX IF NOT EXISTS idx_learning_events_created_at ON learning_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_events_details ON learning_events USING GIN(details);

-- Capability Profiles table
CREATE TABLE IF NOT EXISTS capability_profiles (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]',
  integration_points JSONB NOT NULL DEFAULT '[]',
  performance_metrics JSONB NOT NULL DEFAULT '{}',
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for capability profiles
CREATE INDEX IF NOT EXISTS idx_capability_profiles_name ON capability_profiles(name);
CREATE INDEX IF NOT EXISTS idx_capability_profiles_last_updated ON capability_profiles(last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_capability_profiles_capabilities ON capability_profiles USING GIN(capabilities);
CREATE INDEX IF NOT EXISTS idx_capability_profiles_integration_points ON capability_profiles USING GIN(integration_points);

-- A/B Test Experiments table
CREATE TABLE IF NOT EXISTS learning_ab_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'running',
    'paused',
    'completed',
    'cancelled'
  )),
  hypothesis TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  target_sample_size INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for A/B test experiments
CREATE INDEX IF NOT EXISTS idx_learning_ab_experiments_status ON learning_ab_experiments(status);
CREATE INDEX IF NOT EXISTS idx_learning_ab_experiments_dates ON learning_ab_experiments(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_learning_ab_experiments_name ON learning_ab_experiments(name);

-- A/B Test Variants table
CREATE TABLE IF NOT EXISTS learning_ab_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES learning_ab_experiments(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  allocation_percentage INTEGER NOT NULL CHECK (allocation_percentage >= 0 AND allocation_percentage <= 100),
  is_control BOOLEAN DEFAULT false,
  participants INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  average_rating NUMERIC(3,2) DEFAULT 0,
  custom_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(experiment_id, name)
);

-- Indexes for A/B test variants
CREATE INDEX IF NOT EXISTS idx_learning_ab_variants_experiment_id ON learning_ab_variants(experiment_id);
CREATE INDEX IF NOT EXISTS idx_learning_ab_variants_is_control ON learning_ab_variants(is_control);
CREATE INDEX IF NOT EXISTS idx_learning_ab_variants_allocation_percentage ON learning_ab_variants(allocation_percentage);
CREATE INDEX IF NOT EXISTS idx_learning_ab_variants_config ON learning_ab_variants USING GIN(config);

-- A/B Test Assignments table
CREATE TABLE IF NOT EXISTS learning_ab_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES learning_ab_experiments(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES learning_ab_variants(id) ON DELETE CASCADE,
  user_id VARCHAR(20) NOT NULL,
  guild_id VARCHAR(20),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metrics JSONB DEFAULT '{}',
  UNIQUE(experiment_id, user_id)
);

-- Indexes for A/B test assignments
CREATE INDEX IF NOT EXISTS idx_learning_ab_assignments_experiment_id ON learning_ab_assignments(experiment_id);
CREATE INDEX IF NOT EXISTS idx_learning_ab_assignments_variant_id ON learning_ab_assignments(variant_id);
CREATE INDEX IF NOT EXISTS idx_learning_ab_assignments_user_id ON learning_ab_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_ab_assignments_guild_id ON learning_ab_assignments(guild_id);
CREATE INDEX IF NOT EXISTS idx_learning_ab_assignments_assigned_at ON learning_ab_assignments(assigned_at DESC);

-- ============================================================================
-- Migration Metadata
-- ============================================================================

CREATE TABLE IF NOT EXISTS learning_migration_metadata (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  version VARCHAR(20) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track applied migrations
INSERT INTO learning_migration_metadata (name, version) VALUES
  ('003_create_learning_tables', '1.0.0');

-- ============================================================================
-- Grant permissions (if needed)
-- ============================================================================

-- Grant necessary permissions for learning system (adjust as needed for your setup)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO learning_system;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO learning_system;
