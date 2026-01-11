-- Batch 2: Compliance and Monitoring Tables
-- Migration for compliance audits, security team, performance tracking, and plugin marketplace

-- ============================================================================
-- SECURITY TEAM TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100) NOT NULL DEFAULT 'member',
  on_call BOOLEAN NOT NULL DEFAULT FALSE,
  contact_method VARCHAR(100) NOT NULL DEFAULT 'email',
  email VARCHAR(255),
  phone VARCHAR(50),
  priority INTEGER DEFAULT 0,
  timezone VARCHAR(50) DEFAULT 'UTC',
  available_from TIME,
  available_until TIME,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on security_team
CREATE INDEX IF NOT EXISTS idx_security_team_on_call ON security_team(on_call);
CREATE INDEX IF NOT EXISTS idx_security_team_user_id ON security_team(user_id);
CREATE INDEX IF NOT EXISTS idx_security_team_role ON security_team(role);

-- ============================================================================
-- PERFORMANCE TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS performance_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(255) NOT NULL,
  task_title VARCHAR(500) NOT NULL,
  task_type VARCHAR(100) NOT NULL,
  before_metrics JSONB,
  after_metrics JSONB,
  improvements JSONB,
  average_improvement DECIMAL(10, 2),
  actual_hours DECIMAL(10, 2),
  estimated_hours DECIMAL(10, 2),
  tracked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on performance_tracking
CREATE INDEX IF NOT EXISTS idx_performance_tracking_task_id ON performance_tracking(task_id);
CREATE INDEX IF NOT EXISTS idx_performance_tracking_task_type ON performance_tracking(task_type);
CREATE INDEX IF NOT EXISTS idx_performance_tracking_tracked_at ON performance_tracking(tracked_at);

-- ============================================================================
-- PLUGINS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_name VARCHAR(255) NOT NULL UNIQUE,
  current_version VARCHAR(50) NOT NULL,
  target_version VARCHAR(50),
  update_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending',
  severity VARCHAR(50) DEFAULT 'low',
  is_security_update BOOLEAN DEFAULT FALSE,
  vulnerabilities JSONB,
  breaking_changes JSONB,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  rollback_version VARCHAR(50),
  test_results JSONB,
  assigned_to VARCHAR(255),
  assigned_to_name VARCHAR(255),
  changelog TEXT,
  related_issues TEXT[],
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on plugins
CREATE INDEX IF NOT EXISTS idx_plugins_package_name ON plugins(package_name);
CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
CREATE INDEX IF NOT EXISTS idx_plugins_update_type ON plugins(update_type);
CREATE INDEX IF NOT EXISTS idx_plugins_is_security_update ON plugins(is_security_update);
CREATE INDEX IF NOT EXISTS idx_plugins_scheduled_at ON plugins(scheduled_at);

-- ============================================================================
-- PLUGIN VERSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS plugin_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  manifest JSONB NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(package_name, version)
);

-- Create index on plugin_versions
CREATE INDEX IF NOT EXISTS idx_plugin_versions_package_name ON plugin_versions(package_name);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_published_at ON plugin_versions(published_at);

-- ============================================================================
-- MARKETPLACE CACHE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketplace_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_name VARCHAR(255) NOT NULL,
  plugin_data JSONB NOT NULL,
  search_query VARCHAR(255),
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '5 minutes',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on marketplace_cache
CREATE INDEX IF NOT EXISTS idx_marketplace_cache_package_name ON marketplace_cache(package_name);
CREATE INDEX IF NOT EXISTS idx_marketplace_cache_expires_at ON marketplace_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_marketplace_cache_search_query ON marketplace_cache(search_query);

-- ============================================================================
-- COMPLIANCE FINDINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES compliance_audits(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  location VARCHAR(500),
  recommendation TEXT,
  code_snippet TEXT,
  affected_components TEXT[],
  passed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on compliance_findings
CREATE INDEX IF NOT EXISTS idx_compliance_findings_audit_id ON compliance_findings(audit_id);
CREATE INDEX IF NOT EXISTS idx_compliance_findings_category ON compliance_findings(category);
CREATE INDEX IF NOT EXISTS idx_compliance_findings_severity ON compliance_findings(severity);
CREATE INDEX IF NOT EXISTS idx_compliance_findings_passed ON compliance_findings(passed);
CREATE INDEX IF NOT EXISTS idx_compliance_findings_created_at ON compliance_findings(created_at);

-- ============================================================================
-- COMMENTS/NOTES FOR MAINTENANCE
-- ============================================================================

-- This migration creates tables for:
-- 1. Security team management - stores team members for on-call rotation
-- 2. Performance tracking - tracks metrics before/after maintenance tasks
-- 3. Plugin management - tracks dependency updates and version history
-- 4. Plugin versions - stores version history for rollback capability
-- 5. Marketplace cache - caches npm registry results to reduce API calls
-- 6. Compliance findings - stores detailed findings from compliance audits

-- The tables support the following Batch 2 features:
-- - Security team member lookup for Maintenance Manager
-- - Performance metrics collection for Maintenance Manager
-- - NPM registry integration for Plugin Registry
-- - Detailed compliance audit findings for Compliance Manager
