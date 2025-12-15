/**
 * AI and Tool Calling Type Definitions
 * 
 * This file contains comprehensive TypeScript interfaces and types
 * for the AI integration and tool calling system.
 */

// ============================================================================
// CORE AI TYPES
// ============================================================================

export interface AIProvider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'local' | 'custom';
  capabilities: AICapability[];
  models: AIModel[];
  config: AIProviderConfig;
  status: 'active' | 'inactive' | 'error';
  health: ProviderHealth;
  rateLimits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  type: ModelType;
  capabilities: ModelCapability[];
  contextWindow: number;
  maxTokens: number;
  cost: ModelCost;
  costPerToken: number;
  performance: ModelPerformance;
  status: 'available' | 'unavailable' | 'deprecated';
  isDefault: boolean;
}

export interface AICapability {
  type: 'text' | 'function_calling' | 'code_generation' | 'vision' | 'audio' | 'multimodal';
  supported: boolean;
  quality: number; // 0-1 scale
  cost: number; // relative cost multiplier
}

export interface ModelCapability {
  name: string;
  supported: boolean;
  quality: number;
  cost: number;
}

export interface AIProviderConfig {
  apiKey?: string;
  baseURL?: string;
  timeout: number;
  retries: number;
  rateLimit: RateLimit;
  fallback: FallbackConfig;
}

export interface ProviderHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  responseTime: number;
  errorRate: number;
  uptime: number;
}

export interface ModelCost {
  input: number; // per 1K tokens
  output: number; // per 1K tokens
  currency: string;
}

export interface ModelPerformance {
  accuracy: number;
  speed: number; // tokens per second
  reliability: number;
  efficiency: number;
}

export type ModelType = 
  | 'gpt-3.5-turbo'
  | 'gpt-4'
  | 'gpt-4-turbo'
  | 'claude-3-opus'
  | 'claude-3-sonnet'
  | 'claude-3-haiku'
  | 'llama-2'
  | 'llama-3'
  | 'custom';

export interface RateLimit {
  requestsPerMinute: number;
  tokensPerMinute: number;
  concurrentRequests: number;
}

export interface FallbackConfig {
  enabled: boolean;
  providers: string[];
  threshold: number;
}

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

export interface Conversation {
  id: string;
  userId: string;
  channelId: string;
  guildId?: string;
  messages: ConversationMessage[];
  context: ConversationContext;
  metadata: ConversationMetadata;
  status: 'active' | 'paused' | 'ended';
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata: MessageMetadata;
  processing?: MessageProcessing;
}

export interface ConversationContext {
  entities: Entity[];
  sentiment?: SentimentTemporal;
  intents: IntentType[];
  userPreferences?: UserPreferences;
  previousMessages: ConversationMessage[];
  currentTopic?: string;
  language: string;
  timezone?: string;
  platform: 'discord' | 'web' | 'api';
}

export interface MessageMetadata {
  platform: string;
  messageId: string;
  channelId: string;
  guildId?: string;
  userId: string;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  mentions?: string[];
  replyTo?: string;
}

export interface MessageProcessing {
  intent?: IntentAnalysis;
  entities?: Entity[];
  sentiment?: SentimentAnalysis;
  tools?: ToolCall[];
  response?: string;
  confidence: number;
  processingTime: number;
}

export interface MessageAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ConversationMetadata {
  title?: string;
  summary?: string;
  tags: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  resolved: boolean;
}

// ============================================================================
// INTENT RECOGNITION TYPES
// ============================================================================

export interface IntentAnalysis {
  type: IntentType;
  confidence: number;
  approach: 'keyword' | 'ml' | 'hybrid' | 'pattern';
  reasoning: string[];
  subIntents: SubIntent[];
  parameters?: Record<string, any>;
  matchedPattern?: IntentPattern;
}

export type IntentType = 
  | 'unknown'
  | 'greeting'
  | 'farewell'
  | 'question'
  | 'command'
  | 'request'
  | 'complaint'
  | 'compliment'
  | 'moderation'
  | 'self_edit'
  | 'file_operation'
  | 'information';

export interface SubIntent {
  type: string;
  confidence: number;
  parameters?: Record<string, any>;
}

export interface IntentPattern {
  id: string;
  name: string;
  type: IntentType;
  pattern: string | RegExp;
  keywords: string[];
  confidence: number;
  parameters?: Record<string, any>;
}

export interface IntentContext {
  previousIntents: IntentType[];
  userPreferences?: UserPreferences;
  conversationHistory: ConversationMessage[];
  currentEntities: Entity[];
  platformContext: any;
}

export interface IntentPatternConfig {
  name: string;
  type: IntentType;
  pattern: string | RegExp;
  keywords: string[];
  confidence: number;
  parameters?: Record<string, any>;
}

// ============================================================================
// ENTITY EXTRACTION TYPES
// ============================================================================

export interface Entity {
  id: string;
  type: EntityType;
  value: string;
  confidence: number;
  source: 'text' | 'context' | 'inferred';
  metadata: EntityMetadata;
  relationships: EntityRelationship[];
  mentions: EntityMention[];
}

export type EntityType = 
  | 'person'
  | 'place'
  | 'organization'
  | 'product'
  | 'event'
  | 'time'
  | 'date'
  | 'number'
  | 'url'
  | 'email'
  | 'phone'
  | 'custom';

export interface EntityMetadata {
  canonical: string;
  aliases: string[];
  attributes: Record<string, any>;
  verified: boolean;
  source: string;
  extractedAt: Date;
}

export interface EntityRelationship {
  type: string;
  target: string;
  confidence: number;
  bidirectional: boolean;
}

export interface EntityMention {
  text: string;
  startIndex: number;
  endIndex: number;
  context: string;
  confidence: number;
}

export interface EntityPattern {
  name: string;
  type: EntityType;
  pattern: string | RegExp;
  keywords: string[];
  confidence: number;
  extractor: 'regex' | 'ner' | 'custom';
}

// ============================================================================
// SENTIMENT ANALYSIS TYPES
// ============================================================================

export interface SentimentAnalysis {
  sentiment: SentimentScore;
  emotions: EmotionScore[];
  confidence: number;
  approach: 'rule_based' | 'ml' | 'contextual' | 'hybrid';
  reasoning: string[];
  temporal?: SentimentTemporal;
}

export interface SentimentScore {
  positive: number;
  negative: number;
  neutral: number;
  compound: number;
}

export interface EmotionScore {
  emotion: string;
  score: number;
  confidence?: number;
}

export interface SentimentTemporal {
  overall: SentimentScore;
  trend: 'improving' | 'declining' | 'stable';
  history: SentimentSnapshot[];
  predictions: SentimentPrediction[];
}

export interface SentimentSnapshot {
  timestamp: Date;
  sentiment: SentimentScore;
  emotions: EmotionScore[];
  confidence: number;
}

export interface SentimentPrediction {
  timeframe: string;
  sentiment: SentimentScore;
  confidence: number;
}

// ============================================================================
// TOOL CALLING TYPES
// ============================================================================

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
  error?: ToolError;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  timestamp: Date;
  executionTime?: number;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  category: ToolCategory;
  permissions: string[];
  safety: ToolSafety;
  metadata: ToolMetadata;
}

export interface ToolParameter {
  name: string;
  type: ParameterType;
  required: boolean;
  description: string;
  validation?: ParameterValidation;
  defaultValue?: any;
}

export type ParameterType = 
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'file'
  | 'url'
  | 'custom';

export interface ParameterValidation {
  pattern?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  enum?: any[];
  custom?: string;
}

export type ToolCategory = 
  | 'discord'
  | 'information'
  | 'system'
  | 'external'
  | 'ai'
  | 'moderation'
  | 'utility';

export interface ToolSafety {
  level: 'safe' | 'restricted' | 'dangerous';
  permissions: string[];
  rateLimit?: RateLimit;
  monitoring: boolean;
  sandbox: boolean;
}

export interface ToolMetadata {
  version: string;
  author: string;
  tags: string[];
  documentation?: string;
  examples?: ToolExample[];
  dependencies?: string[];
}

export interface ToolExample {
  description: string;
  parameters: Record<string, any>;
  result?: any;
}

export interface ToolError {
  code: string;
  message: string;
  details?: any;
  retryable: boolean;
}

// ============================================================================
// USER PREFERENCES TYPES
// ============================================================================

export interface UserPreferences {
  id: string;
  userId: string;
  language: string;
  timezone: string;
  communicationStyle: CommunicationStyle;
  privacy: PrivacySettings;
  accessibility: AccessibilitySettings;
  aiPreferences: AIPreferences;
  notifications: NotificationSettings;
  customSettings: Record<string, any>;
  updatedAt: Date;
}

export interface CommunicationStyle {
  tone: 'formal' | 'casual' | 'friendly' | 'professional';
  verbosity: 'concise' | 'detailed' | 'balanced';
  emojiUsage: 'none' | 'minimal' | 'moderate' | 'frequent';
  humor: 'none' | 'light' | 'moderate' | 'frequent';
}

export interface PrivacySettings {
  dataCollection: boolean;
  conversationHistory: boolean;
  personalization: boolean;
  analytics: boolean;
  sharing: boolean;
}

export interface AccessibilitySettings {
  fontSize: 'small' | 'medium' | 'large';
  highContrast: boolean;
  screenReader: boolean;
  reducedMotion: boolean;
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
}

export interface AIPreferences {
  model: string;
  temperature: number;
  maxTokens: number;
  responseStyle: 'creative' | 'balanced' | 'precise';
  toolUsage: 'conservative' | 'balanced' | 'aggressive';
}

export interface NotificationSettings {
  enabled: boolean;
  types: NotificationType[];
  frequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
  channels: string[];
}

export interface NotificationType {
  type: string;
  enabled: boolean;
  priority: 'low' | 'medium' | 'high';
}

// ============================================================================
// SAFETY AND MODERATION TYPES
// ============================================================================

export interface SafetyAnalysis {
  overall: SafetyLevel;
  categories: SafetyCategory[];
  confidence: number;
  reasoning: string[];
  recommendations: SafetyRecommendation[];
  blocked: boolean;
}

export type SafetyLevel = 'safe' | 'caution' | 'warning' | 'danger';

export interface SafetyCategory {
  type: SafetyType;
  level: SafetyLevel;
  confidence: number;
  details: string;
  evidence: string[];
}

export type SafetyType = 
  | 'toxicity'
  | 'violence'
  | 'self_harm'
  | 'sexual_content'
  | 'hate_speech'
  | 'misinformation'
  | 'spam'
  | 'personal_info'
  | 'copyright'
  | 'security';

export interface SafetyRecommendation {
  type: 'block' | 'warn' | 'modify' | 'monitor';
  message: string;
  severity: 'low' | 'medium' | 'high';
  automated: boolean;
}

export interface ModerationAction {
  type: 'delete' | 'warn' | 'timeout' | 'ban' | 'escalate';
  reason: string;
  duration?: number;
  moderator?: string;
  automated: boolean;
}

// ============================================================================
// LEARNING AND ADAPTATION TYPES
// ============================================================================

export interface LearningData {
  userId: string;
  interactions: InteractionData[];
  patterns: UserPattern[];
  preferences: LearnedPreferences;
  performance: PerformanceMetrics;
  adaptation: AdaptationHistory;
}

export interface InteractionData {
  id: string;
  type: string;
  timestamp: Date;
  context: any;
  outcome: 'success' | 'failure' | 'partial';
  feedback?: UserFeedback;
  metrics: InteractionMetrics;
}

export interface UserPattern {
  type: string;
  frequency: number;
  confidence: number;
  context: any;
  lastObserved: Date;
  prediction: PatternPrediction;
}

export interface LearnedPreferences {
  communication: CommunicationStyle;
  ai: AIPreferences;
  tools: ToolPreferences;
  responses: ResponsePreferences;
}

export interface ToolPreferences {
  preferred: string[];
  avoided: string[];
  usage: ToolUsageStats;
}

export interface ToolUsageStats {
  tool: string;
  usageCount: number;
  successRate: number;
  averageTime: number;
  lastUsed: Date;
}

export interface ResponsePreferences {
  length: 'short' | 'medium' | 'long';
  style: 'formal' | 'casual' | 'friendly';
  detail: 'minimal' | 'moderate' | 'comprehensive';
  format: 'text' | 'markdown' | 'structured';
}

export interface PerformanceMetrics {
  accuracy: number;
  speed: number;
  userSatisfaction: number;
  errorRate: number;
  efficiency: number;
}

export interface AdaptationHistory {
  timestamp: Date;
  type: string;
  change: any;
  reason: string;
  impact: AdaptationImpact;
}

export interface AdaptationImpact {
  positive: number;
  negative: number;
  neutral: number;
  metrics: string[];
}

export interface UserFeedback {
  rating: number;
  comment?: string;
  type: 'explicit' | 'implicit';
  timestamp: Date;
}

export interface InteractionMetrics {
  responseTime: number;
  accuracy: number;
  userSatisfaction: number;
  efficiency: number;
}

export interface PatternPrediction {
  likelihood: number;
  confidence: number;
  timeframe: string;
}

// ============================================================================
// RESPONSE GENERATION TYPES
// ============================================================================

export interface ResponseGeneration {
  strategy: ResponseStrategy;
  content: string;
  metadata: ResponseMetadata;
  personalization: ResponsePersonalization;
  safety: SafetyAnalysis;
  quality: ResponseQuality;
}

export interface ResponseStrategy {
  type: 'template' | 'ai_generated' | 'hybrid';
  template?: string;
  model?: string;
  parameters: Record<string, any>;
  confidence: number;
}

export interface ResponseMetadata {
  type: 'text' | 'embed' | 'file' | 'interactive';
  format: 'plain' | 'markdown' | 'html' | 'json';
  length: number;
  tokens: number;
  processingTime: number;
}

export interface ResponsePersonalization {
  adapted: boolean;
  adjustments: PersonalizationAdjustment[];
  userProfile: boolean;
  contextual: boolean;
  userId?: string;
}

export interface PersonalizationAdjustment {
  type: string;
  original: any;
  modified: any;
  reason: string;
}

export interface ResponseQuality {
  relevance: number;
  accuracy: number;
  clarity: number;
  completeness: number;
  appropriateness: number;
  overall: number;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface AIConfig {
  providers: AIProviderConfig[];
  models: ModelConfig[];
  routing: RoutingConfig;
  safety: SafetyConfig;
  learning: LearningConfig;
  tools: ToolsConfig;
}

export interface ModelConfig {
  name: string;
  provider: string;
  type: ModelType;
  capabilities: ModelCapability[];
  parameters: ModelParameters;
  usage: ModelUsage;
}

export interface ModelParameters {
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
}

export interface ModelUsage {
  maxRequests: number;
  maxTokens: number;
  rateLimit: RateLimit;
  costLimit: number;
}

export interface RoutingConfig {
  strategy: 'round_robin' | 'load_balanced' | 'capability_based' | 'cost_optimized';
  fallback: FallbackConfig;
  healthCheck: HealthCheckConfig;
}

export interface HealthCheckConfig {
  enabled: boolean;
  interval: number;
  timeout: number;
  retries: number;
}

export interface SafetyConfig {
  enabled: boolean;
  level: 'strict' | 'moderate' | 'relaxed';
  categories: SafetyType[];
  actions: ModerationAction[];
  monitoring: boolean;
}

export interface LearningConfig {
  enabled: boolean;
  algorithms: string[];
  dataRetention: number;
  privacy: boolean;
  adaptation: AdaptationConfig;
}

export interface AdaptationConfig {
  enabled: boolean;
  threshold: number;
  frequency: 'real_time' | 'batch' | 'scheduled';
  scope: 'individual' | 'group' | 'global';
}

export interface ToolsConfig {
  enabled: boolean;
  registry: string;
  permissions: ToolPermissions;
  sandbox: SandboxConfig;
  monitoring: ToolMonitoring;
}

export interface ToolPermissions {
  default: string[];
  restricted: string[];
  dangerous: string[];
  custom: Record<string, string[]>;
}

export interface SandboxConfig {
  enabled: boolean;
  timeout: number;
  memory: number;
  network: boolean;
  filesystem: boolean;
}

export interface ToolMonitoring {
  enabled: boolean;
  logging: boolean;
  metrics: boolean;
  alerts: boolean;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface ContextAnalyzer {
  analyzeContext(context: any): any;
}

export interface SentimentPatternMatch {
  sentiment: SentimentScore;
  emotions: EmotionScore[];
  confidence: number;
  approach: string;
  reasoning: string[];
  matchedPattern: SentimentPattern;
}

export interface SentimentPattern {
  name: string;
  sentiment: SentimentScore;
  keywords?: string[];
  emojis?: string[];
  phrases?: string[];
  confidence: number;
}

// Additional missing types for the AI system

export interface Intent {
  type: IntentType;
  confidence: number;
  parameters?: Record<string, any>;
}

export interface Priority {
  level: 'low' | 'medium' | 'high' | 'urgent';
  score: number;
}

export interface Response {
  content: string;
  type: 'text' | 'embed' | 'file' | 'interactive';
  metadata?: any;
}

export interface AIResponse {
  content: string;
  confidence: number;
  metadata?: any;
  processingTime?: number;
}

export interface SafetyCheckResult {
  safe: boolean;
  reason?: string;
  confidence: number;
  recommendations?: string[];
}

export interface ConversationFlow {
  id: string;
  userId: string;
  state: string;
  context: any;
  history: ConversationMessage[];
  nextSteps: string[];
}

export interface TemporalContext {
  timestamp: Date;
  timezone: string;
  season?: string;
  timeOfDay?: string;
  dayOfWeek?: string;
}

export interface RoutingStrategy {
  name: string;
  type: 'round_robin' | 'load_balanced' | 'capability_based' | 'cost_optimized';
  config: any;
}

export interface RoutingRule {
  id: string;
  condition: RoutingCondition;
  action: RoutingAction;
  priority: number;
  enabled: boolean;
}

export interface RoutingCondition {
  type: string;
  operator: string;
  value: any;
  field: string;
}

export interface RoutingAction {
  type: 'route_to' | 'fallback' | 'reject';
  target: string;
  parameters?: any;
}

export interface LoadBalancingConfig {
  algorithm: 'round_robin' | 'weighted' | 'least_connections';
  weights?: Record<string, number>;
  healthCheck: boolean;
  interval: number;
}

export interface PersonalizationAdjustment {
  type: string;
  original: any;
  modified: any;
  reason: string;
}

export interface PersonalizationAdjustment {
  type: string;
  original: any;
  modified: any;
  reason: string;
}