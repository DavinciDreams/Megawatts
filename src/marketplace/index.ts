/**
 * Marketplace Module Exports
 * 
 * Exports all marketplace functionality for easy import.
 */

// Export enums from models
export {
  PluginCategory,
  PluginStatus,
  PluginLicense,
  PluginRating,
  ReviewStatus,
  ValidationStatus,
  ValidationCheckType,
  ValidationSeverity
} from './marketplace-models';

// Export interfaces from models
export type {
  MarketplacePlugin,
  PluginDependency,
  PluginConfigSchema,
  ConfigProperty,
  PluginValidation,
  ValidationCheck,
  PluginRatingSummary,
  PluginStatistics,
  PluginMetadata,
  PluginReview,
  ReviewReply,
  ReviewMetadata,
  PluginDownload,
  PluginAnalytics as PluginAnalyticsData,
  AnalyticsMetrics,
  EngagementMetrics,
  PerformanceMetrics,
  PluginTag,
  PluginVersion,
  PluginSearchOptions,
  PluginFilterOptions,
  PluginSortOptions,
  PluginSubmission,
  PluginUpdate,
  PluginApproval,
  PluginReviewData,
  PluginRecommendation,
  TrendingPlugin
} from './marketplace-models';

// Export database schemas
export {
  MARKETPLACE_PLUGINS_TABLE_SCHEMA,
  PLUGIN_REVIEWS_TABLE_SCHEMA,
  PLUGIN_DOWNLOADS_TABLE_SCHEMA,
  PLUGIN_ANALYTICS_TABLE_SCHEMA,
  PLUGIN_TAGS_TABLE_SCHEMA,
  PLUGIN_VERSIONS_TABLE_SCHEMA
} from './marketplace-models';

// Export repository
export {
  MarketplaceRepository
} from './marketplace-repository';

// Export validator
export {
  PluginValidator,
  DEFAULT_PLUGIN_VALIDATOR_CONFIG
} from './plugin-validator';

// Export discovery
export {
  PluginDiscovery,
  DEFAULT_PLUGIN_DISCOVERY_CONFIG
} from './plugin-discovery';

// Export analytics class (renamed to avoid conflict with PluginAnalytics interface)
export {
  PluginAnalytics as PluginAnalyticsService,
  DEFAULT_PLUGIN_ANALYTICS_CONFIG
} from './plugin-analytics';

// Export manager
export {
  MarketplaceManager,
  DEFAULT_MARKETPLACE_MANAGER_CONFIG
} from './marketplace-manager';
