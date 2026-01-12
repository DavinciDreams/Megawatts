/**
 * Feedback Analyzer
 * 
 * AI-powered feedback analysis module for identifying trends,
 * pain points, and improvement opportunities.
 */

import { FeedbackRepository } from './feedback-repository';
import { Feedback, FeedbackQueryOptions, FeedbackInsight, FeedbackAIAnalysis, FeedbackPriority } from './feedback-model';
import { BaseAIProvider } from '../ai/core/ai-provider';
import { AIRequest, AIMessage } from '../types/ai';
import { Logger } from '../utils/logger';

// ============================================================================
// ANALYSIS CONFIGURATION
// ============================================================================

/**
 * Configuration for feedback analyzer
 */
export interface FeedbackAnalyzerConfig {
  enableAutoAnalysis: boolean;
  analysisInterval: number; // in minutes
  minFeedbackForInsights: number;
  sentimentThreshold: {
    positive: number;
    negative: number;
  };
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FeedbackAnalyzerConfig = {
  enableAutoAnalysis: true,
  analysisInterval: 60, // 1 hour
  minFeedbackForInsights: 10,
  sentimentThreshold: {
    positive: 0.3,
    negative: -0.3,
  },
};

// ============================================================================
// ANALYSIS RESULT TYPES
// ============================================================================

/**
 * Trend analysis result
 */
export interface TrendAnalysis {
  period: string;
  metric: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  changeRate: number; // percentage
  confidence: number;
  dataPoints: Array<{ date: Date; value: number }>;
}

/**
 * Pain point analysis result
 */
export interface PainPointAnalysis {
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  frequency: number;
  affectedUsers: number;
  examples: string[];
  suggestedActions: string[];
}

/**
 * Opportunity analysis result
 */
export interface OpportunityAnalysis {
  category: string;
  potentialImpact: 'low' | 'medium' | 'high';
  evidence: string[];
  suggestedFeatures: string[];
  estimatedEffort: 'xs' | 's' | 'm' | 'l' | 'xl';
}

/**
 * Comprehensive analysis result
 */
export interface ComprehensiveAnalysis {
  summary: string;
  trends: TrendAnalysis[];
  painPoints: PainPointAnalysis[];
  opportunities: OpportunityAnalysis[];
  recommendations: string[];
  priority: FeedbackPriority;
  confidence: number;
  analyzedAt: Date;
}

// ============================================================================
// FEEDBACK ANALYZER CLASS
// ============================================================================

/**
 * AI-powered feedback analyzer
 */
export class FeedbackAnalyzer {
  private repository: FeedbackRepository;
  private aiProvider: BaseAIProvider;
  private logger: Logger;
  private config: FeedbackAnalyzerConfig;
  private analysisTimer?: ReturnType<typeof setInterval>;

  constructor(
    repository: FeedbackRepository,
    aiProvider: BaseAIProvider,
    config?: Partial<FeedbackAnalyzerConfig>
  ) {
    this.repository = repository;
    this.aiProvider = aiProvider;
    this.logger = new Logger('FeedbackAnalyzer');
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enableAutoAnalysis) {
      this.startAutoAnalysis();
    }
  }

  /**
   * Analyze a single feedback entry
   * 
   * @param feedback - Feedback to analyze
   * @returns AI analysis results
   */
  async analyzeFeedback(feedback: Feedback): Promise<FeedbackAIAnalysis> {
    try {
      const prompt = this.buildAnalysisPrompt(feedback);
      const request: AIRequest = {
        id: `feedback-analysis-${feedback.id}-${Date.now()}`,
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        maxTokens: 500,
        temperature: 0.3,
        timestamp: new Date(),
      };

      const response = await this.aiProvider.generateResponse(request);
      const analysis = this.parseAnalysisResponse(response.content, feedback);

      // Store analysis in repository
      await this.repository.updateAIAnalysis(feedback.id, analysis);

      this.logger.debug(`Analyzed feedback ${feedback.id}`, { analysis });
      return analysis;
    } catch (error) {
      this.logger.error('Failed to analyze feedback:', error as Error);
      throw error;
    }
  }

  /**
   * Analyze multiple feedback entries in batch
   * 
   * @param feedback - Array of feedback to analyze
   * @returns Array of AI analysis results
   */
  async analyzeFeedbackBatch(feedback: Feedback[]): Promise<FeedbackAIAnalysis[]> {
    const results: FeedbackAIAnalysis[] = [];

    for (const f of feedback) {
      try {
        const analysis = await this.analyzeFeedback(f);
        results.push(analysis);
      } catch (error) {
        this.logger.error(`Failed to analyze feedback ${f.id}:`, error as Error);
        // Continue with next feedback
      }
    }

    return results;
  }

  /**
   * Generate comprehensive analysis from feedback data
   * 
   * @param options - Query options for feedback
   * @returns Comprehensive analysis results
   */
  async generateComprehensiveAnalysis(
    options?: FeedbackQueryOptions
  ): Promise<ComprehensiveAnalysis> {
    try {
      // Get feedback data
      const feedback = await this.repository.queryFeedback(options || {});

      if (feedback.length < this.config.minFeedbackForInsights) {
        return {
          summary: 'Insufficient feedback data for comprehensive analysis.',
          trends: [],
          painPoints: [],
          opportunities: [],
          recommendations: ['Collect more feedback to enable comprehensive analysis.'],
          priority: 'low',
          confidence: 0,
          analyzedAt: new Date(),
        };
      }

      // Analyze trends
      const trends = await this.analyzeTrends(feedback);

      // Identify pain points
      const painPoints = await this.identifyPainPoints(feedback);

      // Find opportunities
      const opportunities = await this.identifyOpportunities(feedback);

      // Generate recommendations using AI
      const recommendations = await this.generateRecommendations(
        feedback,
        trends,
        painPoints,
        opportunities
      );

      // Calculate overall priority
      const priority = this.calculateOverallPriority(painPoints, opportunities);

      // Generate summary
      const summary = await this.generateSummary(feedback, trends, painPoints, opportunities);

      return {
        summary,
        trends,
        painPoints,
        opportunities,
        recommendations,
        priority,
        confidence: this.calculateConfidence(feedback.length),
        analyzedAt: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to generate comprehensive analysis:', error as Error);
      throw error;
    }
  }

  /**
   * Analyze trends in feedback data
   * 
   * @param feedback - Feedback data
   * @returns Trend analysis results
   */
  private async analyzeTrends(feedback: Feedback[]): Promise<TrendAnalysis[]> {
    const trends: TrendAnalysis[] = [];

    // Group feedback by type over time
    const typeOverTime = this.groupByTime(feedback, 'type');

    // Analyze each type for trends
    for (const [type, data] of Object.entries(typeOverTime)) {
      if (data.length < 3) continue;

      const trend = this.calculateTrend(data);
      trends.push({
        period: 'last_30_days',
        metric: type,
        trend: trend.direction,
        changeRate: trend.changeRate,
        confidence: trend.confidence,
        dataPoints: data,
      });
    }

    // Analyze rating trends
    const ratings = feedback.filter((f) => f.rating !== undefined);
    if (ratings.length >= 10) {
      const ratingTrend = this.calculateTrend(
        ratings.map((f) => ({
          date: f.createdAt,
          value: f.rating!,
        }))
      );
      trends.push({
        period: 'last_30_days',
        metric: 'average_rating',
        trend: ratingTrend.direction,
        changeRate: ratingTrend.changeRate,
        confidence: ratingTrend.confidence,
        dataPoints: ratings.map((f) => ({
          date: f.createdAt,
          value: f.rating!,
        })),
      });
    }

    return trends;
  }

  /**
   * Identify pain points from feedback
   * 
   * @param feedback - Feedback data
   * @returns Pain point analysis results
   */
  private async identifyPainPoints(feedback: Feedback[]): Promise<PainPointAnalysis[]> {
    const painPoints: PainPointAnalysis[] = [];

    // Focus on bug reports and negative feedback
    const negativeFeedback = feedback.filter((f) => {
      if (f.type === 'bug_report') return true;
      if (f.aiAnalysis?.sentiment === 'negative') return true;
      if (f.rating !== undefined && f.rating <= 2) return true;
      return false;
    });

    if (negativeFeedback.length === 0) {
      return painPoints;
    }

    // Group by keywords/categories
    const categories = this.extractCategories(negativeFeedback);

    for (const [category, items] of Object.entries(categories)) {
      if (items.length < 2) continue;

      const severity = this.calculateSeverity(items);
      const affectedUsers = new Set(items.map((f) => f.userId)).size;

      painPoints.push({
        category,
        severity,
        frequency: items.length,
        affectedUsers,
        examples: items.slice(0, 3).map((f) => f.content.substring(0, 100)),
        suggestedActions: this.generatePainPointActions(category, severity),
      });
    }

    return painPoints;
  }

  /**
   * Identify opportunities from feedback
   * 
   * @param feedback - Feedback data
   * @returns Opportunity analysis results
   */
  private async identifyOpportunities(feedback: Feedback[]): Promise<OpportunityAnalysis[]> {
    const opportunities: OpportunityAnalysis[] = [];

    // Focus on feature requests and positive feedback
    const positiveFeedback = feedback.filter((f) => {
      if (f.type === 'feature_request') return true;
      if (f.aiAnalysis?.sentiment === 'positive') return true;
      if (f.rating !== undefined && f.rating >= 4) return true;
      return false;
    });

    if (positiveFeedback.length === 0) {
      return opportunities;
    }

    // Group by keywords/categories
    const categories = this.extractCategories(positiveFeedback);

    for (const [category, items] of Object.entries(categories)) {
      if (items.length < 2) continue;

      const potentialImpact = this.calculatePotentialImpact(items);

      opportunities.push({
        category,
        potentialImpact,
        evidence: items.slice(0, 3).map((f) => f.content.substring(0, 100)),
        suggestedFeatures: items.slice(0, 3).map((f) => f.content.substring(0, 50)),
        estimatedEffort: this.estimateEffort(category),
      });
    }

    return opportunities;
  }

  /**
   * Generate recommendations using AI
   * 
   * @param feedback - Feedback data
   * @param trends - Trend analysis
   * @param painPoints - Pain point analysis
   * @param opportunities - Opportunity analysis
   * @returns Recommendations
   */
  private async generateRecommendations(
    feedback: Feedback[],
    trends: TrendAnalysis[],
    painPoints: PainPointAnalysis[],
    opportunities: OpportunityAnalysis[]
  ): Promise<string[]> {
    try {
      const prompt = `
        Based on the following feedback analysis, generate actionable recommendations:

        FEEDBACK SUMMARY:
        - Total feedback: ${feedback.length}
        - By type: ${JSON.stringify(this.groupByType(feedback))}
        - Average rating: ${this.calculateAverageRating(feedback)}

        TRENDS:
        ${JSON.stringify(trends.map((t) => `${t.metric}: ${t.trend} (${t.changeRate}%)`))}

        PAIN POINTS:
        ${JSON.stringify(painPoints.map((p) => `${p.category}: ${p.severity} (${p.frequency} reports)`))}

        OPPORTUNITIES:
        ${JSON.stringify(opportunities.map((o) => `${o.category}: ${o.potentialImpact} impact`))}

        Provide 3-5 specific, actionable recommendations prioritized by impact.
        Each recommendation should be concise and directly address the findings.
      `;

      const request: AIRequest = {
        id: `feedback-recommendations-${Date.now()}`,
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        maxTokens: 800,
        temperature: 0.5,
        timestamp: new Date(),
      };

      const response = await this.aiProvider.generateResponse(request);
      return this.parseRecommendations(response.content);
    } catch (error) {
      this.logger.error('Failed to generate recommendations:', error as Error);
      return ['Unable to generate AI recommendations. Manual review required.'];
    }
  }

  /**
   * Generate analysis summary
   * 
   * @param feedback - Feedback data
   * @param trends - Trend analysis
   * @param painPoints - Pain point analysis
   * @param opportunities - Opportunity analysis
   * @returns Summary text
   */
  private async generateSummary(
    feedback: Feedback[],
    trends: TrendAnalysis[],
    painPoints: PainPointAnalysis[],
    opportunities: OpportunityAnalysis[]
  ): Promise<string> {
    try {
      const prompt = `
        Generate a concise summary (2-3 sentences) of the following feedback analysis:

        - Total feedback: ${feedback.length}
        - Trends identified: ${trends.length}
        - Pain points: ${painPoints.length}
        - Opportunities: ${opportunities.length}

        The summary should highlight the most important findings.
      `;

      const request: AIRequest = {
        id: `feedback-summary-${Date.now()}`,
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a feedback analyst. Generate concise summaries.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        maxTokens: 200,
        temperature: 0.3,
        timestamp: new Date(),
      };

      const response = await this.aiProvider.generateResponse(request);
      return response.content.trim();
    } catch (error) {
      this.logger.error('Failed to generate summary:', error as Error);
      return `Analysis of ${feedback.length} feedback entries revealed ${trends.length} trends, ${painPoints.length} pain points, and ${opportunities.length} opportunities.`;
    }
  }

  /**
   * Build analysis prompt for AI
   * 
   * @param feedback - Feedback to analyze
   * @returns Analysis prompt
   */
  private buildAnalysisPrompt(feedback: Feedback): string {
    return `
      Analyze the following user feedback and provide a JSON response with:
      - sentiment: "positive", "neutral", or "negative"
      - sentimentScore: number between -1 and 1
      - category: brief category (e.g., "ui", "performance", "feature", "bug")
      - keywords: array of relevant keywords
      - summary: brief 1-2 sentence summary
      - suggestedPriority: "low", "medium", "high", or "urgent"

      Feedback:
      Type: ${feedback.type}
      Content: ${feedback.content}
      Rating: ${feedback.rating || 'N/A'}
      ${feedback.metadata ? `Metadata: ${JSON.stringify(feedback.metadata)}` : ''}

      Respond with valid JSON only.
    `;
  }

  /**
   * Get system prompt for AI
   * 
   * @returns System prompt
   */
  private getSystemPrompt(): string {
    return `
      You are a feedback analysis assistant for a Discord bot.
      Analyze user feedback to identify sentiment, categorize issues,
      and suggest priorities. Be objective and concise.
    `;
  }

  /**
   * Parse AI analysis response
   * 
   * @param content - AI response content
   * @param feedback - Original feedback
   * @returns Parsed analysis
   */
  private parseAnalysisResponse(content: string, feedback: Feedback): FeedbackAIAnalysis {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          sentiment: parsed.sentiment || 'neutral',
          sentimentScore: parsed.sentimentScore || 0,
          category: parsed.category,
          keywords: parsed.keywords || [],
          summary: parsed.summary,
          suggestedPriority: parsed.suggestedPriority || 'medium',
          analyzedAt: new Date(),
        };
      }
    } catch (error) {
      this.logger.warn('Failed to parse AI response, using fallback', error as Error);
    }

    // Fallback: simple keyword-based analysis
    return this.fallbackAnalysis(feedback);
  }

  /**
   * Fallback analysis when AI fails
   * 
   * @param feedback - Feedback to analyze
   * @returns Basic analysis
   */
  private fallbackAnalysis(feedback: Feedback): FeedbackAIAnalysis {
    const content = feedback.content.toLowerCase();
    const keywords: string[] = [];

    // Extract keywords
    const keywordPatterns = [
      'bug', 'error', 'crash', 'slow', 'lag',
      'feature', 'improve', 'add', 'better',
      'confusing', 'hard', 'difficult',
      'love', 'great', 'helpful', 'good',
    ];

    for (const pattern of keywordPatterns) {
      if (content.includes(pattern)) {
        keywords.push(pattern);
      }
    }

    // Determine sentiment
    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    let sentimentScore = 0;

    if (feedback.rating) {
      sentimentScore = (feedback.rating - 3) / 2;
      if (feedback.rating >= 4) sentiment = 'positive';
      else if (feedback.rating <= 2) sentiment = 'negative';
    } else {
      const positiveWords = ['love', 'great', 'helpful', 'good', 'awesome', 'thanks'];
      const negativeWords = ['bug', 'error', 'crash', 'slow', 'lag', 'bad', 'hate'];

      const positiveCount = positiveWords.filter((w) => content.includes(w)).length;
      const negativeCount = negativeWords.filter((w) => content.includes(w)).length;

      if (positiveCount > negativeCount) {
        sentiment = 'positive';
        sentimentScore = 0.5;
      } else if (negativeCount > positiveCount) {
        sentiment = 'negative';
        sentimentScore = -0.5;
      }
    }

    // Determine category
    let category: string | undefined;
    if (feedback.type === 'bug_report') category = 'bug';
    else if (feedback.type === 'feature_request') category = 'feature';
    else if (keywords.some((k) => ['bug', 'error', 'crash'].includes(k))) category = 'bug';
    else if (keywords.some((k) => ['feature', 'improve', 'add'].includes(k))) category = 'feature';
    else category = 'general';

    // Determine priority
    let suggestedPriority: FeedbackPriority = 'medium';
    if (sentiment === 'negative' || feedback.type === 'bug_report') {
      suggestedPriority = 'high';
    } else if (feedback.rating && feedback.rating <= 2) {
      suggestedPriority = 'urgent';
    }

    return {
      sentiment,
      sentimentScore,
      category,
      keywords,
      summary: feedback.content.substring(0, 100),
      suggestedPriority,
      analyzedAt: new Date(),
    };
  }

  /**
   * Parse recommendations from AI response
   * 
   * @param content - AI response content
   * @returns Array of recommendations
   */
  private parseRecommendations(content: string): string[] {
    const recommendations: string[] = [];

    // Try to extract numbered list
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^\d+\./) || trimmed.match(/^-/)) {
        recommendations.push(trimmed.replace(/^\d+\.\s*/, '').replace(/^-\s*/, ''));
      }
    }

    return recommendations.length > 0 ? recommendations : [content];
  }

  /**
   * Group feedback by time
   * 
   * @param feedback - Feedback data
   * @param field - Field to analyze
   * @returns Grouped data
   */
  private groupByTime<T extends { createdAt: Date }>(
    feedback: T[],
    field: string
  ): Record<string, Array<{ date: Date; value: any }>> {
    const grouped: Record<string, Array<{ date: Date; value: any }>> = {};

    // Group by day
    for (const f of feedback) {
      const day = f.createdAt.toISOString().split('T')[0];
      if (!grouped[field]) grouped[field] = [];
      grouped[field].push({ date: f.createdAt, value: (f as any)[field] });
    }

    return grouped;
  }

  /**
   * Calculate trend direction
   * 
   * @param data - Data points
   * @returns Trend analysis
   */
  private calculateTrend(data: Array<{ date: Date; value: number }>): {
    direction: 'increasing' | 'decreasing' | 'stable';
    changeRate: number;
    confidence: number;
  } {
    if (data.length < 3) {
      return { direction: 'stable', changeRate: 0, confidence: 0 };
    }

    // Simple linear regression
    const n = data.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += data[i].value;
      sumXY += i * data[i].value;
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgY = sumY / n;

    let direction: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (slope > 0.01) direction = 'increasing';
    else if (slope < -0.01) direction = 'decreasing';

    // Calculate change rate
    const changeRate = (slope / avgY) * 100;

    // Simple confidence based on variance
    const variance = data.reduce((sum, d) => sum + Math.pow(d.value - avgY, 2), 0) / n;
    const confidence = Math.max(0, 1 - variance / (avgY * avgY || 1));

    return { direction, changeRate, confidence };
  }

  /**
   * Extract categories from feedback
   * 
   * @param feedback - Feedback data
   * @returns Categorized feedback
   */
  private extractCategories(feedback: Feedback[]): Record<string, Feedback[]> {
    const categories: Record<string, Feedback[]> = {};

    for (const f of feedback) {
      const category = f.aiAnalysis?.category || f.type;
      if (!categories[category]) categories[category] = [];
      categories[category].push(f);
    }

    return categories;
  }

  /**
   * Group feedback by type
   * 
   * @param feedback - Feedback data
   * @returns Grouped by type
   */
  private groupByType(feedback: Feedback[]): Record<string, number> {
    const grouped: Record<string, number> = {};

    for (const f of feedback) {
      grouped[f.type] = (grouped[f.type] || 0) + 1;
    }

    return grouped;
  }

  /**
   * Calculate average rating
   * 
   * @param feedback - Feedback data
   * @returns Average rating
   */
  private calculateAverageRating(feedback: Feedback[]): number {
    const ratings = feedback.filter((f) => f.rating !== undefined).map((f) => f.rating!);
    if (ratings.length === 0) return 0;
    return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  }

  /**
   * Calculate severity for pain points
   * 
   * @param feedback - Feedback data
   * @returns Severity level
   */
  private calculateSeverity(feedback: Feedback[]): 'low' | 'medium' | 'high' | 'critical' {
    const avgRating = this.calculateAverageRating(feedback);
    const negativeCount = feedback.filter((f) => f.aiAnalysis?.sentiment === 'negative').length;
    const ratio = negativeCount / feedback.length;

    if (avgRating <= 1.5 || ratio > 0.7) return 'critical';
    if (avgRating <= 2 || ratio > 0.5) return 'high';
    if (avgRating <= 3 || ratio > 0.3) return 'medium';
    return 'low';
  }

  /**
   * Calculate potential impact for opportunities
   * 
   * @param feedback - Feedback data
   * @returns Impact level
   */
  private calculatePotentialImpact(feedback: Feedback[]): 'low' | 'medium' | 'high' {
    const avgRating = this.calculateAverageRating(feedback);
    const positiveCount = feedback.filter((f) => f.aiAnalysis?.sentiment === 'positive').length;
    const ratio = positiveCount / feedback.length;

    if (avgRating >= 4.5 || ratio > 0.7) return 'high';
    if (avgRating >= 4 || ratio > 0.5) return 'medium';
    return 'low';
  }

  /**
   * Estimate effort for a category
   * 
   * @param category - Category name
   * @returns Effort estimate
   */
  private estimateEffort(category: string): 'xs' | 's' | 'm' | 'l' | 'xl' {
    // Simple heuristic based on category
    const effortMap: Record<string, 'xs' | 's' | 'm' | 'l' | 'xl'> = {
      'ui': 's',
      'performance': 'm',
      'feature': 'l',
      'bug': 's',
      'general': 'm',
    };

    return effortMap[category] || 'm';
  }

  /**
   * Generate pain point actions
   * 
   * @param category - Category
   * @param severity - Severity
   * @returns Suggested actions
   */
  private generatePainPointActions(
    category: string,
    severity: string
  ): string[] {
    const actions: string[] = [];

    if (severity === 'critical' || severity === 'high') {
      actions.push('Immediate investigation required');
      actions.push('Consider temporary workaround');
    }

    if (category === 'performance') {
      actions.push('Profile and optimize affected code paths');
      actions.push('Review database queries');
    } else if (category === 'bug') {
      actions.push('Reproduce and fix the issue');
      actions.push('Add test coverage');
    } else if (category === 'ui') {
      actions.push('Review user experience');
      actions.push('Consider A/B testing alternatives');
    }

    return actions;
  }

  /**
   * Calculate overall priority
   * 
   * @param painPoints - Pain point analysis
   * @param opportunities - Opportunity analysis
   * @returns Priority level
   */
  private calculateOverallPriority(
    painPoints: PainPointAnalysis[],
    opportunities: OpportunityAnalysis[]
  ): FeedbackPriority {
    const criticalPainPoints = painPoints.filter((p) => p.severity === 'critical').length;
    const highPainPoints = painPoints.filter((p) => p.severity === 'high').length;
    const highOpportunities = opportunities.filter((o) => o.potentialImpact === 'high').length;

    if (criticalPainPoints > 0) return 'urgent';
    if (highPainPoints > 2 || highOpportunities > 1) return 'high';
    if (highPainPoints > 0 || highOpportunities > 0) return 'medium';
    return 'low';
  }

  /**
   * Calculate confidence based on sample size
   * 
   * @param sampleSize - Number of feedback items
   * @returns Confidence score
   */
  private calculateConfidence(sampleSize: number): number {
    // Simple confidence based on sample size
    // More samples = higher confidence
    if (sampleSize >= 100) return 0.95;
    if (sampleSize >= 50) return 0.85;
    if (sampleSize >= 20) return 0.70;
    if (sampleSize >= 10) return 0.50;
    return 0.25;
  }

  /**
   * Start automatic analysis
   */
  private startAutoAnalysis(): void {
    this.analysisTimer = setInterval(async () => {
      try {
        await this.runAutoAnalysis();
      } catch (error) {
        this.logger.error('Auto analysis failed:', error as Error);
      }
    }, this.config.analysisInterval * 60 * 1000);

    this.logger.info('Auto analysis started', { interval: this.config.analysisInterval });
  }

  /**
   * Run automatic analysis
   */
  private async runAutoAnalysis(): Promise<void> {
    // Get unanalyzed feedback
    const unanalyzed = await this.repository.queryFeedback({
      status: 'new',
    });

    if (unanalyzed.length === 0) {
      return;
    }

    this.logger.info(`Running auto analysis on ${unanalyzed.length} feedback items`);
    await this.analyzeFeedbackBatch(unanalyzed);
  }

  /**
   * Stop automatic analysis
   */
  stopAutoAnalysis(): void {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = undefined;
      this.logger.info('Auto analysis stopped');
    }
  }

  /**
   * Update analyzer configuration
   * 
   * @param config - New configuration
   */
  updateConfig(config: Partial<FeedbackAnalyzerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Feedback analyzer configuration updated', { config: this.config });
  }

  /**
   * Get current configuration
   * 
   * @returns Current configuration
   */
  getConfig(): FeedbackAnalyzerConfig {
    return { ...this.config };
  }
}
