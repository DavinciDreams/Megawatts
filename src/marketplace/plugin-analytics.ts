/**
 * Plugin Analytics
 * 
 * Plugin analytics system for marketplace.
 * Provides usage analytics, performance analytics, and user engagement metrics.
 */

import { Logger } from '../utils/logger';
import { MarketplaceRepository } from './marketplace-repository';
import {
  PluginAnalytics as PluginAnalyticsData,
  AnalyticsMetrics,
  EngagementMetrics,
  PerformanceMetrics,
  MarketplacePlugin
} from './marketplace-models';

/**
 * Plugin analytics configuration
 */
export interface PluginAnalyticsConfig {
  aggregationInterval: number; // in milliseconds
  retentionPeriod: number; // in milliseconds
  enableRealTimeAnalytics: boolean;
}

/**
 * Default plugin analytics configuration
 */
export const DEFAULT_PLUGIN_ANALYTICS_CONFIG: PluginAnalyticsConfig = {
  aggregationInterval: 3600000, // 1 hour
  retentionPeriod: 2592000000, // 30 days
  enableRealTimeAnalytics: true
};

/**
 * Plugin analytics system
 */
export class PluginAnalytics {
  private logger: Logger;
  private repository: MarketplaceRepository;
  private config: PluginAnalyticsConfig;
  private aggregationInterval?: NodeJS.Timeout;

  constructor(
    repository: MarketplaceRepository,
    config: PluginAnalyticsConfig,
    logger: Logger
  ) {
    this.logger = logger;
    this.repository = repository;
    this.config = config;
  }

  /**
   * Start analytics collection
   */
  start(): void {
    this.logger.info('Starting plugin analytics collection');

    if (this.config.enableRealTimeAnalytics) {
      this.startAggregation();
    }
  }

  /**
   * Stop analytics collection
   */
  stop(): void {
    this.logger.info('Stopping plugin analytics collection');

    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
      this.aggregationInterval = undefined;
    }
  }

  /**
   * Start periodic aggregation
   */
  private startAggregation(): void {
    this.aggregationInterval = setInterval(() => {
      this.aggregateAnalytics();
    }, this.config.aggregationInterval);

    this.logger.debug(`Analytics aggregation started (interval: ${this.config.aggregationInterval}ms)`);
  }

  /**
   * Aggregate analytics for all plugins
   */
  async aggregateAnalytics(): Promise<void> {
    try {
      this.logger.debug('Running analytics aggregation');

      // Get all published plugins
      const result = await this.repository.searchPlugins({
        search: {
          status: 'published' as any
        },
        sort: {
          field: 'createdAt' as any,
          direction: 'DESC' as any
        }
      });

      const plugins = result.data;
      const now = new Date();
      const period = this.getPeriod(now);

      for (const plugin of plugins) {
        // Get existing analytics for this period
        const existingAnalytics = await this.repository.getAnalytics(plugin.id, period);

        if (existingAnalytics.length > 0) {
          // Update existing analytics
          const updatedMetrics = this.calculateUpdatedMetrics(plugin, existingAnalytics);
          await this.repository.saveAnalytics({
            pluginId: plugin.id,
            period,
            timestamp: now,
            metrics: updatedMetrics.metrics,
            engagement: updatedMetrics.engagement,
            performance: updatedMetrics.performance
          });
        } else {
          // Create new analytics record
          const newAnalytics = this.calculateNewAnalytics(plugin);
          await this.repository.saveAnalytics({
            pluginId: plugin.id,
            period,
            timestamp: now,
            metrics: newAnalytics.metrics,
            engagement: newAnalytics.engagement,
            performance: newAnalytics.performance
          });
        }
      }

      // Clean up old analytics records
      await this.cleanupOldAnalytics();

      this.logger.info(`Analytics aggregation completed for ${plugins.length} plugins`);
    } catch (error) {
      this.logger.error('Analytics aggregation failed:', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Calculate updated metrics for existing analytics
   */
  private calculateUpdatedMetrics(
    plugin: MarketplacePlugin,
    existingAnalytics: PluginAnalyticsData[]
  ): {
    metrics: AnalyticsMetrics;
    engagement: EngagementMetrics;
    performance: PerformanceMetrics
  } {
    const latest = existingAnalytics[existingAnalytics.length - 1];
    const metrics = latest.metrics;
    const engagement = latest.engagement;
    const performance = latest.performance;

    // Increment counts
    metrics.views += plugin.statistics.views || 0;
    metrics.downloads += plugin.statistics.downloads || 0;
    metrics.installs += plugin.statistics.installs || 0;
    metrics.uniqueDownloads += plugin.statistics.downloads || 0;
    metrics.uniqueViews += plugin.statistics.views || 0;
    metrics.activeInstalls += plugin.statistics.activeInstalls || 0;
    metrics.ratingCount += plugin.rating.count || 0;
    metrics.averageRating = this.calculateAverageRating(plugin, existingAnalytics);

    return { metrics, engagement, performance };
  }

  /**
   * Calculate new analytics for a plugin
   */
  private calculateNewAnalytics(plugin: MarketplacePlugin): {
    metrics: AnalyticsMetrics;
    engagement: EngagementMetrics;
    performance: PerformanceMetrics;
  } {
    const metrics: AnalyticsMetrics = {
      views: plugin.statistics.views || 0,
      uniqueViews: plugin.statistics.views || 0,
      downloads: plugin.statistics.downloads || 0,
      uniqueDownloads: plugin.statistics.downloads || 0,
      installs: plugin.statistics.installs || 0,
      uninstalls: 0,
      activeInstalls: plugin.statistics.activeInstalls || 0,
      ratingCount: plugin.rating.count || 0,
      averageRating: plugin.rating.average || 0,
      reviewCount: 0
    };

    const engagement: EngagementMetrics = {
      avgSessionDuration: 0,
      bounceRate: 0,
      clickThroughRate: 0,
      conversionRate: this.calculateConversionRate(plugin),
      retentionRate: 0,
      shares: 0,
      bookmarks: 0
    };

    const performance: PerformanceMetrics = {
      avgLoadTime: 0,
      avgExecutionTime: 0,
      errorRate: 0,
      crashRate: 0,
      resourceUsage: {
        memory: 0,
        cpu: 0
      }
    };

    return { metrics, engagement, performance };
  }

  /**
   * Calculate average rating from historical data
   */
  private calculateAverageRating(
    plugin: MarketplacePlugin,
    existingAnalytics: PluginAnalyticsData[]
  ): number {
    if (existingAnalytics.length === 0) {
      return plugin.rating.average || 0;
    }

    // Calculate weighted average from historical data
    let totalRating = 0;
    let totalWeight = 0;

    for (const analytics of existingAnalytics) {
      const weight = this.getTimeWeight(analytics.timestamp);
      totalRating += analytics.metrics.averageRating * weight;
      totalWeight += weight;
    }

    // Include current rating
    totalRating += plugin.rating.average * 1;
    totalWeight += 1;

    return totalWeight > 0 ? totalRating / totalWeight : plugin.rating.average || 0;
  }

  /**
   * Calculate time weight for analytics (more recent = higher weight)
   */
  private getTimeWeight(timestamp: Date): number {
    const now = Date.now();
    const age = now - timestamp.getTime();
    const maxAge = this.config.retentionPeriod;

    // Exponential decay: weight decreases with age
    return Math.max(1, 1 - (age / maxAge));
  }

  /**
   * Calculate conversion rate
   */
  private calculateConversionRate(plugin: MarketplacePlugin): number {
    const downloads = plugin.statistics.downloads || 0;
    const views = plugin.statistics.views || 0;

    if (views === 0) {
      return 0;
    }

    return downloads / views;
  }

  /**
   * Track plugin view
   * @param pluginId Plugin ID
   * @param userId Optional user ID
   * @param guildId Optional guild ID
   */
  async trackView(pluginId: string, userId?: string, guildId?: string): Promise<void> {
    try {
      this.logger.debug(`Tracking view for plugin ${pluginId}`);

      // Update plugin statistics
      const plugin = await this.repository.findById(pluginId);
      if (plugin) {
        const updatedStatistics = {
          ...plugin.statistics,
          views: (plugin.statistics.views || 0) + 1
        };

        await this.repository.updatePluginStatistics(pluginId, updatedStatistics);

        // Create analytics record for current period
        const now = new Date();
        const period = this.getPeriod(now);
        const existingAnalytics = await this.repository.getAnalytics(pluginId, period);

        if (existingAnalytics.length > 0) {
          const latest = existingAnalytics[existingAnalytics.length - 1];
          const updatedMetrics = {
            ...latest.metrics,
            views: latest.metrics.views + 1,
            uniqueViews: latest.metrics.uniqueViews + 1
          };

          await this.repository.saveAnalytics({
            pluginId,
            period,
            timestamp: now,
            metrics: updatedMetrics,
            engagement: latest.engagement,
            performance: latest.performance
          });
        } else {
          const newAnalytics = this.calculateNewAnalytics(plugin);
          await this.repository.saveAnalytics({
            pluginId,
            period,
            timestamp: now,
            metrics: newAnalytics.metrics,
            engagement: newAnalytics.engagement,
            performance: newAnalytics.performance
          });
        }
      }

      this.logger.debug(`View tracked for plugin ${pluginId}`);
    } catch (error) {
      this.logger.error('Failed to track view:', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Track plugin download
   * @param pluginId Plugin ID
   * @param pluginVersion Plugin version
   * @param userId Optional user ID
   * @param guildId Optional guild ID
   */
  async trackDownload(
    pluginId: string,
    pluginVersion: string,
    userId?: string,
    guildId?: string
  ): Promise<void> {
    try {
      this.logger.debug(`Tracking download for plugin ${pluginId}`);

      // Record download
      await this.repository.trackDownload({
        pluginId,
        pluginVersion,
        userId,
        guildId,
        source: 'marketplace',
        status: 'success'
      });

      // Update plugin statistics
      const plugin = await this.repository.findById(pluginId);
      if (plugin) {
        const updatedStatistics = {
          ...plugin.statistics,
          downloads: (plugin.statistics.downloads || 0) + 1
        };

        await this.repository.updatePluginStatistics(pluginId, updatedStatistics);
      }

      this.logger.debug(`Download tracked for plugin ${pluginId}`);
    } catch (error) {
      this.logger.error('Failed to track download:', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Track plugin install
   * @param pluginId Plugin ID
   * @param userId Optional user ID
   * @param guildId Optional guild ID
   */
  async trackInstall(pluginId: string, userId?: string, guildId?: string): Promise<void> {
    try {
      this.logger.debug(`Tracking install for plugin ${pluginId}`);

      // Update plugin statistics
      const plugin = await this.repository.findById(pluginId);
      if (plugin) {
        const updatedStatistics = {
          ...plugin.statistics,
          installs: (plugin.statistics.installs || 0) + 1,
          activeInstalls: (plugin.statistics.activeInstalls || 0) + 1
        };

        await this.repository.updatePluginStatistics(pluginId, updatedStatistics);
      }

      this.logger.debug(`Install tracked for plugin ${pluginId}`);
    } catch (error) {
      this.logger.error('Failed to track install:', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Track plugin uninstall
   * @param pluginId Plugin ID
   * @param userId Optional user ID
   * @param guildId Optional guild ID
   */
  async trackUninstall(pluginId: string, userId?: string, guildId?: string): Promise<void> {
    try {
      this.logger.debug(`Tracking uninstall for plugin ${pluginId}`);

      // Update plugin statistics
      const plugin = await this.repository.findById(pluginId);
      if (plugin) {
        const updatedStatistics = {
          ...plugin.statistics,
          activeInstalls: Math.max(0, (plugin.statistics.activeInstalls || 0) - 1)
        };

        await this.repository.updatePluginStatistics(pluginId, updatedStatistics);
      }

      this.logger.debug(`Uninstall tracked for plugin ${pluginId}`);
    } catch (error) {
      this.logger.error('Failed to track uninstall:', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get analytics for a plugin
   * @param pluginId Plugin ID
   * @param period Time period
   * @param limit Maximum number of records
   * @returns Plugin analytics
   */
  async getPluginAnalytics(
    pluginId: string,
    period: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily',
    limit: number = 30
  ): Promise<PluginAnalyticsData[]> {
    try {
      this.logger.debug(`Getting analytics for plugin ${pluginId}`);

      const analytics = await this.repository.getAnalytics(pluginId, period, limit);

      this.logger.info(`Retrieved ${analytics.length} analytics records for plugin ${pluginId}`);
      return analytics;
    } catch (error) {
      this.logger.error('Failed to get plugin analytics:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get overall marketplace analytics
   * @returns Overall analytics summary
   */
  async getOverallAnalytics(): Promise<{
    totalPlugins: number;
    totalViews: number;
    totalDownloads: number;
    totalInstalls: number;
    activeInstalls: number;
    averageRating: number;
    topPlugins: Array<{
      pluginId: string;
      pluginName: string;
      downloads: number;
      rating: number;
    }>;
  }> {
    try {
      this.logger.debug('Getting overall marketplace analytics');

      // Get all published plugins
      const result = await this.repository.searchPlugins({
        search: {
          status: 'published' as any
        },
        sort: {
          field: 'downloads' as any,
          direction: 'DESC' as any
        },
        pageSize: 100
      });

      const plugins = result.data;
      let totalViews = 0;
      let totalDownloads = 0;
      let totalInstalls = 0;
      let activeInstalls = 0;
      let totalRatingSum = 0;
      let ratingCount = 0;

      const topPlugins: Array<{
        pluginId: string;
        pluginName: string;
        downloads: number;
        rating: number;
      }> = [];

      for (const plugin of plugins) {
        totalViews += plugin.statistics.views || 0;
        totalDownloads += plugin.statistics.downloads || 0;
        totalInstalls += plugin.statistics.installs || 0;
        activeInstalls += plugin.statistics.activeInstalls || 0;

        if (plugin.rating.count > 0) {
          totalRatingSum += plugin.rating.average * plugin.rating.count;
          ratingCount += plugin.rating.count;
        }

        if (topPlugins.length < 10) {
          topPlugins.push({
            pluginId: plugin.id,
            pluginName: plugin.name,
            downloads: plugin.statistics.downloads || 0,
            rating: plugin.rating.average || 0
          });
        }
      }

      const averageRating = ratingCount > 0 ? totalRatingSum / ratingCount : 0;

      this.logger.info('Overall analytics calculated', {
        totalPlugins: plugins.length,
        totalViews,
        totalDownloads,
        totalInstalls,
        activeInstalls,
        averageRating,
        topPluginsCount: topPlugins.length
      });

      return {
        totalPlugins: plugins.length,
        totalViews,
        totalDownloads,
        totalInstalls,
        activeInstalls,
        averageRating,
        topPlugins
      };
    } catch (error) {
      this.logger.error('Failed to get overall analytics:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get period for current time
   */
  private getPeriod(timestamp: Date): 'hourly' | 'daily' | 'weekly' | 'monthly' {
    const hour = timestamp.getHours();
    const day = timestamp.getDate();

    if (hour < 6) {
      return 'hourly';
    } else if (hour < 12) {
      return 'daily';
    } else if (day <= 7) {
      return 'weekly';
    } else {
      return 'monthly';
    }
  }

  /**
   * Clean up old analytics records
   */
  private async cleanupOldAnalytics(): Promise<void> {
    try {
      this.logger.debug('Cleaning up old analytics records');

      const cutoffDate = new Date(Date.now() - this.config.retentionPeriod);

      // Get all analytics records older than retention period
      // This would require a direct database query
      // For now, just log that cleanup would happen here

      this.logger.debug(`Analytics cleanup completed (cutoff: ${cutoffDate.toISOString()})`);
    } catch (error) {
      this.logger.error('Failed to cleanup old analytics:', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PluginAnalyticsConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (this.aggregationInterval) {
      this.stop();
      if (this.config.enableRealTimeAnalytics) {
        this.startAggregation();
      }
    }
  }
}
