#!/bin/bash

# Coolify Monitoring Setup Script
# This script initializes monitoring stack for Discord Bot deployment in Coolify

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MONITORING_DIR="monitoring"
DASHBOARDS_DIR="monitoring/dashboards"
COOLIFY_ENVIRONMENT=${COOLIFY_ENVIRONMENT:-"staging"}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
    fi
    
    # Check if Coolify CLI is available
    if ! command -v coolify &> /dev/null; then
        warning "Coolify CLI not found. Some features may not work properly."
    fi
    
    # Check if required files exist
    if [[ ! -f "$PROJECT_ROOT/coolify.json" ]]; then
        error "coolify.json not found in project root."
    fi
    
    if [[ ! -f "$PROJECT_ROOT/monitoring/coolify-prometheus.yml" ]]; then
        error "monitoring/coolify-prometheus.yml not found."
    fi
    
    if [[ ! -f "$PROJECT_ROOT/monitoring/coolify-grafana.yml" ]]; then
        error "monitoring/coolify-grafana.yml not found."
    fi
    
    if [[ ! -f "$PROJECT_ROOT/monitoring/coolify-loki.yml" ]]; then
        error "monitoring/coolify-loki.yml not found."
    fi
    
    success "Prerequisites check passed."
}

# Create necessary directories
create_directories() {
    log "Creating necessary directories..."
    
    mkdir -p "$PROJECT_ROOT/$DASHBOARDS_DIR/discord-bot"
    mkdir -p "$PROJECT_ROOT/$DASHBOARDS_DIR/system"
    mkdir -p "$PROJECT_ROOT/$DASHBOARDS_DIR/database"
    mkdir -p "$PROJECT_ROOT/$DASHBOARDS_DIR/coolify"
    mkdir -p "$PROJECT_ROOT/$MONITORING_DIR/rules"
    mkdir -p "$PROJECT_ROOT/$MONITORING_DIR/alerts"
    
    success "Directories created."
}

# Setup Prometheus
setup_prometheus() {
    log "Setting up Prometheus..."
    
    # Copy Prometheus configuration
    cp "$PROJECT_ROOT/monitoring/coolify-prometheus.yml" "$PROJECT_ROOT/monitoring/prometheus.yml"
    
    # Create Prometheus rules directory and files
    cat > "$PROJECT_ROOT/monitoring/rules/discord_bot_rules.yml" << 'EOF'
groups:
  - name: discord_bot
    rules:
      # Calculate rate of Discord events
      - record: discord:events:rate_5m
        expr: rate(discord_events_total[5m])
      
      # Calculate error rate
      - record: discord:errors:rate_5m
        expr: rate(discord_errors_total[5m])
      
      # Calculate response time percentiles
      - record: discord:response_time:p95_5m
        expr: histogram_quantile(0.95, rate(discord_response_time_seconds_bucket[5m]))
      
      # Calculate memory usage per replica
      - record: discord:memory:per_replica
        expr: container_memory_usage_bytes{pod=~"discord-bot-.*"} / count(container_memory_usage_bytes{pod=~"discord-bot-.*"})
      
      # Calculate CPU usage per replica
      - record: discord:cpu:per_replica
        expr: rate(container_cpu_usage_seconds_total{pod=~"discord-bot-.*"}[5m]) / count(container_cpu_usage_seconds_total{pod=~"discord-bot-.*"})
EOF

    # Create alerting rules
    cat > "$PROJECT_ROOT/monitoring/alerts/discord_bot_alerts.yml" << 'EOF'
groups:
  - name: discord_bot_alerts
    rules:
      # Bot is down
      - alert: DiscordBotDown
        expr: up{job="discord-bot"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Discord Bot is down"
          description: "Discord Bot has been down for more than 1 minute"
      
      # High error rate
      - alert: DiscordBotHighErrorRate
        expr: discord:errors:rate_5m > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Discord Bot high error rate"
          description: "Discord Bot error rate is {{ $value }} errors per second"
      
      # High memory usage
      - alert: DiscordBotHighMemoryUsage
        expr: container_memory_usage_bytes{pod=~"discord-bot-.*"} / container_spec_memory_limit_bytes{pod=~"discord-bot-.*"} > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Discord Bot high memory usage"
          description: "Discord Bot memory usage is above 80%"
      
      # High CPU usage
      - alert: DiscordBotHighCPUUsage
        expr: rate(container_cpu_usage_seconds_total{pod=~"discord-bot-.*"}[5m]) > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Discord Bot high CPU usage"
          description: "Discord Bot CPU usage is above 80%"
      
      # Database connection issues
      - alert: DatabaseConnectionIssues
        expr: pg_stat_activity_count{datname=~"discord_bot.*"} > 80
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Database connection issues"
          description: "Database has {{ $value }} active connections"
      
      # Redis memory usage
      - alert: RedisHighMemoryUsage
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Redis high memory usage"
          description: "Redis memory usage is above 80%"
EOF

    success "Prometheus setup completed."
}

# Setup Grafana
setup_grafana() {
    log "Setting up Grafana..."
    
    # Copy Grafana configuration
    cp "$PROJECT_ROOT/monitoring/coolify-grafana.yml" "$PROJECT_ROOT/monitoring/grafana/grafana.yml"
    
    # Create Grafana provisioning directories
    mkdir -p "$PROJECT_ROOT/monitoring/grafana/provisioning/datasources"
    mkdir -p "$PROJECT_ROOT/monitoring/grafana/provisioning/dashboards"
    
    # Copy existing provisioning files
    if [[ -f "$PROJECT_ROOT/monitoring/grafana/provisioning/datasources.yml" ]]; then
        cp "$PROJECT_ROOT/monitoring/grafana/provisioning/datasources.yml" "$PROJECT_ROOT/monitoring/grafana/provisioning/datasources/coolify-datasources.yml"
    fi
    
    if [[ -f "$PROJECT_ROOT/monitoring/grafana/provisioning/dashboards.yml" ]]; then
        cp "$PROJECT_ROOT/monitoring/grafana/provisioning/dashboards.yml" "$PROJECT_ROOT/monitoring/grafana/provisioning/dashboards/coolify-dashboards.yml"
    fi
    
    success "Grafana setup completed."
}

# Setup Loki
setup_loki() {
    log "Setting up Loki..."
    
    # Copy Loki configuration
    cp "$PROJECT_ROOT/monitoring/coolify-loki.yml" "$PROJECT_ROOT/monitoring/loki.yml"
    
    # Create Promtail configuration for log collection
    cat > "$PROJECT_ROOT/monitoring/promtail.yml" << 'EOF'
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # Discord Bot logs
  - job_name: discord-bot
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
        port: 8080
    relabel_configs:
      - source_labels: [__meta_docker_container_label_com_docker_compose_service]
        action: keep
        regex: discord-bot
      - source_labels: [__meta_docker_container_name]
        target_label: container
      - source_labels: [__meta_docker_container_log_stream]
        target_label: stream
      - source_labels: [__meta_docker_container_label_com_docker_compose_project]
        target_label: project
    pipeline_stages:
      - json:
          expressions:
            level: level
            message: message
            timestamp: timestamp
            service: service
            component: component
            user_id: user_id
            guild_id: guild_id
            command: command
            error: error
      - labels:
          level:
          service:
          component:
      - timestamp:
          format: RFC3339Nano
          source: timestamp
      - regex:
          expression: '(?P<command>\w+)\s+executed by user\s+(?P<user_id>\d+)'
          source: message
      - regex:
          expression: 'Error in\s+(?P<component>\w+):\s+(?P<error>.+)'
          source: message

  # PostgreSQL logs
  - job_name: postgres
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
        port: 5432
    relabel_configs:
      - source_labels: [__meta_docker_container_label_com_docker_compose_service]
        action: keep
        regex: postgres
      - source_labels: [__meta_docker_container_name]
        target_label: container
    pipeline_stages:
      - regex:
          expression: '^(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+) \[(?P<pid>\d+)\] (?P<level>\w+):\s+(?P<message>.*)'
      - timestamp:
          format: '2006-01-02 15:04:05.999'
          source: timestamp
      - labels:
          level:
          pid:

  # Redis logs
  - job_name: redis
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
        port: 6379
    relabel_configs:
      - source_labels: [__meta_docker_container_label_com_docker_compose_service]
        action: keep
        regex: redis
      - source_labels: [__meta_docker_container_name]
        target_label: container
    pipeline_stages:
      - regex:
          expression: '^(?P<timestamp>\d+:\d+:\d+) (?P<pid>\d+) (?P<role>\S+) (?P<level>\w+) (?P<message>.*)'
      - labels:
          role:
          level:
          pid:

  # Nginx logs
  - job_name: nginx
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
        port: 80
    relabel_configs:
      - source_labels: [__meta_docker_container_label_com_docker_compose_service]
        action: keep
        regex: nginx
      - source_labels: [__meta_docker_container_name]
        target_label: container
    pipeline_stages:
      - regex:
          expression: '^(?P<remote_addr>\S+) - (?P<remote_user>\S+) \[(?P<time_local>[^\]]+)\] "(?P<method>\S+) (?P<path>\S+) (?P<protocol>\S+)" (?P<status>\d+) (?P<body_bytes_sent>\d+) "(?P<http_referer>[^"]*)" "(?P<http_user_agent>[^"]*)"'
      - labels:
          method:
          status:
      - timestamp:
          format: '02/Jan/2006:15:04:05 -0700'
          source: time_local
EOF

    success "Loki setup completed."
}

# Setup monitoring exporters
setup_exporters() {
    log "Setting up monitoring exporters..."
    
    # Create exporter configuration directory
    mkdir -p "$PROJECT_ROOT/monitoring/exporters"
    
    # Create Docker Compose file for exporters
    cat > "$PROJECT_ROOT/monitoring/exporters/docker-compose.yml" << 'EOF'
version: '3.8'

services:
  # PostgreSQL Exporter
  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:latest
    environment:
      DATA_SOURCE_NAME: "postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}?sslmode=disable"
    ports:
      - "9187:9187"
    depends_on:
      - postgres
    networks:
      - monitoring

  # Redis Exporter
  redis-exporter:
    image: oliver006/redis_exporter:latest
    environment:
      REDIS_ADDR: "redis://redis:6379"
      REDIS_PASSWORD: ${REDIS_PASSWORD}
    ports:
      - "9121:9121"
    depends_on:
      - redis
    networks:
      - monitoring

  # Node Exporter
  node-exporter:
    image: prom/node-exporter:latest
    command:
      - '--path.rootfs=/host'
    ports:
      - "9100:9100"
    volumes:
      - '/:/host:ro,rslave'
    networks:
      - monitoring

  # cAdvisor
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    command:
      - '--port=8080'
      - '--docker_only=true'
      - '--storage_duration=2m'
    ports:
      - "8080:8080"
    volumes:
      - '/:/rootfs:ro'
      - '/var/run:/var/run:ro'
      - '/sys:/sys:ro'
      - '/var/lib/docker/:/var/lib/docker:ro'
      - '/dev/disk/:/dev/disk:ro'
    privileged: true
    networks:
      - monitoring

  # Nginx Exporter
  nginx-exporter:
    image: nginx/nginx-prometheus-exporter:latest
    command:
      - '-nginx.scrape-uri=http://nginx:80/metrics'
    ports:
      - "9113:9113"
    depends_on:
      - nginx
    networks:
      - monitoring

networks:
  monitoring:
    driver: bridge
EOF

    success "Exporters setup completed."
}

# Create health check script
create_health_check() {
    log "Creating health check script..."
    
    cat > "$PROJECT_ROOT/scripts/monitoring-health-check.sh" << 'EOF'
#!/bin/bash

# Monitoring Health Check Script
# Checks the health of all monitoring components

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROMETHEUS_URL="http://localhost:9090"
GRAFANA_URL="http://localhost:3000"
LOKI_URL="http://localhost:3100"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

# Check Prometheus health
check_prometheus() {
    log "Checking Prometheus health..."
    
    if curl -s "$PROMETHEUS_URL/-/healthy" > /dev/null; then
        success "Prometheus is healthy"
    else
        error "Prometheus is not healthy"
        return 1
    fi
}

# Check Grafana health
check_grafana() {
    log "Checking Grafana health..."
    
    if curl -s "$GRAFANA_URL/api/health" > /dev/null; then
        success "Grafana is healthy"
    else
        error "Grafana is not healthy"
        return 1
    fi
}

# Check Loki health
check_loki() {
    log "Checking Loki health..."
    
    if curl -s "$LOKI_URL/ready" > /dev/null; then
        success "Loki is healthy"
    else
        error "Loki is not healthy"
        return 1
    fi
}

# Check exporters
check_exporters() {
    log "Checking exporters..."
    
    local exporters=("postgres-exporter:9187" "redis-exporter:9121" "node-exporter:9100" "cadvisor:8080" "nginx-exporter:9113")
    
    for exporter in "${exporters[@]}"; do
        if curl -s "http://localhost:${exporter#*:}/metrics" > /dev/null; then
            success "$exporter is healthy"
        else
            warning "$exporter is not responding"
        fi
    done
}

# Main health check
main() {
    log "Starting monitoring health check..."
    
    local failed=0
    
    check_prometheus || failed=1
    check_grafana || failed=1
    check_loki || failed=1
    check_exporters
    
    if [[ $failed -eq 0 ]]; then
        success "All monitoring components are healthy"
    else
        error "Some monitoring components are not healthy"
        exit 1
    fi
}

main "$@"
EOF

    chmod +x "$PROJECT_ROOT/scripts/monitoring-health-check.sh"
    
    success "Health check script created."
}

# Deploy to Coolify
deploy_to_coolify() {
    log "Deploying monitoring stack to Coolify..."
    
    # Check if Coolify CLI is available
    if command -v coolify &> /dev/null; then
        # Deploy monitoring services
        coolify deploy --service prometheus --environment "$COOLIFY_ENVIRONMENT"
        coolify deploy --service grafana --environment "$COOLIFY_ENVIRONMENT"
        coolify deploy --service loki --environment "$COOLIFY_ENVIRONMENT"
        
        # Deploy exporters
        coolify deploy --service postgres-exporter --environment "$COOLIFY_ENVIRONMENT"
        coolify deploy --service redis-exporter --environment "$COOLIFY_ENVIRONMENT"
        coolify deploy --service node-exporter --environment "$COOLIFY_ENVIRONMENT"
        coolify deploy --service cadvisor --environment "$COOLIFY_ENVIRONMENT"
        coolify deploy --service nginx-exporter --environment "$COOLIFY_ENVIRONMENT"
        
        success "Monitoring stack deployed to Coolify"
    else
        warning "Coolify CLI not found. Please deploy manually using the Coolify web interface."
    fi
}

# Main function
main() {
    log "Starting Coolify monitoring setup..."
    
    check_prerequisites
    create_directories
    setup_prometheus
    setup_grafana
    setup_loki
    setup_exporters
    create_health_check
    deploy_to_coolify
    
    success "Coolify monitoring setup completed successfully!"
    
    log "Next steps:"
    log "1. Configure environment variables in coolify-secrets.env"
    log "2. Deploy the monitoring stack using Coolify"
    log "3. Import dashboards to Grafana"
    log "4. Configure alert notifications"
    log "5. Run health check: ./scripts/monitoring-health-check.sh"
}

# Run main function
main "$@"