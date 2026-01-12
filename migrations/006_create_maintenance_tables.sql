-- Migration: Create Maintenance Tables
-- Version: 006
-- Description: Creates tables for maintenance and security systems including maintenance tasks, bug reports, security vulnerabilities, dependency updates, compliance audits, and maintenance schedules
-- ============================================================================
-- Enable pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- MAINTENANCE TASKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('bug_fix', 'feature_update', 'security_patch', 'performance_optimization', 'dependency_update', 'data_migration', 'system_upgrade', 'routine_maintenance', 'emergency_fix')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'on_hold', 'completed', 'failed', 'cancelled')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to VARCHAR(20),
  assigned_to_name VARCHAR(100),
  estimated_hours NUMERIC(10, 2),
  actual_hours NUMERIC(10, 2),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  due_date TIMESTAMP WITH TIME ZONE,
  tags TEXT[] DEFAULT '{}',
  dependencies TEXT[] DEFAULT '{}',
  related_issues TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_type ON maintenance_tasks(type);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_status ON maintenance_tasks(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_priority ON maintenance_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_assigned_to ON maintenance_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_scheduled_at ON maintenance_tasks(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_due_date ON maintenance_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_tags ON maintenance_tasks USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_dependencies ON maintenance_tasks USING GIN(dependencies);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_created_at ON maintenance_tasks(created_at DESC);

-- ============================================================================
-- BUG REPORTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'on_hold', 'completed', 'failed', 'cancelled')),
  reported_by VARCHAR(20) NOT NULL,
  reported_by_name VARCHAR(100) NOT NULL,
  reported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  category VARCHAR(100),
  reproduction_steps TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,
  environment TEXT,
  logs TEXT,
  stack_trace TEXT,
  attachments TEXT[] DEFAULT '{}',
  assigned_to VARCHAR(20),
  assigned_to_name VARCHAR(100),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution TEXT,
  related_issues TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_severity ON bug_reports(severity);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_reported_by ON bug_reports(reported_by);
CREATE INDEX IF NOT EXISTS idx_bug_reports_category ON bug_reports(category);
CREATE INDEX IF NOT EXISTS idx_bug_reports_assigned_to ON bug_reports(assigned_to);
CREATE INDEX IF NOT EXISTS idx_bug_reports_reported_at ON bug_reports(reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_attachments ON bug_reports USING GIN(attachments);
CREATE INDEX IF NOT EXISTS idx_bug_reports_related_issues ON bug_reports USING GIN(related_issues);

-- ============================================================================
-- SECURITY VULNERABILITIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_vulnerabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'on_hold', 'completed', 'failed', 'cancelled')),
  cve_id VARCHAR(50),
  cvss_score NUMERIC(3, 1),
  affected_components TEXT[] DEFAULT '{}',
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  discovered_by VARCHAR(20) NOT NULL,
  discovered_by_name VARCHAR(100) NOT NULL,
  exploit_available BOOLEAN DEFAULT FALSE,
  patch_available BOOLEAN DEFAULT FALSE,
  patch_version VARCHAR(50),
  mitigation TEXT,
  references TEXT[] DEFAULT '{}',
  assigned_to VARCHAR(20),
  assigned_to_name VARCHAR(100),
  fixed_at TIMESTAMP WITH TIME ZONE,
  fix_description TEXT,
  related_vulnerabilities TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_vulnerabilities_severity ON security_vulnerabilities(severity);
CREATE INDEX IF NOT EXISTS idx_security_vulnerabilities_status ON security_vulnerabilities(status);
CREATE INDEX IF NOT EXISTS idx_security_vulnerabilities_cve_id ON security_vulnerabilities(cve_id);
CREATE INDEX IF NOT EXISTS idx_security_vulnerabilities_discovered_at ON security_vulnerabilities(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_vulnerabilities_assigned_to ON security_vulnerabilities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_security_vulnerabilities_affected_components ON security_vulnerabilities USING GIN(affected_components);
CREATE INDEX IF NOT EXISTS idx_security_vulnerabilities_references ON security_vulnerabilities USING GIN(references);
CREATE INDEX IF NOT EXISTS idx_security_vulnerabilities_related_vulnerabilities ON security_vulnerabilities USING GIN(related_vulnerabilities);

-- ============================================================================
-- DEPENDENCY UPDATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS dependency_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_name VARCHAR(255) NOT NULL,
  current_version VARCHAR(50) NOT NULL,
  target_version VARCHAR(50) NOT NULL,
  update_type VARCHAR(20) NOT NULL CHECK (update_type IN ('major', 'minor', 'patch', 'prerelease')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'on_hold', 'completed', 'failed', 'cancelled')),
  severity VARCHAR(20) DEFAULT 'low' CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  is_security_update BOOLEAN DEFAULT FALSE,
  vulnerabilities TEXT[] DEFAULT '{}',
  breaking_changes TEXT[] DEFAULT '{}',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  rollback_version VARCHAR(50),
  test_results JSONB,
  assigned_to VARCHAR(20),
  assigned_to_name VARCHAR(100),
  changelog TEXT,
  related_issues TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dependency_updates_package_name ON dependency_updates(package_name);
CREATE INDEX IF NOT EXISTS idx_dependency_updates_status ON dependency_updates(status);
CREATE INDEX IF NOT EXISTS idx_dependency_updates_update_type ON dependency_updates(update_type);
CREATE INDEX IF NOT EXISTS idx_dependency_updates_severity ON dependency_updates(severity);
CREATE INDEX IF NOT EXISTS idx_dependency_updates_is_security_update ON dependency_updates(is_security_update);
CREATE INDEX IF NOT EXISTS idx_dependency_updates_scheduled_at ON dependency_updates(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_dependency_updates_assigned_to ON dependency_updates(assigned_to);
CREATE INDEX IF NOT EXISTS idx_dependency_updates_vulnerabilities ON dependency_updates USING GIN(vulnerabilities);
CREATE INDEX IF NOT EXISTS idx_dependency_updates_breaking_changes ON dependency_updates USING GIN(breaking_changes);
CREATE INDEX IF NOT EXISTS idx_dependency_updates_related_issues ON dependency_updates USING GIN(related_issues);
CREATE INDEX IF NOT EXISTS idx_dependency_updates_created_at ON dependency_updates(created_at DESC);

-- ============================================================================
-- COMPLIANCE AUDITS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL CHECK (type IN ('gdpr', 'discord_tos', 'accessibility', 'localization', 'data_retention', 'privacy', 'security')),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'on_hold', 'completed', 'failed', 'cancelled')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  auditor VARCHAR(20) NOT NULL,
  auditor_name VARCHAR(100) NOT NULL,
  findings JSONB DEFAULT '[]',
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  passed BOOLEAN,
  recommendations TEXT[] DEFAULT '{}',
  next_audit_date TIMESTAMP WITH TIME ZONE,
  related_audits TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_audits_type ON compliance_audits(type);
CREATE INDEX IF NOT EXISTS idx_compliance_audits_status ON compliance_audits(status);
CREATE INDEX IF NOT EXISTS idx_compliance_audits_priority ON compliance_audits(priority);
CREATE INDEX IF NOT EXISTS idx_compliance_audits_scheduled_at ON compliance_audits(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_compliance_audits_auditor ON compliance_audits(auditor);
CREATE INDEX IF NOT EXISTS idx_compliance_audits_passed ON compliance_audits(passed);
CREATE INDEX IF NOT EXISTS idx_compliance_audits_overall_score ON compliance_audits(overall_score);
CREATE INDEX IF NOT EXISTS idx_compliance_audits_recommendations ON compliance_audits USING GIN(recommendations);
CREATE INDEX IF NOT EXISTS idx_compliance_audits_related_audits ON compliance_audits USING GIN(related_audits);

-- ============================================================================
-- MAINTENANCE SCHEDULES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('bug_fix', 'feature_update', 'security_patch', 'performance_optimization', 'dependency_update', 'data_migration', 'system_upgrade', 'routine_maintenance', 'emergency_fix')),
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('once', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  enabled BOOLEAN DEFAULT TRUE,
  scheduled_time VARCHAR(255) NOT NULL,
  timezone VARCHAR(50) DEFAULT 'UTC',
  estimated_duration INTEGER NOT NULL,
  maintenance_window_start VARCHAR(10) NOT NULL,
  maintenance_window_end VARCHAR(10) NOT NULL,
  notify_before INTEGER[] DEFAULT '{}',
  notify_channels TEXT[] DEFAULT '{}',
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  run_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_run_status VARCHAR(20),
  last_run_output TEXT,
  related_tasks TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_type ON maintenance_schedules(type);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_frequency ON maintenance_schedules(frequency);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_priority ON maintenance_schedules(priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_enabled ON maintenance_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_next_run_at ON maintenance_schedules(next_run_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_notify_channels ON maintenance_schedules USING GIN(notify_channels);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_related_tasks ON maintenance_schedules USING GIN(related_tasks);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_created_at ON maintenance_schedules(created_at DESC);

-- ============================================================================
-- MIGRATION COMPLETED
-- ============================================================================

-- Record migration completion
INSERT INTO migrations (version, name, applied_at)
VALUES ('006', 'create_maintenance_tables', NOW())
ON CONFLICT (version) DO NOTHING;
