/**
 * AI and Tool Calling Type Definitions
 * 
 * This file contains comprehensive TypeScript interfaces and types
 * for AI integration and tool calling system.
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
  priority: number;
  isAvailable: boolean;
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
  performance?: ModelPerformance;
  status?: 'available' | 'unavailable' | 'deprecated';
  isDefault?: boolean;
}

export interface AICapability {
  type: 'text' | 'function_calling' | 'code_generation' | 'vision' | 'audio' | 'multimodal';
  supported: boolean;
  quality?: number; // 0-1 scale
  cost?: number; // relative cost multiplier
  enabled?: boolean;
  confidence?: number;
}

export interface ModelCapability {
  name: string;
  supported: boolean;
  quality?: number;
  cost?: number;
  description?: string;
  type?: string;
}

export interface AIProviderConfig {
  apiKey?: string;
  baseURL?: string;
  timeout: number;
  retries: number;
  rateLimit: RateLimit;
  fallback: FallbackConfig;
  customHeaders?: Record<string, string>;
  modelPath?: string;
  endpoint?: string;
}

export interface ProviderConfig {
  apiKey?: string;
  endpoint?: string;
  timeout?: number;
  retries?: number;
  customHeaders?: Record<string, string>;
  modelPath?: string;
  rateLimit?: RateLimit;
  fallback?: FallbackConfig;
}

export interface ProviderHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  responseTime: number;
  errorRate: number;
  uptime: number;
  isHealthy?: boolean;
  lastError?: string;
  consecutiveFailures?: number;
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
  concurrentRequests?: number;
  requestsPerDay?: number;
  tokensPerDay?: number;
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
  summary?: string;
  entities?: Entity[];
  sentiment?: SentimentTemporal;
  intents?: IntentType[];
  userPreferences?: UserPreferences;
  previousMessages?: ConversationMessage[];
  currentTopic?: string;
  language: string;
  timezone?: string;
  platform: 'discord' | 'web' | 'api';
  tokenCount?: number;
  messageCount?: number;
  lastActivity?: Date;
  id?: string;
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
  createdAt?: Date;
  updatedAt?: Date;
  participants?: Set<string>;
  topic?: string;
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
  frequency?: number;
  firstSeen?: Date;
  lastSeen?: Date;
  context?: EntityContext[];
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

export interface EntityContext {
  messageId: string;
  conversationId: string;
  timestamp: Date;
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
  overall?: SentimentScore;
  compound?: number;
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
  history?: SentimentSnapshot[];
  predictions?: SentimentPrediction[];
  changeRate?: number;
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
  notificationSettings?: {
    enabled: boolean;
    types: string[];
    frequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
    channels: string[];
    quietHours?: {
      enabled: boolean;
      startTime: string;
      endTime: string;
      weekends: boolean;
    };
  };
}

export interface CommunicationStyle {
  formality?: 'formal' | 'casual';
  verbosity?: 'concise' | 'detailed' | 'balanced' | 'adaptive';
  tone?: 'friendly' | 'professional';
  responseSpeed?: 'immediate' | 'normal' | 'fast';
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
  keyboardNavigation: boolean;
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
  provider?: string;
  requestId?: string;
  modelUsed?: string;
  tokensUsed?: number;
  confidence?: number;
  safetyChecks?: any[];
  analytics?: {
    engagement?: { readTime?: number; clickThroughRate?: number; responseRate?: number; shareRate?: number };
    effectiveness?: { goalAchievement?: number; userSatisfaction?: number; taskCompletion?: number; errorReduction?: number };
    learning?: { patternRecognition?: number; adaptationRate?: number; improvementSuggestions?: number; knowledgeGained?: number };
  };
  routing?: {
    analysis?: any;
    processedAt?: Date;
    optimizations?: any[];
  };
  [key: string]: any;
}

export interface ResponsePersonalization {
  adapted: boolean;
  adjustments: PersonalizationAdjustment[];
  userProfile: boolean;
  contextual: boolean;
  userId?: string;
  applied?: boolean;
  effectiveness?: number;
  feedback?: ResponseFeedback;
}

export interface PersonalizationAdjustment {
  type: string;
  original: any;
  modified: any;
  reason: string;
  confidence?: number;
}

export interface ResponseQuality {
  relevance: number;
  accuracy: number;
  clarity: number;
  completeness: number;
  appropriateness: number;
  overall: number;
}

export interface ResponseFeedback {
  rating?: number;
  comment?: string;
  type?: 'explicit' | 'implicit';
  timestamp?: Date;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface AIConfiguration {
  providers: {
    openai: {
      enabled: boolean;
      apiKey: string;
      endpoint?: string;
      timeout?: number;
      retries?: number;
      customHeaders?: Record<string, string>;
    };
    anthropic: {
      enabled: boolean;
      apiKey: string;
      endpoint?: string;
      timeout?: number;
      retries?: number;
      customHeaders?: Record<string, string>;
    };
    local: {
      enabled: boolean;
      endpoint?: string;
      timeout?: number;
      retries?: number;
      modelPath?: string;
    };
  };
  routing: {
    strategy: RoutingStrategy;
    strategies: RoutingStrategy[];
    rules: RoutingRule[];
    loadBalancing: {
      enabled: boolean;
      strategy: 'round-robin' | 'weighted' | 'least-connections';
      weights?: Record<string, number>;
    };
    healthCheck: HealthCheckConfig;
  };
  safety: {
    enabled: boolean;
    level?: 'low' | 'medium' | 'high' | 'critical';
    checks?: string[];
  };
  personalization: {
    enabled: boolean;
    strategies?: string[];
  };
  formatting: {
    enabled: boolean;
    strategies?: string[];
  };
  enhancements: {
    enabled: boolean;
    types?: string[];
  };
  performance: {
    maxConcurrentRequests?: number;
    queueSize?: number;
    timeoutMs?: number;
    retryAttempts?: number;
  };
  conversation: {
    maxMessagesPerConversation?: number;
    maxMessageAge?: number;
    cleanup: {
      enabled: boolean;
      interval?: number;
      maxAge?: number;
    };
  };
  memory: {
    maxMemories?: number;
    retention?: number;
    indexing?: boolean;
  };
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

export interface LoadBalancingConfig {
  enabled: boolean;
  strategy: 'round-robin' | 'weighted' | 'least-connections';
  weights?: Record<string, number>;
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

// Additional missing types for AI system

export interface Intent {
  type: IntentType | 'unknown';
  confidence: number;
  parameters?: Record<string, any>;
  subIntents?: SubIntent[];
  context?: IntentContext;
  matchedPattern?: IntentPattern;
  reasoning?: string[];
  approach?: 'keyword' | 'ml' | 'hybrid' | 'pattern';
}

export interface Priority {
  level: 'low' | 'medium' | 'high' | 'urgent' | 'normal';
  score: number;
}

export interface Response {
  id: string;
  conversationId?: string;
  content: string;
  type: 'text' | 'embed' | 'file' | 'interactive';
  strategy: ResponseStrategy;
  personalization: ResponsePersonalization;
  metadata: ResponseMetadata;
  attachments?: any[];
  toolCalls?: any[];
}

export interface SafetyCheckResult {
  safe: boolean;
  reason?: string;
  confidence: number;
  recommendations?: string[];
  isSafe?: boolean;
  issues?: SafetyIssue[];
  escalation?: EscalationInfo;
  audit?: AuditInfo;
}

export interface SafetyIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  confidence: number;
  evidence?: string[];
  mitigation?: string;
  preventable?: boolean;
}

export interface EscalationInfo {
  required: boolean;
  level: 'human' | 'automated' | 'manager';
  reason: string;
  urgency: 'low' | 'normal' | 'high' | 'critical';
  contacts: string[];
}

export interface AuditInfo {
  id: string;
  timestamp: Date;
  assessor: string;
  methodology: string;
  findings: any[];
  recommendations: string[];
  followUp: {
    required: boolean;
    schedule: string;
    responsible: string[];
  };
}

export interface ConversationFlow {
  id: string;
  userId: string;
  state?: string;
  context: any;
  history: ConversationMessage[];
  nextSteps: string[];
  stage?: 'opening' | 'development' | 'resolution' | 'closing';
  progress?: number;
  expectedNextIntents?: string[];
  blockers?: string[];
}

export interface TemporalContext {
  timestamp: Date;
  timezone: string;
  season?: 'spring' | 'summer' | 'fall' | 'winter';
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek?: string;
  recentEvents?: any[];
}

export interface RoutingStrategy {
  name: string;
  type: 'round_robin' | 'load_balanced' | 'capability_based' | 'cost_optimized';
  algorithm?: string;
  weights?: Record<string, number>;
  config?: any;
}

export interface RoutingStrategyConfig {
  name: string;
  type: 'round_robin' | 'load_balanced' | 'capability_based' | 'cost_optimized';
  algorithm: string;
  weights: Record<string, number>;
  config?: any;
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
  provider?: string;
  model?: string;
  parameters?: any;
}

export interface RoutingRule {
  id: string;
  condition: RoutingCondition;
  action: RoutingAction;
  priority: number;
  enabled: boolean;
}

export interface PersonalizationAdjustment {
  type: string;
  original: any;
  modified: any;
  reason: string;
  confidence?: number;
}

export interface AIRequest {
  id: string;
  model?: string;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  functions?: any[];
  function_call?: any;
  tools?: any[];
  tool_choice?: any;
  timestamp: Date;
  userId?: string;
  conversationId?: string;
  contextWindow?: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string;
  name?: string;
  function_call?: any;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface AIResponse {
  id: string;
  model: string;
  created: Date;
  content: string;
  role: string;
  finishReason?: string;
  usage: TokenUsage;
  functionCall?: any;
  toolCalls?: any[];
  metadata: ResponseMetadata;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ResponseFeedback {
  rating?: number;
  comment?: string;
  type?: 'explicit' | 'implicit';
  timestamp?: Date;
}

export interface RoutingRequest {
  id?: string;
  userId?: string;
  guildId?: string;
  channelId?: string;
  userRole?: string;
  userTier?: string;
  userStats?: UserStats;
  priority?: Priority;
  intent?: Intent;
  context?: ConversationContext;
  messages?: AIMessage[];
  maxTokens?: number;
  contextWindow?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  functions?: any[];
  function_call?: any;
  tools?: any[];
  tool_choice?: any;
  attachments?: Attachment[];
}

export interface RoutingResult {
  requestId: string;
  response?: AIResponse;
  routingDecision?: RoutingDecision;
  processingTime: number;
  strategy: RoutingStrategy;
  analysis: RequestAnalysis;
  queued?: boolean;
  estimatedProcessingTime?: number;
  queuePosition?: number;
}

export interface RequestAnalysis {
  complexity: 'low' | 'medium' | 'high';
  priority: Priority;
  estimatedTokens: number;
  capabilities: string[];
  contentType: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  costSensitivity: 'low' | 'medium' | 'high';
  latencySensitivity: 'low' | 'medium' | 'high';
  intent?: Intent;
  context?: ConversationContext;
}

export interface RoutingDecision {
  provider: string;
  model: string;
  confidence: number;
  reasoning: string[];
  strategy: string;
  estimatedCost: number;
}

export interface ProcessingContext {
  userId?: string;
  guildId?: string;
  channelId?: string;
  channelType?: string;
  userPreferences?: UserPreferences;
  conversationContext?: ConversationContext;
  sentiment?: SentimentAnalysis;
  intent?: any;
  requestMessages?: string[];
  userFeedback?: ResponseFeedback;
}

export interface ModelSelectionRequest {
  id: string;
  userId?: string;
  guildId?: string;
  channelId?: string;
  intent?: Intent;
  messages?: AIMessage[];
  requiredCapabilities?: string[];
  maxTokens?: number;
  contextWindow?: number;
  maxCost?: number;
  minPriority?: number;
  priority?: Priority;
}

export interface ModelSelectionResult {
  model: AvailableModel;
  provider: BaseAIProvider;
  confidence: number;
  reasoning: string[];
  alternatives: AvailableModel[];
}

export interface AvailableModel {
  modelId: string;
  providerId: string;
  model: AIModel;
  capabilities: ModelCapability[];
  costPerToken: number;
  maxTokens: number;
  contextWindow: number;
  isDefault: boolean;
}

export interface UserStats {
  dailyRequests: number;
  monthlyRequests: number;
  averageTokensPerRequest: number;
  lastRequest: Date;
}

export interface Attachment {
  type: string;
  url: string;
  size: number;
  name: string;
}

// Base class for AI providers (to be used in interfaces)
export declare class BaseAIProvider {
  constructor(config: ProviderConfig, logger: any);
  getProviderInfo(): AIProvider;
  getAvailableModels(): AIModel[];
  isAvailable(): Promise<boolean>;
  generateResponse(request: AIRequest): Promise<AIResponse>;
  validateRequest(request: AIRequest): Promise<ValidationResult>;
  estimateCost(request: AIRequest): Promise<number>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}