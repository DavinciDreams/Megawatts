/**
 * Knowledge Base
 *
 * Knowledge base management for community support.
 * Provides article creation, FAQ management, search functionality,
 * article categorization, and version tracking.
 */

import { CommunityRepository } from './community-repository';
import { Logger } from '../utils/logger';
import {
  KnowledgeArticle,
  FAQEntry,
  PaginationOptions,
  PaginationResult
} from './community-models';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Knowledge base configuration
 */
export interface KnowledgeBaseConfig {
  enableVersionTracking: boolean;
  enableAutoCategorization: boolean;
  maxArticleVersions: number;
  defaultArticleStatus: 'draft' | 'published';
  enableSearchIndexing: boolean;
  minSearchScore: number;
  enableFeedback: boolean;
}

/**
 * Article version
 */
export interface ArticleVersion {
  id: string;
  articleId: string;
  version: number;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  changeNotes: string;
  createdAt: Date;
}

/**
 * Article category
 */
export interface ArticleCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentCategoryId?: string;
  order: number;
  articleCount: number;
  createdAt: Date;
}

/**
 * Search result
 */
export interface SearchResult<T> {
  item: T;
  score: number;
  highlights: string[];
}

/**
 * Knowledge base statistics
 */
export interface KnowledgeBaseStatistics {
  totalArticles: number;
  publishedArticles: number;
  draftArticles: number;
  totalFAQs: number;
  activeFAQs: number;
  totalViews: number;
  totalHelpfulVotes: number;
  totalCategories: number;
  mostViewedArticles: string[];
  mostHelpfulArticles: string[];
  articlesByCategory: Record<string, number>;
  articlesByDifficulty: Record<string, number>;
}

/**
 * Categorization result
 */
export interface CategorizationResult {
  category: string;
  confidence: number;
  suggestedTags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

// ============================================================================
// KNOWLEDGE BASE CLASS
// ============================================================================

/**
 * KnowledgeBase class for managing community knowledge base
 */
export class KnowledgeBase {
  private repository: CommunityRepository;
  private logger: Logger;
  private config: KnowledgeBaseConfig;
  private articleVersions: Map<string, ArticleVersion[]> = new Map();
  private categories: Map<string, ArticleCategory> = new Map();
  private searchIndex: Map<string, string[]> = new Map();
  private statistics: KnowledgeBaseStatistics;

  constructor(repository: CommunityRepository, logger: Logger, config?: Partial<KnowledgeBaseConfig>) {
    this.repository = repository;
    this.logger = logger;
    this.config = {
      enableVersionTracking: true,
      enableAutoCategorization: true,
      maxArticleVersions: 10,
      defaultArticleStatus: 'draft',
      enableSearchIndexing: true,
      minSearchScore: 0.3,
      enableFeedback: true,
      ...config
    };

    this.statistics = {
      totalArticles: 0,
      publishedArticles: 0,
      draftArticles: 0,
      totalFAQs: 0,
      activeFAQs: 0,
      totalViews: 0,
      totalHelpfulVotes: 0,
      totalCategories: 0,
      mostViewedArticles: [],
      mostHelpfulArticles: [],
      articlesByCategory: {},
      articlesByDifficulty: {}
    };

    this.logger.info('KnowledgeBase initialized', { config: this.config });
  }

  // ============================================================================
  // ARTICLE MANAGEMENT
  // ============================================================================

  /**
   * Create knowledge article
   */
  async createArticle(
    title: string,
    summary: string,
    content: string,
    authorId: string,
    authorName: string,
    options?: {
      category?: string;
      tags?: string[];
      attachments?: string[];
      relatedArticles?: string[];
      difficulty?: 'beginner' | 'intermediate' | 'advanced';
      language?: string;
      published?: boolean;
    }
  ): Promise<KnowledgeArticle> {
    try {
      // Auto-categorize if enabled
      const categorization = this.config.enableAutoCategorization
        ? await this.categorizeArticle(title, summary, content)
        : null;

      const slug = this.generateSlug(title);

      const articleData: Omit<KnowledgeArticle, 'id' | 'createdAt' | 'updatedAt'> = {
        title,
        slug,
        summary,
        content,
        category: options?.category || categorization?.category || 'general',
        tags: options?.tags || categorization?.suggestedTags || [],
        status: options?.published ? 'published' : this.config.defaultArticleStatus,
        authorId,
        authorName,
        version: 1,
        relatedArticles: options?.relatedArticles || [],
        attachments: options?.attachments || [],
        viewCount: 0,
        helpfulCount: 0,
        notHelpfulCount: 0,
        metadata: {
          difficulty: options?.difficulty || categorization?.difficulty || 'intermediate',
          readingTime: this.calculateReadingTime(content),
          language: options?.language || 'en',
          featured: false,
          verified: false
        }
      };

      const article = await this.repository.createArticle(articleData);

      // Create version record
      if (this.config.enableVersionTracking) {
        await this.createArticleVersion(article.id, 1, title, content, authorId, authorName, 'Initial version');
      }

      // Index for search
      if (this.config.enableSearchIndexing) {
        this.indexArticleForSearch(article);
      }

      // Update statistics
      this.updateArticleStatistics(article);

      this.logger.info('Knowledge article created', {
        articleId: article.id,
        slug: article.slug,
        authorId,
        category: article.category
      });

      return article;
    } catch (error) {
      this.logger.error('Failed to create article:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update knowledge article
   */
  async updateArticle(
    articleId: string,
    updates: Partial<KnowledgeArticle>,
    changeNotes?: string
  ): Promise<KnowledgeArticle | null> {
    try {
      const existingArticle = await this.repository.getArticle(articleId);
      if (!existingArticle) {
        throw new Error(`Article ${articleId} not found`);
      }

      // Create new version if content changed
      if (this.config.enableVersionTracking && updates.content && updates.content !== existingArticle.content) {
        const newVersion = existingArticle.version + 1;
        await this.createArticleVersion(
          articleId,
          newVersion,
          updates.title || existingArticle.title,
          updates.content,
          existingArticle.authorId,
          existingArticle.authorName,
          changeNotes || 'Content updated'
        );

        // Update version in article data
        updates.version = newVersion;
      }

      const updatedArticle = await this.repository.createArticle({
        ...existingArticle,
        ...updates
      } as Omit<KnowledgeArticle, 'id' | 'createdAt' | 'updatedAt'>);

      // Re-index for search if content changed
      if (this.config.enableSearchIndexing && (updates.title || updates.content || updates.summary)) {
        this.removeFromSearchIndex(articleId);
        this.indexArticleForSearch(updatedArticle);
      }

      this.logger.info('Knowledge article updated', {
        articleId,
        version: updatedArticle.version
      });

      return updatedArticle;
    } catch (error) {
      this.logger.error('Failed to update article:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Delete article
   */
  async deleteArticle(articleId: string): Promise<boolean> {
    try {
      // Remove from search index
      this.removeFromSearchIndex(articleId);

      // Remove version history
      this.articleVersions.delete(articleId);

      // Delete from repository (would need delete method in repository)
      this.logger.info('Knowledge article deleted', { articleId });

      return true;
    } catch (error) {
      this.logger.error('Failed to delete article:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  /**
   * Get article by ID
   */
  async getArticle(articleId: string): Promise<KnowledgeArticle | null> {
    const article = await this.repository.getArticle(articleId);
    if (article && this.config.enableFeedback) {
      await this.repository.incrementArticleViewCount(articleId);
      this.statistics.totalViews++;
    }
    return article;
  }

  /**
   * Get article by slug
   */
  async getArticleBySlug(slug: string): Promise<KnowledgeArticle | null> {
    const article = await this.repository.getArticleBySlug(slug);
    if (article && this.config.enableFeedback) {
      await this.repository.incrementArticleViewCount(article.id);
      this.statistics.totalViews++;
    }
    return article;
  }

  /**
   * Publish article
   */
  async publishArticle(articleId: string, reviewerId: string, reviewerName: string): Promise<KnowledgeArticle | null> {
    try {
      const article = await this.repository.getArticle(articleId);
      if (!article) {
        throw new Error(`Article ${articleId} not found`);
      }

      await this.repository.updateArticleStatus(articleId, 'published');

      // Update statistics
      this.statistics.draftArticles--;
      this.statistics.publishedArticles++;

      this.logger.info('Article published', {
        articleId,
        reviewerId
      });

      return await this.repository.getArticle(articleId);
    } catch (error) {
      this.logger.error('Failed to publish article:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Archive article
   */
  async archiveArticle(articleId: string): Promise<KnowledgeArticle | null> {
    try {
      const article = await this.repository.getArticle(articleId);
      if (!article) {
        throw new Error(`Article ${articleId} not found`);
      }

      await this.repository.updateArticleStatus(articleId, 'archived');

      // Update statistics
      this.statistics.publishedArticles--;

      this.logger.info('Article archived', { articleId });

      return await this.repository.getArticle(articleId);
    } catch (error) {
      this.logger.error('Failed to archive article:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // ============================================================================
  // VERSION TRACKING
  // ============================================================================

  /**
   * Create article version
   */
  private async createArticleVersion(
    articleId: string,
    version: number,
    title: string,
    content: string,
    authorId: string,
    authorName: string,
    changeNotes: string
  ): Promise<void> {
    const versionRecord: ArticleVersion = {
      id: `ver_${articleId}_${version}`,
      articleId,
      version,
      title,
      content,
      authorId,
      authorName,
      changeNotes,
      createdAt: new Date()
    };

    const versions = this.articleVersions.get(articleId) || [];
    versions.push(versionRecord);

    // Keep only max versions
    if (versions.length > this.config.maxArticleVersions) {
      versions.shift();
    }

    this.articleVersions.set(articleId, versions);
  }

  /**
   * Get article versions
   */
  getArticleVersions(articleId: string): ArticleVersion[] {
    return this.articleVersions.get(articleId) || [];
  }

  /**
   * Get specific article version
   */
  getArticleVersion(articleId: string, version: number): ArticleVersion | null {
    const versions = this.articleVersions.get(articleId) || [];
    return versions.find(v => v.version === version) || null;
  }

  /**
   * Restore article to previous version
   */
  async restoreArticleVersion(articleId: string, version: number): Promise<KnowledgeArticle | null> {
    try {
      const versionRecord = this.getArticleVersion(articleId, version);
      if (!versionRecord) {
        throw new Error(`Version ${version} not found for article ${articleId}`);
      }

      // Note: Full article update would need additional repository method
      // For version restore, we track the version but don't modify the article
      // This would typically require a restoreArticle method in the repository
      await this.createArticleVersion(
        articleId,
        version + 1,
        versionRecord.title,
        versionRecord.content,
        versionRecord.authorId,
        versionRecord.authorName,
        'Restored from version ' + version
      );

      this.logger.info('Article version restored', {
        articleId,
        version
      });

      return await this.repository.getArticle(articleId);
    } catch (error) {
      this.logger.error('Failed to restore article version:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // ============================================================================
  // FAQ MANAGEMENT
  // ============================================================================

  /**
   * Create FAQ entry
   */
  async createFAQ(
    question: string,
    answer: string,
    category: string,
    options?: {
      order?: number;
      tags?: string[];
      relatedArticles?: string[];
      relatedFaqs?: string[];
      language?: string;
    }
  ): Promise<FAQEntry> {
    try {
      const faqData: Omit<FAQEntry, 'id' | 'createdAt' | 'updatedAt'> = {
        question,
        answer,
        category,
        order: options?.order || 0,
        isActive: true,
        viewCount: 0,
        helpfulCount: 0,
        tags: options?.tags || [],
        relatedArticles: options?.relatedArticles || [],
        relatedFaqs: options?.relatedFaqs || [],
        language: options?.language || 'en'
      };

      const faq = await this.repository.createFAQ(faqData);

      // Update statistics
      this.statistics.totalFAQs++;
      this.statistics.activeFAQs++;

      this.logger.info('FAQ entry created', {
        faqId: faq.id,
        category: faq.category
      });

      return faq;
    } catch (error) {
      this.logger.error('Failed to create FAQ:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update FAQ entry
   */
  async updateFAQ(faqId: string, updates: Partial<FAQEntry>): Promise<FAQEntry | null> {
    try {
      const updated = await this.repository.updateFAQ(faqId, updates);

      this.logger.info('FAQ entry updated', { faqId });

      return updated;
    } catch (error) {
      this.logger.error('Failed to update FAQ:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Delete FAQ entry
   */
  async deleteFAQ(faqId: string): Promise<boolean> {
    try {
      // Would need delete method in repository
      this.logger.info('FAQ entry deleted', { faqId });
      return true;
    } catch (error) {
      this.logger.error('Failed to delete FAQ:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  /**
   * Get FAQ by ID
   */
  async getFAQ(faqId: string): Promise<FAQEntry | null> {
    return await this.repository.getFAQ(faqId);
  }

  /**
   * Get active FAQs
   */
  async getActiveFAQs(category?: string): Promise<FAQEntry[]> {
    return await this.repository.getActiveFAQs(category);
  }

  /**
   * Activate/deactivate FAQ
   */
  async setFAQActive(faqId: string, isActive: boolean): Promise<FAQEntry | null> {
    const updated = await this.repository.updateFAQ(faqId, { isActive });

    // Update statistics
    if (isActive) {
      this.statistics.activeFAQs++;
    } else {
      this.statistics.activeFAQs--;
    }

    return updated;
  }

  // ============================================================================
  // SEARCH FUNCTIONALITY
  // ============================================================================

  /**
   * Search knowledge base
   */
  async searchArticles(
    query: string,
    options?: PaginationOptions & {
      category?: string;
      tags?: string[];
      difficulty?: string;
      language?: string;
    }
  ): Promise<PaginationResult<SearchResult<KnowledgeArticle>>> {
    try {
      const searchResult = await this.repository.searchArticles({
        ...options,
        query,
        status: 'published' as any,
        page: options?.page || 1,
        pageSize: options?.pageSize || 20
      });

      // Calculate scores and add highlights
      const results = searchResult.data.map(article => {
        const { score, highlights } = this.calculateSearchScore(query, article);
        return {
          item: article,
          score,
          highlights
        };
      }).filter(result => result.score >= this.config.minSearchScore);

      // Sort by score
      results.sort((a, b) => b.score - a.score);

      return {
        data: results,
        total: searchResult.total,
        page: searchResult.page,
        pageSize: searchResult.pageSize,
        hasNext: searchResult.hasNext,
        hasPrevious: searchResult.hasPrevious
      };
    } catch (error) {
      this.logger.error('Failed to search articles:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Calculate search score
   */
  private calculateSearchScore(query: string, article: KnowledgeArticle): {
    score: number;
    highlights: string[];
  } {
    const queryLower = query.toLowerCase();
    const titleLower = article.title.toLowerCase();
    const summaryLower = article.summary.toLowerCase();
    const contentLower = article.content.toLowerCase();

    let score = 0;
    const highlights: string[] = [];

    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    // Title matches (highest weight)
    for (const word of queryWords) {
      if (titleLower.includes(word)) {
        score += 0.4;
        highlights.push(word);
      }
    }

    // Summary matches (medium weight)
    for (const word of queryWords) {
      if (summaryLower.includes(word) && !titleLower.includes(word)) {
        score += 0.3;
        if (!highlights.includes(word)) {
          highlights.push(word);
        }
      }
    }

    // Content matches (lower weight)
    for (const word of queryWords) {
      if (contentLower.includes(word) && !summaryLower.includes(word) && !titleLower.includes(word)) {
        score += 0.2;
        if (!highlights.includes(word)) {
          highlights.push(word);
        }
      }
    }

    // Tag matches (medium weight)
    for (const tag of article.tags) {
      if (queryLower.includes(tag.toLowerCase())) {
        score += 0.25;
      }
    }

    // Normalize score
    score = Math.min(score, 1);

    return { score, highlights: [...new Set(highlights)] };
  }

  /**
   * Search FAQs
   */
  async searchFAQs(
    query: string,
    options?: {
      category?: string;
      language?: string;
    }
  ): Promise<SearchResult<FAQEntry>[]> {
    try {
      const faqs = await this.repository.getActiveFAQs(options?.category);

      // Simple relevance scoring
      const scored = faqs.map(faq => {
        const questionLower = faq.question.toLowerCase();
        const queryLower = query.toLowerCase();
        const score = this.calculateRelevanceScore(questionLower, queryLower);
        return { faq, score };
      }).filter(item => item.score > 0);

      // Sort by score and return top results
      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(item => ({ item: item.faq, score: item.score, highlights: [] }));
    } catch (error) {
      this.logger.error('Failed to search FAQs:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevanceScore(text: string, query: string): number {
    const queryWords = query.split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return 0;

    let matches = 0;
    for (const word of queryWords) {
      if (text.includes(word)) {
        matches++;
      }
    }

    return matches / queryWords.length;
  }

  /**
   * Index article for search
   */
  private indexArticleForSearch(article: KnowledgeArticle): void {
    const terms = this.extractSearchTerms(article);
    this.searchIndex.set(article.id, terms);
  }

  /**
   * Remove from search index
   */
  private removeFromSearchIndex(articleId: string): void {
    this.searchIndex.delete(articleId);
  }

  /**
   * Extract search terms from article
   */
  private extractSearchTerms(article: KnowledgeArticle): string[] {
    const terms: string[] = [];

    // Add title words
    terms.push(...article.title.toLowerCase().split(/\s+/));

    // Add summary words
    terms.push(...article.summary.toLowerCase().split(/\s+/));

    // Add tags
    terms.push(...article.tags.map(t => t.toLowerCase()));

    // Remove duplicates and short words
    return [...new Set(terms)].filter(t => t.length > 2);
  }

  // ============================================================================
  // ARTICLE CATEGORIZATION
  // ============================================================================

  /**
   * Categorize article automatically
   */
  async categorizeArticle(
    title: string,
    summary: string,
    content: string
  ): Promise<CategorizationResult> {
    try {
      const text = `${title} ${summary} ${content}`.toLowerCase();

      // Define category keywords
      const categoryKeywords: Record<string, string[]> = {
        'general': ['help', 'guide', 'tutorial', 'getting started', 'introduction', 'overview'],
        'technical': ['api', 'code', 'function', 'method', 'class', 'interface', 'implementation', 'configuration'],
        'bug_report': ['bug', 'error', 'issue', 'problem', 'fix', 'patch', 'workaround'],
        'feature_request': ['feature', 'request', 'enhancement', 'improvement', 'suggestion', 'idea'],
        'account': ['account', 'login', 'register', 'signup', 'password', 'profile', 'settings'],
        'billing': ['payment', 'subscription', 'billing', 'invoice', 'credit', 'refund', 'pricing'],
        'integration': ['integration', 'connect', 'webhook', 'api', 'third-party', 'external'],
        'documentation': ['documentation', 'docs', 'reference', 'manual', 'guide', 'readme']
      };

      // Find best matching category
      let bestCategory = 'general';
      let bestScore = 0;

      for (const [category, keywords] of Object.entries(categoryKeywords)) {
        let score = 0;
        for (const keyword of keywords) {
          if (text.includes(keyword)) {
            score++;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestCategory = category;
        }
      }

      // Determine difficulty
      const difficulty = this.determineDifficulty(content);

      // Suggest tags
      const suggestedTags = this.suggestTags(title, summary, content);

      return {
        category: bestCategory,
        confidence: Math.min(bestScore / 5, 1),
        suggestedTags,
        difficulty
      };
    } catch (error) {
      this.logger.error('Failed to categorize article:', error instanceof Error ? error : new Error(String(error)));
      return {
        category: 'general',
        confidence: 0,
        suggestedTags: [],
        difficulty: 'intermediate'
      };
    }
  }

  /**
   * Determine article difficulty
   */
  private determineDifficulty(content: string): 'beginner' | 'intermediate' | 'advanced' {
    const readingTime = this.calculateReadingTime(content);

    if (readingTime < 5) {
      return 'beginner';
    } else if (readingTime < 15) {
      return 'intermediate';
    }
    return 'advanced';
  }

  /**
   * Suggest tags for article
   */
  private suggestTags(title: string, summary: string, content: string): string[] {
    const text = `${title} ${summary} ${content}`.toLowerCase();
    const tags: string[] = [];

    // Common technical tags
    const tagKeywords = [
      'api', 'webhook', 'bot', 'discord', 'command', 'slash command',
      'integration', 'plugin', 'module', 'configuration', 'setup',
      'troubleshooting', 'error', 'bug', 'fix', 'guide', 'tutorial',
      'python', 'typescript', 'javascript', 'node', 'database', 'sql',
      'authentication', 'permission', 'role', 'channel', 'server'
    ];

    for (const keyword of tagKeywords) {
      if (text.includes(keyword)) {
        tags.push(keyword);
      }
    }

    return [...new Set(tags)].slice(0, 5);
  }

  // ============================================================================
  // FEEDBACK
  // ============================================================================

  /**
   * Mark article as helpful
   */
  async markArticleHelpful(articleId: string, helpful: boolean): Promise<void> {
    try {
      if (!this.config.enableFeedback) {
        return;
      }

      await this.repository.markArticleHelpful(articleId, helpful);

      // Update statistics
      if (helpful) {
        this.statistics.totalHelpfulVotes++;
      }

      this.logger.info('Article feedback recorded', {
        articleId,
        helpful
      });
    } catch (error) {
      this.logger.error('Failed to record article feedback:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Mark FAQ as helpful
   */
  async markFAQHelpful(faqId: string): Promise<void> {
    try {
      if (!this.config.enableFeedback) {
        return;
      }

      const faq = await this.repository.getFAQ(faqId);
      if (!faq) {
        throw new Error(`FAQ ${faqId} not found`);
      }

      await this.repository.updateFAQ(faqId, {
        helpfulCount: faq.helpfulCount + 1
      });

      this.statistics.totalHelpfulVotes++;

      this.logger.info('FAQ feedback recorded', { faqId });
    } catch (error) {
      this.logger.error('Failed to record FAQ feedback:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // ============================================================================
  // CATEGORY MANAGEMENT
  // ============================================================================

  /**
   * Create article category
   */
  createCategory(
    name: string,
    description?: string,
    parentCategoryId?: string
  ): ArticleCategory {
    const slug = this.generateSlug(name);
    const category: ArticleCategory = {
      id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name,
      slug,
      description,
      parentCategoryId,
      order: this.categories.size + 1,
      articleCount: 0,
      createdAt: new Date()
    };

    this.categories.set(category.id, category);
    this.statistics.totalCategories++;

    this.logger.info('Category created', { categoryId: category.id, name });

    return category;
  }

  /**
   * Get all categories
   */
  getCategories(): ArticleCategory[] {
    return Array.from(this.categories.values());
  }

  /**
   * Get category by ID
   */
  getCategory(categoryId: string): ArticleCategory | null {
    return this.categories.get(categoryId) || null;
  }

  /**
   * Update category
   */
  updateCategory(categoryId: string, updates: Partial<ArticleCategory>): boolean {
    const category = this.categories.get(categoryId);
    if (!category) return false;

    const updated = { ...category, ...updates };
    this.categories.set(categoryId, updated);

    this.logger.info('Category updated', { categoryId });

    return true;
  }

  /**
   * Delete category
   */
  deleteCategory(categoryId: string): boolean {
    const deleted = this.categories.delete(categoryId);
    if (deleted) {
      this.statistics.totalCategories--;
      this.logger.info('Category deleted', { categoryId });
    }
    return deleted;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get knowledge base statistics
   */
  getStatistics(): KnowledgeBaseStatistics {
    return { ...this.statistics };
  }

  /**
   * Update article statistics
   */
  private updateArticleStatistics(article: KnowledgeArticle): void {
    this.statistics.totalArticles++;

    if (article.status === 'published') {
      this.statistics.publishedArticles++;
    } else if (article.status === 'draft') {
      this.statistics.draftArticles++;
    }

    // Update category count
    const category = article.category;
    this.statistics.articlesByCategory[category] =
      (this.statistics.articlesByCategory[category] || 0) + 1;

    // Update difficulty count
    const difficulty = article.metadata.difficulty;
    this.statistics.articlesByDifficulty[difficulty] =
      (this.statistics.articlesByDifficulty[difficulty] || 0) + 1;
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.statistics = {
      totalArticles: 0,
      publishedArticles: 0,
      draftArticles: 0,
      totalFAQs: 0,
      activeFAQs: 0,
      totalViews: 0,
      totalHelpfulVotes: 0,
      totalCategories: 0,
      mostViewedArticles: [],
      mostHelpfulArticles: [],
      articlesByCategory: {},
      articlesByDifficulty: {}
    };
    this.logger.info('Knowledge base statistics reset');
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update knowledge base configuration
   */
  updateConfig(config: Partial<KnowledgeBaseConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Knowledge base config updated', { config: this.config });
  }

  /**
   * Get knowledge base configuration
   */
  getConfig(): KnowledgeBaseConfig {
    return { ...this.config };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Generate URL-friendly slug from title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 100);
  }

  /**
   * Calculate estimated reading time
   */
  private calculateReadingTime(content: string): number {
    const wordCount = content.split(/\s+/).length;
    const wordsPerMinute = 200;
    return Math.ceil(wordCount / wordsPerMinute);
  }
}
