/**
 * Marketplace Models
 * 
 * Database models and TypeScript interfaces for the plugin marketplace system.
 * Defines the data structures for plugins, reviews, downloads, analytics, tags, and versions.
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Plugin categories for organization and discovery
 */
export enum PluginCategory {
  CORE = 'core',
  AI = 'ai',
  MODERATION = 'moderation',
  UTILITY = 'utility',
  FUN = 'fun',
  INTEGRATION = 'integration',
  CUSTOM = 'custom',
  AUTOMATION = 'automation',
  ADMIN = 'admin',
  DEVELOPER = 'developer'
}

/**
 * Plugin status in the marketplace
 */
export enum PluginStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
  DEPRECATED = 'deprecated',
  REMOVED = 'removed'
}

/**
 * Plugin license types
 */
export enum PluginLicense {
  MIT = 'MIT',
  APACHE_2_0 = 'Apache-2.0',
  GPL_3_0 = 'GPL-3.0',
  BSD_3 = 'BSD-3',
  ISC = 'ISC',
  MPL_2_0 = 'MPL-2.0',
  CUSTOM = 'custom',
  PROPRIETARY = 'proprietary'
}

/**
 * Plugin rating levels
 */
export enum PluginRating {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  AVERAGE = 'average',
  POOR = 'poor',
  TERRIBLE = 'terrible'
}

/**
 * Review status
 */
export enum ReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  FLAGGED = 'flagged'
}

/**
 * Validation status for plugins
 */
export enum ValidationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  PASSED = 'passed',
  FAILED = 'failed',
  WARNING = 'warning'
}

/**
 * Validation check types
 */
export enum ValidationCheckType {
  SECURITY = 'security',
  FUNCTIONALITY = 'functionality',
  PERFORMANCE = 'performance',
  DEPENDENCIES = 'dependencies',
  CODE_QUALITY = 'code_quality',
  DOCUMENTATION = 'documentation'
}

/**
 * Validation severity levels
 */
export enum ValidationSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info'
}

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Marketplace plugin entity
 */
export interface MarketplacePlugin {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription?: string;
  version: string;
  author: string;
  authorId: string;
  email?: string;
  website?: string;
  repository?: string;
  documentation?: string;
  category: PluginCategory;
  status: PluginStatus;
  license: PluginLicense;
  licenseUrl?: string;
  tags: string[];
  keywords: string[];
  icon?: string;
  banner?: string;
  screenshots: string[];
  dependencies: PluginDependency[];
  permissions: string[];
  config: PluginConfigSchema;
  validation: PluginValidation;
  rating: PluginRatingSummary;
  statistics: PluginStatistics;
  metadata: PluginMetadata;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  lastValidatedAt?: Date;
}

/**
 * Plugin dependency
 */
export interface PluginDependency {
  name: string;
  version: string;
  required: boolean;
}

/**
 * Plugin configuration schema
 */
export interface PluginConfigSchema {
  properties: Record<string, ConfigProperty>;
  required: string[];
}

/**
 * Configuration property definition
 */
export interface ConfigProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  default?: any;
  required?: boolean;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
}

/**
 * Plugin validation information
 */
export interface PluginValidation {
  status: ValidationStatus;
  checks: ValidationCheck[];
  overallScore: number;
  lastRunAt?: Date;
  nextReviewAt?: Date;
}

/**
 * Validation check result
 */
export interface ValidationCheck {
  id: string;
  type: ValidationCheckType;
  name: string;
  description: string;
  severity: ValidationSeverity;
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  message?: string;
  details?: Record<string, any>;
  checkedAt: Date;
}

/**
 * Plugin rating summary
 */
export interface PluginRatingSummary {
  average: number;
  count: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

/**
 * Plugin statistics
 */
export interface PluginStatistics {
  downloads: number;
  installs: number;
  activeInstalls: number;
  views: number;
  forks?: number;
  stars?: number;
  lastUpdated?: Date;
}

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  minBotVersion?: string;
  maxBotVersion?: string;
  platform?: string;
  size?: number;
  featured?: boolean;
  verified?: boolean;
  official?: boolean;
  beta?: boolean;
  deprecated?: boolean;
  deprecationMessage?: string;
  replacementPluginId?: string;
  sourceCodeUrl?: string;
  issueTrackerUrl?: string;
  changelogUrl?: string;
}

/**
 * Plugin review
 */
export interface PluginReview {
  id: string;
  pluginId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  title: string;
  content: string;
  status: ReviewStatus;
  helpfulCount: number;
  notHelpfulCount: number;
  reply?: ReviewReply;
  metadata: ReviewMetadata;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Review reply from plugin author
 */
export interface ReviewReply {
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Date;
}

/**
 * Review metadata
 */
export interface ReviewMetadata {
  version: string;
  guildId?: string;
  verifiedPurchase: boolean;
  edited: boolean;
}

/**
 * Plugin download record
 */
export interface PluginDownload {
  id: string;
  pluginId: string;
  pluginVersion: string;
  userId?: string;
  guildId?: string;
  ipAddress?: string;
  userAgent?: string;
  source: 'marketplace' | 'direct' | 'api' | 'cli';
  status: 'success' | 'failed' | 'cancelled';
  error?: string;
  downloadedAt: Date;
  completedAt?: Date;
}

/**
 * Plugin analytics data
 */
export interface PluginAnalytics {
  id: string;
  pluginId: string;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  timestamp: Date;
  metrics: AnalyticsMetrics;
  engagement: EngagementMetrics;
  performance: PerformanceMetrics;
}

/**
 * Analytics metrics
 */
export interface AnalyticsMetrics {
  views: number;
  uniqueViews: number;
  downloads: number;
  uniqueDownloads: number;
  installs: number;
  uninstalls: number;
  activeInstalls: number;
  ratingCount: number;
  averageRating: number;
  reviewCount: number;
}

/**
 * Engagement metrics
 */
export interface EngagementMetrics {
  avgSessionDuration: number;
  bounceRate: number;
  clickThroughRate: number;
  conversionRate: number;
  retentionRate: number;
  shares: number;
  bookmarks: number;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  avgLoadTime: number;
  avgExecutionTime: number;
  errorRate: number;
  crashRate: number;
  resourceUsage: {
    memory: number;
    cpu: number;
  };
}

/**
 * Plugin tag
 */
export interface PluginTag {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category?: string;
  color?: string;
  icon?: string;
  usageCount: number;
  createdAt: Date;
}

/**
 * Plugin version
 */
export interface PluginVersion {
  id: string;
  pluginId: string;
  version: string;
  changelog: string;
  downloadUrl: string;
  size: number;
  checksum: string;
  minBotVersion?: string;
  maxBotVersion?: string;
  isStable: boolean;
  isDeprecated: boolean;
  downloadCount: number;
  publishedAt: Date;
  createdAt: Date;
}

// ============================================================================
// REPOSITORY TYPES
// ============================================================================

/**
 * Plugin search options
 */
export interface PluginSearchOptions {
  query?: string;
  category?: PluginCategory;
  tags?: string[];
  author?: string;
  license?: PluginLicense;
  status?: PluginStatus;
  minRating?: number;
  maxRating?: number;
  featured?: boolean;
  verified?: boolean;
  official?: boolean;
  beta?: boolean;
}

/**
 * Plugin sort options
 */
export interface PluginSortOptions {
  field: 'name' | 'rating' | 'downloads' | 'installs' | 'views' | 'createdAt' | 'updatedAt' | 'publishedAt';
  direction: 'ASC' | 'DESC';
}

/**
 * Plugin filter options
 */
export interface PluginFilterOptions {
  page?: number;
  pageSize?: number;
  search?: PluginSearchOptions;
  sort?: PluginSortOptions;
}

/**
 * Plugin submission data
 */
export interface PluginSubmission {
  name: string;
  description: string;
  longDescription?: string;
  category: PluginCategory;
  license: PluginLicense;
  tags: string[];
  keywords: string[];
  icon?: string;
  banner?: string;
  screenshots: string[];
  dependencies: PluginDependency[];
  permissions: string[];
  config: PluginConfigSchema;
  documentation?: string;
  repository?: string;
  website?: string;
  sourceCodeUrl?: string;
  issueTrackerUrl?: string;
}

/**
 * Plugin update data
 */
export interface PluginUpdate {
  description?: string;
  longDescription?: string;
  category?: PluginCategory;
  license?: PluginLicense;
  tags?: string[];
  keywords?: string[];
  icon?: string;
  banner?: string;
  screenshots?: string[];
  dependencies?: PluginDependency[];
  permissions?: string[];
  config?: PluginConfigSchema;
  documentation?: string;
  repository?: string;
  website?: string;
  sourceCodeUrl?: string;
  issueTrackerUrl?: string;
}

/**
 * Plugin approval data
 */
export interface PluginApproval {
  approved: boolean;
  reviewerId: string;
  notes?: string;
  conditions?: string[];
}

/**
 * Plugin review data
 */
export interface PluginReviewData {
  rating: number;
  title: string;
  content: string;
}

/**
 * Plugin recommendation result
 */
export interface PluginRecommendation {
  pluginId: string;
  plugin: MarketplacePlugin;
  score: number;
  reason: string;
  category?: string;
}

/**
 * Trending plugin data
 */
export interface TrendingPlugin {
  pluginId: string;
  plugin: MarketplacePlugin;
  trendScore: number;
  period: 'day' | 'week' | 'month';
  changePercentage: number;
}

// ============================================================================
// DATABASE SCHEMA
// ============================================================================

/**
 * Marketplace plugins table schema
 */
export const MARKETPLACE_PLUGINS_TABLE_SCHEMA = `
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
`;

/**
 * Plugin reviews table schema
 */
export const PLUGIN_REVIEWS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS plugin_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id UUID NOT NULL REFERENCES marketplace_plugins(id) ON DELETE CASCADE,
  user_id VARCHAR(20) NOT NULL,
  user_name VARCHAR(100) NOT NULL,
  user_avatar VARCHAR(255),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
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

CREATE INDEX IF NOT EXISTS idx_plugin_reviews_plugin_id ON plugin_reviews(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_user_id ON plugin_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_rating ON plugin_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_status ON plugin_reviews(status);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_created_at ON plugin_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_helpful_count ON plugin_reviews(helpful_count DESC);
`;

/**
 * Plugin downloads table schema
 */
export const PLUGIN_DOWNLOADS_TABLE_SCHEMA = `
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

CREATE INDEX IF NOT EXISTS idx_plugin_downloads_plugin_id ON plugin_downloads(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_downloads_user_id ON plugin_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_plugin_downloads_guild_id ON plugin_downloads(guild_id);
CREATE INDEX IF NOT EXISTS idx_plugin_downloads_downloaded_at ON plugin_downloads(downloaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_plugin_downloads_source ON plugin_downloads(source);
CREATE INDEX IF NOT EXISTS idx_plugin_downloads_status ON plugin_downloads(status);
`;

/**
 * Plugin analytics table schema
 */
export const PLUGIN_ANALYTICS_TABLE_SCHEMA = `
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

CREATE INDEX IF NOT EXISTS idx_plugin_analytics_plugin_id ON plugin_analytics(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_analytics_period ON plugin_analytics(period);
CREATE INDEX IF NOT EXISTS idx_plugin_analytics_timestamp ON plugin_analytics(timestamp DESC);
`;

/**
 * Plugin tags table schema
 */
export const PLUGIN_TAGS_TABLE_SCHEMA = `
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

CREATE INDEX IF NOT EXISTS idx_plugin_tags_name ON plugin_tags(name);
CREATE INDEX IF NOT EXISTS idx_plugin_tags_slug ON plugin_tags(slug);
CREATE INDEX IF NOT EXISTS idx_plugin_tags_category ON plugin_tags(category);
CREATE INDEX IF NOT EXISTS idx_plugin_tags_usage_count ON plugin_tags(usage_count DESC);
`;

/**
 * Plugin versions table schema
 */
export const PLUGIN_VERSIONS_TABLE_SCHEMA = `
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

CREATE INDEX IF NOT EXISTS idx_plugin_versions_plugin_id ON plugin_versions(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_version ON plugin_versions(version);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_is_stable ON plugin_versions(is_stable);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_is_deprecated ON plugin_versions(is_deprecated);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_published_at ON plugin_versions(published_at DESC);
`;
