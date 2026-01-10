/**
 * Marketplace Repository
 * 
 * Repository for marketplace data operations.
 * Extends base repository pattern with marketplace-specific operations.
 */

import { BaseRepository, QueryOptions, PaginationResult } from '../storage/repositories/base';
import { PostgresConnectionManager } from '../storage/database';
import { Logger } from '../utils/logger';
import {
  MarketplacePlugin,
  PluginReview,
  PluginDownload,
  PluginAnalytics,
  PluginTag,
  PluginVersion,
  PluginSearchOptions,
  PluginSortOptions,
  PluginFilterOptions,
  PluginRatingSummary,
  PluginStatistics
} from './marketplace-models';

/**
 * Marketplace repository for managing marketplace data
 */
export class MarketplaceRepository extends BaseRepository<MarketplacePlugin> {
  constructor(db: PostgresConnectionManager, logger: Logger) {
    super(db, 'marketplace_plugins', 'id');
  }

  /**
   * Map database row to MarketplacePlugin entity
   */
  protected mapRowToEntity(row: any): MarketplacePlugin {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      longDescription: row.long_description,
      version: row.version,
      author: row.author,
      authorId: row.author_id,
      email: row.email,
      website: row.website,
      repository: row.repository,
      documentation: row.documentation,
      category: row.category,
      status: row.status,
      license: row.license,
      licenseUrl: row.license_url,
      tags: row.tags || [],
      keywords: row.keywords || [],
      icon: row.icon,
      banner: row.banner,
      screenshots: row.screenshots || [],
      dependencies: row.dependencies || [],
      permissions: row.permissions || [],
      config: row.config,
      validation: row.validation,
      rating: row.rating,
      statistics: row.statistics,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      lastValidatedAt: row.last_validated_at
    };
  }

  /**
   * Get entity name for error messages
   */
  protected getEntityName(): string {
    return 'MarketplacePlugin';
  }

  /**
   * Find plugin by slug
   */
  async findBySlug(slug: string): Promise<MarketplacePlugin | null> {
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE slug = $1`;
      const result = await this.db.query(query, [slug]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to find plugin by slug:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Search plugins with filters and pagination
   */
  async searchPlugins(options: PluginFilterOptions = {}): Promise<PaginationResult<MarketplacePlugin>> {
    try {
      const {
        page = 1,
        pageSize = 20,
        search = {},
        sort = { field: 'createdAt', direction: 'DESC' }
      } = options;

      const offset = (page - 1) * pageSize;
      const params: any[] = [];
      const whereConditions: string[] = [];

      // Build WHERE clause
      if (search.query) {
        whereConditions.push(`(
          name ILIKE $${params.length + 1} OR
          description ILIKE $${params.length + 2} OR
          keywords @> $${params.length + 3}
        )`);
        const queryPattern = `%${search.query}%`;
        params.push(queryPattern, queryPattern, [search.query]);
      }

      if (search.category) {
        params.push(search.category);
        whereConditions.push(`category = $${params.length}`);
      }

      if (search.tags && search.tags.length > 0) {
        params.push(search.tags);
        whereConditions.push(`tags && $${params.length}`);
      }

      if (search.author) {
        params.push(search.author);
        whereConditions.push(`author ILIKE $${params.length}`);
      }

      if (search.license) {
        params.push(search.license);
        whereConditions.push(`license = $${params.length}`);
      }

      if (search.status) {
        params.push(search.status);
        whereConditions.push(`status = $${params.length}`);
      }

      if (search.minRating !== undefined) {
        params.push(search.minRating);
        whereConditions.push(`(rating->>'average')::numeric >= $${params.length}`);
      }

      if (search.maxRating !== undefined) {
        params.push(search.maxRating);
        whereConditions.push(`(rating->>'average')::numeric <= $${params.length}`);
      }

      if (search.featured !== undefined) {
        params.push(search.featured);
        whereConditions.push(`(metadata->>'featured')::boolean = $${params.length}`);
      }

      if (search.verified !== undefined) {
        params.push(search.verified);
        whereConditions.push(`(metadata->>'verified')::boolean = $${params.length}`);
      }

      if (search.beta !== undefined) {
        params.push(search.beta);
        whereConditions.push(`(metadata->>'beta')::boolean = $${params.length}`);
      }

      // Build WHERE clause string
      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Map sort field to database column
      const sortFieldMap: Record<string, string> = {
        name: 'name',
        rating: '(rating->>"average")::numeric',
        downloads: '(statistics->>"downloads")::bigint',
        installs: '(statistics->>"installs")::bigint',
        views: '(statistics->>"views")::bigint',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        publishedAt: 'published_at'
      };

      const sortField = sortFieldMap[sort.field] || 'created_at';
      const sortDirection = sort.direction || 'DESC';

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM ${this.tableName} ${whereClause}`;
      const countResult = await this.db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // Get data
      const dataQuery = `
        SELECT * FROM ${this.tableName}
        ${whereClause}
        ORDER BY ${sortField} ${sortDirection}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(pageSize, offset);

      const dataResult = await this.db.query(dataQuery, params);
      const data = dataResult.rows.map((row: any) => this.mapRowToEntity(row));

      return {
        data,
        total,
        page,
        pageSize,
        hasNext: offset + pageSize < total,
        hasPrevious: page > 1
      };
    } catch (error) {
      this.logger.error('Failed to search plugins:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get trending plugins
   */
  async getTrendingPlugins(limit: number = 10, period: 'day' | 'week' | 'month' = 'week'): Promise<MarketplacePlugin[]> {
    try {
      const periodDays = period === 'day' ? 1 : period === 'week' ? 7 : 30;
      const query = `
        SELECT p.*, 
          COALESCE(d.download_count, 0) as recent_downloads
        FROM ${this.tableName} p
        LEFT JOIN (
          SELECT plugin_id, COUNT(*) as download_count
          FROM plugin_downloads
          WHERE downloaded_at >= NOW() - INTERVAL '${periodDays} days'
          GROUP BY plugin_id
        ) d ON p.id = d.plugin_id
        WHERE p.status = 'published'
        ORDER BY recent_downloads DESC, p.downloads DESC
        LIMIT $1
      `;

      const result = await this.db.query(query, [limit]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      this.logger.error('Failed to get trending plugins:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get featured plugins
   */
  async getFeaturedPlugins(limit: number = 10): Promise<MarketplacePlugin[]> {
    try {
      const query = `
        SELECT * FROM ${this.tableName}
        WHERE status = 'published'
          AND (metadata->>'featured')::boolean = TRUE
        ORDER BY (statistics->>"downloads")::bigint DESC
        LIMIT $1
      `;

      const result = await this.db.query(query, [limit]);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      this.logger.error('Failed to get featured plugins:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get plugins by author
   */
  async getPluginsByAuthor(authorId: string, options: QueryOptions = {}): Promise<MarketplacePlugin[]> {
    try {
      const params: any[] = [authorId];
      let query = `SELECT * FROM ${this.tableName} WHERE author_id = $1`;

      if (options.where) {
        query += ` AND ${options.where}`;
        if (options.params) {
          params.push(...options.params);
        }
      }

      if (options.orderBy) {
        query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
      }

      if (options.limit) {
        query += ` LIMIT ${options.limit}`;
      }

      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }

      const result = await this.db.query(query, params);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      this.logger.error('Failed to get plugins by author:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get plugins by category
   */
  async getPluginsByCategory(category: string, options: QueryOptions = {}): Promise<MarketplacePlugin[]> {
    try {
      const params: any[] = [category];
      let query = `SELECT * FROM ${this.tableName} WHERE category = $1`;

      if (options.where) {
        query += ` AND ${options.where}`;
        if (options.params) {
          params.push(...options.params);
        }
      }

      if (options.orderBy) {
        query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
      }

      if (options.limit) {
        query += ` LIMIT ${options.limit}`;
      }

      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }

      const result = await this.db.query(query, params);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      this.logger.error('Failed to get plugins by category:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get plugins by tags
   */
  async getPluginsByTags(tags: string[], options: QueryOptions = {}): Promise<MarketplacePlugin[]> {
    try {
      const params: any[] = [tags];
      let query = `SELECT * FROM ${this.tableName} WHERE tags && $1`;

      if (options.where) {
        query += ` AND ${options.where}`;
        if (options.params) {
          params.push(...options.params);
        }
      }

      if (options.orderBy) {
        query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
      }

      if (options.limit) {
        query += ` LIMIT ${options.limit}`;
      }

      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }

      const result = await this.db.query(query, params);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      this.logger.error('Failed to get plugins by tags:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update plugin rating
   */
  async updatePluginRating(pluginId: string, rating: number): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET 
          rating = jsonb_set(
            rating,
            '{count}',
            (rating->>'count')::int + 1
          ),
          rating = jsonb_set(
            rating,
            '{average}',
            (
              (rating->>'average')::numeric * (rating->>'count')::int + $1
            ) / ((rating->>'count')::int + 1)
            )
          ),
          rating = jsonb_set(
            rating,
            '{distribution,' || $2 || '}',
            (rating->'distribution'->>$2)::int + 1
          ),
          updated_at = NOW()
        WHERE id = $1
      `;

      await this.db.query(query, [rating, Math.round(rating).toString(), pluginId]);
      this.logger.debug(`Updated rating for plugin ${pluginId} to ${rating}`);
    } catch (error) {
      this.logger.error('Failed to update plugin rating:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get plugin rating summary
   */
  async getPluginRatingSummary(pluginId: string): Promise<PluginRatingSummary | null> {
    try {
      const query = `SELECT rating FROM ${this.tableName} WHERE id = $1`;
      const result = await this.db.query(query, [pluginId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].rating;
    } catch (error) {
      this.logger.error('Failed to get plugin rating summary:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Track plugin download
   */
  async trackDownload(download: Omit<PluginDownload, 'id' | 'downloadedAt'>): Promise<PluginDownload> {
    try {
      const query = `
        INSERT INTO plugin_downloads (
          plugin_id, plugin_version, user_id, guild_id, ip_address, user_agent, source, status, error, downloaded_at, completed_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
         RETURNING *
      `;

      const params = [
        download.pluginId,
        download.pluginVersion,
        download.userId,
        download.guildId,
        download.ipAddress,
        download.userAgent,
        download.source,
        download.status,
        download.error,
        download.completedAt
      ];

      const result = await this.db.query(query, params);
      const row = result.rows[0];

      // Update plugin download count
      if (download.status === 'success') {
        await this.incrementDownloadCount(download.pluginId);
      }

      return {
        id: row.id,
        pluginId: row.plugin_id,
        pluginVersion: row.plugin_version,
        userId: row.user_id,
        guildId: row.guild_id,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        source: row.source,
        status: row.status,
        error: row.error,
        downloadedAt: row.downloaded_at,
        completedAt: row.completed_at
      };
    } catch (error) {
      this.logger.error('Failed to track download:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Increment plugin download count
   */
  private async incrementDownloadCount(pluginId: string): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET 
          statistics = jsonb_set(
            statistics,
            '{downloads}',
            (statistics->>'downloads')::bigint + 1
          ),
          updated_at = NOW()
        WHERE id = $1
      `;

      await this.db.query(query, [pluginId]);
    } catch (error) {
      this.logger.error('Failed to increment download count:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get plugin statistics
   */
  async getPluginStatistics(pluginId: string): Promise<PluginStatistics | null> {
    try {
      const query = `SELECT statistics FROM ${this.tableName} WHERE id = $1`;
      const result = await this.db.query(query, [pluginId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].statistics;
    } catch (error) {
      this.logger.error('Failed to get plugin statistics:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update plugin statistics
   */
  async updatePluginStatistics(pluginId: string, updates: Partial<PluginStatistics>): Promise<void> {
    try {
      const fields = Object.keys(updates);
      const setClauses: string[] = [];

      for (const field of fields) {
        const camelToSnake = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        const snakeField = camelToSnake(field);
        setClauses.push(`statistics = jsonb_set(statistics, '{${snakeField}}', $${fields.indexOf(field) + 1})`);
      }

      const query = `
        UPDATE ${this.tableName}
        SET ${setClauses.join(', ')}, updated_at = NOW()
        WHERE id = $${fields.length + 1}
      `;

      const params = [...Object.values(updates), pluginId];
      await this.db.query(query, params);
      this.logger.debug(`Updated statistics for plugin ${pluginId}`);
    } catch (error) {
      this.logger.error('Failed to update plugin statistics:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get plugin reviews
   */
  async getPluginReviews(pluginId: string, options: QueryOptions = {}): Promise<PluginReview[]> {
    try {
      const params: any[] = [pluginId];
      let query = `SELECT * FROM plugin_reviews WHERE plugin_id = $1`;

      if (options.where) {
        query += ` AND ${options.where}`;
        if (options.params) {
          params.push(...options.params);
        }
      }

      if (options.orderBy) {
        query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
      } else {
        query += ` ORDER BY created_at DESC`;
      }

      if (options.limit) {
        query += ` LIMIT ${options.limit}`;
      }

      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }

      const result = await this.db.query(query, params);
      return result.rows.map((row: any) => ({
        id: row.id,
        pluginId: row.plugin_id,
        userId: row.user_id,
        userName: row.user_name,
        userAvatar: row.user_avatar,
        rating: row.rating,
        title: row.title,
        content: row.content,
        status: row.status,
        helpfulCount: row.helpful_count,
        notHelpfulCount: row.not_helpful_count,
        reply: row.reply,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      this.logger.error('Failed to get plugin reviews:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Save plugin analytics
   */
  async saveAnalytics(analytics: Omit<PluginAnalytics, 'id'>): Promise<PluginAnalytics> {
    try {
      const query = `
        INSERT INTO plugin_analytics (
          plugin_id, period, timestamp, metrics, engagement, performance
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (plugin_id, period, timestamp)
         DO UPDATE SET
           metrics = EXCLUDED.metrics,
           engagement = EXCLUDED.engagement,
           performance = EXCLUDED.performance
         RETURNING *
      `;

      const params = [
        analytics.pluginId,
        analytics.period,
        analytics.timestamp,
        JSON.stringify(analytics.metrics),
        JSON.stringify(analytics.engagement),
        JSON.stringify(analytics.performance)
      ];

      const result = await this.db.query(query, params);
      const row = result.rows[0];

      return {
        id: row.id,
        pluginId: row.plugin_id,
        period: row.period,
        timestamp: row.timestamp,
        metrics: row.metrics,
        engagement: row.engagement,
        performance: row.performance
      };
    } catch (error) {
      this.logger.error('Failed to save analytics:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get plugin analytics
   */
  async getAnalytics(pluginId: string, period: 'hourly' | 'daily' | 'weekly' | 'monthly', limit: number = 30): Promise<PluginAnalytics[]> {
    try {
      const query = `
        SELECT * FROM plugin_analytics
        WHERE plugin_id = $1 AND period = $2
        ORDER BY timestamp DESC
        LIMIT $3
      `;

      const result = await this.db.query(query, [pluginId, period, limit]);
      return result.rows.map((row: any) => ({
        id: row.id,
        pluginId: row.plugin_id,
        period: row.period,
        timestamp: row.timestamp,
        metrics: row.metrics,
        engagement: row.engagement,
        performance: row.performance
      }));
    } catch (error) {
      this.logger.error('Failed to get analytics:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get all tags
   */
  async getAllTags(options: QueryOptions = {}): Promise<PluginTag[]> {
    try {
      let query = `SELECT * FROM plugin_tags`;

      const params: any[] = [];

      if (options.where) {
        query += ` WHERE ${options.where}`;
        if (options.params) {
          params.push(...options.params);
        }
      }

      if (options.orderBy) {
        query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
      } else {
        query += ` ORDER BY usage_count DESC, name ASC`;
      }

      if (options.limit) {
        query += ` LIMIT ${options.limit}`;
      }

      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }

      const result = await this.db.query(query, params);
      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        category: row.category,
        color: row.color,
        icon: row.icon,
        usageCount: row.usage_count,
        createdAt: row.created_at
      }));
    } catch (error) {
      this.logger.error('Failed to get tags:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get plugin versions
   */
  async getPluginVersions(pluginId: string): Promise<PluginVersion[]> {
    try {
      const query = `
        SELECT * FROM plugin_versions
        WHERE plugin_id = $1
        ORDER BY published_at DESC
      `;

      const result = await this.db.query(query, [pluginId]);
      return result.rows.map((row: any) => ({
        id: row.id,
        pluginId: row.plugin_id,
        version: row.version,
        changelog: row.changelog,
        downloadUrl: row.download_url,
        size: row.size,
        checksum: row.checksum,
        minBotVersion: row.min_bot_version,
        maxBotVersion: row.max_bot_version,
        isStable: row.is_stable,
        isDeprecated: row.is_deprecated,
        downloadCount: row.download_count,
        publishedAt: row.published_at,
        createdAt: row.created_at
      }));
    } catch (error) {
      this.logger.error('Failed to get plugin versions:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get latest plugin version
   */
  async getLatestPluginVersion(pluginId: string): Promise<PluginVersion | null> {
    try {
      const query = `
        SELECT * FROM plugin_versions
        WHERE plugin_id = $1 AND is_stable = TRUE
        ORDER BY published_at DESC
        LIMIT 1
      `;

      const result = await this.db.query(query, [pluginId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        pluginId: row.plugin_id,
        version: row.version,
        changelog: row.changelog,
        downloadUrl: row.download_url,
        size: row.size,
        checksum: row.checksum,
        minBotVersion: row.min_bot_version,
        maxBotVersion: row.max_bot_version,
        isStable: row.is_stable,
        isDeprecated: row.is_deprecated,
        downloadCount: row.download_count,
        publishedAt: row.published_at,
        createdAt: row.created_at
      };
    } catch (error) {
      this.logger.error('Failed to get latest plugin version:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Mark plugin as published
   */
  async markAsPublished(pluginId: string): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET status = 'published', published_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `;

      await this.db.query(query, [pluginId]);
      this.logger.info(`Plugin ${pluginId} marked as published`);
    } catch (error) {
      this.logger.error('Failed to mark plugin as published:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Mark plugin as archived
   */
  async markAsArchived(pluginId: string): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET status = 'archived', updated_at = NOW()
        WHERE id = $1
      `;

      await this.db.query(query, [pluginId]);
      this.logger.info(`Plugin ${pluginId} marked as archived`);
    } catch (error) {
      this.logger.error('Failed to mark plugin as archived:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Increment tag usage count
   */
  async incrementTagUsage(tagName: string): Promise<void> {
    try {
      const query = `
        UPDATE plugin_tags
        SET usage_count = usage_count + 1
        WHERE name = $1
      `;

      await this.db.query(query, [tagName]);
    } catch (error) {
      this.logger.error('Failed to increment tag usage:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Decrement tag usage count
   */
  async decrementTagUsage(tagName: string): Promise<void> {
    try {
      const query = `
        UPDATE plugin_tags
        SET usage_count = GREATEST(usage_count - 1, 0)
        WHERE name = $1
      `;

      await this.db.query(query, [tagName]);
    } catch (error) {
      this.logger.error('Failed to decrement tag usage:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}
