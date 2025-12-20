import { Message } from 'discord.js';

/**
 * Message processing context information
 */
export interface MessageContext {
  userId: string;
  guildId?: string;
  channelId: string;
  messageId: string;
  timestamp: Date;
  previousMessages?: Message[];
  userHistory?: UserMessageHistory;
  guildContext?: GuildContext;
}

/**
 * User message history for context
 */
export interface UserMessageHistory {
  messageCount: number;
  lastMessageTime: Date;
  averageMessageLength: number;
  commonPatterns: string[];
  spamScore: number;
}

/**
 * Guild-specific context
 */
export interface GuildContext {
  memberCount: number;
  userRoles: string[];
  channelType: string;
  guildRules?: string[];
  activeModerators: string[];
}

/**
 * Recognized message intent
 */
export interface MessageIntent {
  type: IntentType;
  confidence: number;
  entities: IntentEntity[];
  action?: string;
  target?: string;
}

/**
 * Intent types for message classification
 */
export enum IntentType {
  COMMAND = 'command',
  QUESTION = 'question',
  GREETING = 'greeting',
  FAREWELL = 'farewell',
  HELP = 'help',
  MODERATION = 'moderation',
  SPAM = 'spam',
  CONVERSATION = 'conversation',
  UNKNOWN = 'unknown'
}

/**
 * Extracted entities from message
 */
export interface IntentEntity {
  type: string;
  value: string;
  confidence: number;
  start: number;
  end: number;
}

/**
 * Safety check results
 */
export interface SafetyCheckResult {
  isSafe: boolean;
  riskLevel: RiskLevel;
  violations: SafetyViolation[];
  confidence: number;
  requiresAction: boolean;
}

/**
 * Risk levels for safety assessment
 */
export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Safety violations detected
 */
export interface SafetyViolation {
  type: ViolationType;
  severity: RiskLevel;
  description: string;
  detectedContent: string;
  suggestedAction: string;
}

/**
 * Types of safety violations
 */
export enum ViolationType {
  PROFANITY = 'profanity',
  HARASSMENT = 'harassment',
  SPAM = 'spam',
  MALICIOUS_LINKS = 'malicious_links',
  PERSONAL_INFO = 'personal_info',
  HATE_SPEECH = 'hate_speech',
  SELF_HARM = 'self_harm',
  VIOLENCE = 'violence'
}

/**
 * Message routing decision
 */
export interface RoutingDecision {
  handler: HandlerType;
  priority: number;
  requiresModeration: boolean;
  shouldRespond: boolean;
  responseChannel?: string;
  metadata?: Record<string, any>;
}

/**
 * Handler types for message routing
 */
export enum HandlerType {
  COMMAND = 'command',
  AI_CHAT = 'ai_chat',
  MODERATION = 'moderation',
  HELP_SYSTEM = 'help_system',
  IGNORE = 'ignore',
  LOG_ONLY = 'log_only'
}

/**
 * Complete processing result
 */
export interface ProcessingResult {
  originalMessage: Message;
  context: MessageContext;
  intent: MessageIntent;
  safety: SafetyCheckResult;
  routing: RoutingDecision;
  processingTime: number;
  success: boolean;
  errors?: string[];
}

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  enableSafetyChecks: boolean;
  enableIntentRecognition: boolean;
  enableContextExtraction: boolean;
  safetyThreshold: number;
  contextHistorySize: number;
  intentConfidenceThreshold: number;
  enableLogging: boolean;
  // Channel filtering and mention detection
  allowedChannels?: string[];
  respondToMentions?: boolean;
  allowedChannelNames?: string[];
}

/**
 * Default pipeline configuration
 */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  enableSafetyChecks: true,
  enableIntentRecognition: true,
  enableContextExtraction: true,
  safetyThreshold: 0.7,
  contextHistorySize: 10,
  intentConfidenceThreshold: 0.5,
  enableLogging: true,
  // Channel filtering and mention detection defaults
  allowedChannels: [], // Empty by default, will be configured
  respondToMentions: true, // Enabled by default
  allowedChannelNames: [process.env.BOT_RESPONSE_CHANNEL || 'megawatts'] // Use environment variable or fallback to megawatts
};

/**
 * Processing pipeline statistics
 */
export interface PipelineStats {
  totalProcessed: number;
  averageProcessingTime: number;
  intentDistribution: Record<IntentType, number>;
  safetyViolations: Record<ViolationType, number>;
  routingDistribution: Record<HandlerType, number>;
  errorRate: number;
}