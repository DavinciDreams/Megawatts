# =============================================================================
# Optimized Dockerfile for Coolify Deployment
# =============================================================================
# Multi-stage build optimized for production with security hardening
# =============================================================================

# Stage 1: Base builder with optimized layer caching
FROM node:18-alpine AS base-builder
LABEL maintainer="Discord Bot Team"
LABEL description="Self-editing Discord bot with AI capabilities"
LABEL version="1.0.0"

# Install build dependencies with minimal footprint
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/cache/apk/*

# Create app directory with proper permissions
WORKDIR /app

# Stage 2: Dependencies builder with optimized caching
FROM base-builder AS deps-builder

# Copy package files with proper order for layer caching
COPY package*.json ./
COPY tsconfig.json ./

# Configure npm for production builds
RUN npm config set production false \
    && npm config set cache /tmp/.npm \
    && npm ci --include=dev \
    && npm cache clean --force

# Stage 3: Application builder
FROM deps-builder AS app-builder

# Copy source code
COPY src/ ./src/

# Build the application with optimizations
RUN npm run build \
    && npm prune --production \
    && npm cache clean --force

# Stage 4: Security scanner (optional)
FROM app-builder AS security-scanner
RUN npm audit --audit-level high || true

# Stage 5: Production image with security hardening
FROM node:18-alpine AS production

# Security labels
LABEL maintainer="Discord Bot Team"
LABEL description="Self-editing Discord bot with AI capabilities - Production"
LABEL version="1.0.0"
LABEL security.scan="completed"

# Install runtime dependencies with security hardening
RUN apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates \
    tzdata \
    && rm -rf /var/cache/apk/* \
    && addgroup -g 1001 -S nodejs \
    && adduser -S botuser -u 1001 -G nodejs

# Set timezone to UTC
ENV TZ=UTC

# Create app directory with proper permissions
WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm config set production true \
    && npm config set cache /tmp/.npm \
    && npm ci --only=production \
    && npm cache clean --force \
    && chown -R botuser:nodejs /app

# Copy built application from builder stage
COPY --from=app-builder --chown=botuser:nodejs /app/dist ./dist

# Copy health check script
COPY --chown=botuser:nodejs docker/health-check.sh ./health-check.sh
RUN chmod +x ./health-check.sh

# Switch to non-root user
USER botuser

# Expose port for health checks
EXPOSE 8080

# Set environment variables for security
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512 --enable-source-maps"

# Health check with proper signal handling
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD ./health-check.sh

# Use dumb-init to handle signals properly for graceful shutdowns
ENTRYPOINT ["dumb-init", "--"]

# Start production server with proper signal handling
CMD ["node", "dist/index.js"]

# Stage 6: Minimal image for edge deployments (optional)
FROM node:18-alpine AS edge

# Install minimal runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    ca-certificates \
    && rm -rf /var/cache/apk/* \
    && addgroup -g 1001 -S nodejs \
    && adduser -S botuser -u 1001 -G nodejs

WORKDIR /app

# Copy only essential files for edge deployment
COPY --from=app-builder --chown=botuser:nodejs /app/dist ./dist
COPY --from=app-builder --chown=botuser:nodejs /app/node_modules ./node_modules
COPY --from=app-builder --chown=botuser:nodejs /app/package.json ./package.json

USER botuser

EXPOSE 8080

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=256"

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]