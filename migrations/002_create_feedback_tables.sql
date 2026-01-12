-- ============================================================================
-- Feedback System Migration for Phase 5
-- User Feedback Collection System Tables
-- ============================================================================

-- Enable pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Feedback table
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

-- Indexes for feedback
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_server_id ON feedback(server_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_priority ON feedback(priority);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_tags ON feedback USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_feedback_ai_analysis_sentiment ON feedback((ai_analysis->>'sentiment'));

-- A/B Test Experiments table
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

-- Indexes for A/B test experiments
CREATE INDEX IF NOT EXISTS idx_ab_experiments_status ON ab_test_experiments(status);
CREATE INDEX IF NOT EXISTS idx_ab_experiments_dates ON ab_test_experiments(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_ab_experiments_name ON ab_test_experiments(name);

-- A/B Test Variants table
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
  average_rating NUMERIC(3,2),
  custom_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(experiment_id, name)
);

-- Indexes for A/B test variants
CREATE INDEX IF NOT EXISTS idx_ab_variants_experiment_id ON ab_test_variants(experiment_id);
CREATE INDEX IF NOT EXISTS idx_ab_variants_is_control ON ab_test_variants(is_control);
CREATE INDEX IF NOT EXISTS idx_ab_variants_allocation_percentage ON ab_test_variants(allocation_percentage);

-- A/B Test Assignments table
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

-- Indexes for A/B test assignments
CREATE INDEX IF NOT EXISTS idx_ab_assignments_experiment_id ON ab_test_assignments(experiment_id);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_user_id ON ab_test_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_variant_id ON ab_test_assignments(variant_id);

-- Improvement Suggestions table
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

-- Indexes for improvement suggestions
CREATE INDEX IF NOT EXISTS idx_improvements_priority_score ON improvement_suggestions(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_improvements_status ON improvement_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_improvements_category ON improvement_suggestions(category);

-- Feedback Insights table
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

-- Indexes for feedback insights
CREATE INDEX IF NOT EXISTS idx_insights_type ON feedback_insights(type);
CREATE INDEX IF NOT EXISTS idx_insights_confidence ON feedback_insights(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_insights_created_at ON feedback_insights(created_at DESC);

-- ============================================================================
-- Migration Metadata
-- ============================================================================

CREATE TABLE IF NOT EXISTS migration_metadata (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  version VARCHAR(20) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track applied migrations
INSERT INTO migration_metadata (name, version) VALUES
  ('002_create_feedback_tables', '1.0.0'),
  ('002_create_feedback_tables', '1.0.0');

-- ============================================================================
-- Grant permissions (if needed)
-- ============================================================================

-- Grant necessary permissions for feedback system (adjust as needed for your setup)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO feedback_analyzer;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO feedback_reader;
