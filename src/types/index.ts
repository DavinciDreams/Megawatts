// Core type definitions for self-editing Discord bot

// Re-export error types
export * from '../core/errors/types';

// Re-export conversational types
export * from './conversational';

export interface BotConfig {
  token: string;
  clientId: string;
  guildId: string;
  prefix: string;
  intents: string[];
  presence: {
    status: string;
    activities: Array<{
      name: string;
      type: string;
    }>;
  };
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  pool: {
    min: number;
    max: number;
    idle: number;
  };
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

export interface AIConfig {
  openai?: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };
  anthropic?: {
    apiKey: string;
    model: string;
    maxTokens: number;
  };
}

export interface StorageConfig {
  postgres: DatabaseConfig;
  redis: RedisConfig;
  vector?: {
    provider: 'pinecone' | 'weaviate' | 'qdrant';
    config: Record<string, any>;
  };
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'text';
  transports: Array<{
    type: 'console' | 'file' | 'database';
    config: Record<string, any>;
  }>;
}

export interface SelfEditingConfig {
  enabled: boolean;
  interval: number; // minutes
  criteria: {
    performance: {
      enabled: boolean;
      thresholds: {
        responseTime: number;
        errorRate: number;
      };
    };
    userFeedback: {
      enabled: boolean;
      minInteractions: number;
      feedbackWeight: number;
    };
    codeQuality: {
      enabled: boolean;
      metrics: ['complexity', 'maintainability', 'testCoverage'];
    };
  };
  learning: {
    enabled: boolean;
    adaptationRate: number;
    maxChangesPerSession: number;
  };
}

export interface PluginConfig {
  name: string;
  enabled: boolean;
  config: Record<string, any>;
  dependencies?: string[];
}

export interface ToolConfig {
  name: string;
  enabled: boolean;
  permissions: string[];
  config: Record<string, any>;
}

export interface ConfigSchema {
  bot: BotConfig;
  storage: StorageConfig;
  ai: AIConfig;
  logging: LoggingConfig;
  selfEditing: SelfEditingConfig;
  plugins: PluginConfig[];
  tools: ToolConfig[];
  environment: 'development' | 'staging' | 'production';
}

// Event types
export interface DiscordEvent {
  type: string;
  data: any;
  timestamp: Date;
  guildId?: string;
  userId?: string;
  channelId?: string;
}

export interface SelfEditingMetrics {
  timestamp: Date;
  type: 'performance' | 'user_feedback' | 'code_quality' | 'adaptation';
  metrics: Record<string, number | string | boolean>;
  confidence: number;
  actionTaken?: {
    type: string;
    description: string;
    result: 'success' | 'failure' | 'partial';
  };
}

// Database types
export interface User {
  id: string;
  discordId: string;
  username: string;
  discriminator: string;
  avatar?: string;
  roles: string[];
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
  lastSeen?: Date;
}

export interface Guild {
  id: string;
  name: string;
  icon?: string;
  ownerId: string;
  memberCount: number;
  features: {
    textChannels: number;
    voiceChannels: number;
    roles: number;
    emojis: number;
  };
  settings: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// AI Tool types
export interface AITool {
  name: string;
  description: string;
  parameters: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required: boolean;
    description: string;
  }>;
  examples?: Array<{
    input: Record<string, any>;
    output: any;
    description: string;
  }>;
}

export interface ToolCall {
  id: string;
  tool: string;
  input: Record<string, any>;
  output: any;
  timestamp: Date;
  executionTime: number;
  success: boolean;
  error?: string;
}

// Plugin types
export interface Plugin {
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  hooks: {
    onMessage?: string;
    onReaction?: string;
    onJoin?: string;
    onLeave?: string;
  };
  config: Record<string, any>;
}

// Error types
export interface BotError extends Error {
  code: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
  timestamp: Date;
}

export interface ConfigurationError extends BotError {
  field: string;
  expectedValue: any;
  actualValue: any;
}

export interface DatabaseError extends BotError {
  query?: string;
  parameters?: Record<string, any>;
}

export interface AIError extends BotError {
  provider: 'openai' | 'anthropic';
  model?: string;
  tokensUsed?: number;
}

export interface SelfEditingError extends BotError {
  metricType: string;
  threshold?: number;
  actualValue?: number;
  suggestedAction?: string;
}

// Discord-specific Command Types
export interface DiscordCommand {
  name: string;
  description: string;
  category: CommandCategory;
  permissions: DiscordPermission[];
  cooldown: number;
  enabled: boolean;
  options?: DiscordCommandOption[];
  subcommands?: DiscordSubcommand[];
  aliases?: string[];
  usage?: string;
  examples?: string[];
  restrictions?: CommandRestrictions;
}

export enum CommandCategory {
  ADMINISTRATION = 'administration',
  MODERATION = 'moderation',
  UTILITY = 'utility',
  FUN = 'fun',
  INFORMATION = 'information',
  AI = 'ai',
  CONFIGURATION = 'configuration',
  DEVELOPER = 'developer'
}

export enum DiscordPermission {
  ADMINISTRATOR = 'Administrator',
  MANAGE_GUILD = 'ManageGuild',
  MANAGE_CHANNELS = 'ManageChannels',
  MANAGE_MESSAGES = 'ManageMessages',
  KICK_MEMBERS = 'KickMembers',
  BAN_MEMBERS = 'BanMembers',
  SEND_MESSAGES = 'SendMessages',
  EMBED_LINKS = 'EmbedLinks',
  ATTACH_FILES = 'AttachFiles',
  READ_MESSAGE_HISTORY = 'ReadMessageHistory',
  MENTION_EVERYONE = 'MentionEveryone',
  USE_EXTERNAL_EMOJIS = 'UseExternalEmojis',
  ADD_REACTIONS = 'AddReactions'
}

export interface DiscordCommandOption {
  name: string;
  description: string;
  type: CommandOptionType;
  required: boolean;
  choices?: CommandOptionChoice[];
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  autocomplete?: boolean;
}

export enum CommandOptionType {
  STRING = 'STRING',
  INTEGER = 'INTEGER',
  BOOLEAN = 'BOOLEAN',
  USER = 'USER',
  CHANNEL = 'CHANNEL',
  ROLE = 'ROLE',
  MENTIONABLE = 'MENTIONABLE',
  NUMBER = 'NUMBER',
  ATTACHMENT = 'ATTACHMENT'
}

export interface CommandOptionChoice {
  name: string;
  value: string | number;
}

export interface DiscordSubcommand {
  name: string;
  description: string;
  options?: DiscordCommandOption[];
}

export interface CommandRestrictions {
  guildOnly?: boolean;
  dmOnly?: boolean;
  ownerOnly?: boolean;
  nsfw?: boolean;
  cooldownExempt?: string[];
  roleExempt?: string[];
  channelExempt?: string[];
}

export interface CommandCooldown {
  userId: string;
  commandName: string;
  timestamp: Date;
  duration: number;
  guildId?: string;
}

// Discord Event Types
export interface DiscordMessageEvent {
  eventType: 'messageCreate' | 'messageUpdate' | 'messageDelete';
  messageId: string;
  channelId: string;
  guildId?: string;
  author: DiscordUser;
  content: string;
  attachments: DiscordAttachment[];
  embeds: DiscordEmbed[];
  mentions: DiscordUser[];
  mentionRoles: string[];
  mentionChannels: string[];
  timestamp: Date;
  editedTimestamp?: Date;
  tts: boolean;
  pinned: boolean;
  webhookId?: string;
  messageType: MessageType;
  flags: MessageFlags;
  reactions: DiscordReaction[];
}

export interface DiscordGuildEvent {
  eventType: 'guildCreate' | 'guildUpdate' | 'guildDelete' | 'guildMemberAdd' | 'guildMemberRemove' | 'guildMemberUpdate';
  guildId: string;
  guild?: DiscordGuild;
  member?: DiscordGuildMember;
  user?: DiscordUser;
  timestamp: Date;
}

export interface DiscordInteractionEvent {
  eventType: 'interactionCreate';
  interactionId: string;
  interactionType: InteractionType;
  user: DiscordUser;
  channel?: DiscordChannel;
  guild?: DiscordGuild;
  timestamp: Date;
  data: any;
  token: string;
  version: number;
}

export interface DiscordVoiceEvent {
  eventType: 'voiceStateUpdate' | 'voiceServerUpdate';
  userId: string;
  guildId: string;
  channelId?: string;
  sessionId?: string;
  deaf?: boolean;
  mute?: boolean;
  selfDeaf?: boolean;
  selfMute?: boolean;
  suppress?: boolean;
  timestamp: Date;
}

export enum MessageType {
  DEFAULT = 'DEFAULT',
  RECIPIENT_ADD = 'RECIPIENT_ADD',
  RECIPIENT_REMOVE = 'RECIPIENT_REMOVE',
  CALL = 'CALL',
  CHANNEL_NAME_CHANGE = 'CHANNEL_NAME_CHANGE',
  CHANNEL_ICON_CHANGE = 'CHANNEL_ICON_CHANGE',
  CHANNEL_PINNED_MESSAGE = 'CHANNEL_PINNED_MESSAGE',
  GUILD_MEMBER_JOIN = 'GUILD_MEMBER_JOIN',
  USER_PREMIUM_GUILD_SUBSCRIPTION = 'USER_PREMIUM_GUILD_SUBSCRIPTION',
  USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_1 = 'USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_1',
  USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_2 = 'USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_2',
  USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_3 = 'USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_3',
  CHANNEL_FOLLOW_ADD = 'CHANNEL_FOLLOW_ADD',
  GUILD_DISCOVERY_DISQUALIFIED = 'GUILD_DISCOVERY_DISQUALIFIED',
  GUILD_DISCOVERY_REQUALIFIED = 'GUILD_DISCOVERY_REQUALIFIED',
  GUILD_DISCOVERY_GRACE_PERIOD_INITIAL_WARNING = 'GUILD_DISCOVERY_GRACE_PERIOD_INITIAL_WARNING',
  GUILD_DISCOVERY_GRACE_PERIOD_FINAL_WARNING = 'GUILD_DISCOVERY_GRACE_PERIOD_FINAL_WARNING',
  THREAD_CREATED = 'THREAD_CREATED',
  REPLY = 'REPLY',
  CHAT_INPUT_COMMAND = 'CHAT_INPUT_COMMAND',
  THREAD_STARTER_MESSAGE = 'THREAD_STARTER_MESSAGE',
  GUILD_INVITE_REMINDER = 'GUILD_INVITE_REMINDER',
  CONTEXT_MENU_COMMAND = 'CONTEXT_MENU_COMMAND',
  AUTO_MODERATION_ACTION = 'AUTO_MODERATION_ACTION',
  ROLE_SUBSCRIPTION_PURCHASE = 'ROLE_SUBSCRIPTION_PURCHASE',
  INTERACTION_PREMIUM_UPSELL = 'INTERACTION_PREMIUM_UPSELL',
  STAGE_START = 'STAGE_START',
  STAGE_END = 'STAGE_END',
  STAGE_SPEAKER = 'STAGE_SPEAKER',
  STAGE_TOPIC = 'STAGE_TOPIC',
  GUILD_APPLICATION_PREMIUM_SUBSCRIPTION = 'GUILD_APPLICATION_PREMIUM_SUBSCRIPTION'
}

export enum MessageFlags {
  CROSSPOSTED = 'CROSSPOSTED',
  IS_CROSSPOST = 'IS_CROSSPOST',
  SUPPRESS_EMBEDS = 'SUPPRESS_EMBEDS',
  SOURCE_MESSAGE_DELETED = 'SOURCE_MESSAGE_DELETED',
  URGENT = 'URGENT',
  HAS_THREAD = 'HAS_THREAD',
  EPHEMERAL = 'EPHEMERAL',
  LOADING = 'LOADING',
  FAILED_TO_MENTION_SOME_ROLES_IN_THREAD = 'FAILED_TO_MENTION_SOME_ROLES_IN_THREAD'
}

// Discord Interaction Types
export interface DiscordInteraction {
  id: string;
  type: InteractionType;
  applicationId: string;
  guildId?: string;
  channelId?: string;
  user: DiscordUser;
  member?: DiscordGuildMember;
  token: string;
  version: number;
  message?: DiscordMessage;
  appPermissions?: DiscordPermission[];
  locale?: string;
  guildLocale?: string;
  entitlements?: any[];
  authorizingIntegrationOwners?: any;
  context?: InteractionContextType;
}

export enum InteractionType {
  PING = 'PING',
  APPLICATION_COMMAND = 'APPLICATION_COMMAND',
  MESSAGE_COMPONENT = 'MESSAGE_COMPONENT',
  APPLICATION_COMMAND_AUTOCOMPLETE = 'APPLICATION_COMMAND_AUTOCOMPLETE',
  MODAL_SUBMIT = 'MODAL_SUBMIT'
}

export enum InteractionContextType {
  GUILD = 'GUILD',
  BOT_DM = 'BOT_DM',
  PRIVATE_CHANNEL = 'PRIVATE_CHANNEL'
}

export interface DiscordSlashCommand extends DiscordInteraction {
  type: InteractionType.APPLICATION_COMMAND;
  data: SlashCommandData;
}

export interface DiscordComponentInteraction extends DiscordInteraction {
  type: InteractionType.MESSAGE_COMPONENT;
  data: ComponentInteractionData;
}

export interface DiscordModalSubmitInteraction extends DiscordInteraction {
  type: InteractionType.MODAL_SUBMIT;
  data: ModalSubmitData;
}

export interface SlashCommandData {
  id: string;
  name: string;
  type: CommandOptionType;
  resolved?: any;
  options?: CommandOptionValue[];
  guildId?: string;
  targetId?: string;
}

export interface ComponentInteractionData {
  customId: string;
  componentType: ComponentType;
  values?: string[];
}

export enum ComponentType {
  ACTION_ROW = 'ACTION_ROW',
  BUTTON = 'BUTTON',
  STRING_SELECT = 'STRING_SELECT',
  INPUT_TEXT = 'INPUT_TEXT',
  USER_SELECT = 'USER_SELECT',
  ROLE_SELECT = 'ROLE_SELECT',
  MENTIONABLE_SELECT = 'MENTIONABLE_SELECT',
  CHANNEL_SELECT = 'CHANNEL_SELECT'
}

export interface ModalSubmitData {
  customId: string;
  components: ModalActionRow[];
}

export interface ModalActionRow {
  type: ComponentType.ACTION_ROW;
  components: ModalComponent[];
}

export interface ModalComponent {
  type: ComponentType.INPUT_TEXT;
  customId: string;
  value?: string;
}

export interface CommandOptionValue {
  name: string;
  type: CommandOptionType;
  value: any;
  focused?: boolean;
}

// Discord Bot State Types
export interface BotState {
  status: BotStatus;
  uptime: number;
  guilds: number;
  users: number;
  channels: number;
  commands: number;
  memory: MemoryUsage;
  performance: PerformanceMetrics;
  lastHeartbeat?: Date;
  version: string;
  environment: 'development' | 'staging' | 'production';
}

export enum BotStatus {
  OFFLINE = 'offline',
  CONNECTING = 'connecting',
  ONLINE = 'online',
  MAINTENANCE = 'maintenance',
  ERROR = 'error'
}

export interface MemoryUsage {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

export interface PerformanceMetrics {
  responseTime: number;
  commandsPerSecond: number;
  messagesPerSecond: number;
  errorRate: number;
  uptime: number;
  latency: number;
}

export interface BotStatistics {
  totalCommands: number;
  totalMessages: number;
  totalInteractions: number;
  totalGuilds: number;
  totalUsers: number;
  averageResponseTime: number;
  errorCount: number;
  uptime: number;
  commandUsage: Record<string, number>;
  guildActivity: Record<string, GuildActivity>;
}

export interface GuildActivity {
  messageCount: number;
  commandCount: number;
  lastActivity: Date;
  activeUsers: number;
}

// Discord Configuration Types
export interface DiscordBotConfig extends BotConfig {
  features: BotFeatures;
  moderation: ModerationConfig;
  autoModeration: AutoModerationConfig;
  welcome: WelcomeConfig;
  leveling: LevelingConfig;
  economy: EconomyConfig;
  music: MusicConfig;
  logging: DiscordLoggingConfig;
  backup: BackupConfig;
}

export interface BotFeatures {
  commands: boolean;
  autoModeration: boolean;
  leveling: boolean;
  economy: boolean;
  music: boolean;
  welcome: boolean;
  logging: boolean;
  backup: boolean;
  ai: boolean;
  selfEditing: boolean;
}

export interface ModerationConfig {
  enabled: boolean;
  autoMod: boolean;
  logChannel?: string;
  modRole?: string;
  adminRole?: string;
  warnThreshold: number;
  kickThreshold: number;
  banThreshold: number;
  muteRole?: string;
  jailChannel?: string;
  rules: ModerationRule[];
}

export interface ModerationRule {
  id: string;
  name: string;
  enabled: boolean;
  type: ModerationRuleType;
  trigger: string;
  action: ModerationAction;
  severity: 'low' | 'medium' | 'high' | 'critical';
  exemptRoles?: string[];
  exemptChannels?: string[];
}

export enum ModerationRuleType {
  SPAM = 'spam',
  PROFANITY = 'profanity',
  INVITES = 'invites',
  MENTIONS = 'mentions',
  LINKS = 'links',
  CAPS = 'caps',
  SLOWMODE = 'slowmode'
}

export enum ModerationAction {
  WARN = 'warn',
  MUTE = 'mute',
  KICK = 'kick',
  BAN = 'ban',
  DELETE = 'delete',
  QUARANTINE = 'quarantine'
}

export interface AutoModerationConfig {
  enabled: boolean;
  rules: AutoModRule[];
  alertChannel?: string;
  logChannel?: string;
}

export interface AutoModRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: AutoModTriggerType;
  keywordPatterns: string[];
  allowList: string[];
  action: AutoModAction;
  severity: 'low' | 'medium' | 'high';
}

export enum AutoModTriggerType {
  KEYWORD = 'keyword',
  SPAM = 'spam',
  MENTION_SPAM = 'mention_spam',
  LINK_SPAM = 'link_spam'
}

export enum AutoModAction {
  BLOCK_MESSAGE = 'block_message',
  ALERT = 'alert',
  TIMEOUT = 'timeout',
  DELETE = 'delete'
}

export interface WelcomeConfig {
  enabled: boolean;
  channel?: string;
  message?: string;
  embed?: boolean;
  embedColor?: string;
  embedTitle?: string;
  embedDescription?: string;
  embedImage?: string;
  assignRole?: string;
  sendDm?: boolean;
  dmMessage?: string;
}

export interface LevelingConfig {
  enabled: boolean;
  messageXp: number;
  voiceXpPerMinute: number;
  maxLevel: number;
  levelUpMessage?: string;
  levelUpChannel?: string;
  levelRoles: LevelRole[];
  xpMultiplier: number;
}

export interface LevelRole {
  level: number;
  roleId: string;
  removePrevious: boolean;
}

export interface EconomyConfig {
  enabled: boolean;
  startingBalance: number;
  dailyAmount: number;
  workMin: number;
  workMax: number;
  workCooldown: number;
  currencySymbol: string;
  currencyName: string;
}

export interface MusicConfig {
  enabled: boolean;
  maxQueueSize: number;
  defaultVolume: number;
  leaveOnEmpty: boolean;
  leaveOnEmptyDelay: number;
  autoPlay: boolean;
  lyricsEnabled: boolean;
}

export interface DiscordLoggingConfig {
  enabled: boolean;
  messageLogs: boolean;
  moderationLogs: boolean;
  voiceLogs: boolean;
  memberLogs: boolean;
  channelLogs: boolean;
  logChannel?: string;
  logLevel: 'basic' | 'detailed' | 'verbose';
}

export interface BackupConfig {
  enabled: boolean;
  interval: number; // hours
  includeRoles: boolean;
  includeChannels: boolean;
  includeMessages: boolean;
  includeSettings: boolean;
  storageLocation: 'local' | 'cloud';
  retention: number; // days
}

// Self-Editing Integration Types
export interface SelfEditingIntegration {
  enabled: boolean;
  engine: any; // SelfEditingEngine will be imported from actual implementation
  metrics: SelfEditingMetricsCollector;
  feedback: SelfEditingFeedbackProcessor;
  adaptation: SelfEditingAdaptationEngine;
  learning: SelfEditingLearningSystem;
}

export interface SelfEditingMetricsCollector {
  collectPerformanceMetrics(): Promise<PerformanceMetricData>;
  collectUserMetrics(): Promise<UserMetricData>;
  collectSystemMetrics(): Promise<SystemMetricData>;
  analyzeMetrics(): Promise<MetricsAnalysis>;
}

export interface PerformanceMetricData {
  responseTime: number;
  commandSuccess: number;
  commandFailure: number;
  errorRate: number;
  memoryUsage: number;
  cpuUsage: number;
  timestamp: Date;
}

export interface UserMetricData {
  totalInteractions: number;
  satisfactionScore: number;
  engagementLevel: number;
  feedbackCount: number;
  commonCommands: string[];
  timestamp: Date;
}

export interface SystemMetricData {
  uptime: number;
  guildCount: number;
  userCount: number;
  messageCount: number;
  commandCount: number;
  errorCount: number;
  timestamp: Date;
}

export interface MetricsAnalysis {
  performance: PerformanceAnalysis;
  userSatisfaction: SatisfactionAnalysis;
  systemHealth: HealthAnalysis;
  recommendations: AdaptationRecommendation[];
  confidence: number;
}

export interface PerformanceAnalysis {
  trend: 'improving' | 'stable' | 'degrading';
  bottlenecks: string[];
  efficiency: number;
  issues: PerformanceIssue[];
}

export interface SatisfactionAnalysis {
  overallScore: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  commonComplaints: string[];
  positiveFeedback: string[];
  areasForImprovement: string[];
}

export interface HealthAnalysis {
  status: 'healthy' | 'warning' | 'critical';
  issues: HealthIssue[];
  resourceUsage: ResourceUsage;
  stability: number;
}

export interface PerformanceIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  affectedComponent: string;
  suggestedFix: string;
}

export interface HealthIssue {
  component: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
  impact: string;
  resolution: string;
}

export interface ResourceUsage {
  memory: number;
  cpu: number;
  disk: number;
  network: number;
}

export interface AdaptationRecommendation {
  type: AdaptationType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  expectedImpact: string;
  implementationComplexity: 'simple' | 'moderate' | 'complex';
  rollbackPlan: string;
}

export enum AdaptationType {
  PERFORMANCE_OPTIMIZATION = 'performance_optimization',
  BEHAVIOR_ADJUSTMENT = 'behavior_adjustment',
  CONFIGURATION_CHANGE = 'configuration_change',
  CODE_REFACTORING = 'code_refactoring',
  FEATURE_ENHANCEMENT = 'feature_enhancement',
  BUG_FIX = 'bug_fix'
}

export interface SelfEditingFeedbackProcessor {
  collectFeedback(): Promise<UserFeedback[]>;
  analyzeFeedback(feedback: UserFeedback[]): Promise<FeedbackAnalysis>;
  categorizeFeedback(feedback: UserFeedback[]): FeedbackCategory[];
  generateInsights(analysis: FeedbackAnalysis): FeedbackInsight[];
}

export interface UserFeedback {
  id: string;
  type: 'reaction' | 'rating' | 'comment' | 'interaction';
  value: string | number;
  userId: string;
  guildId?: string;
  channelId?: string;
  messageId?: string;
  timestamp: Date;
  context?: Record<string, any>;
}

export interface FeedbackAnalysis {
  timestamp: Date;
  totalInteractions: number;
  sentiment: {
    positive: number;
    negative: number;
    neutral: number;
  };
  averageRating: number;
  commonIssues: string[];
  improvementSuggestions: string[];
  confidence: number;
}

export interface FeedbackCategory {
  type: FeedbackType;
  count: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  examples: string[];
}

export enum FeedbackType {
  COMMAND_SUGGESTION = 'command_suggestion',
  BUG_REPORT = 'bug_report',
  FEATURE_REQUEST = 'feature_request',
  PERFORMANCE_ISSUE = 'performance_issue',
  USER_EXPERIENCE = 'user_experience',
  MODERATION = 'moderation'
}

export interface FeedbackInsight {
  category: FeedbackType;
  insight: string;
  confidence: number;
  actionable: boolean;
  priority: 'low' | 'medium' | 'high';
  suggestedAction: string;
}

export interface SelfEditingAdaptationEngine {
  evaluateRecommendations(recommendations: AdaptationRecommendation[]): Promise<AdaptationPlan>;
  createAdaptationPlan(recommendations: AdaptationRecommendation[]): AdaptationPlan;
  executeAdaptationPlan(plan: AdaptationPlan): Promise<AdaptationResult>;
  rollbackAdaptation(adaptationId: string): Promise<boolean>;
}

export interface AdaptationPlan {
  id: string;
  adaptations: PlannedAdaptation[];
  estimatedTime: number;
  riskLevel: 'low' | 'medium' | 'high';
  rollbackStrategy: RollbackStrategy;
  dependencies: string[];
  approvalRequired: boolean;
}

export interface PlannedAdaptation {
  id: string;
  type: AdaptationType;
  description: string;
  changes: AdaptationChange[];
  testPlan: TestPlan;
  rollbackPlan: RollbackPlan;
}

export interface AdaptationChange {
  file: string;
  type: 'add' | 'modify' | 'delete';
  content?: string;
  backup?: string;
}

export interface TestPlan {
  unitTests: string[];
  integrationTests: string[];
  performanceTests: string[];
  manualTests: string[];
}

export interface RollbackPlan {
  backupFiles: string[];
  rollbackSteps: string[];
  verificationSteps: string[];
}

export interface RollbackStrategy {
  type: 'automatic' | 'manual';
  triggers: string[];
  timeout: number;
  notificationChannels: string[];
}

export interface AdaptationResult {
  success: boolean;
  adaptationId: string;
  executedChanges: AdaptationChange[];
  testResults: TestResult[];
  errors: AdaptationError[];
  rollbackRequired: boolean;
  timestamp: Date;
}

export interface TestResult {
  testType: 'unit' | 'integration' | 'performance' | 'manual';
  testName: string;
  passed: boolean;
  duration: number;
  details?: string;
}

export interface AdaptationError {
  changeId: string;
  error: string;
  severity: 'low' | 'medium' | 'high';
  recoverable: boolean;
  suggestedFix: string;
}

export interface SelfEditingLearningSystem {
  recordAdaptation(result: AdaptationResult): Promise<void>;
  analyzeAdaptationHistory(): Promise<LearningAnalysis>;
  predictSuccess(adaptation: PlannedAdaptation): Promise<PredictionResult>;
  updateModel(feedback: AdaptationResult): Promise<void>;
}

export interface LearningAnalysis {
  successRate: number;
  commonFailurePatterns: string[];
  effectiveAdaptations: AdaptationType[];
  ineffectiveAdaptations: AdaptationType[];
  improvementSuggestions: string[];
  confidence: number;
}

export interface PredictionResult {
  successProbability: number;
  confidence: number;
  riskFactors: string[];
  mitigationStrategies: string[];
}

// Discord Object Types
export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  bot?: boolean;
  system?: boolean;
  mfaEnabled?: boolean;
  banner?: string;
  accentColor?: number;
  locale?: string;
  verified?: boolean;
  email?: string;
  flags?: number;
  premiumType?: number;
  publicFlags?: number;
  avatarDecoration?: string;
  displayName?: string;
}

export interface DiscordGuildMember {
  user: DiscordUser;
  nick?: string;
  avatar?: string;
  roles: string[];
  joinedAt: Date;
  premiumSince?: Date;
  deaf: boolean;
  mute: boolean;
  flags: number;
  pending: boolean;
  permissions?: DiscordPermission[];
  communicationDisabledUntil?: Date;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon?: string;
  iconHash?: string;
  splash?: string;
  discoverySplash?: string;
  owner?: DiscordUser;
  ownerId: string;
  permissions?: DiscordPermission[];
  region?: string;
  afkChannelId?: string;
  afkTimeout: number;
  widgetEnabled?: boolean;
  widgetChannelId?: string;
  verificationLevel: VerificationLevel;
  defaultMessageNotifications: DefaultMessageNotifications;
  explicitContentFilter: ExplicitContentFilterLevel;
  roles: DiscordRole[];
  emojis: DiscordEmoji[];
  features: GuildFeature[];
  mfaLevel: MFALevel;
  applicationId: string;
  systemChannelId?: string;
  systemChannelFlags: number;
  rulesChannelId?: string;
  maxMembers: number;
  maxPresences: number;
  approximateMemberCount: number;
  approximatePresenceCount: number;
  vanityUrlCode?: string;
  description?: string;
  banner?: string;
  premiumTier: PremiumTier;
  premiumSubscriptionCount?: number;
  preferredLocale: string;
  publicUpdatesChannelId?: string;
  safetyAlertsChannelId?: string;
}

export enum VerificationLevel {
  NONE = 'NONE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  VERY_HIGH = 'VERY_HIGH'
}

export enum DefaultMessageNotifications {
  ALL_MESSAGES = 'ALL_MESSAGES',
  ONLY_MENTIONS = 'ONLY_MENTIONS'
}

export enum ExplicitContentFilterLevel {
  DISABLED = 'DISABLED',
  MEMBERS_WITHOUT_ROLES = 'MEMBERS_WITHOUT_ROLES',
  ALL_MEMBERS = 'ALL_MEMBERS'
}

export enum MFALevel {
  NONE = 'NONE',
  ELEVATED = 'ELEVATED'
}

export enum PremiumTier {
  NONE = 'NONE',
  TIER_1 = 'TIER_1',
  TIER_2 = 'TIER_2',
  TIER_3 = 'TIER_3'
}

export enum GuildFeature {
  INVITE_SPLASH = 'INVITE_SPLASH',
  VIP_REGIONS = 'VIP_REGIONS',
  VANITY_URL = 'VANITY_URL',
  VERIFIED = 'VERIFIED',
  PARTNERED = 'PARTNERED',
  COMMUNITY = 'COMMUNITY',
  COMMERCE = 'COMMERCE',
  NEWS = 'NEWS',
  WELCOME_SCREEN_ENABLED = 'WELCOME_SCREEN_ENABLED',
  MEMBER_VERIFICATION_GATE_ENABLED = 'MEMBER_VERIFICATION_GATE_ENABLED',
  PREVIEW_ENABLED = 'PREVIEW_ENABLED',
  TICKETED_EVENTS_ENABLED = 'TICKETED_EVENTS_ENABLED',
  MONETIZATION_ENABLED = 'MONETIZATION_ENABLED',
  MORE_STICKERS = 'MORE_STICKERS',
  THREE_DAY_THREAD_ARCHIVE = 'THREE_DAY_THREAD_ARCHIVE',
  SEVEN_DAY_THREAD_ARCHIVE = 'SEVEN_DAY_THREAD_ARCHIVE',
  PRIVATE_THREADS = 'PRIVATE_THREADS'
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  position: number;
  permissions: DiscordPermission[];
  managed: boolean;
  mentionable: boolean;
  icon?: string;
  unicodeEmoji?: string;
  tags?: RoleTags;
}

export interface RoleTags {
  botId?: string;
  integrationId?: string;
  premiumSubscriber?: boolean;
}

export interface DiscordEmoji {
  id?: string;
  name: string;
  roles?: string[];
  user?: DiscordUser;
  requireColons: boolean;
  managed: boolean;
  animated: boolean;
  available: boolean;
}

export interface DiscordChannel {
  id: string;
  type: ChannelType;
  guildId?: string;
  position?: number;
  permissionOverwrites?: PermissionOverwrite[];
  name?: string;
  topic?: string;
  nsfw?: boolean;
  lastMessageId?: string;
  bitrate?: number;
  userLimit?: number;
  rateLimitPerUser?: number;
  recipients?: DiscordUser[];
  icon?: string;
  ownerId?: string;
  applicationId?: string;
  parentId?: string;
  lastPinTimestamp?: Date;
  rtcRegion?: string;
  videoQualityMode?: VideoQualityMode;
  messageCount?: number;
  memberCount?: number;
  defaultAutoArchiveDuration?: ThreadAutoArchiveDuration;
  flags?: ChannelFlags;
}

export enum ChannelType {
  GUILD_TEXT = 'GUILD_TEXT',
  DM = 'DM',
  GUILD_VOICE = 'GUILD_VOICE',
  GROUP_DM = 'GROUP_DM',
  GUILD_CATEGORY = 'GUILD_CATEGORY',
  GUILD_NEWS = 'GUILD_NEWS',
  GUILD_STORE = 'GUILD_STORE',
  GUILD_NEWS_THREAD = 'GUILD_NEWS_THREAD',
  GUILD_PUBLIC_THREAD = 'GUILD_PUBLIC_THREAD',
  GUILD_PRIVATE_THREAD = 'GUILD_PRIVATE_THREAD',
  GUILD_STAGE_VOICE = 'GUILD_STAGE_VOICE'
}

export enum VideoQualityMode {
  AUTO = 'AUTO',
  FULL = 'FULL',
  _720P = '720P'
}

export enum ThreadAutoArchiveDuration {
  HOUR = 'HOUR',
  DAY = 'DAY',
  THREE_DAYS = 'THREE_DAYS',
  WEEK = 'WEEK'
}

export enum ChannelFlags {
  PINNED = 'PINNED',
  REQUIRE_TAG = 'REQUIRE_TAG'
}

export interface PermissionOverwrite {
  id: string;
  type: OverwriteType;
  allow: DiscordPermission[];
  deny: DiscordPermission[];
}

export enum OverwriteType {
  ROLE = 'role',
  MEMBER = 'member'
}

export interface DiscordMessage {
  id: string;
  channelId: string;
  guildId?: string;
  author: DiscordUser;
  member?: DiscordGuildMember;
  content: string;
  timestamp: Date;
  editedTimestamp?: Date;
  tts: boolean;
  mentionEveryone: boolean;
  mentions: DiscordUser[];
  mentionRoles: string[];
  mentionChannels: DiscordChannel[];
  attachments: DiscordAttachment[];
  embeds: DiscordEmbed[];
  reactions: DiscordReaction[];
  nonce?: string | number;
  pinned: boolean;
  webhookId?: string;
  type: MessageType;
  activity?: MessageActivity;
  application?: MessageApplication;
  messageReference?: MessageReference;
  flags?: MessageFlags;
  referencedMessage?: DiscordMessage;
  interaction?: DiscordInteraction;
  thread?: DiscordChannel;
  components?: MessageComponent[];
  stickers?: DiscordSticker[];
}

export interface DiscordAttachment {
  id: string;
  filename: string;
  description?: string;
  contentType?: string;
  size: number;
  url: string;
  proxyUrl: string;
  height?: number;
  width?: number;
  ephemeral?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  type?: EmbedType;
  description?: string;
  url?: string;
  timestamp?: Date;
  color?: number;
  footer?: EmbedFooter;
  image?: EmbedImage;
  thumbnail?: EmbedThumbnail;
  video?: EmbedVideo;
  provider?: EmbedProvider;
  author?: EmbedAuthor;
  fields?: EmbedField[];
}

export enum EmbedType {
  RICH = 'rich',
  IMAGE = 'image',
  VIDEO = 'video',
  GIFV = 'gifv',
  ARTICLE = 'article',
  LINK = 'link'
}

export interface EmbedFooter {
  text: string;
  iconUrl?: string;
  proxyIconUrl?: string;
}

export interface EmbedImage {
  url: string;
  proxyUrl?: string;
  height?: number;
  width?: number;
}

export interface EmbedThumbnail {
  url: string;
  proxyUrl?: string;
  height?: number;
  width?: number;
}

export interface EmbedVideo {
  url?: string;
  proxyUrl?: string;
  height?: number;
  width?: number;
}

export interface EmbedProvider {
  name?: string;
  url?: string;
}

export interface EmbedAuthor {
  name?: string;
  url?: string;
  iconUrl?: string;
  proxyIconUrl?: string;
}

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordReaction {
  emoji: DiscordEmoji;
  count: number;
  me: boolean;
}

export interface MessageActivity {
  type: ActivityType;
  partyId?: string;
}

export enum ActivityType {
  JOIN = 'JOIN',
  SPECTATE = 'SPECTATE',
  LISTEN = 'LISTEN',
  JOIN_REQUEST = 'JOIN_REQUEST'
}

export interface MessageApplication {
  id: string;
  coverImage?: string;
  description: string;
  icon?: string;
  name: string;
}

export interface MessageReference {
  messageId?: string;
  channelId?: string;
  guildId?: string;
  failIfNotExists?: boolean;
}

export interface MessageComponent {
  type: ComponentType;
  customId?: string;
  disabled?: boolean;
  style?: ButtonStyle;
  label?: string;
  emoji?: DiscordEmoji;
  url?: string;
  options?: SelectOption[];
  placeholder?: string;
  minValues?: number;
  maxValues?: number;
  components?: MessageComponent[];
}

export enum ButtonStyle {
  PRIMARY = 'PRIMARY',
  SECONDARY = 'SECONDARY',
  SUCCESS = 'SUCCESS',
  DANGER = 'DANGER',
  LINK = 'LINK'
}

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: DiscordEmoji;
  default?: boolean;
}

export interface DiscordSticker {
  id: string;
  packId: string;
  name: string;
  description: string;
  tags: string;
  format: StickerFormat;
  available?: boolean;
  sortValue?: number;
}

export enum StickerFormat {
  PNG = 'PNG',
  APNG = 'APNG',
  LOTTIE = 'LOTTIE',
  GIF = 'GIF'
}