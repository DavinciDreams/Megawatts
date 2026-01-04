-- =============================================================================
-- Tiered Storage Tables Migration
-- =============================================================================
-- This migration creates the necessary tables for tiered storage functionality
-- including warm, cold, and backup storage tiers, metadata tracking, and migration logs.
-- =============================================================================

-- Create tiered storage warm table
CREATE TABLE IF NOT EXISTS tiered_storage_warm (
    id VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create tiered storage cold table
CREATE TABLE IF NOT EXISTS tiered_storage_cold (
    id VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    compressed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create tiered storage backup table
CREATE TABLE IF NOT EXISTS tiered_storage_backup (
    id VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create tiered storage metadata table
CREATE TABLE IF NOT EXISTS tiered_storage_metadata (
    id VARCHAR(255) PRIMARY KEY,
    data_type VARCHAR(50) NOT NULL,
    current_tier VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    size BIGINT DEFAULT 0,
    tags JSONB DEFAULT '[]'::jsonb,
    expires_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create tier migration log table
CREATE TABLE IF NOT EXISTS tier_migration_log (
    id SERIAL PRIMARY KEY,
    data_id VARCHAR(255) NOT NULL,
    from_tier VARCHAR(20) NOT NULL,
    to_tier VARCHAR(20) NOT NULL,
    reason TEXT NOT NULL,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    migrated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tiered_warm_created ON tiered_storage_warm(created_at);
CREATE INDEX IF NOT EXISTS idx_tiered_warm_updated ON tiered_storage_warm(updated_at);

CREATE INDEX IF NOT EXISTS idx_tiered_cold_created ON tiered_storage_cold(created_at);
CREATE INDEX IF NOT EXISTS idx_tiered_cold_updated ON tiered_storage_cold(updated_at);
CREATE INDEX IF NOT EXISTS idx_tiered_cold_compressed ON tiered_storage_cold(compressed);

CREATE INDEX IF NOT EXISTS idx_tiered_backup_created ON tiered_storage_backup(created_at);
CREATE INDEX IF NOT EXISTS idx_tiered_backup_updated ON tiered_storage_backup(updated_at);

CREATE INDEX IF NOT EXISTS idx_tiered_metadata_current_tier ON tiered_storage_metadata(current_tier);
CREATE INDEX IF NOT EXISTS idx_tiered_metadata_data_type ON tiered_storage_metadata(data_type);
CREATE INDEX IF NOT EXISTS idx_tiered_metadata_last_accessed ON tiered_storage_metadata(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_tiered_metadata_expires_at ON tiered_storage_metadata(expires_at);
CREATE INDEX IF NOT EXISTS idx_tiered_metadata_tags ON tiered_storage_metadata USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_tier_migration_log_data_id ON tier_migration_log(data_id);
CREATE INDEX IF NOT EXISTS idx_tier_migration_log_from_tier ON tier_migration_log(from_tier);
CREATE INDEX IF NOT EXISTS idx_tier_migration_log_to_tier ON tier_migration_log(to_tier);
CREATE INDEX IF NOT EXISTS idx_tier_migration_log_migrated_at ON tier_migration_log(migrated_at);
CREATE INDEX IF NOT EXISTS idx_tier_migration_log_success ON tier_migration_log(success);

-- Create function to update updated_at timestamp for tiered storage tables
CREATE OR REPLACE FUNCTION update_tiered_storage_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at for tiered storage tables
CREATE TRIGGER update_tiered_warm_updated_at BEFORE UPDATE ON tiered_storage_warm
    FOR EACH ROW EXECUTE FUNCTION update_tiered_storage_updated_at_column();

CREATE TRIGGER update_tiered_cold_updated_at BEFORE UPDATE ON tiered_storage_cold
    FOR EACH ROW EXECUTE FUNCTION update_tiered_storage_updated_at_column();

CREATE TRIGGER update_tiered_backup_updated_at BEFORE UPDATE ON tiered_storage_backup
    FOR EACH ROW EXECUTE FUNCTION update_tiered_storage_updated_at_column();

CREATE TRIGGER update_tiered_metadata_updated_at BEFORE UPDATE ON tiered_storage_metadata
    FOR EACH ROW EXECUTE FUNCTION update_tiered_storage_updated_at_column();

-- Grant permissions to the bot user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO CURRENT_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO CURRENT_USER;
