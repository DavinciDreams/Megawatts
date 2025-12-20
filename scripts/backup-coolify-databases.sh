#!/bin/bash

# =============================================================================
# Discord Bot Database Backup Script for Coolify Deployment
# =============================================================================
# This script performs automated backups of PostgreSQL and Redis databases
# for Discord bot deployment across different environments in Coolify.
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration Variables
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${ENVIRONMENT:-staging}"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
LOG_FILE="${PROJECT_ROOT}/logs/backup-databases-${ENVIRONMENT}.log"

# Backup retention settings
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_RETENTION_WEEKS="${BACKUP_RETENTION_WEEKS:-4}"
BACKUP_RETENTION_MONTHS="${BACKUP_RETENTION_MONTHS:-12}"

# PostgreSQL connection variables
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-discord_bot}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
POSTGRES_DB="${POSTGRES_DB:-discord_bot_${ENVIRONMENT}}"

# Redis connection variables
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

# Backup schedule (cron format)
POSTGRES_BACKUP_SCHEDULE="${POSTGRES_BACKUP_SCHEDULE:-0 2 * * *}"
REDIS_BACKUP_SCHEDULE="${REDIS_BACKUP_SCHEDULE:-0 3 * * *}"

# =============================================================================
# Logging Functions
# =============================================================================
setup_logging() {
    mkdir -p "$(dirname "$LOG_FILE")"
    mkdir -p "$BACKUP_DIR"
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
    
    if ! command -v pg_dump &> /dev/null; then
        missing_deps+=("postgresql-client")
    fi
    
    if ! command -v redis-cli &> /dev/null; then
        missing_deps+=("redis-tools")
    fi
    
    if ! command -v gzip &> /dev/null; then
        missing_deps+=("gzip")
    fi
    
    if ! command -v find &> /dev/null; then
        missing_deps+=("findutils")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        error "Missing dependencies: ${missing_deps[*]}"
    fi
    
    log "All dependencies are available"
}

create_backup_directories() {
    log "Creating backup directories..."
    
    local dirs=(
        "${BACKUP_DIR}/postgres/daily"
        "${BACKUP_DIR}/postgres/weekly"
        "${BACKUP_DIR}/postgres/monthly"
        "${BACKUP_DIR}/redis/daily"
        "${BACKUP_DIR}/redis/weekly"
        "${BACKUP_DIR}/redis/monthly"
        "${BACKUP_DIR}/logs"
    )
    
    for dir in "${dirs[@]}"; do
        mkdir -p "$dir"
    done
    
    log "Backup directories created"
}

get_backup_type() {
    local day_of_week day_of_month backup_type
    
    day_of_week=$(date +%u)  # 1-7 (Monday-Sunday)
    day_of_month=$(date +%d)  # 01-31
    
    # Monthly backup on the 1st of each month
    if [ "$day_of_month" = "01" ]; then
        backup_type="monthly"
    # Weekly backup on Sunday (day 7)
    elif [ "$day_of_week" = "7" ]; then
        backup_type="weekly"
    # Daily backup otherwise
    else
        backup_type="daily"
    fi
    
    echo "$backup_type"
}

# =============================================================================
# PostgreSQL Backup Functions
# =============================================================================
backup_postgres() {
    local backup_type
    backup_type=$(get_backup_type)
    
    log "Starting PostgreSQL backup ($backup_type)..."
    
    local timestamp
    timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_file="${BACKUP_DIR}/postgres/${backup_type}/postgres_${ENVIRONMENT}_${timestamp}.sql"
    local compressed_file="${backup_file}.gz"
    
    # Create database backup
    log "Creating PostgreSQL backup: $backup_file"
    
    PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
        -h "$POSTGRES_HOST" \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        --verbose \
        --clean \
        --if-exists \
        --create \
        --format=plain \
        --no-owner \
        --no-privileges \
        --exclude-table-data='schema_migrations' \
        --file="$backup_file" || error "PostgreSQL backup failed"
    
    # Compress backup
    log "Compressing PostgreSQL backup..."
    gzip "$backup_file" || error "Failed to compress PostgreSQL backup"
    
    # Verify backup
    verify_postgres_backup "$compressed_file" || error "PostgreSQL backup verification failed"
    
    # Create backup metadata
    create_postgres_metadata "$compressed_file" "$backup_type"
    
    log "PostgreSQL backup completed: $compressed_file"
}

verify_postgres_backup() {
    local backup_file="$1"
    
    log "Verifying PostgreSQL backup: $backup_file"
    
    # Check if file exists and is not empty
    if [ ! -s "$backup_file" ]; then
        error "Backup file is empty or does not exist: $backup_file"
    fi
    
    # Test decompression
    if ! gzip -t "$backup_file" 2>/dev/null; then
        error "Backup file is corrupted: $backup_file"
    fi
    
    # Check file size (minimum 1KB for a valid backup)
    local file_size
    file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
    
    if [ "$file_size" -lt 1024 ]; then
        error "Backup file is too small: $file_size bytes"
    fi
    
    log "PostgreSQL backup verification passed"
}

create_postgres_metadata() {
    local backup_file="$1"
    local backup_type="$2"
    local metadata_file="${backup_file}.meta"
    
    log "Creating PostgreSQL backup metadata: $metadata_file"
    
    local backup_size
    backup_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
    
    local table_count
    table_count=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null || echo "0")
    
    cat > "$metadata_file" << EOF
backup_type=$backup_type
environment=$ENVIRONMENT
database=$POSTGRES_DB
host=$POSTGRES_HOST
port=$POSTGRES_PORT
user=$POSTGRES_USER
timestamp=$(date -Iseconds)
file_size=$backup_size
table_count=$table_count
compression=gzip
version=1.0
EOF
    
    log "PostgreSQL backup metadata created"
}

# =============================================================================
# Redis Backup Functions
# =============================================================================
backup_redis() {
    local backup_type
    backup_type=$(get_backup_type)
    
    log "Starting Redis backup ($backup_type)..."
    
    local timestamp
    timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_file="${BACKUP_DIR}/redis/${backup_type}/redis_${ENVIRONMENT}_${timestamp}.rdb"
    local compressed_file="${backup_file}.gz"
    
    # Create Redis backup
    log "Creating Redis backup: $backup_file"
    
    # Trigger background save
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" BGSAVE || error "Failed to trigger Redis background save"
    
    # Wait for background save to complete
    wait_for_redis_save
    
    # Copy RDB file
    local redis_data_dir
    redis_data_dir=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" config get dir | tail -1) || error "Failed to get Redis data directory"
    
    # Get the latest RDB file
    local rdb_file
    rdb_file=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" config get dbfilename | tail -1) || error "Failed to get Redis RDB filename"
    
    # Copy RDB file from Redis container to backup location
    docker cp "$(get_redis_container_name):${redis_data_dir}/${rdb_file}" "$backup_file" || error "Failed to copy Redis RDB file"
    
    # Compress backup
    log "Compressing Redis backup..."
    gzip "$backup_file" || error "Failed to compress Redis backup"
    
    # Verify backup
    verify_redis_backup "$compressed_file" || error "Redis backup verification failed"
    
    # Create backup metadata
    create_redis_metadata "$compressed_file" "$backup_type"
    
    log "Redis backup completed: $compressed_file"
}

wait_for_redis_save() {
    log "Waiting for Redis background save to complete..."
    
    local max_attempts=60
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        local lastsave
        lastsave=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" LASTSAVE 2>/dev/null || echo "0")
        
        sleep 1
        
        local current_lastsave
        current_lastsave=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" LASTSAVE 2>/dev/null || echo "0")
        
        if [ "$current_lastsave" -gt "$lastsave" ]; then
            log "Redis background save completed"
            return 0
        fi
        
        log "Attempt $attempt/$max_attempts: Redis save in progress..."
        sleep 2
        ((attempt++))
    done
    
    error "Redis background save did not complete within $max_attempts attempts"
}

get_redis_container_name() {
    # Try to find the Redis container name based on environment
    case "$ENVIRONMENT" in
        "development")
            echo "discord-bot-redis-dev"
            ;;
        "staging")
            echo "discord-bot-redis-staging"
            ;;
        "production")
            echo "discord-bot-redis-primary"
            ;;
        *)
            echo "discord-bot-redis-${ENVIRONMENT}"
            ;;
    esac
}

verify_redis_backup() {
    local backup_file="$1"
    
    log "Verifying Redis backup: $backup_file"
    
    # Check if file exists and is not empty
    if [ ! -s "$backup_file" ]; then
        error "Backup file is empty or does not exist: $backup_file"
    fi
    
    # Test decompression
    if ! gzip -t "$backup_file" 2>/dev/null; then
        error "Backup file is corrupted: $backup_file"
    fi
    
    # Check file size (minimum 1KB for a valid backup)
    local file_size
    file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
    
    if [ "$file_size" -lt 1024 ]; then
        error "Backup file is too small: $file_size bytes"
    fi
    
    log "Redis backup verification passed"
}

create_redis_metadata() {
    local backup_file="$1"
    local backup_type="$2"
    local metadata_file="${backup_file}.meta"
    
    log "Creating Redis backup metadata: $metadata_file"
    
    local backup_size
    backup_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
    
    local key_count
    key_count=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" DBSIZE 2>/dev/null || echo "0")
    
    local redis_version
    redis_version=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" INFO server | grep "redis_version" | cut -d: -f2 | tr -d '\r' 2>/dev/null || echo "unknown")
    
    cat > "$metadata_file" << EOF
backup_type=$backup_type
environment=$ENVIRONMENT
host=$REDIS_HOST
port=$REDIS_PORT
timestamp=$(date -Iseconds)
file_size=$backup_size
key_count=$key_count
redis_version=$redis_version
compression=gzip
version=1.0
EOF
    
    log "Redis backup metadata created"
}

# =============================================================================
# Backup Cleanup Functions
# =============================================================================
cleanup_old_backups() {
    log "Cleaning up old backups..."
    
    # Clean up daily backups (keep last N days)
    find "${BACKUP_DIR}/postgres/daily" -name "*.gz" -mtime +${BACKUP_RETENTION_DAYS} -delete
    find "${BACKUP_DIR}/redis/daily" -name "*.gz" -mtime +${BACKUP_RETENTION_DAYS} -delete
    
    # Clean up weekly backups (keep last N weeks)
    find "${BACKUP_DIR}/postgres/weekly" -name "*.gz" -mtime +$((BACKUP_RETENTION_WEEKS * 7)) -delete
    find "${BACKUP_DIR}/redis/weekly" -name "*.gz" -mtime +$((BACKUP_RETENTION_WEEKS * 7)) -delete
    
    # Clean up monthly backups (keep last N months)
    find "${BACKUP_DIR}/postgres/monthly" -name "*.gz" -mtime +$((BACKUP_RETENTION_MONTHS * 30)) -delete
    find "${BACKUP_DIR}/redis/monthly" -name "*.gz" -mtime +$((BACKUP_RETENTION_MONTHS * 30)) -delete
    
    # Clean up metadata files
    find "${BACKUP_DIR}" -name "*.meta" -mtime +$((BACKUP_RETENTION_MONTHS * 30)) -delete
    
    log "Old backup cleanup completed"
}

# =============================================================================
# Restoration Functions
# =============================================================================
restore_postgres() {
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
    fi
    
    log "Starting PostgreSQL restoration from: $backup_file"
    
    # Decompress backup if needed
    local temp_file
    if [[ "$backup_file" == *.gz ]]; then
        temp_file=$(mktemp)
        gunzip -c "$backup_file" > "$temp_file" || error "Failed to decompress backup file"
        backup_file="$temp_file"
    fi
    
    # Restore database
    PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h "$POSTGRES_HOST" \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        -f "$backup_file" || error "PostgreSQL restoration failed"
    
    # Clean up temp file
    if [ -n "${temp_file:-}" ]; then
        rm -f "$temp_file"
    fi
    
    log "PostgreSQL restoration completed successfully"
}

restore_redis() {
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
    fi
    
    log "Starting Redis restoration from: $backup_file"
    
    # Stop Redis
    docker stop "$(get_redis_container_name)" || error "Failed to stop Redis container"
    
    # Decompress backup if needed
    local temp_file
    if [[ "$backup_file" == *.gz ]]; then
        temp_file=$(mktemp)
        gunzip -c "$backup_file" > "$temp_file" || error "Failed to decompress backup file"
        backup_file="$temp_file"
    fi
    
    # Get Redis data directory
    local redis_data_dir
    redis_data_dir=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" config get dir | tail -1) || error "Failed to get Redis data directory"
    
    local rdb_file
    rdb_file=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" config get dbfilename | tail -1) || error "Failed to get Redis RDB filename"
    
    # Copy backup file to Redis data directory
    docker cp "$backup_file" "$(get_redis_container_name):${redis_data_dir}/${rdb_file}" || error "Failed to copy backup to Redis container"
    
    # Start Redis
    docker start "$(get_redis_container_name)" || error "Failed to start Redis container"
    
    # Clean up temp file
    if [ -n "${temp_file:-}" ]; then
        rm -f "$temp_file"
    fi
    
    log "Redis restoration completed successfully"
}

# =============================================================================
# Monitoring and Alerting Functions
# =============================================================================
check_backup_health() {
    log "Checking backup health..."
    
    local daily_backup_count
    daily_backup_count=$(find "${BACKUP_DIR}/postgres/daily" -name "*.gz" -mtime -1 | wc -l)
    
    if [ "$daily_backup_count" -eq 0 ]; then
        log "WARNING: No daily PostgreSQL backups found in the last 24 hours"
    fi
    
    local redis_daily_backup_count
    redis_daily_backup_count=$(find "${BACKUP_DIR}/redis/daily" -name "*.gz" -mtime -1 | wc -l)
    
    if [ "$redis_daily_backup_count" -eq 0 ]; then
        log "WARNING: No daily Redis backups found in the last 24 hours"
    fi
    
    # Check backup sizes
    local latest_postgres_backup
    latest_postgres_backup=$(find "${BACKUP_DIR}/postgres/daily" -name "*.gz" -mtime -1 -exec ls -la {} \; | sort -k6,7 -r | head -1 | awk '{print $5}')
    
    if [ -n "$latest_postgres_backup" ] && [ "$latest_postgres_backup" -lt 1024 ]; then
        log "WARNING: Latest PostgreSQL backup is suspiciously small: ${latest_postgres_backup} bytes"
    fi
    
    log "Backup health check completed"
}

send_backup_notification() {
    local status="$1"
    local message="$2"
    
    # This would integrate with your notification system (Slack, email, etc.)
    log "Backup notification: [$status] $message"
    
    # Example webhook integration (commented out):
    # if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    #     curl -X POST -H 'Content-type: application/json' \
    #         --data "{\"text\":\"Discord Bot Backup [$status]: $message\"}" \
    #         "$SLACK_WEBHOOK_URL"
    # fi
}

# =============================================================================
# Main Execution Functions
# =============================================================================
perform_backup() {
    log "Starting backup process for environment: $ENVIRONMENT"
    
    local backup_start_time
    backup_start_time=$(date +%s)
    
    # Perform backups
    backup_postgres
    backup_redis
    
    # Clean up old backups
    cleanup_old_backups
    
    # Check backup health
    check_backup_health
    
    local backup_end_time
    backup_end_time=$(date +%s)
    local backup_duration=$((backup_end_time - backup_start_time))
    
    log "Backup process completed successfully in ${backup_duration} seconds"
    send_backup_notification "SUCCESS" "Backup completed for $ENVIRONMENT environment in ${backup_duration} seconds"
}

setup_cron_jobs() {
    log "Setting up cron jobs for automated backups..."
    
    # Create cron file
    local cron_file="/etc/cron.d/discord-bot-backups"
    
    cat > "$cron_file" << EOF
# PostgreSQL backup
$POSTGRES_BACKUP_SCHEDULE $SCRIPT_DIR/backup-coolify-databases.sh postgres >> $LOG_FILE 2>&1

# Redis backup
$REDIS_BACKUP_SCHEDULE $SCRIPT_DIR/backup-coolify-databases.sh redis >> $LOG_FILE 2>&1

# Cleanup old backups
0 4 * * * $SCRIPT_DIR/backup-coolify-databases.sh cleanup >> $LOG_FILE 2>&1
EOF
    
    # Set proper permissions
    chmod 0644 "$cron_file"
    
    # Reload cron
    service cron reload || systemctl reload cron || crontab "$cron_file"
    
    log "Cron jobs setup completed"
}

# =============================================================================
# Main Execution
# =============================================================================
main() {
    local action="${1:-backup}"
    
    case "$action" in
        "backup")
            log "Starting backup process for environment: $ENVIRONMENT"
            setup_logging
            check_dependencies
            create_backup_directories
            perform_backup
            ;;
        "restore-postgres")
            setup_logging
            check_dependencies
            restore_postgres "$2"
            ;;
        "restore-redis")
            setup_logging
            check_dependencies
            restore_redis "$2"
            ;;
        "cleanup")
            setup_logging
            check_dependencies
            cleanup_old_backups
            ;;
        "setup-cron")
            setup_logging
            setup_cron_jobs
            ;;
        "health-check")
            setup_logging
            check_dependencies
            check_backup_health
            ;;
        *)
            echo "Usage: $0 {backup|restore-postgres|restore-redis|cleanup|setup-cron|health-check} [backup_file]"
            echo "  backup              - Perform full backup (default)"
            echo "  restore-postgres    - Restore PostgreSQL from backup file"
            echo "  restore-redis       - Restore Redis from backup file"
            echo "  cleanup             - Clean up old backups"
            echo "  setup-cron          - Setup cron jobs for automated backups"
            echo "  health-check        - Check backup health and send notifications"
            exit 1
            ;;
    esac
}

# =============================================================================
# Script Entry Point
# =============================================================================
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi