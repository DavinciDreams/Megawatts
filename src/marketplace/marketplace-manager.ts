/**
 * Marketplace Manager
 * 
 * Main marketplace orchestrator for plugin submissions, approvals, versioning, and publishing.
 * Integrates with existing plugin system and monitoring.
 */

import { Logger } from '../utils/logger';
import { MarketplaceRepository } from './marketplace-repository';
import { PluginValidator, PluginValidationResult, DEFAULT_PLUGIN_VALIDATOR_CONFIG } from './plugin-validator';
import { PluginDiscovery, DEFAULT_PLUGIN_DISCOVERY_CONFIG } from './plugin-discovery';
import { PluginAnalytics, DEFAULT_PLUGIN_ANALYTICS_CONFIG } from './plugin-analytics';
import {
  MarketplacePlugin,
  PluginStatus,
  PluginSubmission,
  PluginUpdate,
  PluginApproval,
  PluginValidation,
  PluginCategory,
  PluginLicense,
  PluginVersion,
  PluginDependency,
  PluginConfigSchema,
  ConfigProperty
} from './marketplace-models';

/**
 * Plugin review data type
 */
export interface PluginReviewData {
  rating: number;
  title: string;
  content: string;
}

/**
 * Marketplace manager configuration
 */
export interface MarketplaceManagerConfig {
  enableAutoApproval: boolean;
  requireManualReview: boolean;
  maxPluginSize: number;
  allowedLicenses: PluginLicense[];
  requireValidation: boolean;
  enableVersioning: boolean;
  maxVersionsPerPlugin: number;
  autoPublishThreshold: number;
}

/**
 * Default marketplace manager configuration
 */
export const DEFAULT_MARKETPLACE_MANAGER_CONFIG: MarketplaceManagerConfig = {
  enableAutoApproval: false,
  requireManualReview: true,
  maxPluginSize: 10 * 1024 * 1024, // 10MB
  allowedLicenses: [
    PluginLicense.MIT,
    PluginLicense.APACHE_2_0,
    PluginLicense.GPL_3_0,
    PluginLicense.BSD_3,
    PluginLicense.ISC,
    PluginLicense.MPL_2_0
  ],
  requireValidation: true,
  enableVersioning: true,
  maxVersionsPerPlugin: 10,
  autoPublishThreshold: 4.0
};

/**
 * Plugin submission result
 */
export interface PluginSubmissionResult {
  success: boolean;
  pluginId?: string;
  plugin?: MarketplacePlugin;
  validation?: PluginValidation;
  errors: string[];
  warnings: string[];
}

/**
 * Plugin approval result
 */
export interface PluginApprovalResult {
  success: boolean;
  pluginId: string;
  approved: boolean;
  reviewerId?: string;
  notes?: string;
  conditions?: string[];
}

/**
 * Plugin version result
 */
export interface PluginVersionResult {
  success: boolean;
  pluginId: string;
  versionId?: string;
  version?: PluginVersion;
}

/**
 * Marketplace manager for plugin submissions, approvals, versioning, and publishing
 */
export class MarketplaceManager {
  private logger: Logger;
  private repository: MarketplaceRepository;
  private validator: PluginValidator;
  private discovery: PluginDiscovery;
  private analytics: PluginAnalytics;
  private config: MarketplaceManagerConfig;

  constructor(
    repository: MarketplaceRepository,
    config: MarketplaceManagerConfig,
    logger: Logger
  ) {
    this.logger = logger;
    this.repository = repository;
    this.config = config;
    this.validator = new PluginValidator(DEFAULT_PLUGIN_VALIDATOR_CONFIG, logger);
    this.discovery = new PluginDiscovery(repository, DEFAULT_PLUGIN_DISCOVERY_CONFIG, logger);
    this.analytics = new PluginAnalytics(repository, DEFAULT_PLUGIN_ANALYTICS_CONFIG, logger);
  }

  /**
   * Submit a new plugin to the marketplace
   * @param submission Plugin submission data
   * @param authorId Author ID
   * @returns Submission result
   */
  async submitPlugin(
    submission: PluginSubmission,
    authorId: string
  ): Promise<PluginSubmissionResult> {
    try {
      this.logger.info(`Submitting plugin: ${submission.name}`);

      // Validate submission
      const validationErrors = this.validateSubmission(submission);

      if (validationErrors.length > 0) {
        return {
          success: false,
          errors: validationErrors,
          warnings: []
        };
      }

      // Check plugin size
      const estimatedSize = this.estimatePluginSize(submission);
      if (estimatedSize > this.config.maxPluginSize) {
        return {
          success: false,
          errors: [`Plugin size exceeds maximum of ${this.config.maxPluginSize} bytes`],
          warnings: []
        };
      }

      // Check license
      if (!this.config.allowedLicenses.includes(submission.license)) {
        return {
          success: false,
          errors: [`License type ${submission.license} is not allowed`],
          warnings: []
        };
      }

      // Create plugin slug
      const slug = this.createSlug(submission.name);

      // Check if slug already exists
      const existingPlugin = await this.repository.findBySlug(slug);
      if (existingPlugin) {
        return {
          success: false,
          errors: [`Plugin with slug '${slug}' already exists`],
          warnings: []
        };
      }

      // Create plugin entity
      const plugin = await this.createPluginEntity(submission, authorId, slug);

      // Run validation if required
      let validation: PluginValidation | undefined;
      if (this.config.requireValidation) {
        const validationResult = await this.validator.validatePlugin(
          '',
          submission.dependencies,
          submission.config
        );
        validation = this.validator.createPluginValidation(validationResult);
      }

      // Set initial status
      const status = this.config.enableAutoApproval ? PluginStatus.PUBLISHED : PluginStatus.PENDING_REVIEW;

      // Save plugin to repository
      const savedPlugin = await this.repository.create({
        ...plugin,
        status,
        validation
      });

      this.logger.info(`Plugin submitted successfully: ${savedPlugin.id}`);
      return {
        success: true,
        pluginId: savedPlugin.id,
        plugin: savedPlugin,
        validation,
        errors: [],
        warnings: []
      };
    } catch (error) {
      this.logger.error('Plugin submission failed:', error instanceof Error ? error : new Error(String(error)));
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: []
      };
    }
  }

  /**
   * Validate plugin submission
   */
  private validateSubmission(submission: PluginSubmission): string[] {
    const errors: string[] = [];

    // Check required fields
    if (!submission.name || submission.name.trim() === '') {
      errors.push('Plugin name is required');
    }

    if (!submission.description || submission.description.trim() === '') {
      errors.push('Plugin description is required');
    }

    if (!submission.category) {
      errors.push('Plugin category is required');
    }

    if (!submission.license) {
      errors.push('Plugin license is required');
    }

    if (!submission.tags || submission.tags.length === 0) {
      errors.push('At least one tag is required');
    }

    if (!submission.dependencies) {
      errors.push('Plugin dependencies are required');
    }

    if (!submission.config || !submission.config.properties) {
      errors.push('Plugin configuration schema is required');
    }

    return errors;
  }

  /**
   * Estimate plugin size
   */
  private estimatePluginSize(submission: PluginSubmission): number {
    let size = 1000; // Base size in bytes

    // Add size for long description
    if (submission.longDescription) {
      size += submission.longDescription.length * 2;
    }

    // Add size for screenshots
    size += (submission.screenshots || []).length * 500;

    return size;
  }

  /**
   * Create plugin slug from name
   */
  private createSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/[^\w-]/g, '_')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/[^a-z0-9]+/g, '');
  }

  /**
   * Create plugin entity from submission
   */
  private async createPluginEntity(
    submission: PluginSubmission,
    authorId: string,
    slug: string
  ): Promise<MarketplacePlugin> {
    const now = new Date();

    const plugin: MarketplacePlugin = {
      id: '', // Will be set by repository
      name: submission.name,
      slug,
      description: submission.description,
      longDescription: submission.longDescription,
      version: '1.0.0',
      author: '', // Will be set by repository
      authorId,
      email: undefined,
      website: submission.website,
      repository: submission.repository,
      documentation: submission.documentation,
      category: submission.category,
      status: this.config.enableAutoApproval ? PluginStatus.PUBLISHED : PluginStatus.PENDING_REVIEW,
      license: submission.license,
      licenseUrl: undefined,
      tags: submission.tags,
      keywords: submission.keywords || [],
      icon: undefined,
      banner: undefined,
      screenshots: submission.screenshots || [],
      dependencies: submission.dependencies || [],
      permissions: [],
      config: submission.config || this.createDefaultConfigSchema(),
      validation: {
        status: 'pending' as any,
        checks: [],
        overallScore: 0,
        lastRunAt: now
      },
      rating: {
        average: 0,
        count: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      },
      statistics: {
        downloads: 0,
        installs: 0,
        activeInstalls: 0,
        views: 0
      },
      metadata: {
        featured: false,
        verified: false,
        official: false,
        beta: false
      },
      createdAt: now,
      updatedAt: now,
      publishedAt: this.config.enableAutoApproval ? now : undefined,
      lastValidatedAt: now
    };

    return plugin;
  }

  /**
   * Create default configuration schema
   */
  private createDefaultConfigSchema(): PluginConfigSchema {
    return {
      properties: {
        enabled: {
          type: 'boolean' as const,
          description: 'Enable or disable plugin',
          default: true,
          required: false
        }
      },
      required: []
    };
  }

  /**
   * Approve a plugin
   */
  async approvePlugin(
    pluginId: string,
    approval: PluginApproval,
    reviewerId: string
  ): Promise<PluginApprovalResult> {
    try {
      this.logger.info(`Approving plugin: ${pluginId}`);

      // Get plugin
      const plugin = await this.repository.findById(pluginId);
      if (!plugin) {
        return {
          success: false,
          errors: [`Plugin not found: ${pluginId}`]
        };
      }

      // Check if plugin is in appropriate status
      if (plugin.status !== PluginStatus.PENDING_REVIEW && 
          plugin.status !== PluginStatus.UNDER_REVIEW) {
        return {
          success: false,
          errors: [`Plugin is not in review status: ${plugin.status}`]
        };
      }

      // Update plugin status
      const status = approval.approved ? PluginStatus.APPROVED : PluginStatus.REJECTED;

      await this.repository.update(pluginId, {
        status
      });

      this.logger.info(`Plugin ${pluginId} ${status} by reviewer ${reviewerId}`);

      return {
        success: true,
        pluginId,
        approved: approval.approved,
        reviewerId,
        notes: approval.notes,
        conditions: approval.conditions
      };
    } catch (error) {
      this.logger.error('Plugin approval failed:', error instanceof Error ? error : new Error(String(error)));
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Reject a plugin
   */
  async rejectPlugin(
    pluginId: string,
    reason: string,
    reviewerId: string
  ): Promise<PluginApprovalResult> {
    try {
      this.logger.info(`Rejecting plugin: ${pluginId}`);

      // Get plugin
      const plugin = await this.repository.findById(pluginId);
      if (!plugin) {
        return {
          success: false,
          errors: [`Plugin not found: ${pluginId}`]
        };
      }

      // Check if plugin is in appropriate status
      if (plugin.status !== PluginStatus.PENDING_REVIEW && 
          plugin.status !== PluginStatus.UNDER_REVIEW) {
        return {
          success: false,
          errors: [`Plugin is not in review status: ${plugin.status}`]
        };
      }

      // Update plugin status
      await this.repository.update(pluginId, {
        status: PluginStatus.REJECTED
      });

      this.logger.info(`Plugin ${pluginId} rejected by reviewer ${reviewerId}: ${reason}`);

      return {
        success: true,
        pluginId,
        approved: false,
        reviewerId,
        notes: reason
      };
    } catch (error) {
      this.logger.error('Plugin rejection failed:', error instanceof Error ? error : new Error(String(error)));
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Update a plugin
   */
  async updatePlugin(
    pluginId: string,
    updates: PluginUpdate
  ): Promise<{ success: boolean; plugin?: MarketplacePlugin }> {
    try {
      this.logger.info(`Updating plugin: ${pluginId}`);

      // Get plugin
      const plugin = await this.repository.findById(pluginId);
      if (!plugin) {
        return {
          success: false,
          errors: [`Plugin not found: ${pluginId}`]
        };
      }

      // Check if plugin is published
      if (plugin.status !== PluginStatus.PUBLISHED) {
        return {
          success: false,
          errors: [`Plugin is not published: ${plugin.status}`]
        };
      }

      // Update plugin
      const updatedPlugin = await this.repository.update(pluginId, updates);

      this.logger.info(`Plugin ${pluginId} updated successfully`);
      return {
        success: true,
        plugin: updatedPlugin
      };
    } catch (error) {
      this.logger.error('Plugin update failed:', error instanceof Error ? error : new Error(String(error)));
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Create a new plugin version
   */
  async createPluginVersion(
    pluginId: string,
    version: string,
    changelog: string,
    downloadUrl: string
  ): Promise<PluginVersionResult> {
    try {
      this.logger.info(`Creating version ${version} for plugin ${pluginId}`);

      // Check version count
      const versions = await this.repository.getPluginVersions(pluginId);
      if (versions.length >= this.config.maxVersionsPerPlugin) {
        return {
          success: false,
          errors: [`Maximum number of versions (${this.config.maxVersionsPerPlugin}) exceeded`]
        };
      }

      // Create version
      const newVersion: PluginVersion = {
        pluginId,
        version,
        changelog,
        downloadUrl,
        size: 0, // Would be set by storage system
        checksum: '', // Would be calculated
        minBotVersion: undefined,
        maxBotVersion: undefined,
        isStable: true,
        isDeprecated: false,
        downloadCount: 0,
        publishedAt: new Date(),
        createdAt: new Date()
      };

      this.logger.info(`Version ${version} created for plugin ${pluginId}`);
      return {
        success: true,
        pluginId,
        versionId: newVersion.id
      };
    } catch (error) {
      this.logger.error('Plugin version creation failed:', error instanceof Error ? error : new Error(String(error)));
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Delete a plugin
   */
  async deletePlugin(
    pluginId: string,
    deleteVolumes: boolean = false
  ): Promise<{ success: boolean; deletedVersions?: number }> {
    try {
      this.logger.info(`Deleting plugin: ${pluginId}`);

      // Get plugin
      const plugin = await this.repository.findById(pluginId);
      if (!plugin) {
        return {
          success: false,
          errors: [`Plugin not found: ${pluginId}`]
        };
      }

      // Check if plugin can be deleted
      if (plugin.status === PluginStatus.PUBLISHED && !plugin.metadata.official) {
        // Archive instead of delete
        await this.repository.markAsArchived(pluginId);
        this.logger.info(`Plugin ${pluginId} archived (not deleted as it's published)`);
        return {
          success: true,
          deletedVersions: 0
        };
      }

      // Delete plugin
      await this.repository.delete(pluginId);

      this.logger.info(`Plugin ${pluginId} deleted successfully`);
      return {
        success: true,
        deletedVersions: 0
      };
    } catch (error) {
      this.logger.error('Plugin deletion failed:', error instanceof Error ? error : new Error(String(error)));
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Get pending reviews
   */
  async getPendingReviews(limit: number = 50): Promise<PluginReview[]> {
    try {
      this.logger.debug('Getting pending reviews');

      // Get all plugins with pending review status
      const result = await this.repository.searchPlugins({
        search: {
          status: 'pending_review' as any
        },
        pageSize: limit
      });

      const reviews = result.data.map((plugin, index) => ({
        id: '',
        pluginId: plugin.id,
        userId: '',
        userName: '',
        userAvatar: undefined,
        rating: 0,
        title: 'Pending Review',
        content: 'Plugin awaiting review',
        status: 'pending' as any,
        helpfulCount: 0,
        notHelpfulCount: 0,
        reply: undefined,
        metadata: {
          version: '1.0.0',
          verifiedPurchase: false,
          edited: false
        },
        createdAt: plugin.createdAt,
        updatedAt: plugin.updatedAt
      }));

      this.logger.info(`Retrieved ${reviews.length} pending reviews`);
      return reviews;
    } catch (error) {
      this.logger.error('Failed to get pending reviews:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get marketplace statistics
   */
  async getStatistics(): Promise<{
    totalPlugins: number;
    publishedPlugins: number;
    pendingReviewPlugins: number;
    rejectedPlugins: number;
    totalDownloads: number;
    totalReviews: number;
    averageRating: number;
  }> {
    try {
      this.logger.info('Getting marketplace statistics');

      // Get all plugins
      const result = await this.repository.searchPlugins({
        search: {
          status: 'published' as any
        },
        pageSize: 1000
      });

      const plugins = result.data;
      const publishedPlugins = plugins.filter(p => p.status === PluginStatus.PUBLISHED);
      const pendingReviewPlugins = plugins.filter(p => p.status === PluginStatus.PENDING_REVIEW);
      const rejectedPlugins = plugins.filter(p => p.status === PluginStatus.REJECTED);

      // Calculate totals
      let totalDownloads = 0;
      let totalRatingSum = 0;
      let ratingCount = 0;

      for (const plugin of plugins) {
        totalDownloads += plugin.statistics.downloads || 0;
        totalRatingSum += (plugin.rating.average || 0) * plugin.rating.count;
        ratingCount += plugin.rating.count;
      }

      const averageRating = ratingCount > 0 ? totalRatingSum / ratingCount : 0;

      this.logger.info('Marketplace statistics calculated', {
        totalPlugins: plugins.length,
        publishedPlugins: publishedPlugins.length,
        pendingReviewPlugins: pendingReviewPlugins.length,
        rejectedPlugins: rejectedPlugins.length,
        totalDownloads,
        totalReviews: ratingCount,
        averageRating
      });

      return {
        totalPlugins: plugins.length,
        publishedPlugins: publishedPlugins.length,
        pendingReviewPlugins: pendingReviewPlugins.length,
        rejectedPlugins: rejectedPlugins.length,
        totalDownloads,
        totalReviews: ratingCount,
        averageRating
      };
    } catch (error) {
      this.logger.error('Failed to get marketplace statistics:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MarketplaceManagerConfig>): void {
    this.logger.info('Updating marketplace manager configuration');
    this.config = { ...this.config, ...newConfig };
  }
}
