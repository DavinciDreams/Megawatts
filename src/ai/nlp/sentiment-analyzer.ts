/**
 * Sentiment Analyzer
 * 
 * This module implements sentiment analysis using multiple approaches
 * including rule-based, ML-based, and contextual analysis.
 */

import { 
  SentimentAnalysis, 
  SentimentScore,
  EmotionScore,
  SentimentTemporal,
  ConversationContext,
  UserPreferences
} from '../../types/ai';
import { Logger } from '../../utils/logger';

// ============================================================================
// SENTIMENT ANALYZER CLASS
// ============================================================================

export class SentimentAnalyzer {
  private logger: Logger;
  private sentimentPatterns: SentimentPattern[] = [];
  private emotionLexicon: Map<string, EmotionData> = new Map();
  private mlModels: Map<string, SentimentModel> = new Map();
  private contextAnalyzer: ContextAnalyzer;
  private config: SentimentAnalyzerConfig;

  constructor(config: SentimentAnalyzerConfig, logger: Logger) {
    this.logger = logger;
    this.contextAnalyzer = new ContextAnalyzer(logger);
    this.config = config;
    this.initializeSentimentPatterns();
    this.loadEmotionLexicon();
    this.loadMLModels(config.mlModels);
  }

  /**
   * Analyze sentiment of text
   */
  async analyzeSentiment(
    text: string, 
    context?: ConversationContext
  ): Promise<SentimentAnalysis> {
    try {
      const startTime = Date.now();

      // Preprocess text
      const preprocessedText = this.preprocessText(text);
      
      // Try multiple analysis approaches
      const ruleBasedResult = this.analyzeByRules(preprocessedText, context);
      const mlResult = await this.analyzeByML(preprocessedText, context);
      const contextualResult = this.analyzeContextual(preprocessedText, context);
      
      // Combine results with confidence scoring
      const combinedResult = this.combineResults([
        ruleBasedResult,
        mlResult,
        contextualResult
      ]);

      this.logger.info('Sentiment analysis completed', {
        text: preprocessedText,
        sentiment: combinedResult.sentiment,
        emotions: combinedResult.emotions,
        confidence: combinedResult.confidence,
        processingTime: Date.now() - startTime
      });

      return combinedResult;

    } catch (error) {
      this.logger.error('Sentiment analysis failed', error as Error);
      throw error;
    }
  }

  /**
   * Analyze sentiment using rule-based approach
   */
  private analyzeByRules(
    text: string, 
    context?: ConversationContext
  ): SentimentAnalysisResult {
    const lowerText = text.toLowerCase();
    let bestMatch: SentimentAnalysisResult = {
      sentiment: {
        positive: 0,
        negative: 0,
        neutral: 1,
        compound: 0
      },
      emotions: [],
      confidence: 0,
      approach: 'rule_based',
      reasoning: []
    };

    for (const pattern of this.sentimentPatterns) {
      const match = this.matchSentimentPattern(lowerText, pattern);
      if (match && match.confidence > bestMatch.confidence) {
        bestMatch = {
          sentiment: match.sentiment,
          emotions: match.emotions || [],
          confidence: match.confidence,
          approach: 'rule_based',
          reasoning: [`Matched ${pattern.name} pattern`],
          matchedPattern: pattern
        };
      }
    }

    return bestMatch;
  }

  /**
   * Analyze sentiment using ML models
   */
  private async analyzeByML(
    text: string, 
    context?: ConversationContext
  ): Promise<SentimentAnalysisResult> {
    // In a real implementation, this would use trained sentiment models
    // For now, return a simple heuristic-based result
    const features = this.extractSentimentFeatures(text);
    const prediction = this.predictSentiment(features, context);
    
    return {
      sentiment: prediction.sentiment,
      emotions: prediction.emotions || [],
      confidence: prediction.confidence,
      approach: 'ml',
      reasoning: [`ML prediction based on features: ${features.join(', ')}`],
      matchedPattern: null
    };
  }

  /**
   * Analyze sentiment using contextual information
   */
  private analyzeContextual(
    text: string, 
    context?: ConversationContext
  ): SentimentAnalysisResult {
    if (!context) {
      return {
        sentiment: {
          positive: 0,
          negative: 0,
          neutral: 1,
          compound: 0
        },
        emotions: [],
        confidence: 0.5,
        approach: 'contextual',
        reasoning: ['No context provided for contextual analysis'],
        matchedPattern: null
      };
    }

    // Analyze based on conversation history
    const recentSentiment = context?.sentiment;
    if (recentSentiment) {
      // Bias towards recent sentiment
      const bias = recentSentiment.overall.compound * 0.3;
      
      return {
        sentiment: {
          positive: Math.max(0, 0.1 + bias),
          negative: Math.max(0, -0.1 + bias),
          neutral: 1 - Math.abs(bias) * 2,
          compound: bias
        },
        emotions: this.generateEmotionsFromSentiment(bias),
        confidence: 0.6,
        approach: 'contextual',
        reasoning: [`Contextual bias towards recent sentiment: ${bias.toFixed(2)}`],
        matchedPattern: null
      };
    }

    // Analyze based on user preferences
    const userPrefs = context?.userPreferences;
    if (userPrefs?.communicationStyle?.tone === 'positive') {
      return {
        sentiment: {
          positive: 0.3,
          negative: 0.1,
          neutral: 0.6,
          compound: 0.2
        },
        emotions: [
          { emotion: 'joy', score: 0.4 },
          { emotion: 'trust', score: 0.3 }
        ],
        confidence: 0.7,
        approach: 'contextual',
        reasoning: ['User prefers positive communication style'],
        matchedPattern: null
      };
    }

    return {
      sentiment: {
        positive: 0,
        negative: 0,
        neutral: 1,
        compound: 0
      },
      emotions: [],
      confidence: 0.4,
      approach: 'contextual',
      reasoning: ['Default contextual analysis'],
      matchedPattern: null
    };
  }

  /**
   * Match text against sentiment pattern
   */
  private matchSentimentPattern(
    text: string, 
    pattern: SentimentPattern
  ): SentimentPatternMatch | null {
    // Check keyword matches
    const keywordMatches = pattern.keywords.filter(keyword => 
      text.includes(keyword.toLowerCase())
    ).length;
    
    // Check emoji matches
    const emojiMatches = pattern.emojis.filter(emoji => 
      text.includes(emoji)
    ).length;
    
    // Check phrase matches
    let phraseMatches = 0;
    if (pattern.phrases) {
      for (const phrase of pattern.phrases) {
        if (text.toLowerCase().includes(phrase.toLowerCase())) {
          phraseMatches++;
        }
      }
    }
    
    // Calculate confidence
    const totalMatches = keywordMatches + emojiMatches + phraseMatches;
    const confidence = this.calculatePatternConfidence(totalMatches, pattern);
    
    if (confidence > 0.3) {
      return {
        sentiment: pattern.sentiment,
        emotions: this.generateEmotionsFromSentiment(pattern.sentiment),
        confidence,
        approach: 'rule_based',
        reasoning: [
          `Matched ${keywordMatches} keywords`,
          emojiMatches > 0 ? `Matched ${emojiMatches} emojis` : '',
          phraseMatches > 0 ? `Matched ${phraseMatches} phrases` : ''
        ],
        matchedPattern: pattern
      };
    }
    
    return null;
  }

  /**
   * Extract sentiment features for ML prediction
   */
  private extractSentimentFeatures(text: string): string[] {
    const features: string[] = [];
    const lowerText = text.toLowerCase();
    
    // Text length features
    features.push(`length_${text.length}`);
    features.push(`word_count_${text.split(/\s+/).length}`);
    
    // Punctuation features
    const exclamationCount = (text.match(/!/g) || []).length;
    const questionCount = (text.match(/\?/g) || []).length;
    features.push(`exclamation_count_${exclamationCount}`);
    features.push(`question_count_${questionCount}`);
    
    // Keyword features
    const positiveWords = ['good', 'great', 'excellent', 'love', 'happy', 'wonderful', 'amazing'];
    const negativeWords = ['bad', 'terrible', 'hate', 'angry', 'sad', 'awful', 'horrible'];
    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
    
    features.push(`positive_word_count_${positiveCount}`);
    features.push(`negative_word_count_${negativeCount}`);
    features.push(`sentiment_ratio_${(positiveCount - negativeCount)}`);
    
    // Emotion indicators
    const emotionEmojis = ['😊', '😢', '😡', '😠', '🤗', '😎'];
    const emojiCount = emotionEmojis.filter(emoji => text.includes(emoji)).length;
    features.push(`emotion_emoji_count_${emojiCount}`);
    
    return features;
  }

  /**
   * Predict sentiment using features
   */
  private predictSentiment(
    features: string[], 
    context?: ConversationContext
  ): SentimentAnalysisResult {
    // Simple heuristic-based prediction
    const positiveIndicators = features.filter(f => f.startsWith('positive_')).length;
    const negativeIndicators = features.filter(f => f.startsWith('negative_')).length;
    const questionIndicators = features.filter(f => f.includes('question_count') && parseInt(f.split('_')[1]) > 0).length;
    
    if (questionIndicators > 0) {
      return {
        sentiment: {
          positive: 0.1,
          negative: 0.1,
          neutral: 0.8,
          compound: 0
        },
        emotions: [
          { emotion: 'curiosity', score: 0.6 }
        ],
        confidence: 0.6,
        approach: 'ml',
        reasoning: ['Detected question indicators'],
        matchedPattern: null
      };
    }
    
    if (positiveIndicators > negativeIndicators) {
      return {
        sentiment: {
          positive: 0.7,
          negative: 0.1,
          neutral: 0.2,
          compound: 0.6
        },
        emotions: [
          { emotion: 'joy', score: 0.5 },
          { emotion: 'trust', score: 0.4 }
        ],
        confidence: 0.7,
        approach: 'ml',
        reasoning: ['More positive than negative indicators'],
        matchedPattern: null
      };
    }
    
    if (negativeIndicators > positiveIndicators) {
      return {
        sentiment: {
          positive: 0.1,
          negative: 0.7,
          neutral: 0.2,
          compound: -0.6
        },
        emotions: [
          { emotion: 'sadness', score: 0.6 },
          { emotion: 'anger', score: 0.5 }
        ],
        confidence: 0.7,
        approach: 'ml',
        reasoning: ['More negative than positive indicators'],
        matchedPattern: null
      };
    }
    
    return {
      sentiment: {
        positive: 0.2,
        negative: 0.2,
        neutral: 0.6,
        compound: 0
      },
      emotions: [],
      confidence: 0.5,
      approach: 'ml',
      reasoning: ['Balanced sentiment indicators'],
      matchedPattern: null
    };
  }

  /**
   * Combine multiple sentiment analysis results
   */
  private combineResults(
    results: SentimentAnalysisResult[]
  ): SentimentAnalysisResult {
    if (results.length === 0) {
      return {
        sentiment: {
          positive: 0,
          negative: 0,
          neutral: 1,
          compound: 0
        },
        emotions: [],
        confidence: 0,
        approach: 'none',
        reasoning: ['No analysis results available'],
        matchedPattern: null
      };
    }

    // Weight results by confidence and approach reliability
    const weightedResults = results.map(result => ({
      ...result,
      weight: this.calculateResultWeight(result)
    }));

    // Sort by weighted score
    weightedResults.sort((a, b) => b.weight - a.weight);

    const bestResult = weightedResults[0];
    
    // Apply temporal smoothing if context is available
    const smoothedResult = this.applyTemporalSmoothing(bestResult);
    
    return smoothedResult;
  }

  /**
   * Calculate result weight
   */
  private calculateResultWeight(result: SentimentAnalysisResult): number {
    let weight = result.confidence;
    
    // Boost weight for ML approaches
    if (result.approach === 'ml') {
      weight += 0.2;
    }
    
    // Boost weight for contextual approaches
    if (result.approach === 'contextual') {
      weight += 0.3;
    }
    
    // Boost weight for approaches with emotions
    if (result.emotions && result.emotions.length > 0) {
      weight += 0.1;
    }
    
    return weight;
  }

  /**
   * Apply temporal smoothing to sentiment
   */
  private applyTemporalSmoothing(
    result: SentimentAnalysisResult
  ): SentimentAnalysisResult {
    // Simple temporal smoothing - don't overreact to single messages
    if (result.sentiment.compound > 0.3 || result.sentiment.compound < -0.3) {
      return {
        ...result,
        sentiment: {
          positive: result.sentiment.positive * 0.8,
          negative: result.sentiment.negative * 0.8,
          neutral: result.sentiment.neutral * 1.2,
          compound: result.sentiment.compound * 0.6
        },
        confidence: result.confidence * 0.9, // Reduce confidence for extreme sentiments
        reasoning: [
          ...result.reasoning,
          'Applied temporal smoothing due to extreme sentiment'
        ]
      };
    }
    
    return result;
  }

  /**
   * Generate emotions from sentiment
   */
  private generateEmotionsFromSentiment(sentiment: SentimentScore): EmotionScore[] {
    const emotions: EmotionScore[] = [];
    
    switch (sentiment.compound) {
      case 0.8: // Strongly positive
        emotions.push({ emotion: 'joy', score: 0.9, confidence: 0.8 });
        emotions.push({ emotion: 'trust', score: 0.7, confidence: 0.6 });
        emotions.push({ emotion: 'love', score: 0.8, confidence: 0.7 });
        break;
      case 0.4: // Moderately positive
        emotions.push({ emotion: 'joy', score: 0.6, confidence: 0.7 });
        emotions.push({ emotion: 'surprise', score: 0.4, confidence: 0.5 });
        break;
      case 0.0: // Neutral
        emotions.push({ emotion: 'anticipation', score: 0.3, confidence: 0.4 });
        emotions.push({ emotion: 'trust', score: 0.3, confidence: 0.4 });
        break;
      case -0.4: // Moderately negative
        emotions.push({ emotion: 'sadness', score: 0.6, confidence: 0.7 });
        emotions.push({ emotion: 'anger', score: 0.5, confidence: 0.6 });
        emotions.push({ emotion: 'disgust', score: 0.4, confidence: 0.6 });
        emotions.push({ emotion: 'fear', score: 0.4, confidence: 0.5 });
        break;
      case -0.8: // Strongly negative
        emotions.push({ emotion: 'sadness', score: 0.8, confidence: 0.8 });
        emotions.push({ emotion: 'anger', score: 0.7, confidence: 0.8 });
        emotions.push({ emotion: 'disgust', score: 0.6, confidence: 0.8 });
        emotions.push({ emotion: 'fear', score: 0.6, confidence: 0.7 });
        break;
    }
    
    return emotions;
  }

  /**
   * Calculate pattern matching confidence
   */
  private calculatePatternConfidence(
    totalMatches: number, 
    pattern: SentimentPattern
  ): number {
    let confidence = pattern.confidence || 0.6;
    
    // Boost confidence for higher coverage
    const expectedMatches = pattern.keywords?.length || pattern.phrases?.length || 1;
    const coverageRatio = totalMatches / expectedMatches;
    confidence += Math.min(0.3, (1 - coverageRatio) * 0.3);
    
    return Math.min(1.0, confidence);
  }

  /**
   * Initialize sentiment patterns
   */
  private initializeSentimentPatterns(): void {
    // Positive sentiment patterns
    this.sentimentPatterns.push('positive', [
      {
        name: 'explicit_positive',
        keywords: ['excellent', 'amazing', 'wonderful', 'fantastic', 'perfect', 'great', 'love', 'awesome'],
        emojis: ['😊', '🎉', '🌟', '✨', '💯'],
        confidence: 0.9,
        phrases: ['absolutely love', 'couldn\'t be better', 'totally amazing']
      },
      {
        name: 'moderate_positive',
        keywords: ['good', 'great', 'nice', 'happy', 'pleased', 'satisfied', 'like', 'enjoy'],
        emojis: ['😊', '🙂', '😌', '👍'],
        confidence: 0.7,
        phrases: ['pretty good', 'that\'s great', 'feeling good']
      },
      {
        name: 'mild_positive',
        keywords: ['okay', 'fine', 'not bad', 'decent', 'acceptable'],
        emojis: ['👍', '😌'],
        confidence: 0.6,
        phrases: ['could be worse', 'not too bad']
      }
    ]);

    // Negative sentiment patterns
    this.sentimentPatterns.push('negative', [
      {
        name: 'strong_negative',
        keywords: ['terrible', 'awful', 'horrible', 'hate', 'disgusting', 'worst', 'unacceptable'],
        emojis: ['😡', '😠', '💢', '👎', '😤'],
        confidence: 0.9,
        phrases: ['completely unacceptable', 'absolutely terrible']
      },
      {
        name: 'moderate_negative',
        keywords: ['bad', 'poor', 'disappointed', 'frustrated', 'annoyed', 'upset', 'sad'],
        emojis: ['😞', '😕', '😔', '😒'],
        confidence: 0.7,
        phrases: ['not happy', 'could be better', 'feeling down']
      },
      {
        name: 'mild_negative',
        keywords: ['issue', 'problem', 'concern', 'trouble', 'difficult', 'challenge'],
        emojis: ['😕', '😟'],
        confidence: 0.5,
        phrases: ['facing challenges', 'some difficulties']
      }
    ]);

    // Neutral sentiment patterns
    this.sentimentPatterns.push('neutral', [
      {
        name: 'question_neutral',
        keywords: ['what', 'how', 'why', 'when', 'where', 'explain', 'describe'],
        confidence: 0.5,
        phrases: ['seeking information', 'requesting clarification']
      },
      {
        name: 'statement_neutral',
        keywords: ['the', 'is', 'are', 'was', 'according', 'report'],
        confidence: 0.4,
        phrases: ['stating facts', 'providing information']
      }
    ]);
  }

  /**
   * Load emotion lexicon
   */
  private loadEmotionLexicon(): void {
    // Load emotion keywords and intensifiers
    const emotionData = {
      joy: {
        keywords: ['happy', 'joy', 'excited', 'delighted', 'cheerful', 'glad'],
        intensifiers: ['very', 'extremely', 'really', 'quite'],
        emojis: ['😊', '😄', '🌟', '✨', '🎉']
      },
      sadness: {
        keywords: ['sad', 'unhappy', 'depressed', 'disappointed', 'lonely', 'miserable'],
        intensifiers: ['very', 'extremely', 'deeply', 'terribly'],
        emojis: ['😢', '😔', '😞', '💔']
      },
      anger: {
        keywords: ['angry', 'furious', 'enraged', 'irate', 'mad', 'annoyed'],
        intensifiers: ['very', 'extremely', 'really', 'quite'],
        emojis: ['😠', '😡', '💢', '👿']
      },
      fear: {
        keywords: ['scared', 'afraid', 'terrified', 'anxious', 'worried', 'nervous'],
        intensifiers: ['very', 'extremely', 'deeply', 'quite'],
        emojis: ['😨', '😰', '😱']
      },
      surprise: {
        keywords: ['surprised', 'amazed', 'astonished', 'shocked', 'stunned'],
        intensifiers: ['very', 'extremely', 'really', 'quite'],
        emojis: ['😮', '😲', '😯']
      },
      disgust: {
        keywords: ['disgusted', 'revolted', 'sickened', 'nauseated', 'appalled'],
        intensifiers: ['very', 'extremely', 'deeply', 'quite'],
        emojis: ['🤢', '🤮', '🤢']
      }
    };

    for (const [emotion, data] of Object.entries(emotionData)) {
      this.emotionLexicon.set(emotion, data);
    }
  }

  /**
   * Load ML models
   */
  private loadMLModels(mlModelConfigs: any[]): void {
    for (const config of mlModelConfigs) {
      this.mlModels.set(config.name, {
        name: config.name,
        type: config.type || 'neural',
        version: config.version || '1.0.0',
        loaded: false,
        accuracy: config.accuracy || 0.8
      });
    }
  }
}

// ============================================================================
// SUPPORTING INTERFACES AND CLASSES
// ============================================================================

export interface SentimentAnalyzerConfig {
  patterns: SentimentPatternConfig[];
  mlModels: any[];
  contextualAnalysis: boolean;
  temporalSmoothing: boolean;
}

export interface SentimentPattern {
  name: string;
  sentiment: SentimentScore;
  keywords?: string[];
  emojis?: string[];
  phrases?: string[];
  confidence: number;
}

export interface SentimentPatternConfig {
  sentiment: SentimentScore;
  patterns: SentimentPattern[];
}

export interface SentimentAnalysisResult {
  sentiment: SentimentScore;
  emotions: EmotionScore[];
  confidence: number;
  approach: 'rule_based' | 'ml' | 'contextual' | 'hybrid';
  reasoning: string[];
  matchedPattern: SentimentPattern | null;
}

export interface EmotionData {
  keywords: string[];
  intensifiers: string[];
  emojis: string[];
}

export interface SentimentModel {
  name: string;
  type: 'neural' | 'rule_based' | 'hybrid';
  version: string;
  loaded: boolean;
  accuracy: number;
}