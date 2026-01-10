/**
 * Community Building Features
 *
 * Module exports for community building and support features.
 * Provides community member management, event scheduling, moderation,
 * support system, knowledge base, and developer ecosystem management.
 */

// ============================================================================
// EXPORTS FROM MODELS
// ============================================================================

export {
  // Enums
  CommunityRole,
  CommunityStatus,
  EventType,
  TicketStatus,
  TicketPriority,
  SupportCategory,
  // Interfaces
  CommunityMember,
  CommunityMemberMetadata,
  NotificationPreferences,
  SocialLinks,
  CommunityEvent,
  EventAgendaItem,
  RecurringEventConfig,
  EventMetadata,
  CommunityGuideline,
  SupportTicket,
  TicketResponse,
  TicketMetadata,
  KnowledgeArticle,
  ArticleMetadata,
  FAQEntry,
  DeveloperProfile,
  DeveloperSkill,
  DeveloperProject,
  DeveloperRatingSummary,
  DeveloperStats,
  Contribution,
  ContributionType,
  ContributionStatus,
  ContributionMetadata,
  // Repository Types
  MemberSearchOptions,
  EventSearchOptions,
  TicketSearchOptions,
  ArticleSearchOptions,
  DeveloperSearchOptions,
  PaginationOptions,
  PaginationResult,
  // Database Schemas
  COMMUNITY_MEMBERS_TABLE_SCHEMA,
  COMMUNITY_EVENTS_TABLE_SCHEMA,
  COMMUNITY_GUIDELINES_TABLE_SCHEMA,
  SUPPORT_TICKETS_TABLE_SCHEMA,
  KNOWLEDGE_ARTICLES_TABLE_SCHEMA,
  FAQ_ENTRIES_TABLE_SCHEMA,
  DEVELOPER_PROFILES_TABLE_SCHEMA,
  CONTRIBUTIONS_TABLE_SCHEMA
} from './community-models';

// ============================================================================
// EXPORTS FROM REPOSITORY
// ============================================================================

export { CommunityRepository } from './community-repository';

// ============================================================================
// EXPORTS FROM MODERATION TOOLS
// ============================================================================

export {
  ModerationTools,
  // Types
  ModerationActionResult,
  ContentAnalysisResult,
  UserBehaviorMetrics,
  ModerationConfig
} from './moderation-tools';

// ============================================================================
// EXPORTS FROM SUPPORT SYSTEM
// ============================================================================

export {
  SupportSystem,
  // Types
  SupportSystemConfig,
  AutoResponseResult,
  TicketRoutingResult,
  ResponseTemplate,
  SupportStatistics,
  EscalationRule
} from './support-system';

// ============================================================================
// EXPORTS FROM KNOWLEDGE BASE
// ============================================================================

export {
  KnowledgeBase,
  // Types
  KnowledgeBaseConfig,
  SearchResult,
  ArticleVersion,
  ArticleCategory,
  KnowledgeBaseStatistics,
  CategorizationResult
} from './knowledge-base';

// ============================================================================
// EXPORTS FROM COMMUNITY MANAGER
// ============================================================================

export {
  CommunityManager,
  // Types
  CommunityManagerConfig,
  CommunityAnalytics,
  EventManagementResult,
  DeveloperEcosystemStats
} from './community-manager';
