#!/bin/bash

# =============================================================================
# Discord Bot Database Setup Script for Coolify Deployment
# =============================================================================
# This script initializes and configures databases for Discord bot deployment
# across different environments in Coolify.
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration Variables
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${ENVIRONMENT:-staging}"
LOG_FILE="${PROJECT_ROOT}/logs/setup-databases-${ENVIRONMENT}.log"

# Database connection variables
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-discord_bot}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-discord_bot_${ENVIRONMENT}}"

# Redis connection variables
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

# =============================================================================
# Logging Functions
# =============================================================================
setup_logging() {
    mkdir -p "$(dirname "$LOG_FILE")"
    exec 1> >(tee -a "$LOG_FILE")
    exec 2> >(tee -a "$LOG_FILE" >&2)
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
    log "ERROR: $*"
    exit 1
}

# =============================================================================
# Utility Functions
# =============================================================================
check_dependencies() {
    log "Checking dependencies..."
    
    local missing_deps=()
    
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        missing_deps+=("docker-compose")
    fi
    
    if ! command -v psql &> /dev/null; then
        missing_deps+=("postgresql-client")
    fi
    
    if ! command -v redis-cli &> /dev/null; then
        missing_deps+=("redis-tools")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        error "Missing dependencies: ${missing_deps[*]}"
    fi
    
    log "All dependencies are available"
}

wait_for_postgres() {
    log "Waiting for PostgreSQL to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if PGPASSWORD="$DB_PASSWORD" pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" &> /dev/null; then
            log "PostgreSQL is ready"
            return 0
        fi
        
        log "Attempt $attempt/$max_attempts: PostgreSQL not ready, waiting 5 seconds..."
        sleep 5
        ((attempt++))
    done
    
    error "PostgreSQL did not become ready within $max_attempts attempts"
}

wait_for_redis() {
    log "Waiting for Redis to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" ping &> /dev/null; then
            log "Redis is ready"
            return 0
        fi
        
        log "Attempt $attempt/$max_attempts: Redis not ready, waiting 5 seconds..."
        sleep 5
        ((attempt++))
    done
    
    error "Redis did not become ready within $max_attempts attempts"
}

# =============================================================================
# PostgreSQL Setup Functions
# =============================================================================
create_database() {
    log "Creating database if it doesn't exist..."
    
    # Check if database exists
    local db_exists
    db_exists=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" postgres 2>/dev/null || echo "")
    
    if [ -z "$db_exists" ]; then
        log "Creating database: $DB_NAME"
        PGPASSWORD="$DB_PASSWORD" createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" || error "Failed to create database"
        log "Database created successfully"
    else
        log "Database already exists: $DB_NAME"
    fi
}

initialize_schema() {
    log "Initializing database schema..."
    
    local init_file="${PROJECT_ROOT}/postgres/init.sql"
    
    if [ ! -f "$init_file" ]; then
        error "Initialization file not found: $init_file"
    fi
    
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$init_file" || error "Failed to initialize schema"
    
    log "Database schema initialized successfully"
}

create_extensions() {
    log "Creating required extensions..."
    
    local extensions=("uuid-ossp" "pg_trgm" "pg_stat_statements" "btree_gin" "btree_gist")
    
    for extension in "${extensions[@]}"; do
        log "Creating extension: $extension"
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS \"$extension\";" || error "Failed to create extension: $extension"
    done
    
    log "All extensions created successfully"
}

create_users() {
    log "Creating database users..."
    
    # Create read-only user for reporting
    local readonly_user="${DB_USER}_readonly"
    local readonly_password="${DB_PASSWORD}_readonly"
    
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$readonly_user') THEN
                CREATE ROLE $readonly_user WITH LOGIN PASSWORD '$readonly_password';
            END IF;
        END
        \$\$;
    " || error "Failed to create read-only user"
    
    # Grant read-only permissions
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        GRANT CONNECT ON DATABASE $DB_NAME TO $readonly_user;
        GRANT USAGE ON SCHEMA public TO $readonly_user;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO $readonly_user;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO $readonly_user;
    " || error "Failed to grant read-only permissions"
    
    log "Database users created successfully"
}

setup_replication() {
    if [ "$ENVIRONMENT" != "production" ]; then
        log "Skipping replication setup for non-production environment"
        return 0
    fi
    
    log "Setting up replication..."
    
    local replication_user="${POSTGRES_REPLICATION_USER:-replicator}"
    local replication_password="${POSTGRES_REPLICATION_PASSWORD:-}"
    
    # Create replication user
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$replication_user') THEN
                CREATE ROLE $replication_user WITH REPLICATION LOGIN PASSWORD '$replication_password';
            END IF;
        END
        \$\$;
    " || error "Failed to create replication user"
    
    log "Replication setup completed"
}

# =============================================================================
# Redis Setup Functions
# =============================================================================
configure_redis() {
    log "Configuring Redis..."
    
    # Set Redis configuration
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" config set "save" "900 1 300 10 60 10000" || error "Failed to configure Redis save policy"
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" config set "appendonly" "yes" || error "Failed to configure Redis AOF"
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" config set "maxmemory-policy" "allkeys-lru" || error "Failed to configure Redis memory policy"
    
    log "Redis configured successfully"
}

setup_redis_cluster() {
    if [ "$ENVIRONMENT" != "production" ]; then
        log "Skipping Redis cluster setup for non-production environment"
        return 0
    fi
    
    log "Setting up Redis cluster..."
    
    # This would be called from the redis-cluster-init service
    # The actual cluster initialization is handled by the init-redis-cluster.sh script
    
    log "Redis cluster setup initiated"
}

# =============================================================================
# Migration Functions
# =============================================================================
run_migrations() {
    log "Running database migrations..."
    
    local migrations_dir="${PROJECT_ROOT}/migrations"
    
    if [ ! -d "$migrations_dir" ]; then
        log "No migrations directory found, skipping migrations"
        return 0
    fi
    
    # Create migrations table if it doesn't exist
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    " || error "Failed to create migrations table"
    
    # Run migration files in order
    for migration_file in "$migrations_dir"/*.sql; do
        if [ -f "$migration_file" ]; then
            local migration_name=$(basename "$migration_file" .sql)
            
            # Check if migration has already been applied
            local applied
            applied=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM schema_migrations WHERE version='$migration_name'" 2>/dev/null || echo "")
            
            if [ -z "$applied" ]; then
                log "Applying migration: $migration_name"
                PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration_file" || error "Failed to apply migration: $migration_name"
                
                # Record migration as applied
                PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "INSERT INTO schema_migrations (version) VALUES ('$migration_name');" || error "Failed to record migration"
                
                log "Migration applied successfully: $migration_name"
            else
                log "Migration already applied: $migration_name"
            fi
        fi
    done
    
    log "All migrations completed successfully"
}

# =============================================================================
# Health Check Functions
# =============================================================================
health_check_postgres() {
    log "Performing PostgreSQL health check..."
    
    # Test basic connectivity
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null || error "PostgreSQL health check failed"
    
    # Test table existence
    local tables=("users" "guilds" "conversations" "plugins" "analytics")
    for table in "${tables[@]}"; do
        local exists
        exists=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='$table'" 2>/dev/null || echo "")
        
        if [ -z "$exists" ]; then
            error "Required table not found: $table"
        fi
    done
    
    log "PostgreSQL health check passed"
}

health_check_redis() {
    log "Performing Redis health check..."
    
    # Test basic connectivity
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" ping &> /dev/null || error "Redis health check failed"
    
    # Test read/write operations
    local test_key="health_check_$(date +%s)"
    local test_value="ok"
    
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" set "$test_key" "$test_value" &> /dev/null || error "Redis write test failed"
    
    local result
    result=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" get "$test_key" 2>/dev/null || echo "")
    
    if [ "$result" != "$test_value" ]; then
        error "Redis read test failed"
    fi
    
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" del "$test_key" &> /dev/null || error "Redis cleanup test failed"
    
    log "Redis health check passed"
}

# =============================================================================
# Main Execution
# =============================================================================
main() {
    log "Starting database setup for environment: $ENVIRONMENT"
    
    setup_logging
    check_dependencies
    
    # Wait for services to be ready
    wait_for_postgres
    wait_for_redis
    
    # PostgreSQL setup
    create_database
    initialize_schema
    create_extensions
    create_users
    setup_replication
    
    # Redis setup
    configure_redis
    setup_redis_cluster
    
    # Run migrations
    run_migrations
    
    # Health checks
    health_check_postgres
    health_check_redis
    
    log "Database setup completed successfully for environment: $ENVIRONMENT"
}

# =============================================================================
# Script Entry Point
# =============================================================================
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi