/**
 * Emotional Intelligence Engine
 * 
 * Analyzes emotions and adapts responses for empathy and appropriateness.
 * Implements multiple sentiment analysis approaches, emotion detection,
 * mood inference, response adaptation, conflict detection, and positive reinforcement.
 */

import type {
  ConversationalDiscordConfig,
  EmotionalIntelligenceConfig,
  SentimentAnalysis,
  EmotionDetection,
  MoodInference,
  AdaptedResponse,
  ConflictDetection,
  ConflictContext,
  EmotionalContext,
  MessageHistoryEntry,
} from '../../types/conversational';
import type { Logger } from '../../types/logger';

/**
 * Emotion categories supported by the engine
 */
const EMOTIONS = {
  JOY: 'joy',
  SADNESS: 'sadness',
  ANGER: 'anger',
  FEAR: 'fear',
  SURPRISE: 'surprise',
  DISGUST: 'disgust',
} as const;

/**
 * Mood categories supported by the engine
 */
const MOODS = {
  HAPPY: 'happy',
  NEUTRAL: 'neutral',
  FRUSTRATED: 'frustrated',
  EXCITED: 'excited',
  ANXIOUS: 'anxious',
  CALM: 'calm',
} as const;

/**
 * Rule-based sentiment lexicon
 */
const SENTIMENT_LEXICON: Record<string, number> = {
  // Positive words
  'happy': 0.8,
  'joy': 0.9,
  'great': 0.7,
  'awesome': 0.8,
  'excellent': 0.8,
  'love': 0.9,
  'wonderful': 0.9,
  'fantastic': 0.8,
  'amazing': 0.8,
  'good': 0.6,
  'nice': 0.5,
  'thanks': 0.6,
  'thank': 0.6,
  'appreciate': 0.7,
  'excited': 0.7,
  'exciting': 0.7,
  'pleased': 0.7,
  'delighted': 0.8,
  'glad': 0.7,
  'cheerful': 0.7,
  'optimistic': 0.6,
  'hopeful': 0.5,
  'positive': 0.6,
  'success': 0.7,
  'win': 0.6,
  'won': 0.6,
  
  // Negative words
  'sad': -0.7,
  'angry': -0.8,
  'angry': -0.8,
  'angry': -0.8,
  'hate': -0.9,
  'terrible': -0.8,
  'awful': -0.8,
  'horrible': -0.8,
  'bad': -0.6,
  'worse': -0.7,
  'worst': -0.8,
  'disappointed': -0.7,
  'upset': -0.6,
  'frustrated': -0.7,
  'annoying': -0.6,
  'annoyed': -0.6,
  'irritated': -0.7,
  'irritating': -0.6,
  'stupid': -0.7,
  'idiot': -0.8,
  'dumb': -0.7,
  'worried': -0.5,
  'anxious': -0.6,
  'scared': -0.6,
  'afraid': -0.6,
  'fear': -0.7,
  'frightened': -0.6,
  'disgusting': -0.8,
  'disgust': -0.8,
  'gross': -0.6,
  'boring': -0.5,
  'bored': -0.5,
  'tired': -0.3,
  'exhausted': -0.4,
  'hopeless': -0.7,
  'helpless': -0.7,
  'useless': -0.7,
  'failure': -0.7,
  'failed': -0.6,
  'fail': -0.6,
  'wrong': -0.5,
  'mistake': -0.5,
  'problem': -0.4,
  'issue': -0.3,
  'trouble': -0.5,
  'pain': -0.6,
  'hurt': -0.6,
  'painful': -0.6,
  'suffering': -0.7,
  'suffer': -0.7,
  'grief': -0.8,
  'grieving': -0.8,
  'mourn': -0.7,
  'mournful': -0.7,
  'regret': -0.6,
  'regretful': -0.6,
  'sorry': -0.4,
  'apologize': -0.3,
  'apology': -0.3,
  'guilty': -0.6,
  'guilt': -0.6,
  'ashamed': -0.6,
  'embarrassed': -0.5,
  'embarrassing': -0.5,
  'humiliated': -0.7,
  'humiliating': -0.7,
  'insult': -0.8,
  'insulting': -0.8,
  'offended': -0.6,
  'offensive': -0.7,
  'aggressive': -0.6,
  'hostile': -0.7,
  'threatening': -0.8,
  'threat': -0.8,
  'dangerous': -0.7,
  'danger': -0.7,
  'violent': -0.8,
  'violence': -0.8,
  'kill': -0.9,
  'die': -0.8,
  'death': -0.7,
  'dead': -0.7,
  'suicide': -0.9,
  'murder': -0.9,
  'abuse': -0.8,
  'abusive': -0.8,
  'harass': -0.8,
  'harassment': -0.8,
  'bully': -0.8,
  'bullying': -0.8,
  'attack': -0.7,
  'attacking': -0.7,
  'harm': -0.7,
  'harmful': -0.7,
  'hurtful': -0.7,
  'cruel': -0.8,
  'cruelty': -0.8,
  'mean': -0.6,
  'nasty': -0.7,
  'rude': -0.6,
  'impolite': -0.5,
  'unfair': -0.6,
  'unjust': -0.6,
  'unjustified': -0.6,
  'unreasonable': -0.6,
  'ridiculous': -0.5,
  'absurd': -0.5,
  'crazy': -0.5,
  'insane': -0.6,
  'mad': -0.6,
  'crazy': -0.5,
  'lunatic': -0.8,
  'psychopath': -0.9,
  'sociopath': -0.9,
  'maniac': -0.8,
};

/**
 * Emotion keywords for rule-based detection
 */
const EMOTION_KEYWORDS: Record<string, string[]> = {
  [EMOTIONS.JOY]: [
    'happy', 'joy', 'excited', 'delighted', 'thrilled', 'elated',
    'cheerful', 'jubilant', 'ecstatic', 'glad', 'pleased',
    'content', 'satisfied', 'grateful', 'thankful', 'wonderful',
    'fantastic', 'amazing', 'awesome', 'great', 'love',
    'celebrate', 'celebration', 'fun', 'enjoy', 'enjoying',
  ],
  [EMOTIONS.SADNESS]: [
    'sad', 'unhappy', 'depressed', 'down', 'low', 'blue',
    'miserable', 'heartbroken', 'grief', 'grieving', 'sorrow',
    'crying', 'cried', 'tears', 'weeping', 'disappointed',
    'let down', 'hopeless', 'despair', 'lonely', 'alone',
    'empty', 'numb', 'lost', 'missing', 'miss',
  ],
  [EMOTIONS.ANGER]: [
    'angry', 'furious', 'rage', 'mad', 'livid', 'irate',
    'annoyed', 'irritated', 'frustrated', 'aggravated', 'upset',
    'hate', 'loath', 'despise', 'detest', 'resent',
    'hostile', 'aggressive', 'violent', 'outraged', 'infuriated',
    'pissed', 'pissed off', 'fuming', 'seething', 'boiling',
  ],
  [EMOTIONS.FEAR]: [
    'afraid', 'scared', 'fear', 'frightened', 'terrified', 'horrified',
    'anxious', 'worried', 'nervous', 'uneasy', 'apprehensive',
    'panic', 'panicking', 'dread', 'dreading', 'concerned',
    'threatened', 'endangered', 'unsafe', 'insecure', 'vulnerable',
    'timid', 'shy', 'hesitant', 'reluctant', 'fearful',
  ],
  [EMOTIONS.SURPRISE]: [
    'surprised', 'shocked', 'amazed', 'astonished', 'astounded',
    'stunned', 'bewildered', 'confused', 'unexpected', 'wow',
    'incredible', 'unbelievable', 'whoa', 'omg', 'oh my',
    'sudden', 'abrupt', 'startled', 'taken aback', 'caught off guard',
  ],
  [EMOTIONS.DISGUST]: [
    'disgusted', 'gross', 'revolting', 'repulsive', 'nauseating',
    'sickening', 'horrible', 'awful', 'terrible', 'disgusting',
    'grossed out', 'repulsed', 'appalled', 'horrified', 'sick',
    'yuck', 'eww', 'gross', 'nasty', 'filthy',
    'dirty', 'contaminated', 'polluted', 'tainted', 'corrupt',
  ],
};

/**
 * Conflict detection keywords
 */
const CONFLICT_INDICATORS: Record<string, string[]> = {
  'aggression': [
    'shut up', 'stupid', 'idiot', 'moron', 'dumb', 'hate',
    'you are', 'you always', 'you never', 'why do you', 'what is wrong with you',
  ],
  'escalation': [
    'whatever', 'fine', 'whatever you say', 'i do not care', 'who cares',
    'whatever', 'fine', 'i do not care anymore',
  ],
  'hostility': [
    'get lost', 'go away', 'leave me alone', 'shut up', 'be quiet',
    'stop talking', 'nobody asked you', 'mind your business',
  ],
};

/**
 * Positive reinforcement templates
 */
const POSITIVE_REINFORCEMENT_TEMPLATES: Record<string, string[]> = {
  [MOODS.HAPPY]: [
    'I am glad to hear that!',
    'That is wonderful!',
    'I am happy for you!',
    'That sounds great!',
    'I am pleased to hear that!',
  ],
  [MOODS.EXCITED]: [
    'That is exciting!',
    'How wonderful!',
    'I share your enthusiasm!',
    'That sounds fantastic!',
    'What a great moment!',
  ],
  [MOODS.CALM]: [
    'I appreciate your calm approach.',
    'That is a thoughtful perspective.',
    'I value your measured response.',
    'Your composure is admirable.',
    'That is a well-reasoned point.',
  ],
};

/**
 * Empathetic response templates
 */
const EMPATHETIC_RESPONSES: Record<string, string[]> = {
  [EMOTIONS.SADNESS]: [
    'I am sorry to hear you are feeling this way.',
    'That sounds really difficult.',
    'I can understand why that would be upsetting.',
    'It sounds like you are going through a tough time.',
    'I am here to listen and help however I can.',
  ],
  [EMOTIONS.ANGER]: [
    'I can hear your frustration.',
    'I understand why that would make you angry.',
    'Your feelings are valid.',
    'It sounds like this situation is really frustrating.',
    'I want to help work through this together.',
  ],
  [EMOTIONS.FEAR]: [
    'I understand your concern.',
    'That sounds worrying.',
    'It is okay to feel anxious about this.',
    'I am here to help you through this.',
    'Let us work through this together.',
  ],
};

/**
 * De-escalation response templates
 */
const DE_ESCALATION_RESPONSES: Record<string, string[]> = {
  low: [
    'I understand your perspective. Let us find a constructive way forward.',
    'I hear what you are saying. How can we work together on this?',
    'Your feedback is valuable. Let us discuss this calmly.',
  ],
  medium: [
    'I can see this is important to you. Let us take a step back and find common ground.',
    'I understand you are upset. I want to help resolve this situation.',
    'Let us pause and approach this from a different angle.',
  ],
  high: [
    'I hear that you are very upset. Let us take a moment to breathe.',
    'I want to help, but let us calm down first.',
    'Your concerns are important. Let us find a constructive way to address them.',
  ],
};

/**
 * Emotional Intelligence Engine
 * 
 * Analyzes emotions and adapts responses for empathy and appropriateness.
 */
export class EmotionalIntelligenceEngine {
  private config: EmotionalIntelligenceConfig;
  private logger: Logger;
  private emotionInfluence: number;

  constructor(config: ConversationalDiscordConfig, logger: Logger) {
    this.config = config.emotionalIntelligence;
    this.logger = logger;
    this.emotionInfluence = this.config.emotionInfluence || 0.7;

    this.logger.info('EmotionalIntelligenceEngine initialized', {
      enabled: this.config.enabled,
      sentimentAnalysis: this.config.sentimentAnalysis,
      emotionDetection: this.config.emotionDetection,
      empatheticResponses: this.config.empatheticResponses,
      conflictDeescalation: this.config.conflictDeescalation,
      moodAdaptation: this.config.moodAdaptation,
    });
  }

  /**
   * Analyze sentiment using multiple approaches
   */
  async analyzeSentiment(text: string): Promise<SentimentAnalysis> {
    if (!this.config.sentimentAnalysis) {
      return {
        score: 0,
        magnitude: 0,
        confidence: 0,
        approach: 'rule-based',
      };
    }

    const normalizedText = text.toLowerCase();
    const words = normalizedText.split(/\s+/);
    const sentimentScores: number[] = [];

    // Rule-based sentiment analysis
    for (const word of words) {
      const cleanWord = word.replace(/[^a-z]/g, '');
      if (SENTIMENT_LEXICON[cleanWord]) {
        sentimentScores.push(SENTIMENT_LEXICON[cleanWord]);
      }
    }

    // Calculate overall sentiment
    let score = 0;
    let magnitude = 0;

    if (sentimentScores.length > 0) {
      score = sentimentScores.reduce((sum, s) => sum + s, 0) / sentimentScores.length;
      magnitude = Math.abs(score);
    }

    // Normalize score to [-1, 1]
    score = Math.max(-1, Math.min(1, score));

    // Calculate confidence based on number of sentiment words found
    const confidence = Math.min(1, sentimentScores.length / 5);

    this.logger.debug('Sentiment analysis completed', {
      text: text.substring(0, 50),
      score,
      magnitude,
      confidence,
      approach: 'rule-based',
    });

    return {
      score,
      magnitude,
      confidence,
      approach: 'rule-based',
    };
  }

  /**
   * Detect emotions from text
   */
  async detectEmotion(text: string): Promise<EmotionDetection> {
    if (!this.config.emotionDetection) {
      return {
        primary: 'neutral',
        emotions: {},
        confidence: 0,
      };
    }

    const normalizedText = text.toLowerCase();
    const emotionScores: Record<string, number> = {};

    // Score each emotion based on keyword matches
    for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
      let score = 0;
      for (const keyword of keywords) {
        if (normalizedText.includes(keyword)) {
          score += 1;
        }
      }
      emotionScores[emotion] = score;
    }

    // Find primary and secondary emotions
    const sortedEmotions = Object.entries(emotionScores)
      .filter(([_, score]) => score > 0)
      .sort((a, b) => b[1] - a[1]);

    let primary = 'neutral';
    let secondary: string | undefined;
    const emotions: Record<string, number> = {};
    let confidence = 0;

    if (sortedEmotions.length > 0) {
      primary = sortedEmotions[0][0];
      if (sortedEmotions.length > 1) {
        secondary = sortedEmotions[1][0];
      }

      // Normalize emotion scores to [0, 1]
      const maxScore = sortedEmotions[0][1];
      for (const [emotion, score] of sortedEmotions) {
        emotions[emotion] = score / maxScore;
      }

      // Confidence based on keyword count
      confidence = Math.min(1, sortedEmotions[0][1] / 2);
    }

    this.logger.debug('Emotion detection completed', {
      primary,
      secondary,
      confidence,
    });

    return {
      primary,
      secondary,
      emotions,
      confidence,
    };
  }

  /**
   * Infer mood from text and conversation history
   */
  async inferMood(text: string, history?: MessageHistoryEntry[]): Promise<MoodInference> {
    if (!this.config.moodAdaptation) {
      return {
        mood: 'neutral',
        intensity: 0,
        confidence: 0,
        factors: [],
      };
    }

    const sentiment = await this.analyzeSentiment(text);
    const emotion = await this.detectEmotion(text);

    let mood = 'neutral';
    let intensity = 0;
    const factors: string[] = [];

    // Infer mood from sentiment
    if (sentiment.score > 0.5) {
      mood = 'happy';
      intensity = sentiment.score;
      factors.push('positive sentiment');
    } else if (sentiment.score < -0.3) {
      if (emotion.primary === EMOTIONS.ANGER) {
        mood = 'frustrated';
        intensity = Math.abs(sentiment.score);
        factors.push('negative sentiment with anger');
      } else if (emotion.primary === EMOTIONS.FEAR) {
        mood = 'anxious';
        intensity = Math.abs(sentiment.score);
        factors.push('negative sentiment with fear');
      } else {
        mood = 'neutral';
        intensity = Math.abs(sentiment.score) * 0.5;
        factors.push('negative sentiment');
      }
    } else if (emotion.primary === EMOTIONS.JOY) {
      mood = 'excited';
      intensity = emotion.confidence;
      factors.push('joy emotion detected');
    } else if (sentiment.score > 0.1 && sentiment.score < 0.3) {
      mood = 'calm';
      intensity = sentiment.score;
      factors.push('mild positive sentiment');
    }

    // Consider conversation history if available
    if (history && history.length > 0) {
      const recentSentiments = await Promise.all(
        history.slice(-3).map(entry => this.analyzeSentiment(entry.content))
      );

      const avgSentiment = recentSentiments.reduce((sum, s) => sum + s.score, 0) / recentSentiments.length;

      if (avgSentiment < -0.2 && sentiment.score > avgSentiment) {
        mood = 'calm';
        factors.push('improving mood from history');
      }
    }

    // Normalize intensity to [0, 1]
    intensity = Math.max(0, Math.min(1, intensity));

    // Confidence based on factors
    const confidence = Math.min(1, factors.length * 0.4 + 0.2);

    this.logger.debug('Mood inference completed', {
      mood,
      intensity,
      confidence,
      factors,
    });

    return {
      mood,
      intensity,
      confidence,
      factors,
    };
  }

  /**
   * Adapt response based on emotional context
   */
  async adaptResponse(response: string, emotionalContext: EmotionalContext): Promise<AdaptedResponse> {
    if (!this.config.empatheticResponses) {
      return {
        content: response,
        tone: 'friendly',
        empathyLevel: 0,
        adaptations: [],
      };
    }

    let adaptedContent = response;
    const adaptations: string[] = [];
    let tone = 'friendly';
    let empathyLevel = 0;

    // Apply empathetic language if needed
    if (emotionalContext.emotion.confidence > 0.5) {
      const empatheticPrefix = this.getEmpatheticPrefix(emotionalContext.emotion.primary);
      if (empatheticPrefix) {
        adaptedContent = `${empatheticPrefix} ${adaptedContent}`;
        adaptations.push('empathetic prefix added');
        empathyLevel = emotionalContext.emotion.confidence * this.emotionInfluence;
      }
    }

    // Apply positive reinforcement for positive moods
    if (emotionalContext.mood.mood === MOODS.HAPPY || emotionalContext.mood.mood === MOODS.EXCITED) {
      adaptedContent = await this.applyPositiveReinforcement(adaptedContent, emotionalContext.mood.mood);
      adaptations.push('positive reinforcement applied');
    }

    // Adapt tone based on mood
    if (emotionalContext.mood.mood === MOODS.FRUSTRATED) {
      tone = 'professional';
      adaptations.push('tone adjusted to professional');
    } else if (emotionalContext.mood.mood === MOODS.ANXIOUS) {
      tone = 'friendly';
      adaptations.push('tone adjusted to friendly for reassurance');
    } else if (emotionalContext.mood.mood === MOODS.CALM) {
      tone = 'professional';
      adaptations.push('tone adjusted to professional');
    }

    this.logger.debug('Response adaptation completed', {
      adaptations,
      tone,
      empathyLevel,
    });

    return {
      content: adaptedContent,
      tone,
      empathyLevel,
      adaptations,
    };
  }

  /**
   * Detect conflict in message and conversation history
   */
  async detectConflict(text: string, history?: MessageHistoryEntry[]): Promise<ConflictDetection> {
    const normalizedText = text.toLowerCase();
    const indicators: string[] = [];
    let severity: 'low' | 'medium' | 'high' = 'low';

    // Check for conflict indicators
    for (const [type, keywords] of Object.entries(CONFLICT_INDICATORS)) {
      for (const keyword of keywords) {
        if (normalizedText.includes(keyword)) {
          if (!indicators.includes(type)) {
            indicators.push(type);
          }
        }
      }
    }

    // Check sentiment for negative patterns
    const sentiment = await this.analyzeSentiment(text);
    if (sentiment.score < -0.5) {
      if (!indicators.includes('negative sentiment')) {
        indicators.push('negative sentiment');
      }
    }

    // Analyze conversation history for escalation
    if (history && history.length > 0) {
      const recentSentiments = await Promise.all(
        history.slice(-5).map(entry => this.analyzeSentiment(entry.content))
      );

      const negativeCount = recentSentiments.filter(s => s.score < -0.3).length;
      if (negativeCount >= 3) {
        if (!indicators.includes('escalating pattern')) {
          indicators.push('escalating pattern');
        }
        severity = 'medium';
      }
      if (negativeCount >= 4) {
        severity = 'high';
      }
    }

    // Determine severity based on indicators
    if (indicators.includes('aggression') || indicators.includes('hostility')) {
      severity = 'high';
    } else if (indicators.length >= 2) {
      severity = 'medium';
    }

    const isConflict = indicators.length > 0;
    const confidence = Math.min(1, indicators.length * 0.3 + 0.2);

    this.logger.debug('Conflict detection completed', {
      isConflict,
      severity,
      indicators,
      confidence,
    });

    return {
      isConflict,
      severity,
      confidence,
      indicators,
    };
  }

  /**
   * Generate de-escalation response for conflict
   */
  async generateDeEscalationResponse(conflictContext: ConflictContext): Promise<string> {
    const templates = DE_ESCALATION_RESPONSES[conflictContext.severity];
    const randomIndex = Math.floor(Math.random() * templates.length);

    let response = templates[randomIndex];

    // Customize response based on conflict type
    if (conflictContext.conflictType === 'aggression') {
      response = 'I understand this is frustrating. Let us take a moment to find a constructive way forward.';
    } else if (conflictContext.conflictType === 'escalation') {
      response = 'I can see tensions are rising. Let us step back and find common ground together.';
    } else if (conflictContext.conflictType === 'hostility') {
      response = 'I hear that you are upset. I want to help resolve this situation calmly.';
    }

    this.logger.debug('De-escalation response generated', {
      severity: conflictContext.severity,
      conflictType: conflictContext.conflictType,
    });

    return response;
  }

  /**
   * Apply positive reinforcement to response
   */
  async applyPositiveReinforcement(response: string, mood: string): Promise<string> {
    const templates = POSITIVE_REINFORCEMENT_TEMPLATES[mood];
    if (!templates) {
      return response;
    }

    const randomIndex = Math.floor(Math.random() * templates.length);
    const reinforcement = templates[randomIndex];

    // Add reinforcement at the beginning or end
    if (Math.random() > 0.5) {
      return `${reinforcement} ${response}`;
    } else {
      return `${response} ${reinforcement}`;
    }
  }

  /**
   * Get empathetic prefix based on emotion
   */
  private getEmpatheticPrefix(emotion: string): string | null {
    const templates = EMPATHETIC_RESPONSES[emotion];
    if (!templates) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * templates.length);
    return templates[randomIndex];
  }

  /**
   * Analyze complete emotional context from message and history
   */
  async analyzeEmotionalContext(
    message: string,
    history?: MessageHistoryEntry[]
  ): Promise<EmotionalContext> {
    const sentiment = await this.analyzeSentiment(message);
    const emotion = await this.detectEmotion(message);
    const mood = await this.inferMood(message, history);

    let conflict: ConflictDetection | undefined;
    if (this.config.conflictDeescalation) {
      conflict = await this.detectConflict(message, history);
    }

    return {
      sentiment,
      emotion,
      mood,
      conflict,
    };
  }

  /**
   * Check if empathetic response is needed
   */
  needsEmpatheticResponse(emotionalContext: EmotionalContext): boolean {
    return (
      this.config.empatheticResponses &&
      (emotionalContext.sentiment.score < -0.2 || emotionalContext.emotion.confidence > 0.6)
    );
  }

  /**
   * Check if de-escalation is needed
   */
  needsDeescalation(emotionalContext: EmotionalContext): boolean {
    return (
      this.config.conflictDeescalation &&
      emotionalContext.conflict?.isConflict === true &&
      emotionalContext.conflict.confidence > 0.5
    );
  }
}
