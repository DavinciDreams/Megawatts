/**
 * Plugin Discovery
 * 
 * Plugin discovery and recommendation system.
 * Provides intelligent plugin recommendations based on community needs.
 */

import { Logger } from '../utils/logger';
import { MarketplaceRepository } from './marketplace-repository';
import {
  MarketplacePlugin,
  PluginCategory,
  PluginSearchOptions,
  PluginSortOptions,
  PluginFilterOptions,
  PluginRecommendation,
  TrendingPlugin,
  PluginTag
} from './marketplace-models';

/**
 * Plugin discovery configuration
 */
export interface PluginDiscoveryConfig {
  maxRecommendations: number;
  maxTrendingPlugins: number;
  trendingPeriod: 'day' | 'week' | 'month';
  enableAIRecommendations: boolean;
  cacheDuration: number; // in milliseconds
}

/**
 * Default plugin discovery configuration
 */
export const DEFAULT_PLUGIN_DISCOVERY_CONFIG: PluginDiscoveryConfig = {
  maxRecommendations: 10,
  maxTrendingPlugins: 10,
  trendingPeriod: 'week',
  enableAIRecommendations: true,
  cacheDuration: 300000 // 5 minutes
};

/**
 * Plugin discovery and recommendation system
 */
export class PluginDiscovery {
  private logger: Logger;
  private repository: MarketplaceRepository;
  private config: PluginDiscoveryConfig;
  private recommendationsCache: Map<string, PluginRecommendation[]> = new Map();
  private trendingCache: TrendingPlugin[] | null = null;
  private cacheTimestamp: number = 0;

  constructor(
    repository: MarketplaceRepository,
    config: PluginDiscoveryConfig,
    logger: Logger
  ) {
    this.logger = logger;
    this.repository = repository;
    this.config = config;
  }

  /**
   * Get plugin recommendations for a user
   * @param userId User ID
   * @param guildId Optional guild ID
   * @param installedPlugins List of installed plugin IDs
   * @param limit Maximum number of recommendations
   * @returns Plugin recommendations
   */
  async getRecommendations(
    userId: string,
    guildId?: string,
    installedPlugins: string[] = [],
    limit: number = this.config.maxRecommendations
  ): Promise<PluginRecommendation[]> {
    try {
      this.logger.debug(`Getting recommendations for user ${userId}`);

      const cacheKey = `${userId}-${guildId || 'default'}`;
      const cached = this.recommendationsCache.get(cacheKey);

      // Check cache
      if (cached && Date.now() - this.cacheTimestamp < this.config.cacheDuration) {
        this.logger.debug('Returning cached recommendations');
        return cached.slice(0, limit);
      }

      const recommendations: PluginRecommendation[] = [];

      // Get trending plugins not installed
      const trendingPlugins = await this.repository.getTrendingPlugins(
        this.config.maxTrendingPlugins,
        this.config.trendingPeriod
      );

      for (const plugin of trendingPlugins) {
        if (!installedPlugins.includes(plugin.id)) {
          const recommendation: PluginRecommendation = {
            pluginId: plugin.id,
            plugin,
            score: this.calculateTrendScore(plugin),
            reason: `Trending plugin with ${plugin.statistics.downloads} downloads`,
            category: plugin.category
          };
          recommendations.push(recommendation);
        }
      }

      // Get plugins similar to installed ones
      for (const installedPluginId of installedPlugins) {
        const installedPlugin = await this.repository.findById(installedPluginId);
        if (installedPlugin) {
          const similarPlugins = await this.findSimilarPlugins(installedPlugin, limit);
          for (const similar of similarPlugins) {
            if (!recommendations.find(r => r.pluginId === similar.id) &&
                !installedPlugins.includes(similar.id)) {
              const recommendation: PluginRecommendation = {
                pluginId: similar.pluginId,
                plugin: similar,
                score: this.calculateSimilarityScore(installedPlugin, similar),
                reason: `Similar to ${installedPlugin.name}`,
                category: similar.category
              };
              recommendations.push(recommendation);
            }
          }
        }
      }

      // Get featured plugins
      const featuredPlugins = await this.repository.getFeaturedPlugins(limit);
      for (const plugin of featuredPlugins) {
        if (!recommendations.find(r => r.pluginId === plugin.id) && 
              !installedPlugins.includes(plugin.id)) {
          const recommendation: PluginRecommendation = {
            pluginId: plugin.id,
            plugin,
            score: 90,
            reason: 'Featured plugin',
            category: plugin.category
          };
          recommendations.push(recommendation);
        }
      }

      // Sort by score and limit
      recommendations.sort((a, b) => b.score - a.score);
      const limitedRecommendations = recommendations.slice(0, limit);

      // Cache results
      this.recommendationsCache.set(cacheKey, limitedRecommendations);
      this.cacheTimestamp = Date.now();

      this.logger.info(`Generated ${limitedRecommendations.length} recommendations for user ${userId}`);
      return limitedRecommendations;
    } catch (error) {
      this.logger.error('Failed to get recommendations:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get trending plugins
   * @param limit Maximum number of plugins
   * @param period Time period for trending
   * @returns Trending plugins
   */
  async getTrendingPlugins(
    limit: number = this.config.maxTrendingPlugins,
    period: 'day' | 'week' | 'month' = this.config.trendingPeriod
  ): Promise<TrendingPlugin[]> {
    try {
      this.logger.debug(`Getting trending plugins for period: ${period}`);

      // Check cache
      const cacheKey = `trending-${period}`;
      if (this.trendingCache && Date.now() - this.cacheTimestamp < this.config.cacheDuration) {
        this.logger.debug('Returning cached trending plugins');
        return this.trendingCache.slice(0, limit);
      }

      const trendingPlugins = await this.repository.getTrendingPlugins(limit, period);
      const trendingResults: TrendingPlugin[] = [];

      for (const plugin of trendingPlugins) {
        const trendScore = this.calculateTrendScore(plugin);
        const changePercentage = this.calculateTrendChange(plugin, period);

        const trendingPlugin: TrendingPlugin = {
          pluginId: plugin.id,
          plugin,
          trendScore,
          period,
          changePercentage
        };
        trendingResults.push(trendingPlugin);
      }

      // Cache results
      this.trendingCache = trendingResults;
      this.cacheTimestamp = Date.now();

      this.logger.info(`Retrieved ${trendingResults.length} trending plugins`);
      return trendingResults;
    } catch (error) {
      this.logger.error('Failed to get trending plugins:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Find similar plugins
   * @param plugin Reference plugin
   * @param limit Maximum number of similar plugins
   * @returns Similar plugins
   */
  async findSimilarPlugins(
    plugin: MarketplacePlugin,
    limit: number = 5
  ): Promise<MarketplacePlugin[]> {
    try {
      this.logger.debug(`Finding similar plugins to ${plugin.name}`);

      // Get plugins in same category
      const categoryPlugins = await this.repository.getPluginsByCategory(
        plugin.category,
        { limit: limit * 2 }
      );

      // Get plugins with similar tags
      const similarPlugins: MarketplacePlugin[] = [];
      for (const tag of plugin.tags) {
        const tagPlugins = await this.repository.getPluginsByTags([tag], { limit: 5 });
        for (const tagPlugin of tagPlugins) {
          if (!similarPlugins.find(p => p.id === tagPlugin.id) && tagPlugin.id !== plugin.id) {
            similarPlugins.push(tagPlugin);
          }
        }
      }

      // Calculate similarity scores
      const scoredPlugins = similarPlugins.map(p => ({
        plugin: p,
        score: this.calculateSimilarityScore(plugin, p)
      }));

      // Sort by similarity and limit
      scoredPlugins.sort((a, b) => b.score - a.score);
      return scoredPlugins.slice(0, limit).map(s => s.plugin);
    } catch (error) {
      this.logger.error('Failed to find similar plugins:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Browse plugins by category
   * @param category Plugin category
   * @param options Filter and sort options
   * @returns Plugins in category
   */
  async browseByCategory(
    category: PluginCategory,
    options: PluginFilterOptions = {}
  ): Promise<{ plugins: MarketplacePlugin[]; total: number }> {
    try {
      this.logger.debug(`Browsing plugins in category: ${category}`);

      const searchOptions: PluginSearchOptions = {
        ...options.search,
        category
      };

      const result = await this.repository.searchPlugins({
        ...options,
        search: searchOptions
      });

      this.logger.info(`Found ${result.data.length} plugins in category ${category}`);
      return { plugins: result.data, total: result.total };
    } catch (error) {
      this.logger.error('Failed to browse by category:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Browse plugins by tags
   * @param tags Plugin tags
   * @param options Filter and sort options
   * @returns Plugins with tags
   */
  async browseByTags(
    tags: string[],
    options: PluginFilterOptions = {}
  ): Promise<{ plugins: MarketplacePlugin[]; total: number }> {
    try {
      this.logger.debug(`Browsing plugins with tags: ${tags.join(', ')}`);

      const searchOptions: PluginSearchOptions = {
        ...options.search,
        tags
      };

      const result = await this.repository.searchPlugins({
        ...options,
        search: searchOptions
      });

      this.logger.info(`Found ${result.data.length} plugins with tags`);
      return { plugins: result.data, total: result.total };
    } catch (error) {
      this.logger.error('Failed to browse by tags:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Search plugins
   * @param query Search query
   * @param options Filter and sort options
   * @returns Search results
   */
  async searchPlugins(
    query: string,
    options: PluginFilterOptions = {}
  ): Promise<{ plugins: MarketplacePlugin[]; total: number }> {
    try {
      this.logger.debug(`Searching plugins with query: ${query}`);

      const searchOptions: PluginSearchOptions = {
        ...options.search,
        query
      };

      const result = await this.repository.searchPlugins({
        ...options,
        search: searchOptions
      });

      this.logger.info(`Found ${result.data.length} plugins for query: ${query}`);
      return { plugins: result.data, total: result.total };
    } catch (error) {
      this.logger.error('Failed to search plugins:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get all available tags
   * @param limit Maximum number of tags
   * @returns Available tags
   */
  async getTags(limit: number = 50): Promise<PluginTag[]> {
    try {
      this.logger.debug('Getting all tags');

      const tags = await this.repository.getAllTags({ limit });

      this.logger.info(`Retrieved ${tags.length} tags`);
      return tags;
    } catch (error) {
      this.logger.error('Failed to get tags:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get popular tags
   * @param limit Maximum number of tags
   * @returns Popular tags
   */
  async getPopularTags(limit: number = 20): Promise<PluginTag[]> {
    try {
      this.logger.debug('Getting popular tags');

      const tags = await this.repository.getAllTags({ limit });

      this.logger.info(`Retrieved ${tags.length} popular tags`);
      return tags;
    } catch (error) {
      this.logger.error('Failed to get popular tags:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get plugins by author
   * @param authorId Author ID
   * @param options Filter and sort options
   * @returns Plugins by author
   */
  async getPluginsByAuthor(
    authorId: string,
    options: PluginFilterOptions = {}
  ): Promise<{ plugins: MarketplacePlugin[]; total: number }> {
    try {
      this.logger.debug(`Getting plugins by author: ${authorId}`);

      const searchOptions: PluginSearchOptions = {
        ...options.search,
        author: authorId
      };

      const result = await this.repository.searchPlugins({
        ...options,
        search: searchOptions
      });

      this.logger.info(`Found ${result.data.length} plugins by author ${authorId}`);
      return { plugins: result.data, total: result.total };
    } catch (error) {
      this.logger.error('Failed to get plugins by author:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Clear recommendation cache
   */
  clearCache(): void {
    this.logger.debug('Clearing recommendation cache');
    this.recommendationsCache.clear();
    this.trendingCache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Calculate trend score for a plugin
   */
  private calculateTrendScore(plugin: MarketplacePlugin): number {
    const downloads = plugin.statistics.downloads || 0;
    const activeInstalls = plugin.statistics.activeInstalls || 0;
    const views = plugin.statistics.views || 0;
    const rating = plugin.rating.average || 0;

    // Normalize and weight different metrics
    const downloadScore = Math.min(downloads / 1000, 10);
    const installScore = Math.min(activeInstalls / 100, 10);
    const viewScore = Math.min(views / 500, 10);
    const ratingScore = rating * 10;

    return downloadScore + installScore + viewScore + ratingScore;
  }

  /**
   * Calculate trend change percentage
   */
  private calculateTrendChange(plugin: MarketplacePlugin, period: 'day' | 'week' | 'month'): number {
    // In a real implementation, this would compare current downloads
    // with downloads from the previous period
    // For now, return a placeholder value
    return 0;
  }

  /**
   * Calculate similarity score between two plugins
   */
  private calculateSimilarityScore(plugin1: MarketplacePlugin, plugin2: MarketplacePlugin): number {
    let score = 0;

    // Same category
    if (plugin1.category === plugin2.category) {
      score += 30;
    }

    // Shared tags
    const sharedTags = plugin1.tags.filter(t => plugin2.tags.includes(t));
    score += sharedTags.length * 10;

    // Similar description (simple keyword matching)
    const desc1Words = plugin1.description.toLowerCase().split(/\s+/);
    const desc2Words = plugin2.description.toLowerCase().split(/\s+/);
    const commonWords = desc1Words.filter(w => desc2Words.includes(w));
    score += commonWords.length * 5;

    // Same author
    if (plugin1.author === plugin2.author) {
      score += 15;
    }

    // Rating similarity
    const ratingDiff = Math.abs((plugin1.rating.average || 0) - (plugin2.rating.average || 0));
    score += Math.max(0, 20 - ratingDiff);

    return Math.min(100, score);
  }
}
