/**
 * Conversational Discord Type Definitions
 * 
 * This file contains TypeScript interfaces and types for
 * conversational Discord mode integration.
 */

// ============================================================================
// DISCORD MESSAGE TYPES
// ============================================================================

export interface DiscordMessage {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    discriminator: string;
    bot?: boolean;
  };
  channelId: string;
  guildId?: string;
  timestamp: Date;
  mentions: string[];
}

// ============================================================================
// CONVERSATION CONTEXT TYPES
// ============================================================================

export interface ConversationContext {
  conversationId: string;
  userId: string;
  channelId: string;
  guildId?: string;
  messageHistory: MessageHistoryEntry[];
  userPreferences?: UserPreferences;
  emotionalContext?: EmotionalContext;
}

export interface MessageHistoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface UserPreferences {
  tone?: 'professional' | 'casual' | 'friendly' | 'adaptive';
  language?: string;
  verbosity?: 'concise' | 'normal' | 'detailed';
  topics?: string[];
}

export interface SentimentAnalysis {
  score: number; // -1 to 1
  magnitude: number; // 0 to 1
  confidence: number; // 0 to 1
  approach: 'rule-based' | 'ml' | 'contextual';
}

export interface EmotionDetection {
  primary: string;
  secondary?: string;
  emotions: Record<string, number>; // emotion name to confidence
  confidence: number;
}

export interface MoodInference {
  mood: string;
  intensity: number; // 0 to 1
  confidence: number;
  factors: string[];
}

export interface AdaptedResponse {
  content: string;
  tone: string;
  empathyLevel: number;
  adaptations: string[];
}

export interface ConflictDetection {
  isConflict: boolean;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  indicators: string[];
}

export interface ConflictContext {
  userId: string;
  channelId: string;
  conflictType: string;
  severity: string;
  history: MessageHistoryEntry[];
}

export interface EmotionalContext {
  sentiment: SentimentAnalysis;
  emotion: EmotionDetection;
  mood: MoodInference;
  conflict?: ConflictDetection;
}

// ============================================================================
// CONVERSATION RESPONSE TYPES
// ============================================================================

export interface ConversationResponse {
  content: string;
  tone: 'friendly' | 'professional' | 'casual' | 'playful' | 'adaptive';
  emotion?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// AI REQUEST/RESPONSE TYPES FOR CONVERSATIONAL MODE
// ============================================================================

export interface ConversationalAIRequest {
  message: string;
  context: ConversationContext;
  config: ConversationalDiscordConfig;
  systemPrompt?: string;
}

export interface ConversationalAIResponse {
  content: string;
  tone: string;
  emotion?: string;
  metadata?: Record<string, unknown>;
  provider: string;
  model: string;
  tokensUsed: number;
}

// ============================================================================
// CONVERSATIONAL DISCORD CONFIG TYPES
// ============================================================================

export interface ConversationalDiscordConfig {
  enabled: boolean;
  mode: 'conversational' | 'command' | 'hybrid';
  responseChannel: string | null;
  responseChannelType: 'same' | 'dm' | 'custom';
  contextWindow: number;
  maxTokens: number;
  temperature: number;
  personality: PersonalityProfile;
  tone: 'friendly' | 'professional' | 'casual' | 'playful';
  formality: 'formal' | 'casual' | 'adaptive';
  verbosity: 'concise' | 'detailed' | 'balanced' | 'adaptive';
  emotionalIntelligence: EmotionalIntelligenceConfig;
  memory: MemoryConfig;
  multilingual: MultilingualConfig;
  safety: SafetyConfig;
  rateLimiting: RateLimitingConfig;
  features: ConversationalFeatures;
}

export interface PersonalityProfile {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  defaultTone: 'friendly' | 'professional' | 'casual' | 'playful';
  defaultFormality: 'formal' | 'casual' | 'adaptive';
  defaultVerbosity: 'concise' | 'detailed' | 'balanced' | 'adaptive';
}

export interface EmotionalIntelligenceConfig {
  enabled: boolean;
  sentimentAnalysis: boolean;
  emotionDetection: boolean;
  empatheticResponses: boolean;
  conflictDeescalation: boolean;
  moodAdaptation: boolean;
  emotionInfluence: number; // 0-1.0
}

export interface MemoryConfig {
  shortTermEnabled: boolean;
  shortTermTTL: number; // Time to live in seconds
  mediumTermEnabled: boolean;
  mediumTermRetentionDays: number;
  longTermEnabled: boolean;
  longTermRetentionDays: number;
  vectorSearchEnabled: boolean;
  vectorSimilarityThreshold: number; // 0-1.0
}

export interface MultilingualConfig {
  enabled: boolean;
  defaultLanguage: string; // ISO 639-1 code
  autoDetectLanguage: boolean;
  supportedLanguages: string[];
}

export interface SafetyConfig {
  enabled: boolean;
  contentFiltering: boolean;
  moderationLevel: 'strict' | 'moderate' | 'relaxed';
  blockHarmfulContent: boolean;
  blockPersonalInfo: boolean;
  emergencyStop: boolean;
  emergencyStopPhrases: string[];
  maxResponseLength: number;
}

export interface RateLimitingConfig {
  enabled: boolean;
  messagesPerMinute: number;
  messagesPerHour: number;
  messagesPerDay: number;
  perUserLimit: boolean;
  perChannelLimit: boolean;
  cooldownPeriod: number; // Seconds between messages
}

export interface ConversationalFeatures {
  crossChannelAwareness: boolean;
  temporalContext: boolean;
  userLearning: boolean;
  adaptiveResponses: boolean;
  toolCalling: boolean;
  codeExecution: boolean;
  selfEditing: boolean;
}

// ============================================================================
// DISCORD CONTEXT TYPES
// ============================================================================

export interface DiscordContext {
  conversationId: string;
  userId: string;
  channelId: string;
  guildId?: string;
  messageHistory: MessageHistoryEntry[];
  channelContext: ChannelContext;
  guildContext?: GuildContext;
  temporalContext: TemporalContext;
  crossChannelContext?: CrossChannelContext;
  metadata: Record<string, unknown>;
}

export interface ChannelContext {
  channelId: string;
  channelName: string;
  channelType: string;
  topic?: string;
  participantCount: number;
  recentActivity: ActivityEntry[];
}

export interface GuildContext {
  guildId: string;
  guildName: string;
  memberCount: number;
  roles: string[];
  channels: string[];
  rules?: string[];
  culture?: string;
}

export interface TemporalContext {
  currentTime: Date;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: string;
  season?: string;
  timezone?: string;
}

export interface CrossChannelContext {
  userId: string;
  activeChannels: string[];
  recentConversations: ChannelConversationSummary[];
  topicsDiscussed: string[];
  overallMood: string;
}

export interface ActivityEntry {
  timestamp: Date;
  userId: string;
  action: string;
  content?: string;
}

export interface ChannelConversationSummary {
  channelId: string;
  channelName: string;
  lastActive: Date;
  messageCount: number;
  topics: string[];
}
