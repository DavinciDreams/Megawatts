#!/bin/bash

# =============================================================================
# Multi-Architecture Docker Image Build Script for Coolify Deployment
# =============================================================================
# This script builds and pushes multi-architecture Docker images for the Discord bot
# optimized for Coolify's infrastructure and deployment pipeline
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration Variables
# =============================================================================

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/docker"

# Build configuration
REGISTRY_URL="${REGISTRY_URL:-ghcr.io/your-org}"
IMAGE_NAME="${IMAGE_NAME:-discord-bot}"
DOCKERFILE="${DOCKERFILE:-docker/coolify.Dockerfile}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"

# Version and tagging
VERSION="${VERSION:-$(node -p "require('$PROJECT_ROOT/package.json').version")}"
COMMIT_SHA="${COMMIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')}"
BUILD_DATE="${BUILD_DATE:-$(date -u +'%Y-%m-%dT%H:%M:%SZ')}"
BUILD_NUMBER="${BUILD_NUMBER:-${BUILDKITE_BUILD_NUMBER:-${GITHUB_RUN_NUMBER:-0}}}"

# Multi-architecture support
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64,linux/arm/v7}"
BUILDER_NAME="${BUILDER_NAME:-discord-bot-builder}"
BUILDER_DRIVER="${BUILDER_DRIVER:-docker-container}"

# Environment and deployment
ENVIRONMENT="${ENVIRONMENT:-staging}"
COOLIFY_ENVIRONMENT="${COOLIFY_ENVIRONMENT:-$ENVIRONMENT}"
COOLIFY_SERVICE_NAME="${COOLIFY_SERVICE_NAME:-discord-bot}"

# Registry authentication
REGISTRY_USERNAME="${REGISTRY_USERNAME:-}"
REGISTRY_PASSWORD="${REGISTRY_PASSWORD:-}"
REGISTRY_TOKEN="${REGISTRY_TOKEN:-$GITHUB_TOKEN}"

# Build optimization
BUILDKIT_INLINE_CACHE="${BUILDKIT_INLINE_CACHE:-1}"
BUILDKIT_MULTI_PLATFORM="${BUILDKIT_MULTI_PLATFORM:-1}"
CACHE_FROM="${CACHE_FROM:-type=gha}"
CACHE_TO="${CACHE_TO:-type=gha,mode=max}"
NO_CACHE="${NO_CACHE:-false}"

# Push configuration
PUSH_IMAGES="${PUSH_IMAGES:-true}"
PUSH_LATEST="${PUSH_LATEST:-false}"
PUSH_ENVIRONMENT_TAG="${PUSH_ENVIRONMENT_TAG:-true}"

# Security and scanning
SECURITY_SCAN="${SECURITY_SCAN:-true}"
SECURITY_SCAN_TIMEOUT="${SECURITY_SCAN_TIMEOUT:-300}"
VULNERABILITY_THRESHOLD="${VULNERABILITY_THRESHOLD:-medium}"

# Logging and output
LOG_LEVEL="${LOG_LEVEL:-info}"
VERBOSE="${VERBOSE:-false}"
DRY_RUN="${DRY_RUN:-false}"

# =============================================================================
# Color and Formatting
# =============================================================================

if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    PURPLE='\033[0;35m'
    CYAN='\033[0;36m'
    WHITE='\033[1;37m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    PURPLE=''
    CYAN=''
    WHITE=''
    NC=''
fi

# =============================================================================
# Logging Functions
# =============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date -u +'%Y-%m-%d %H:%M:%S UTC')
    
    case "$level" in
        "ERROR")
            echo -e "${RED}[ERROR]${NC} [$timestamp] $message" >&2
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} [$timestamp] $message" >&2
            ;;
        "INFO")
            echo -e "${GREEN}[INFO]${NC} [$timestamp] $message"
            ;;
        "DEBUG")
            if [[ "$VERBOSE" == "true" ]]; then
                echo -e "${BLUE}[DEBUG]${NC} [$timestamp] $message"
            fi
            ;;
        *)
            echo -e "${WHITE}[LOG]${NC} [$timestamp] $message"
            ;;
    esac
}

error() {
    log "ERROR" "$@"
    exit 1
}

warn() {
    log "WARN" "$@"
}

info() {
    log "INFO" "$@"
}

debug() {
    log "DEBUG" "$@"
}

# =============================================================================
# Utility Functions
# =============================================================================

check_dependencies() {
    debug "Checking dependencies..."
    
    local missing_deps=()
    
    if ! command -v docker >/dev/null 2>&1; then
        missing_deps+=("docker")
    fi
    
    if ! command -v jq >/dev/null 2>&1; then
        missing_deps+=("jq")
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        error "Missing required dependencies: ${missing_deps[*]}"
    fi
    
    debug "All dependencies are available"
}

validate_environment() {
    debug "Validating environment..."
    
    # Check if we're in a git repository
    if [[ ! -d "$PROJECT_ROOT/.git" ]] && [[ "$COMMIT_SHA" == "unknown" ]]; then
        warn "Not in a git repository, using unknown commit SHA"
    fi
    
    # Validate required files
    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        error "package.json not found in project root"
    fi
    
    if [[ ! -f "$PROJECT_ROOT/$DOCKERFILE" ]]; then
        error "Dockerfile not found at $DOCKERFILE"
    fi
    
    # Validate registry URL
    if [[ -z "$REGISTRY_URL" ]]; then
        error "REGISTRY_URL is required"
    fi
    
    debug "Environment validation passed"
}

setup_builder() {
    info "Setting up Docker builder for multi-architecture builds..."
    
    # Check if builder exists
    if ! docker buildx ls | grep -q "$BUILDER_NAME"; then
        info "Creating new builder: $BUILDER_NAME"
        docker buildx create \
            --name "$BUILDER_NAME" \
            --driver "$BUILDER_DRIVER" \
            --bootstrap \
            --use
    else
        info "Using existing builder: $BUILDER_NAME"
        docker buildx use "$BUILDER_NAME"
    fi
    
    # Inspect builder
    if [[ "$VERBOSE" == "true" ]]; then
        debug "Builder configuration:"
        docker buildx inspect "$BUILDER_NAME"
    fi
}

authenticate_registry() {
    info "Authenticating with registry: $REGISTRY_URL"
    
    if [[ -n "$REGISTRY_TOKEN" ]]; then
        debug "Using token authentication"
        echo "$REGISTRY_TOKEN" | docker login "$REGISTRY_URL" --username "$REGISTRY_USERNAME" --password-stdin
    elif [[ -n "$REGISTRY_PASSWORD" ]]; then
        debug "Using password authentication"
        echo "$REGISTRY_PASSWORD" | docker login "$REGISTRY_URL" --username "$REGISTRY_USERNAME" --password-stdin
    else
        warn "No registry credentials provided, assuming public registry or already authenticated"
    fi
}

generate_build_args() {
    local build_args=(
        "--build-arg" "BUILDKIT_INLINE_CACHE=$BUILDKIT_INLINE_CACHE"
        "--build-arg" "BUILDKIT_MULTI_PLATFORM=$BUILDKIT_MULTI_PLATFORM"
        "--build-arg" "VERSION=$VERSION"
        "--build-arg" "COMMIT_SHA=$COMMIT_SHA"
        "--build-arg" "BUILD_DATE=$BUILD_DATE"
        "--build-arg" "BUILD_NUMBER=$BUILD_NUMBER"
        "--build-arg" "ENVIRONMENT=$ENVIRONMENT"
        "--build-arg" "COOLIFY_ENVIRONMENT=$COOLIFY_ENVIRONMENT"
        "--build-arg" "COOLIFY_SERVICE_NAME=$COOLIFY_SERVICE_NAME"
    )
    
    printf '%s\n' "${build_args[@]}"
}

generate_labels() {
    local labels=(
        "--label" "org.opencontainers.image.title=$IMAGE_NAME"
        "--label" "org.opencontainers.image.description=Self-editing Discord bot with AI capabilities"
        "--label" "org.opencontainers.image.version=$VERSION"
        "--label" "org.opencontainers.image.created=$BUILD_DATE"
        "--label" "org.opencontainers.image.revision=$COMMIT_SHA"
        "--label" "org.opencontainers.image.source=https://github.com/your-org/discord-bot"
        "--label" "org.opencontainers.image.url=https://github.com/your-org/discord-bot"
        "--label" "org.opencontainers.image.documentation=https://github.com/your-org/discord-bot/blob/main/README.md"
        "--label" "org.opencontainers.image.licenses=MIT"
        "--label" "org.opencontainers.image.vendor=Discord Bot Development Team"
        "--label" "coolify.service.name=$COOLIFY_SERVICE_NAME"
        "--label" "coolify.service.environment=$COOLIFY_ENVIRONMENT"
        "--label" "coolify.service.version=$VERSION"
        "--label" "coolify.build.number=$BUILD_NUMBER"
        "--label" "coolify.build.date=$BUILD_DATE"
        "--label" "coolify.build.commit=$COMMIT_SHA"
    )
    
    printf '%s\n' "${labels[@]}"
}

build_image() {
    local tag="$1"
    local target="$2"
    
    info "Building image: $tag (target: $target)"
    
    local build_cmd=(
        "buildx" "build"
        "--platform" "$PLATFORMS"
        "--target" "$target"
        "--file" "$DOCKERFILE"
        "--tag" "$tag"
    )
    
    # Add cache configuration
    if [[ "$NO_CACHE" != "true" ]]; then
        build_cmd+=("--cache-from" "$CACHE_FROM")
        build_cmd+=("--cache-to" "$CACHE_TO")
    fi
    
    # Add build arguments
    while IFS= read -r arg; do
        build_cmd+=("$arg")
    done < <(generate_build_args)
    
    # Add labels
    while IFS= read -r label; do
        build_cmd+=("$label")
    done < <(generate_labels)
    
    # Add push flag if enabled
    if [[ "$PUSH_IMAGES" == "true" ]]; then
        build_cmd+=("--push")
    else
        build_cmd+=("--load")
    fi
    
    # Add context
    build_cmd+=("$BUILD_CONTEXT")
    
    if [[ "$DRY_RUN" == "true" ]]; then
        info "DRY RUN: Would execute: docker ${build_cmd[*]}"
        return 0
    fi
    
    debug "Executing build command: docker ${build_cmd[*]}"
    docker "${build_cmd[@]}"
}

scan_image() {
    local image_tag="$1"
    
    if [[ "$SECURITY_SCAN" != "true" ]]; then
        info "Security scanning disabled, skipping"
        return 0
    fi
    
    info "Scanning image for vulnerabilities: $image_tag"
    
    # Check if trivy is available
    if ! command -v trivy >/dev/null 2>&1; then
        warn "Trivy not found, skipping security scan"
        return 0
    fi
    
    local scan_cmd=(
        "trivy" "image"
        "--format" "json"
        "--output" "trivy-report-$VERSION.json"
        "--timeout" "$SECURITY_SCAN_TIMEOUT"
        "--exit-code" "0"
        "$image_tag"
    )
    
    if [[ "$DRY_RUN" == "true" ]]; then
        info "DRY RUN: Would execute: ${scan_cmd[*]}"
        return 0
    fi
    
    debug "Executing security scan: ${scan_cmd[*]}"
    "${scan_cmd[@]}"
    
    # Check for critical vulnerabilities
    local critical_count
    critical_count=$(jq -r '.Results[]?.Vulnerabilities[]? | select(.Severity == "CRITICAL") | .VulnerabilityID' "trivy-report-$VERSION.json" | wc -l || echo "0")
    
    if [[ "$critical_count" -gt 0 ]]; then
        error "Found $critical_count critical vulnerabilities"
    fi
    
    local high_count
    high_count=$(jq -r '.Results[]?.Vulnerabilities[]? | select(.Severity == "HIGH") | .VulnerabilityID' "trivy-report-$VERSION.json" | wc -l || echo "0")
    
    if [[ "$high_count" -gt 0 ]]; then
        warn "Found $high_count high vulnerabilities"
    fi
    
    info "Security scan completed"
}

generate_sbom() {
    local image_tag="$1"
    
    info "Generating SBOM for image: $image_tag"
    
    # Check if syft is available
    if ! command -v syft >/dev/null 2>&1; then
        warn "Syft not found, skipping SBOM generation"
        return 0
    fi
    
    local sbom_cmd=(
        "syft" "$image_tag"
        "--output" "spdx-json"
        "--file" "sbom-$VERSION.json"
    )
    
    if [[ "$DRY_RUN" == "true" ]]; then
        info "DRY RUN: Would execute: ${sbom_cmd[*]}"
        return 0
    fi
    
    debug "Executing SBOM generation: ${sbom_cmd[*]}"
    "${sbom_cmd[@]}"
    
    info "SBOM generated: sbom-$VERSION.json"
}

# =============================================================================
# Main Build Function
# =============================================================================

main() {
    info "Starting multi-architecture Docker image build for Coolify"
    info "Project: $IMAGE_NAME"
    info "Version: $VERSION"
    info "Commit: $COMMIT_SHA"
    info "Environment: $ENVIRONMENT"
    info "Platforms: $PLATFORMS"
    
    # Validate environment and dependencies
    validate_environment
    check_dependencies
    
    # Setup builder
    setup_builder
    
    # Authenticate with registry
    if [[ "$PUSH_IMAGES" == "true" ]]; then
        authenticate_registry
    fi
    
    # Generate image tags
    local base_image="$REGISTRY_URL/$IMAGE_NAME"
    local version_tag="$base_image:$VERSION"
    local commit_tag="$base_image:$COMMIT_SHA"
    local environment_tag="$base_image:$ENVIRONMENT"
    local latest_tag="$base_image:latest"
    
    # Build production image
    info "Building production image..."
    build_image "$version_tag" "production"
    
    # Build additional tags
    if [[ "$PUSH_IMAGES" == "true" ]]; then
        info "Tagging additional image variants..."
        
        # Tag with commit SHA
        docker buildx imagetools create "$version_tag" --tag "$commit_tag"
        
        # Tag with environment
        if [[ "$PUSH_ENVIRONMENT_TAG" == "true" ]]; then
            docker buildx imagetools create "$version_tag" --tag "$environment_tag"
        fi
        
        # Tag as latest for production
        if [[ "$ENVIRONMENT" == "production" ]] && [[ "$PUSH_LATEST" == "true" ]]; then
            docker buildx imagetools create "$version_tag" --tag "$latest_tag"
        fi
    fi
    
    # Security scanning
    if [[ "$PUSH_IMAGES" == "true" ]]; then
        scan_image "$version_tag"
        generate_sbom "$version_tag"
    fi
    
    # Build edge image for edge deployments
    info "Building edge image..."
    local edge_tag="$base_image:edge-$VERSION"
    build_image "$edge_tag" "edge"
    
    # Security scanning for edge image
    if [[ "$PUSH_IMAGES" == "true" ]]; then
        scan_image "$edge_tag"
        generate_sbom "$edge_tag"
    fi
    
    info "Build process completed successfully"
    
    # Output summary
    echo
    echo -e "${CYAN}Build Summary:${NC}"
    echo -e "  ${WHITE}Image:${NC} $base_image"
    echo -e "  ${WHITE}Version:${NC} $version_tag"
    echo -e "  ${WHITE}Commit:${NC} $commit_tag"
    echo -e "  ${WHITE}Environment:${NC} $environment_tag"
    echo -e "  ${WHITE}Edge:${NC} $edge_tag"
    if [[ "$ENVIRONMENT" == "production" ]] && [[ "$PUSH_LATEST" == "true" ]]; then
        echo -e "  ${WHITE}Latest:${NC} $latest_tag"
    fi
    echo
}

# =============================================================================
# Script Entry Point
# =============================================================================

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --registry)
            REGISTRY_URL="$2"
            shift 2
            ;;
        --image-name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --platforms)
            PLATFORMS="$2"
            shift 2
            ;;
        --no-push)
            PUSH_IMAGES="false"
            shift
            ;;
        --no-cache)
            NO_CACHE="true"
            shift
            ;;
        --push-latest)
            PUSH_LATEST="true"
            shift
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --verbose)
            VERBOSE="true"
            shift
            ;;
        --security-scan)
            SECURITY_SCAN="true"
            shift
            ;;
        --no-security-scan)
            SECURITY_SCAN="false"
            shift
            ;;
        --help|-h)
            cat << EOF
Multi-Architecture Docker Image Build Script for Coolify

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --registry URL          Container registry URL (default: ghcr.io/your-org)
    --image-name NAME       Image name (default: discord-bot)
    --version VERSION       Image version (default: from package.json)
    --environment ENV       Target environment (default: staging)
    --platforms PLATFORMS   Target platforms (default: linux/amd64,linux/arm64,linux/arm/v7)
    --no-push              Skip pushing images to registry
    --no-cache             Disable build cache
    --push-latest          Tag as latest (only for production)
    --dry-run              Show commands without executing
    --verbose              Enable verbose output
    --security-scan        Enable security scanning
    --no-security-scan     Disable security scanning
    --help, -h             Show this help message

ENVIRONMENT VARIABLES:
    REGISTRY_URL           Container registry URL
    IMAGE_NAME            Image name
    VERSION               Image version
    ENVIRONMENT           Target environment
    PLATFORMS             Target platforms
    PUSH_IMAGES           Whether to push images
    NO_CACHE              Whether to disable cache
    PUSH_LATEST           Whether to tag as latest
    VERBOSE               Whether to enable verbose output
    SECURITY_SCAN         Whether to enable security scanning
    DRY_RUN               Whether to run in dry-run mode

EXAMPLES:
    # Build and push staging images
    $0 --environment staging --push-latest

    # Build production images with security scanning
    $0 --environment production --security-scan --push-latest

    # Build locally without pushing
    $0 --no-push --verbose

    # Dry run to see what would be executed
    $0 --dry-run --verbose

EOF
            exit 0
            ;;
        *)
            error "Unknown option: $1. Use --help for usage information."
            ;;
    esac
done

# Run main function
main "$@"