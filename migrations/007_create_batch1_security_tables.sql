-- Batch 1: Core Security and Connection Tables
-- This migration creates tables for:
-- - Sandbox executions
-- - Penetration tests
-- - Security findings

BEGIN;

-- Sandbox executions table
CREATE TABLE IF NOT EXISTS sandbox_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_id VARCHAR(255) NOT NULL,
  code TEXT NOT NULL,
  context JSONB,
  options JSONB,
  output JSONB,
  memory_usage_mb NUMERIC(10, 2),
  execution_time_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT sandbox_executions_sandbox_id_fkey FOREIGN KEY (sandbox_id) REFERENCES sandboxes(id) ON DELETE CASCADE
);

-- Index for sandbox executions
CREATE INDEX IF NOT EXISTS idx_sandbox_executions_sandbox_id ON sandbox_executions(sandbox_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_executions_created_at ON sandbox_executions(created_at);
CREATE INDEX IF NOT EXISTS idx_sandbox_executions_success ON sandbox_executions(success);

-- Penetration tests table
CREATE TABLE IF NOT EXISTS penetration_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_hours INTEGER NOT NULL,
  scope JSONB NOT NULL,
  team JSONB NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  results JSONB,
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  passed BOOLEAN NOT NULL,
  duration_ms INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT penetration_tests_status_check CHECK (
    (status = 'scheduled' AND started_at IS NULL AND completed_at IS NULL) OR
    (status = 'in_progress' AND started_at IS NOT NULL AND completed_at IS NULL) OR
    (status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL) OR
    (status = 'cancelled' AND completed_at IS NOT NULL)
  )
);

-- Index for penetration tests
CREATE INDEX IF NOT EXISTS idx_penetration_tests_status ON penetration_tests(status);
CREATE INDEX IF NOT EXISTS idx_penetration_tests_scheduled_for ON penetration_tests(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_penetration_tests_created_at ON penetration_tests(created_at);

-- Security findings table
CREATE TABLE IF NOT EXISTS security_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  location TEXT,
  recommendation TEXT NOT NULL,
  cvss_score NUMERIC(5, 2),
  cve_id VARCHAR(50),
  affected_components JSONB NOT NULL,
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  penetration_test_id UUID,
  audit_id UUID,
  vulnerability_id UUID,
  status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by VARCHAR(255),
  CONSTRAINT security_findings_penetration_test_id_fkey FOREIGN KEY (penetration_test_id) REFERENCES penetration_tests(id) ON DELETE SET NULL,
  CONSTRAINT security_findings_audit_id_fkey FOREIGN KEY (audit_id) REFERENCES security_audits(id) ON DELETE SET NULL,
  CONSTRAINT security_findings_vulnerability_id_fkey FOREIGN KEY (vulnerability_id) REFERENCES security_vulnerabilities(id) ON DELETE SET NULL
);

-- Index for security findings
CREATE INDEX IF NOT EXISTS idx_security_findings_type ON security_findings(type);
CREATE INDEX IF NOT EXISTS idx_security_findings_severity ON security_findings(severity);
CREATE INDEX IF NOT EXISTS idx_security_findings_status ON security_findings(status);
CREATE INDEX IF NOT EXISTS idx_security_findings_discovered_at ON security_findings(discovered_at);
CREATE INDEX IF NOT EXISTS idx_security_findings_penetration_test_id ON security_findings(penetration_test_id);
CREATE INDEX IF NOT EXISTS idx_security_findings_audit_id ON security_findings(audit_id);
CREATE INDEX IF NOT EXISTS idx_security_findings_vulnerability_id ON security_findings(vulnerability_id);

-- Sandboxes table (if not exists in maintenance tables)
CREATE TABLE IF NOT EXISTS sandboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  options JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'destroyed'))
);

-- Security audits table (if not exists in maintenance tables)
CREATE TABLE IF NOT EXISTS security_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  type VARCHAR(50) NOT NULL CHECK (type IN ('vulnerability_scan', 'penetration_test', 'code_review', 'configuration_audit')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
  findings JSONB NOT NULL,
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  passed BOOLEAN NOT NULL,
  duration_ms INTEGER NOT NULL,
  metadata JSONB
);

-- Index for security audits
CREATE INDEX IF NOT EXISTS idx_security_audits_type ON security_audits(type);
CREATE INDEX IF NOT EXISTS idx_security_audits_status ON security_audits(status);
CREATE INDEX IF NOT EXISTS idx_security_audits_timestamp ON security_audits(timestamp);

-- Security vulnerabilities table (if not exists in maintenance tables)
CREATE TABLE IF NOT EXISTS security_vulnerabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(50) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'dismissed')),
  cve_id VARCHAR(50),
  cvss_score NUMERIC(5, 2),
  affected_components JSONB NOT NULL,
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  discovered_by VARCHAR(255) NOT NULL,
  discovered_by_name VARCHAR(255) NOT NULL,
  exploit_available BOOLEAN NOT NULL DEFAULT FALSE,
  patch_available BOOLEAN NOT NULL DEFAULT FALSE,
  references JSONB,
  metadata JSONB
);

-- Index for security vulnerabilities
CREATE INDEX IF NOT EXISTS idx_security_vulnerabilities_severity ON security_vulnerabilities(severity);
CREATE INDEX IF NOT EXISTS idx_security_vulnerabilities_status ON security_vulnerabilities(status);
CREATE INDEX IF NOT EXISTS idx_security_vulnerabilities_discovered_at ON security_vulnerabilities(discovered_at);

COMMIT;

-- Add comments
COMMENT ON TABLE sandbox_executions IS 'Stores execution results from security sandbox';
COMMENT ON TABLE penetration_tests IS 'Stores scheduled and completed penetration tests';
COMMENT ON TABLE security_findings IS 'Stores security findings from audits and penetration tests';
COMMENT ON TABLE sandboxes IS 'Stores active security sandbox instances';
COMMENT ON TABLE security_audits IS 'Stores security audit results';
COMMENT ON TABLE security_vulnerabilities IS 'Stores discovered security vulnerabilities';
