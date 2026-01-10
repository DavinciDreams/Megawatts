-- ============================================================================
-- Plugin Marketplace Migration for Phase 5
-- Marketplace Infrastructure Tables
-- ============================================================================

-- Enable pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Marketplace Plugins table
CREATE TABLE IF NOT EXISTS marketplace_plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  long_description TEXT,
  version VARCHAR(20) NOT NULL,
  author VARCHAR(100) NOT NULL,
  author_id VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  website VARCHAR(255),
  repository VARCHAR(255),
  documentation VARCHAR(255),
  category VARCHAR(50) NOT NULL CHECK (category IN ('core', 'ai', 'moderation', 'utility', 'fun', 'integration', 'custom', 'automation', 'admin', 'developer')),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'under_review', 'approved', 'published', 'rejected', 'archived', 'deprecated', 'removed')),
  license VARCHAR(20) NOT NULL CHECK (license IN ('MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3', 'ISC', 'MPL-2.0', 'custom', 'proprietary')),
  license_url VARCHAR(255),
  tags TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  icon VARCHAR(255),
  banner VARCHAR(255),
  screenshots TEXT[] DEFAULT '{}',
  dependencies JSONB DEFAULT '[]',
  permissions TEXT[] DEFAULT '{}',
  config JSONB NOT NULL,
  validation JSONB DEFAULT '{"status": "pending", "checks": [], "overallScore": 0}',
  rating JSONB DEFAULT '{"average": 0, "count": 0, "distribution": {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}}',
  statistics JSONB DEFAULT '{"downloads": 0, "installs": 0, "activeInstalls": 0, "views": 0}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE,
  last_validated_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for marketplace_plugins
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_slug ON marketplace_plugins(slug);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_author ON marketplace_plugins(author);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_category ON marketplace_plugins(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_status ON marketplace_plugins(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_license ON marketplace_plugins(license);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_tags ON marketplace_plugins USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_keywords ON marketplace_plugins USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_rating ON marketplace_plugins((rating->>'average'));
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_downloads ON marketplace_plugins((statistics->>'downloads'));
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_created_at ON marketplace_plugins(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_published_at ON marketplace_plugins(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_metadata_featured ON marketplace_plugins((metadata->>'featured'));
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_metadata_verified ON marketplace_plugins((metadata->>'verified'));
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_metadata_official ON marketplace_plugins((metadata->>'official'));

-- Plugin Reviews table
CREATE TABLE IF NOT EXISTS plugin_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id UUID NOT NULL REFERENCES marketplace_plugins(id) ON DELETE CASCADE,
  user_id VARCHAR(20) NOT NULL,
  user_name VARCHAR(100) NOT NULL,
  user_avatar VARCHAR(255),
  rating INTEGER NOT NULL CHECK (rating >=1 AND rating <= 5),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected', 'flagged')),
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  reply JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for plugin_reviews
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_plugin_id ON plugin_reviews(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_user_id ON plugin_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_rating ON plugin_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_status ON plugin_reviews(status);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_created_at ON plugin_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_helpful_count ON plugin_reviews(helpful_count DESC);

-- Plugin Downloads table
CREATE TABLE IF NOT EXISTS plugin_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id UUID NOT NULL REFERENCES marketplace_plugins(id) ON DELETE CASCADE,
  plugin_version VARCHAR(20) NOT NULL,
  user_id VARCHAR(20),
  guild_id VARCHAR(20),
  ip_address VARCHAR(45),
  user_agent TEXT,
  source VARCHAR(20) NOT NULL CHECK (source IN ('marketplace', 'direct', 'api', 'cli')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'cancelled')),
  error TEXT,
  downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for plugin_downloads
CREATE INDEX IF NOT EXISTS idx_plugin_downloads_plugin_id ON plugin_downloads(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_downloads_user_id ON plugin_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_plugin_downloads_guild_id ON plugin_downloads(guild_id);
CREATE INDEX IF NOT EXISTS idx_plugin_downloads_downloaded_at ON plugin_downloads(downloaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_plugin_downloads_source ON plugin_downloads(source);
CREATE INDEX IF NOT EXISTS idx_plugin_downloads_status ON plugin_downloads(status);

-- Plugin Analytics table
CREATE TABLE IF NOT EXISTS plugin_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id UUID NOT NULL REFERENCES marketplace_plugins(id) ON DELETE CASCADE,
  period VARCHAR(20) NOT NULL CHECK (period IN ('hourly', 'daily', 'weekly', 'monthly')),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metrics JSONB NOT NULL,
  engagement JSONB NOT NULL,
  performance JSONB NOT NULL,
  UNIQUE(plugin_id, period, timestamp)
);

-- Indexes for plugin_analytics
CREATE INDEX IF NOT EXISTS idx_plugin_analytics_plugin_id ON plugin_analytics(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_analytics_period ON plugin_analytics(period);
CREATE INDEX IF NOT EXISTS idx_plugin_analytics_timestamp ON plugin_analytics(timestamp DESC);

-- Plugin Tags table
CREATE TABLE IF NOT EXISTS plugin_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(50),
  color VARCHAR(7),
  icon VARCHAR(50),
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for plugin_tags
CREATE INDEX IF NOT EXISTS idx_plugin_tags_name ON plugin_tags(name);
CREATE INDEX IF NOT EXISTS idx_plugin_tags_slug ON plugin_tags(slug);
CREATE INDEX IF NOT EXISTS idx_plugin_tags_category ON plugin_tags(category);
CREATE INDEX IF NOT EXISTS idx_plugin_tags_usage_count ON plugin_tags(usage_count DESC);

-- Plugin Versions table
CREATE TABLE IF NOT EXISTS plugin_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id UUID NOT NULL REFERENCES marketplace_plugins(id) ON DELETE CASCADE,
  version VARCHAR(20) NOT NULL,
  changelog TEXT,
  download_url VARCHAR(255) NOT NULL,
  size BIGINT,
  checksum VARCHAR(64),
  min_bot_version VARCHAR(20),
  max_bot_version VARCHAR(20),
  is_stable BOOLEAN DEFAULT TRUE,
  is_deprecated BOOLEAN DEFAULT FALSE,
  download_count INTEGER DEFAULT 0,
  published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(plugin_id, version)
);

-- Indexes for plugin_versions
CREATE INDEX IF NOT EXISTS idx_plugin_versions_plugin_id ON plugin_versions(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_version ON plugin_versions(version);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_is_stable ON plugin_versions(is_stable);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_is_deprecated ON plugin_versions(is_deprecated);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_published_at ON plugin_versions(published_at DESC);

-- ============================================================================
-- Migration Metadata
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketplace_migration_metadata (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  version VARCHAR(20) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track applied migrations
INSERT INTO marketplace_migration_metadata (name, version) VALUES
  ('004_create_marketplace_tables', '1.0.0');

-- ============================================================================
-- Grant permissions (if needed)
-- ============================================================================

-- Grant necessary permissions for marketplace system (adjust as needed for your setup)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO marketplace_system;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO marketplace_system;
