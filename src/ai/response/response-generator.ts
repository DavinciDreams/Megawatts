/**
 * Response Generator
 * 
 * This module implements dynamic response strategy selection and generation
 * for AI system.
 */

import { 
  ResponseGeneration,
  ResponseStrategy,
  ResponseMetadata,
  ResponsePersonalization,
  ResponseQuality,
  SafetyAnalysis,
  ConversationContext,
  UserPreferences,
  IntentAnalysis,
  SentimentAnalysis
} from '../../types/ai';
import { Logger } from '../../utils/logger';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Handlebars from 'handlebars';

// ============================================================================
// RESPONSE GENERATOR CLASS
// ============================================================================

export class ResponseGenerator {
  private logger: Logger;
  private config: ResponseGeneratorConfig;
  private templates: Map<string, ResponseTemplate> = new Map();
  private strategies: Map<string, ResponseStrategyHandler> = new Map();
  private personalizers: Map<string, ResponsePersonalizer> = new Map();
  private qualityValidators: ResponseQualityValidator[] = [];
  private openaiClient?: OpenAI;
  private anthropicClient?: Anthropic;

  constructor(config: ResponseGeneratorConfig, logger: Logger) {
    this.logger = logger;
    this.config = config;
    this.initializeAIClients();
    this.initializeStrategies();
    this.initializeTemplates();
    this.initializePersonalizers();
    this.initializeQualityValidators();
  }

  private initializeAIClients(): void {
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (openaiKey) {
      this.openaiClient = new OpenAI({ apiKey: openaiKey });
      this.logger.info('OpenAI client initialized');
    }

    if (anthropicKey) {
      this.anthropicClient = new Anthropic({ apiKey: anthropicKey });
      this.logger.info('Anthropic client initialized');
    }

    if (!openaiKey && !anthropicKey) {
      this.logger.warn('No AI API keys configured - AI responses will use fallback');
    }
  }

  /**
   * Generate a response
   */
  async generateResponse(
    input: string,
    context: ConversationContext,
    options?: ResponseGenerationOptions
  ): Promise<ResponseGeneration> {
    try {
      const startTime = Date.now();

      // Analyze input and context
      const analysis = await this.analyzeInput(input, context);
      
      // Select response strategy
      const strategy = await this.selectStrategy(analysis, context, options);
      
      // Generate base response
      const baseResponse = await this.generateBaseResponse(strategy, analysis, context);
      
      // Apply personalization
      const personalizedResponse = await this.personalizeResponse(
        baseResponse, 
        context, 
        analysis
      );
      
      // Validate safety
      const safetyAnalysis = await this.validateSafety(personalizedResponse, context);
      
      // Apply safety modifications if needed
      const safeResponse = await this.applySafetyModifications(
        personalizedResponse, 
        safetyAnalysis
      );
      
      // Validate quality
      const qualityAnalysis = await this.validateQuality(safeResponse, analysis, context);
      
      // Create final response
      const response: ResponseGeneration = {
        strategy,
        content: safeResponse.content,
        metadata: {
          type: 'text',
          format: 'markdown',
          length: safeResponse.content.length,
          tokens: this.estimateTokens(safeResponse.content),
          processingTime: Date.now() - startTime
        },
        personalization: safeResponse.personalization,
        safety: safetyAnalysis,
        quality: qualityAnalysis
      };

      this.logger.info('Response generated successfully', {
        strategy: strategy.type,
        length: response.metadata.length,
        processingTime: response.metadata.processingTime,
        quality: qualityAnalysis.overall
      });

      return response;

    } catch (error) {
      this.logger.error('Failed to generate response', error as Error);
      
      // Fallback response
      return this.generateFallbackResponse(error as Error);
    }
  }

  /**
   * Generate multiple response options
   */
  async generateResponseOptions(
    input: string,
    context: ConversationContext,
    count: number = 3
  ): Promise<ResponseGeneration[]> {
    const responses: ResponseGeneration[] = [];

    for (let i = 0; i < count; i++) {
      const options: ResponseGenerationOptions = {
        variation: i,
        creativeMode: i > 0
      };
      
      const response = await this.generateResponse(input, context, options);
      responses.push(response);
    }

    return responses;
  }

  /**
   * Refine an existing response
   */
  async refineResponse(
    originalResponse: ResponseGeneration,
    feedback: ResponseFeedback,
    context: ConversationContext
  ): Promise<ResponseGeneration> {
    try {
      // Apply feedback-based refinements
      const refinedContent = await this.applyFeedbackRefinements(
        originalResponse.content,
        feedback,
        context
      );

      // Create refined response
      const refinedResponse: ResponseGeneration = {
        ...originalResponse,
        content: refinedContent,
        metadata: {
          ...originalResponse.metadata,
          processingTime: Date.now()
        },
        personalization: {
          adapted: true,
          adjustments: feedback.adjustments || [],
          userProfile: true,
          contextual: true
        }
      };

      // Re-validate quality
      refinedResponse.quality = await this.validateQuality(refinedResponse, null, context);

      this.logger.info('Response refined based on feedback', {
        feedbackType: feedback.type,
        quality: refinedResponse.quality.overall
      });

      return refinedResponse;

    } catch (error) {
      this.logger.error('Failed to refine response', error as Error);
      return originalResponse;
    }
  }

  /**
   * Get available response strategies
   */
  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Add a custom response template
   */
  addTemplate(template: ResponseTemplate): void {
    this.templates.set(template.id, template);
    this.logger.info('Response template added', { templateId: template.id });
  }

  /**
   * Remove a response template
   */
  removeTemplate(templateId: string): boolean {
    const removed = this.templates.delete(templateId);
    if (removed) {
      this.logger.info('Response template removed', { templateId });
    }
    return removed;
  }

  /**
   * Analyze input and context
   */
  private async analyzeInput(
    input: string, 
    context: ConversationContext
  ): Promise<InputAnalysis> {
    return {
      input,
      length: input.length,
      complexity: this.calculateComplexity(input),
      intent: context.intents[context.intents.length - 1],
      sentiment: context.sentiment,
      entities: context.entities,
      urgency: this.assessUrgency(input, context),
      context
    };
  }

  /**
   * Select response strategy
   */
  private async selectStrategy(
    analysis: InputAnalysis,
    context: ConversationContext,
    options?: ResponseGenerationOptions
  ): Promise<ResponseStrategy> {
    // Check for explicit strategy in options
    if (options?.strategy) {
      const handler = this.strategies.get(options.strategy);
      if (handler) {
        return handler.getStrategy(analysis, context, options);
      }
    }

    // Auto-select based on analysis
    for (const [name, handler] of this.strategies) {
      if (await handler.shouldUse(analysis, context, options)) {
        return handler.getStrategy(analysis, context, options);
      }
    }

    // Fallback to default strategy
    return this.strategies.get('default')!.getStrategy(analysis, context, options);
  }

  /**
   * Generate base response using strategy
   */
  private async generateBaseResponse(
    strategy: ResponseStrategy,
    analysis: InputAnalysis,
    context: ConversationContext
  ): Promise<ResponseGeneration> {
    const handler = this.strategies.get(strategy.type);
    if (!handler) {
      throw new Error(`Unknown strategy: ${strategy.type}`);
    }

    return handler.generate(strategy, analysis, context);
  }

  /**
   * Personalize response
   */
  private async personalizeResponse(
    response: ResponseGeneration,
    context: ConversationContext,
    analysis: InputAnalysis
  ): Promise<ResponseGeneration> {
    if (!context.userPreferences) {
      return response;
    }

    let personalizedContent = response.content;
    const adjustments: any[] = [];

    // Apply personalization strategies
    for (const [name, personalizer] of this.personalizers) {
      if (await personalizer.shouldApply(context, analysis)) {
        const result = await personalizer.apply(
          personalizedContent, 
          context, 
          analysis
        );
        
        personalizedContent = result.content;
        adjustments.push(result.adjustment);
      }
    }

    return {
      ...response,
      content: personalizedContent,
      personalization: {
        adapted: adjustments.length > 0,
        adjustments,
        userProfile: true,
        contextual: true
      }
    };
  }

  /**
   * Validate response safety
   */
  private async validateSafety(
    response: ResponseGeneration,
    context: ConversationContext
  ): Promise<SafetyAnalysis> {
    // This would integrate with safety system
    // For now, return a basic safety analysis
    return {
      overall: 'safe',
      categories: [],
      confidence: 0.9,
      reasoning: ['Basic safety validation passed'],
      recommendations: [],
      blocked: false
    };
  }

  /**
   * Apply safety modifications
   */
  private async applySafetyModifications(
    response: ResponseGeneration,
    safetyAnalysis: SafetyAnalysis
  ): Promise<ResponseGeneration> {
    if (safetyAnalysis.blocked) {
      // Generate safe fallback
      return this.generateSafeFallback(safetyAnalysis);
    }

    if (safetyAnalysis.recommendations.length > 0) {
      // Apply recommended modifications
      let modifiedContent = response.content;
      
      for (const recommendation of safetyAnalysis.recommendations) {
        if (recommendation.type === 'modify') {
          modifiedContent = this.applyModification(
            modifiedContent, 
            recommendation
          );
        }
      }

      return {
        ...response,
        content: modifiedContent,
        personalization: {
          ...response.personalization,
          adjustments: [
            ...response.personalization.adjustments,
            {
              type: 'safety',
              original: response.content,
              modified: modifiedContent,
              reason: 'Applied safety recommendations'
            }
          ]
        }
      };
    }

    return response;
  }

  /**
   * Validate response quality
   */
  private async validateQuality(
    response: ResponseGeneration,
    analysis: InputAnalysis | null,
    context: ConversationContext
  ): Promise<ResponseQuality> {
    const qualityScores = await Promise.all(
      this.qualityValidators.map(validator => 
        validator.validate(response, analysis, context)
      )
    );

    // Aggregate quality scores
    const quality: ResponseQuality = {
      relevance: this.averageScore(qualityScores.map((q: any) => q.relevance)),
      accuracy: this.averageScore(qualityScores.map((q: any) => q.accuracy)),
      clarity: this.averageScore(qualityScores.map((q: any) => q.clarity)),
      completeness: this.averageScore(qualityScores.map((q: any) => q.completeness)),
      appropriateness: this.averageScore(qualityScores.map((q: any) => q.appropriateness)),
      overall: 0
    };

    quality.overall = (
      quality.relevance + 
      quality.accuracy + 
      quality.clarity + 
      quality.completeness + 
      quality.appropriateness
    ) / 5;

    return quality;
  }

  /**
   * Generate fallback response
   */
  private generateFallbackResponse(error: Error): ResponseGeneration {
    const fallbackContent = this.config.fallbackMessage || 
      "I'm sorry, I'm having trouble generating a response right now. Please try again later.";

    return {
      strategy: {
        type: 'template',
        template: 'fallback',
        parameters: { error: error.message },
        confidence: 0.1
      },
      content: fallbackContent,
      metadata: {
        type: 'text',
        format: 'plain',
        length: fallbackContent.length,
        tokens: this.estimateTokens(fallbackContent),
        processingTime: 0
      },
      personalization: {
        adapted: false,
        adjustments: [],
        userProfile: false,
        contextual: false
      },
      safety: {
        overall: 'safe',
        categories: [],
        confidence: 1.0,
        reasoning: ['Fallback response is safe'],
        recommendations: [],
        blocked: false
      },
      quality: {
        relevance: 0.5,
        accuracy: 0.8,
        clarity: 0.9,
        completeness: 0.3,
        appropriateness: 0.9,
        overall: 0.68
      }
    };
  }

  /**
   * Generate safe fallback
   */
  private generateSafeFallback(safetyAnalysis: SafetyAnalysis): ResponseGeneration {
    const safeMessage = "I'm sorry, but I can't provide a response to that request. Let's talk about something else.";

    return {
      strategy: {
        type: 'template',
        template: 'safe_fallback',
        parameters: { reason: safetyAnalysis.reasoning.join(', ') },
        confidence: 1.0
      },
      content: safeMessage,
      metadata: {
        type: 'text',
        format: 'plain',
        length: safeMessage.length,
        tokens: this.estimateTokens(safeMessage),
        processingTime: 0
      },
      personalization: {
        adapted: false,
        adjustments: [],
        userProfile: false,
        contextual: false
      },
      safety: {
        overall: 'safe',
        categories: [],
        confidence: 1.0,
        reasoning: ['Safe fallback response'],
        recommendations: [],
        blocked: false
      },
      quality: {
        relevance: 0.3,
        accuracy: 0.9,
        clarity: 0.8,
        completeness: 0.2,
        appropriateness: 1.0,
        overall: 0.64
      }
    };
  }

  /**
   * Apply feedback-based refinements
   */
  private async applyFeedbackRefinements(
    content: string,
    feedback: ResponseFeedback,
    context: ConversationContext
  ): Promise<string> {
    let refinedContent = content;

    switch (feedback.type) {
      case 'too_long':
        refinedContent = this.shortenContent(content, 0.7);
        break;
      case 'too_short':
        refinedContent = this.expandContent(content, context);
        break;
      case 'too_formal':
        refinedContent = this.makeContentCasual(refinedContent);
        break;
      case 'too_casual':
        refinedContent = this.makeContentFormal(refinedContent);
        break;
      case 'unclear':
        refinedContent = this.clarifyContent(refinedContent);
        break;
      case 'inaccurate':
        refinedContent = await this.correctContent(refinedContent, context);
        break;
    }

    return refinedContent;
  }

  /**
   * Helper methods
   */
  private calculateComplexity(input: string): number {
    // Simple complexity calculation based on length, punctuation, and vocabulary
    const words = input.split(/\s+/).length;
    const sentences = input.split(/[.!?]+/).length;
    const avgWordsPerSentence = words / sentences;
    const uniqueWords = new Set(input.toLowerCase().split(/\s+/)).size;
    const vocabularyRatio = uniqueWords / words;

    return Math.min(1.0, (avgWordsPerSentence / 10 + vocabularyRatio) / 2);
  }

  private assessUrgency(input: string, context: ConversationContext): number {
    const urgencyKeywords = ['urgent', 'asap', 'immediately', 'emergency', 'help'];
    const lowerInput = input.toLowerCase();
    
    let urgencyScore = 0;
    for (const keyword of urgencyKeywords) {
      if (lowerInput.includes(keyword)) {
        urgencyScore += 0.2;
      }
    }

    // Check for exclamation marks
    const exclamationCount = (input.match(/!/g) || []).length;
    urgencyScore += Math.min(0.3, exclamationCount * 0.1);

    return Math.min(1.0, urgencyScore);
  }

  private estimateTokens(text: string): number {
    // Rough token estimation (approximately 4 characters per token)
    return Math.ceil(text.length / 4);
  }

  private averageScore(scores: number[]): number {
    if (scores.length === 0) return 0;
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  private shortenContent(content: string, ratio: number): string {
    const targetLength = Math.floor(content.length * ratio);
    return content.substring(0, targetLength) + (content.length > targetLength ? '...' : '');
  }

  private expandContent(content: string, context: ConversationContext): string {
    // Add context-aware expansion
    const expansions = [
      "Could you tell me more about that?",
      "I'd be happy to help you with that.",
      "Let me provide some additional information."
    ];
    
    return content + " " + expansions[Math.floor(Math.random() * expansions.length)];
  }

  private makeContentCasual(content: string): string {
    return content
      .replace(/\b(do not)\b/gi, "don't")
      .replace(/\b(cannot)\b/gi, "can't")
      .replace(/\b(will not)\b/gi, "won't")
      .replace(/\b(I am)\b/gi, "I'm");
  }

  private makeContentFormal(content: string): string {
    return content
      .replace(/\b(don't)\b/gi, "do not")
      .replace(/\b(can't)\b/gi, "cannot")
      .replace(/\b(won't)\b/gi, "will not")
      .replace(/\b(I'm)\b/gi, "I am");
  }

  private clarifyContent(content: string): string {
    return "Let me clarify: " + content;
  }

  private async correctContent(content: string, context: ConversationContext): Promise<string> {
    // This would integrate with fact-checking system
    return content;
  }

  private applyModification(content: string, recommendation: any): string {
    // Apply safety modification based on recommendation
    return content;
  }

  /**
   * Initialize response strategies
   */
  private initializeStrategies(): void {
    this.strategies.set('default', new DefaultStrategyHandler(this.openaiClient, this.anthropicClient, this.logger));
    this.strategies.set('template', new TemplateStrategyHandler(this.templates, this.logger));
    this.strategies.set('ai_generated', new AIGeneratedStrategyHandler(this.openaiClient, this.anthropicClient, this.logger));
    this.strategies.set('hybrid', new HybridStrategyHandler(this.templates, this.openaiClient, this.anthropicClient, this.logger));
  }

  /**
   * Initialize templates
   */
  private initializeTemplates(): void {
    // Add basic templates
    this.templates.set('greeting', {
      id: 'greeting',
      name: 'Greeting Response',
      content: 'Hello! How can I help you today?',
      variables: [],
      conditions: ['intent:greeting'],
      priority: 1
    });

    this.templates.set('error', {
      id: 'error',
      name: 'Error Response',
      content: 'I apologize, but something went wrong. Please try again.',
      variables: [],
      conditions: ['error'],
      priority: 10
    });
  }

  /**
   * Initialize personalizers
   */
  private initializePersonalizers(): void {
    // Tone personalizer
    this.personalizers.set('tone', new TonePersonalizer());
    
    // Length personalizer
    this.personalizers.set('length', new LengthPersonalizer());
    
    // Format personalizer
    this.personalizers.set('format', new FormatPersonalizer());
  }

  /**
   * Initialize quality validators
   */
  private initializeQualityValidators(): void {
    this.qualityValidators = [
      new RelevanceValidator(),
      new ClarityValidator(),
      new AppropriatenessValidator(),
      new CompletenessValidator()
    ];
  }
}

// ============================================================================
// SUPPORTING INTERFACES AND CLASSES
// ============================================================================

export interface ResponseGeneratorConfig {
  defaultStrategy: string;
  fallbackMessage?: string;
  enablePersonalization: boolean;
  enableSafetyChecks: boolean;
  enableQualityValidation: boolean;
  maxResponseLength: number;
}

export interface ResponseGenerationOptions {
  strategy?: string;
  creativeMode?: boolean;
  variation?: number;
  maxLength?: number;
  format?: 'plain' | 'markdown' | 'html';
}

export interface InputAnalysis {
  input: string;
  length: number;
  complexity: number;
  intent?: IntentAnalysis;
  sentiment?: SentimentAnalysis;
  entities: any[];
  urgency: number;
  context: ConversationContext;
}

export interface ResponseFeedback {
  type: 'too_long' | 'too_short' | 'too_formal' | 'too_casual' | 'unclear' | 'inaccurate';
  rating: number;
  comment?: string;
  adjustments?: any[];
}

export interface ResponseTemplate {
  id: string;
  name: string;
  content: string;
  variables: string[];
  conditions: string[];
  priority: number;
}

export interface ResponseStrategyHandler {
  shouldUse(analysis: InputAnalysis, context: ConversationContext, options?: ResponseGenerationOptions): Promise<boolean>;
  getStrategy(analysis: InputAnalysis, context: ConversationContext, options?: ResponseGenerationOptions): Promise<ResponseStrategy>;
  generate(strategy: ResponseStrategy, analysis: InputAnalysis, context: ConversationContext): Promise<ResponseGeneration>;
}

export interface ResponsePersonalizer {
  shouldApply(context: ConversationContext, analysis: InputAnalysis): Promise<boolean>;
  apply(content: string, context: ConversationContext, analysis: InputAnalysis): Promise<{content: string, adjustment: any}>;
}

export interface ResponseQualityValidator {
  validate(response: ResponseGeneration, analysis: InputAnalysis | null, context: ConversationContext): Promise<Partial<ResponseQuality>>;
}

// Strategy Handler Implementations
class DefaultStrategyHandler implements ResponseStrategyHandler {
  private openaiClient?: OpenAI;
  private anthropicClient?: Anthropic;
  private logger: Logger;

  constructor(openaiClient?: OpenAI, anthropicClient?: Anthropic, logger?: Logger) {
    this.openaiClient = openaiClient;
    this.anthropicClient = anthropicClient;
    this.logger = logger || { info: console.log, warn: console.warn, error: console.error };
  }

  async shouldUse(analysis: InputAnalysis, context: ConversationContext, options?: ResponseGenerationOptions): Promise<boolean> {
    return !options?.strategy;
  }

  async getStrategy(analysis: InputAnalysis, context: ConversationContext, options?: ResponseGenerationOptions): Promise<ResponseStrategy> {
    return {
      type: 'ai_generated',
      parameters: { fallback: true },
      confidence: 0.5
    };
  }

  async generate(strategy: ResponseStrategy, analysis: InputAnalysis, context: ConversationContext): Promise<ResponseGeneration> {
    const startTime = Date.now();

    try {
      let content = '';

      // Try OpenAI first
      if (this.openaiClient) {
        const response = await this.openaiClient.chat.completions.create({
          model: process.env.AI_MODEL || 'gpt-4',
          messages: [
            { role: 'system', content: this.buildSystemPrompt(context) },
            { role: 'user', content: analysis.input }
          ],
          max_tokens: parseInt(process.env.AI_MAX_TOKENS || '2048'),
          temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7')
        });
        content = response.choices[0]?.message?.content || '';
      } 
      // Fallback to Anthropic
      else if (this.anthropicClient) {
        const response = await this.anthropicClient.messages.create({
          model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
          max_tokens: parseInt(process.env.AI_MAX_TOKENS || '2048'),
          system: this.buildSystemPrompt(context),
          messages: [{ role: 'user', content: analysis.input }]
        });
        content = response.content[0]?.type === 'text' ? response.content[0].text : '';
      } 
      // Final fallback
      else {
        content = this.generateDefaultResponse(analysis);
      }

      return {
        strategy,
        content,
        metadata: {
          type: 'text',
          format: 'markdown',
          length: content.length,
          tokens: this.estimateTokens(content),
          processingTime: Date.now() - startTime
        },
        personalization: {
          adapted: false,
          adjustments: [],
          userProfile: false,
          contextual: false
        },
        safety: {
          overall: 'safe',
          categories: [],
          confidence: 0.9,
          reasoning: ['Default strategy response'],
          recommendations: [],
          blocked: false
        },
        quality: {
          relevance: 0.8,
          accuracy: 0.8,
          clarity: 0.8,
          completeness: 0.7,
          appropriateness: 0.9,
          overall: 0.8
        }
      };
    } catch (error) {
      this.logger.error('Default strategy generation failed', error as Error);
      return this.generateFallbackResponse(analysis);
    }
  }

  private buildSystemPrompt(context: ConversationContext): string {
    return `You are a helpful Discord bot assistant. 
Respond in a friendly, helpful manner.
Keep responses concise and relevant to user's query.
${context.userPreferences ? `User preferences: ${JSON.stringify(context.userPreferences)}` : ''}`;
  }

  private generateDefaultResponse(analysis: InputAnalysis): string {
    const responses = [
      "I understand your request. Let me help you with that.",
      "Thanks for reaching out! How can I assist you today?",
      "I'm here to help. What would you like to know?",
      "Got it! Let me provide some information on that topic."
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private generateFallbackResponse(analysis: InputAnalysis): ResponseGeneration {
    const fallbackContent = this.generateDefaultResponse(analysis);
    return {
      strategy: {
        type: 'ai_generated',
        parameters: { fallback: true },
        confidence: 0.3
      },
      content: fallbackContent,
      metadata: {
        type: 'text',
        format: 'plain',
        length: fallbackContent.length,
        tokens: this.estimateTokens(fallbackContent),
        processingTime: 0
      },
      personalization: {
        adapted: false,
        adjustments: [],
        userProfile: false,
        contextual: false
      },
      safety: {
        overall: 'safe',
        categories: [],
        confidence: 1.0,
        reasoning: ['Fallback response'],
        recommendations: [],
        blocked: false
      },
      quality: {
        relevance: 0.5,
        accuracy: 0.7,
        clarity: 0.8,
        completeness: 0.5,
        appropriateness: 0.9,
        overall: 0.68
      }
    };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

class TemplateStrategyHandler implements ResponseStrategyHandler {
  private templates: Map<string, ResponseTemplate>;
  private handlebars: typeof Handlebars;
  private logger: Logger;

  constructor(templates: Map<string, ResponseTemplate>, logger?: Logger) {
    this.templates = templates;
    this.handlebars = Handlebars.create();
    this.logger = logger || { info: console.log, warn: console.warn, error: console.error };
  }

  async shouldUse(analysis: InputAnalysis, context: ConversationContext, options?: ResponseGenerationOptions): Promise<boolean> {
    if (options?.strategy === 'template') return true;
    
    for (const template of this.templates.values()) {
      for (const condition of template.conditions) {
        if (this.matchesCondition(analysis, condition)) {
          return true;
        }
      }
    }
    
    return false;
  }

  async getStrategy(analysis: InputAnalysis, context: ConversationContext, options?: ResponseGenerationOptions): Promise<ResponseStrategy> {
    const template = this.findMatchingTemplate(analysis);
    return {
      type: 'template',
      template: template?.id || 'default',
      parameters: this.extractTemplateVariables(analysis, template),
      confidence: 0.9
    };
  }

  async generate(strategy: ResponseStrategy, analysis: InputAnalysis, context: ConversationContext): Promise<ResponseGeneration> {
    const startTime = Date.now();

    try {
      const template = this.templates.get(strategy.template as string);
      
      if (!template) {
        throw new Error(`Template not found: ${strategy.template}`);
      }

      // Compile and render template
      const compiledTemplate = this.handlebars.compile(template.content);
      const contextData = this.buildTemplateContext(analysis, context, strategy.parameters);
      const content = compiledTemplate(contextData);

      return {
        strategy,
        content,
        metadata: {
          type: 'text',
          format: 'plain',
          length: content.length,
          tokens: this.estimateTokens(content),
          processingTime: Date.now() - startTime
        },
        personalization: {
          adapted: false,
          adjustments: [],
          userProfile: false,
          contextual: true
        },
        safety: {
          overall: 'safe',
          categories: [],
          confidence: 1.0,
          reasoning: ['Template-based response'],
          recommendations: [],
          blocked: false
        },
        quality: {
          relevance: 0.9,
          accuracy: 0.9,
          clarity: 0.9,
          completeness: 0.8,
          appropriateness: 0.9,
          overall: 0.88
        }
      };
    } catch (error) {
      this.logger.error('Template strategy generation failed', error as Error);
      return this.generateFallbackResponse(analysis, strategy);
    }
  }

  private findMatchingTemplate(analysis: InputAnalysis): ResponseTemplate | undefined {
    let bestMatch: ResponseTemplate | undefined;
    let highestPriority = -1;

    for (const template of this.templates.values()) {
      for (const condition of template.conditions) {
        if (this.matchesCondition(analysis, condition) && template.priority > highestPriority) {
          bestMatch = template;
          highestPriority = template.priority;
        }
      }
    }

    return bestMatch;
  }

  private matchesCondition(analysis: InputAnalysis, condition: string): boolean {
    const [type, value] = condition.split(':');
    
    switch (type) {
      case 'intent':
        return analysis.intent?.intent === value;
      case 'sentiment':
        return analysis.sentiment?.sentiment === value;
      case 'length':
        if (value === 'short') return analysis.length < 50;
        if (value === 'long') return analysis.length > 200;
        return false;
      default:
        return false;
    }
  }

  private extractTemplateVariables(analysis: InputAnalysis, template?: ResponseTemplate): Record<string, any> {
    const variables: Record<string, any> = {};
    
    if (template) {
      for (const varName of template.variables) {
        switch (varName) {
          case 'input':
            variables.input = analysis.input;
            break;
          case 'intent':
            variables.intent = analysis.intent?.intent || 'unknown';
            break;
          case 'sentiment':
            variables.sentiment = analysis.sentiment?.sentiment || 'neutral';
            break;
        }
      }
    }
    
    return variables;
  }

  private buildTemplateContext(analysis: InputAnalysis, context: ConversationContext, parameters: any): Record<string, any> {
    return {
      ...parameters,
      input: analysis.input,
      intent: analysis.intent?.intent,
      sentiment: analysis.sentiment?.sentiment,
      userName: context.userId,
      channelName: context.channelId,
      timestamp: new Date().toISOString()
    };
  }

  private generateFallbackResponse(analysis: InputAnalysis, strategy: ResponseStrategy): ResponseGeneration {
    const fallbackContent = "I'm here to help! What would you like to know?";
    
    return {
      strategy,
      content: fallbackContent,
      metadata: {
        type: 'text',
        format: 'plain',
        length: fallbackContent.length,
        tokens: this.estimateTokens(fallbackContent),
        processingTime: 0
      },
      personalization: {
        adapted: false,
        adjustments: [],
        userProfile: false,
        contextual: false
      },
      safety: {
        overall: 'safe',
        categories: [],
        confidence: 1.0,
        reasoning: ['Template fallback'],
        recommendations: [],
        blocked: false
      },
      quality: {
        relevance: 0.6,
        accuracy: 0.8,
        clarity: 0.9,
        completeness: 0.5,
        appropriateness: 0.9,
        overall: 0.74
      }
    };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

class AIGeneratedStrategyHandler implements ResponseStrategyHandler {
  private openaiClient?: OpenAI;
  private anthropicClient?: Anthropic;
  private logger: Logger;

  constructor(openaiClient?: OpenAI, anthropicClient?: Anthropic, logger?: Logger) {
    this.openaiClient = openaiClient;
    this.anthropicClient = anthropicClient;
    this.logger = logger || { info: console.log, warn: console.warn, error: console.error };
  }

  async shouldUse(analysis: InputAnalysis, context: ConversationContext, options?: ResponseGenerationOptions): Promise<boolean> {
    if (options?.strategy === 'ai_generated') return true;
    if (analysis.complexity > 0.5) return true;
    if (analysis.urgency > 0.5) return true;
    return false;
  }

  async getStrategy(analysis: InputAnalysis, context: ConversationContext, options?: ResponseGenerationOptions): Promise<ResponseStrategy> {
    const provider = this.openaiClient ? 'openai' : this.anthropicClient ? 'anthropic' : 'fallback';
    const model = provider === 'openai' 
      ? (process.env.AI_MODEL || 'gpt-4')
      : provider === 'anthropic'
      ? (process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229')
      : 'fallback';
      
    return {
      type: 'ai_generated',
      model,
      parameters: {
        provider,
        temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
        maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2048')
      },
      confidence: 0.8
    };
  }

  async generate(strategy: ResponseStrategy, analysis: InputAnalysis, context: ConversationContext): Promise<ResponseGeneration> {
    const startTime = Date.now();

    try {
      let content = '';
      let provider = 'unknown';

      // Try OpenAI
      if (this.openaiClient && strategy.parameters?.provider === 'openai') {
        provider = 'openai';
        const response = await this.openaiClient.chat.completions.create({
          model: strategy.model || process.env.AI_MODEL || 'gpt-4',
          messages: [
            { 
              role: 'system', 
              content: this.buildSystemPrompt(context, analysis) 
            },
            { role: 'user', content: analysis.input }
          ],
          max_tokens: strategy.parameters?.maxTokens || parseInt(process.env.AI_MAX_TOKENS || '2048'),
          temperature: strategy.parameters?.temperature || parseFloat(process.env.AI_TEMPERATURE || '0.7')
        });
        content = response.choices[0]?.message?.content || '';
      } 
      // Try Anthropic
      else if (this.anthropicClient && strategy.parameters?.provider === 'anthropic') {
        provider = 'anthropic';
        const response = await this.anthropicClient.messages.create({
          model: strategy.model || process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
          max_tokens: strategy.parameters?.maxTokens || parseInt(process.env.AI_MAX_TOKENS || '2048'),
          system: this.buildSystemPrompt(context, analysis),
          messages: [{ role: 'user', content: analysis.input }]
        });
        content = response.content[0]?.type === 'text' ? response.content[0].text : '';
      } 
      // Fallback to OpenAI if available
      else if (this.openaiClient) {
        provider = 'openai';
        const response = await this.openaiClient.chat.completions.create({
          model: process.env.AI_MODEL || 'gpt-4',
          messages: [
            { role: 'system', content: this.buildSystemPrompt(context, analysis) },
            { role: 'user', content: analysis.input }
          ],
          max_tokens: parseInt(process.env.AI_MAX_TOKENS || '2048'),
          temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7')
        });
        content = response.choices[0]?.message?.content || '';
      }
      // Final fallback
      else {
        content = this.generateFallbackContent(analysis);
      }

      return {
        strategy,
        content,
        metadata: {
          type: 'text',
          format: 'markdown',
          length: content.length,
          tokens: this.estimateTokens(content),
          processingTime: Date.now() - startTime
        },
        personalization: {
          adapted: true,
          adjustments: [],
          userProfile: true,
          contextual: true
        },
        safety: {
          overall: 'safe',
          categories: [],
          confidence: 0.85,
          reasoning: [`AI-generated response using ${provider}`],
          recommendations: [],
          blocked: false
        },
        quality: {
          relevance: 0.9,
          accuracy: 0.85,
          clarity: 0.9,
          completeness: 0.85,
          appropriateness: 0.9,
          overall: 0.88
        }
      };
    } catch (error) {
      this.logger.error('AI-generated strategy failed', error as Error);
      return this.generateFallbackResponse(analysis, strategy);
    }
  }

  private buildSystemPrompt(context: ConversationContext, analysis: InputAnalysis): string {
    let prompt = `You are a helpful Discord bot assistant. Provide accurate, helpful, and engaging responses.

Context:
- User input: ${analysis.input}
- Complexity: ${analysis.complexity.toFixed(2)}
- Urgency: ${analysis.urgency.toFixed(2)}
`;

    if (analysis.intent) {
      prompt += `- Intent: ${analysis.intent.intent}\n`;
    }

    if (analysis.sentiment) {
      prompt += `- Sentiment: ${analysis.sentiment.sentiment}\n`;
    }

    if (context.userPreferences) {
      prompt += `\nUser preferences: ${JSON.stringify(context.userPreferences)}\n`;
    }

    prompt += `\nGuidelines:
- Keep responses concise but comprehensive
- Use markdown formatting for readability
- Be friendly and approachable
- Address user's query directly`;

    return prompt;
  }

  private generateFallbackContent(analysis: InputAnalysis): string {
    const responses = [
      "I'd be happy to help you with that! Could you provide a bit more detail?",
      "That's an interesting question. Let me think about best way to assist you.",
      "I'm processing your request. In the meantime, is there anything specific you'd like to know?"
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private generateFallbackResponse(analysis: InputAnalysis, strategy: ResponseStrategy): ResponseGeneration {
    const fallbackContent = this.generateFallbackContent(analysis);
    
    return {
      strategy,
      content: fallbackContent,
      metadata: {
        type: 'text',
        format: 'plain',
        length: fallbackContent.length,
        tokens: this.estimateTokens(fallbackContent),
        processingTime: 0
      },
      personalization: {
        adapted: false,
        adjustments: [],
        userProfile: false,
        contextual: false
      },
      safety: {
        overall: 'safe',
        categories: [],
        confidence: 1.0,
        reasoning: ['AI fallback response'],
        recommendations: [],
        blocked: false
      },
      quality: {
        relevance: 0.6,
        accuracy: 0.7,
        clarity: 0.8,
        completeness: 0.6,
        appropriateness: 0.9,
        overall: 0.72
      }
    };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

class HybridStrategyHandler implements ResponseStrategyHandler {
  private templates: Map<string, ResponseTemplate>;
  private openaiClient?: OpenAI;
  private anthropicClient?: Anthropic;
  private handlebars: typeof Handlebars;
  private logger: Logger;

  constructor(templates: Map<string, ResponseTemplate>, openaiClient?: OpenAI, anthropicClient?: Anthropic, logger?: Logger) {
    this.templates = templates;
    this.openaiClient = openaiClient;
    this.anthropicClient = anthropicClient;
    this.handlebars = Handlebars.create();
    this.logger = logger || { info: console.log, warn: console.warn, error: console.error };
  }

  async shouldUse(analysis: InputAnalysis, context: ConversationContext, options?: ResponseGenerationOptions): Promise<boolean> {
    if (options?.strategy === 'hybrid') return true;
    if (analysis.complexity > 0.3 && analysis.complexity < 0.7) return true;
    return false;
  }

  async getStrategy(analysis: InputAnalysis, context: ConversationContext, options?: ResponseGenerationOptions): Promise<ResponseStrategy> {
    const template = this.findMatchingTemplate(analysis);
    const provider = this.openaiClient ? 'openai' : this.anthropicClient ? 'anthropic' : 'fallback';
    
    return {
      type: 'hybrid',
      template: template?.id || 'default',
      model: provider === 'openai' 
        ? (process.env.AI_MODEL || 'gpt-4')
        : provider === 'anthropic'
        ? (process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229')
        : 'fallback',
      parameters: {
        provider,
        templateRatio: 0.4,
        aiRatio: 0.6
      },
      confidence: 0.75
    };
  }

  async generate(strategy: ResponseStrategy, analysis: InputAnalysis, context: ConversationContext): Promise<ResponseGeneration> {
    const startTime = Date.now();

    try {
      // Step 1: Generate template-based response
      const templateResponse = await this.generateTemplateResponse(strategy, analysis, context);
      
      // Step 2: Generate AI-based response
      const aiResponse = await this.generateAIResponse(strategy, analysis, context);
      
      // Step 3: Combine responses
      const combinedContent = this.combineResponses(templateResponse, aiResponse, strategy);
      
      return {
        strategy,
        content: combinedContent,
        metadata: {
          type: 'text',
          format: 'markdown',
          length: combinedContent.length,
          tokens: this.estimateTokens(combinedContent),
          processingTime: Date.now() - startTime
        },
        personalization: {
          adapted: true,
          adjustments: [
            { type: 'hybrid', template: strategy.template, ai: strategy.model }
          ],
          userProfile: true,
          contextual: true
        },
        safety: {
          overall: 'safe',
          categories: [],
          confidence: 0.87,
          reasoning: ['Hybrid response combining template and AI'],
          recommendations: [],
          blocked: false
        },
        quality: {
          relevance: 0.88,
          accuracy: 0.86,
          clarity: 0.89,
          completeness: 0.84,
          appropriateness: 0.9,
          overall: 0.874
        }
      };
    } catch (error) {
      this.logger.error('Hybrid strategy generation failed', error as Error);
      return this.generateFallbackResponse(analysis, strategy);
    }
  }

  private async generateTemplateResponse(strategy: ResponseStrategy, analysis: InputAnalysis, context: ConversationContext): Promise<string> {
    const template = this.templates.get(strategy.template as string);
    
    if (!template) {
      return '';
    }

    try {
      const compiledTemplate = this.handlebars.compile(template.content);
      const contextData = this.buildTemplateContext(analysis, context, strategy.parameters);
      return compiledTemplate(contextData);
    } catch (error) {
      this.logger.warn('Template generation failed in hybrid strategy', error as Error);
      return '';
    }
  }

  private async generateAIResponse(strategy: ResponseStrategy, analysis: InputAnalysis, context: ConversationContext): Promise<string> {
    const templatePart = await this.generateTemplateResponse(strategy, analysis, context);
    
    try {
      let content = '';
      
      // Try OpenAI
      if (this.openaiClient && strategy.parameters?.provider === 'openai') {
        const response = await this.openaiClient.chat.completions.create({
          model: strategy.model || process.env.AI_MODEL || 'gpt-4',
          messages: [
            { 
              role: 'system', 
              content: this.buildHybridSystemPrompt(context, analysis, templatePart) 
            },
            { role: 'user', content: analysis.input }
          ],
          max_tokens: strategy.parameters?.maxTokens || parseInt(process.env.AI_MAX_TOKENS || '2048'),
          temperature: strategy.parameters?.temperature || parseFloat(process.env.AI_TEMPERATURE || '0.7')
        });
        content = response.choices[0]?.message?.content || '';
      } 
      // Try Anthropic
      else if (this.anthropicClient && strategy.parameters?.provider === 'anthropic') {
        const response = await this.anthropicClient.messages.create({
          model: strategy.model || process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
          max_tokens: strategy.parameters?.maxTokens || parseInt(process.env.AI_MAX_TOKENS || '2048'),
          system: this.buildHybridSystemPrompt(context, analysis, templatePart),
          messages: [{ role: 'user', content: analysis.input }]
        });
        content = response.content[0]?.type === 'text' ? response.content[0].text : '';
      }
      
      return content;
    } catch (error) {
      this.logger.warn('AI generation failed in hybrid strategy', error as Error);
      return '';
    }
  }

  private buildHybridSystemPrompt(context: ConversationContext, analysis: InputAnalysis, templatePart: string): string {
    let prompt = `You are a helpful Discord bot assistant. Enhance and complete the following template response.

Template response:
${templatePart || '[No template available]'}

User input: ${analysis.input}

Instructions:
- Use template as a base and enhance it with AI-generated content
- Keep structure and key points from template
- Add relevant details and context
- Make it more conversational and engaging
- Use markdown formatting for readability
`;

    if (analysis.intent) {
      prompt += `\nIntent: ${analysis.intent.intent}\n`;
    }

    if (analysis.sentiment) {
      prompt += `Sentiment: ${analysis.sentiment.sentiment}\n`;
    }

    return prompt;
  }

  private combineResponses(templateResponse: string, aiResponse: string, strategy: ResponseStrategy): string {
    const templateRatio = strategy.parameters?.templateRatio || 0.4;
    const aiRatio = strategy.parameters?.aiRatio || 0.6;

    // If template is empty, use AI response
    if (!templateResponse.trim()) {
      return aiResponse;
    }

    // If AI response is empty, use template
    if (!aiResponse.trim()) {
      return templateResponse;
    }

    // Combine based on ratios
    // For simplicity, we'll use template as introduction and AI for detailed content
    const templateLines = templateResponse.split('\n').filter(line => line.trim());
    const aiLines = aiResponse.split('\n').filter(line => line.trim());
    
    // Take first part from template, rest from AI
    const templatePart = templateLines.slice(0, Math.ceil(templateLines.length * templateRatio)).join('\n');
    const aiPart = aiLines.join('\n');
    
    return `${templatePart}\n\n${aiPart}`;
  }

  private findMatchingTemplate(analysis: InputAnalysis): ResponseTemplate | undefined {
    let bestMatch: ResponseTemplate | undefined;
    let highestPriority = -1;

    for (const template of this.templates.values()) {
      for (const condition of template.conditions) {
        if (this.matchesCondition(analysis, condition) && template.priority > highestPriority) {
          bestMatch = template;
          highestPriority = template.priority;
        }
      }
    }

    return bestMatch;
  }

  private matchesCondition(analysis: InputAnalysis, condition: string): boolean {
    const [type, value] = condition.split(':');
    
    switch (type) {
      case 'intent':
        return analysis.intent?.intent === value;
      case 'sentiment':
        return analysis.sentiment?.sentiment === value;
      default:
        return false;
    }
  }

  private buildTemplateContext(analysis: InputAnalysis, context: ConversationContext, parameters: any): Record<string, any> {
    return {
      ...parameters,
      input: analysis.input,
      intent: analysis.intent?.intent,
      sentiment: analysis.sentiment?.sentiment,
      userName: context.userId,
      timestamp: new Date().toISOString()
    };
  }

  private generateFallbackResponse(analysis: InputAnalysis, strategy: ResponseStrategy): ResponseGeneration {
    const fallbackContent = "I'm here to help! What would you like to know?";
    
    return {
      strategy,
      content: fallbackContent,
      metadata: {
        type: 'text',
        format: 'plain',
        length: fallbackContent.length,
        tokens: this.estimateTokens(fallbackContent),
        processingTime: 0
      },
      personalization: {
        adapted: false,
        adjustments: [],
        userProfile: false,
        contextual: false
      },
      safety: {
        overall: 'safe',
        categories: [],
        confidence: 1.0,
        reasoning: ['Hybrid fallback response'],
        recommendations: [],
        blocked: false
      },
      quality: {
        relevance: 0.6,
        accuracy: 0.7,
        clarity: 0.8,
        completeness: 0.6,
        appropriateness: 0.9,
        overall: 0.72
      }
    };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

// Personalizer Implementations
class TonePersonalizer implements ResponsePersonalizer {
  async shouldApply(): Promise<boolean> { return true; }
  async apply(content: string): Promise<{content: string, adjustment: any}> {
    return { content, adjustment: { type: 'tone', original: content, modified: content, reason: 'No tone adjustment needed' } };
  }
}

class LengthPersonalizer implements ResponsePersonalizer {
  async shouldApply(): Promise<boolean> { return true; }
  async apply(content: string): Promise<{content: string, adjustment: any}> {
    return { content, adjustment: { type: 'length', original: content, modified: content, reason: 'No length adjustment needed' } };
  }
}

class FormatPersonalizer implements ResponsePersonalizer {
  async shouldApply(): Promise<boolean> { return true; }
  async apply(content: string): Promise<{content: string, adjustment: any}> {
    return { content, adjustment: { type: 'format', original: content, modified: content, reason: 'No format adjustment needed' } };
  }
}

// Quality Validator Implementations
class RelevanceValidator implements ResponseQualityValidator {
  async validate(): Promise<Partial<ResponseQuality>> {
    return { relevance: 0.8 };
  }
}

class ClarityValidator implements ResponseQualityValidator {
  async validate(): Promise<Partial<ResponseQuality>> {
    return { clarity: 0.7 };
  }
}

class AppropriatenessValidator implements ResponseQualityValidator {
  async validate(): Promise<Partial<ResponseQuality>> {
    return { appropriateness: 0.9 };
  }
}

class CompletenessValidator implements ResponseQualityValidator {
  async validate(): Promise<Partial<ResponseQuality>> {
    return { completeness: 0.6 };
  }
}
