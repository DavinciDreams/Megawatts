-- Migration: Create Batch 3 Tables
-- Description: Tables for user preferences, performance metrics, modifications, and reports
-- Version: 009

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USER PREFERENCES TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255) NOT NULL,
  guild_id VARCHAR(255),
  preference_key VARCHAR(100) NOT NULL,
  preference_value JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, preference_key)
);

-- Create index for faster lookups
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX idx_user_preferences_guild_id ON user_preferences(guild_id);
CREATE INDEX idx_user_preferences_key ON user_preferences(preference_key);

-- ============================================
-- PERFORMANCE METRICS TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  modification_id UUID NOT NULL,
  execution_time DECIMAL(10, 2) NOT NULL,
  memory_usage DECIMAL(10, 2) NOT NULL,
  cpu_usage DECIMAL(5, 2) NOT NULL,
  throughput DECIMAL(10, 2),
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB
);

CREATE INDEX idx_performance_metrics_modification_id ON performance_metrics(modification_id);
CREATE INDEX idx_performance_metrics_recorded_at ON performance_metrics(recorded_at);

-- Performance history table
CREATE TABLE IF NOT EXISTS performance_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  modification_id UUID NOT NULL,
  optimization VARCHAR(255) NOT NULL,
  impact VARCHAR(20) NOT NULL CHECK (impact IN ('positive', 'negative', 'neutral')),
  before_metrics JSONB NOT NULL,
  after_metrics JSONB NOT NULL,
  improvement DECIMAL(5, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_performance_history_modification_id ON performance_history(modification_id);
CREATE INDEX idx_performance_history_created_at ON performance_history(created_at);

-- ============================================
-- MODIFICATION TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS modifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255) NOT NULL,
  code_snippet TEXT NOT NULL,
  intent VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB
);

CREATE INDEX idx_modifications_user_id ON modifications(user_id);
CREATE INDEX idx_modifications_status ON modifications(status);
CREATE INDEX idx_modifications_created_at ON modifications(created_at);

-- User feedback table
CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255) NOT NULL,
  modification_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_feedback_modification 
    FOREIGN KEY (modification_id) REFERENCES modifications(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_feedback_user_id ON user_feedback(user_id);
CREATE INDEX idx_user_feedback_modification_id ON user_feedback(modification_id);
CREATE INDEX idx_user_feedback_rating ON user_feedback(rating);

-- Feedback analysis table
CREATE TABLE IF NOT EXISTS feedback_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feedback_id UUID NOT NULL,
  sentiment VARCHAR(50) NOT NULL,
  sentiment_score DECIMAL(3, 2),
  key_points JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_feedback_analysis_feedback 
    FOREIGN KEY (feedback_id) REFERENCES user_feedback(id) ON DELETE CASCADE
);

CREATE INDEX idx_feedback_analysis_feedback_id ON feedback_analysis(feedback_id);

-- ============================================
-- REPORTS TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS performance_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary JSONB NOT NULL,
  bottlenecks JSONB NOT NULL,
  optimizations JSONB NOT NULL,
  overall_score DECIMAL(5, 2) NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  generated_by VARCHAR(255),
  metadata JSONB
);

CREATE INDEX idx_performance_reports_type ON performance_reports(report_type);
CREATE INDEX idx_performance_reports_generated_at ON performance_reports(generated_at);

-- Security reports table
CREATE TABLE IF NOT EXISTS security_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code_path VARCHAR(500) NOT NULL,
  vulnerabilities JSONB NOT NULL,
  risk_score DECIMAL(3, 2) NOT NULL,
  compliance_score DECIMAL(5, 2) NOT NULL,
  sensitive_data JSONB NOT NULL,
  recommendations JSONB NOT NULL,
  compliance_status JSONB NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB
);

CREATE INDEX idx_security_reports_code_path ON security_reports(code_path);
CREATE INDEX idx_security_reports_generated_at ON security_reports(generated_at);

-- ============================================
-- CONTEXT EXTRACTION TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS guild_context (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guild_id VARCHAR(255) NOT NULL UNIQUE,
  member_count INTEGER,
  user_roles JSONB,
  channel_type VARCHAR(50),
  active_moderators JSONB,
  guild_rules JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_guild_context_guild_id ON guild_context(guild_id);

-- ============================================
-- AI RESPONSE CACHE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS ai_response_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy VARCHAR(50) NOT NULL,
  context_hash VARCHAR(64) NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  hit_count INTEGER DEFAULT 0
);

CREATE INDEX idx_ai_response_cache_strategy ON ai_response_cache(strategy);
CREATE INDEX idx_ai_response_cache_hash ON ai_response_cache(context_hash);
CREATE INDEX idx_ai_response_cache_expires_at ON ai_response_cache(expires_at);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for tables with updated_at
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_modifications_updated_at
  BEFORE UPDATE ON modifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_guild_context_updated_at
  BEFORE UPDATE ON guild_context
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- CLEANUP JOBS
-- ============================================

-- Function to clean up expired AI response cache
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM ai_response_cache WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Create index for cleanup job
CREATE INDEX idx_ai_response_cache_cleanup ON ai_response_cache(expires_at) WHERE expires_at < CURRENT_TIMESTAMP;

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- View for user preferences with user info
CREATE OR REPLACE VIEW user_preferences_view AS
SELECT 
  up.id,
  up.user_id,
  up.guild_id,
  up.preference_key,
  up.preference_value,
  up.created_at,
  up.updated_at
FROM user_preferences up;

-- View for performance metrics summary
CREATE OR REPLACE VIEW performance_metrics_summary AS
SELECT 
  pm.modification_id,
  AVG(pm.execution_time) as avg_execution_time,
  AVG(pm.memory_usage) as avg_memory_usage,
  AVG(pm.cpu_usage) as avg_cpu_usage,
  AVG(pm.throughput) as avg_throughput,
  COUNT(*) as metric_count,
  MAX(pm.recorded_at) as last_recorded
FROM performance_metrics pm
GROUP BY pm.modification_id;

-- View for modification with feedback
CREATE OR REPLACE VIEW modification_feedback_view AS
SELECT 
  m.id,
  m.user_id,
  m.intent,
  m.status,
  m.created_at,
  m.updated_at,
  COUNT(uf.id) as feedback_count,
  AVG(uf.rating) as average_rating
FROM modifications m
LEFT JOIN user_feedback uf ON m.id = uf.modification_id
GROUP BY m.id;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE user_preferences IS 'Stores user preference settings for Discord users';
COMMENT ON TABLE performance_metrics IS 'Stores performance metrics for code modifications';
COMMENT ON TABLE performance_history IS 'Stores historical performance data for learning';
COMMENT ON TABLE modifications IS 'Stores code modification requests and status';
COMMENT ON TABLE user_feedback IS 'Stores user feedback on modifications';
COMMENT ON TABLE feedback_analysis IS 'Stores analysis results of user feedback';
COMMENT ON TABLE performance_reports IS 'Stores generated performance analysis reports';
COMMENT ON TABLE security_reports IS 'Stores security analysis reports';
COMMENT ON TABLE guild_context IS 'Stores cached context information for Discord guilds';
COMMENT ON TABLE ai_response_cache IS 'Caches AI-generated responses to reduce API calls';

COMMENT ON COLUMN performance_metrics.execution_time IS 'Execution time in milliseconds';
COMMENT ON COLUMN performance_metrics.memory_usage IS 'Memory usage in MB';
COMMENT ON COLUMN performance_metrics.cpu_usage IS 'CPU usage percentage';
COMMENT ON COLUMN performance_metrics.throughput IS 'Operations per second';
COMMENT ON COLUMN security_reports.risk_score IS 'Overall risk score from 0 to 10';
COMMENT ON COLUMN security_reports.compliance_score IS 'Compliance score from 0 to 100';
