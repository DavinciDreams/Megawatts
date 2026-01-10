/**
 * Community Models
 *
 * Database models and TypeScript interfaces for the community building system.
 * Defines the data structures for community members, events, guidelines, support tickets,
 * knowledge articles, FAQs, developer profiles, and contributions.
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Community member roles
 */
export enum CommunityRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  DEVELOPER = 'developer',
  CONTRIBUTOR = 'contributor',
  MEMBER = 'member',
  GUEST = 'guest'
}

/**
 * Community member status
 */
export enum CommunityStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  BANNED = 'banned',
  PENDING = 'pending'
}

/**
 * Event types for community events
 */
export enum EventType {
  MEETUP = 'meetup',
  WEBINAR = 'webinar',
  HACKATHON = 'hackathon',
  WORKSHOP = 'workshop',
  AMA = 'ama',
  RELEASE = 'release',
  ANNOUNCEMENT = 'announcement',
  SOCIAL = 'social'
}

/**
 * Support ticket status
 */
export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  WAITING = 'waiting',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  ESCALATED = 'escalated'
}

/**
 * Support ticket priority levels
 */
export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
  CRITICAL = 'critical'
}

/**
 * Support categories for ticket classification
 */
export enum SupportCategory {
  GENERAL = 'general',
  TECHNICAL = 'technical',
  BUG_REPORT = 'bug_report',
  FEATURE_REQUEST = 'feature_request',
  ACCOUNT = 'account',
  BILLING = 'billing',
  INTEGRATION = 'integration',
  API = 'api',
  DOCUMENTATION = 'documentation',
  OTHER = 'other'
}

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Community member entity
 */
export interface CommunityMember {
  id: string;
  userId: string;
  guildId: string;
  username: string;
  displayName: string;
  avatar?: string;
  email?: string;
  role: CommunityRole;
  status: CommunityStatus;
  bio?: string;
  skills: string[];
  interests: string[];
  joinedAt: Date;
  lastActiveAt: Date;
  warningCount: number;
  banCount: number;
  contributionCount: number;
  reputation: number;
  metadata: CommunityMemberMetadata;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Community member metadata
 */
export interface CommunityMemberMetadata {
  timezone?: string;
  language?: string;
  notificationPreferences: NotificationPreferences;
  socialLinks?: SocialLinks;
  badges: string[];
  isVerified: boolean;
  isSponsor: boolean;
}

/**
 * Notification preferences
 */
export interface NotificationPreferences {
  email: boolean;
  dm: boolean;
  mentions: boolean;
  events: boolean;
  announcements: boolean;
  updates: boolean;
}

/**
 * Social links for community members
 */
export interface SocialLinks {
  github?: string;
  twitter?: string;
  linkedin?: string;
  website?: string;
  discord?: string;
}

/**
 * Community event entity
 */
export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  type: EventType;
  status: 'draft' | 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  location?: string;
  platform?: string;
  maxAttendees?: number;
  currentAttendees: number;
  organizerId: string;
  organizerName: string;
  image?: string;
  tags: string[];
  requirements?: string[];
  agenda?: EventAgendaItem[];
  attendees: string[];
  waitlist: string[];
  recurring?: RecurringEventConfig;
  metadata: EventMetadata;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Event agenda item
 */
export interface EventAgendaItem {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  duration: number;
  speaker?: string;
}

/**
 * Recurring event configuration
 */
export interface RecurringEventConfig {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
  endDate?: Date;
  daysOfWeek?: number[];
}

/**
 * Event metadata
 */
export interface EventMetadata {
  recordingUrl?: string;
  slidesUrl?: string;
  materialsUrl?: string;
  feedbackEnabled: boolean;
  feedbackCollected: number;
  rating?: number;
}

/**
 * Community guideline entity
 */
export interface CommunityGuideline {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
  content: string;
  examples?: string[];
  consequences?: string[];
  version: number;
  effectiveFrom: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Support ticket entity
 */
export interface SupportTicket {
  id: string;
  ticketNumber: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  guildId?: string;
  category: SupportCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  description: string;
  attachments?: string[];
  assignedTo?: string;
  assignedToName?: string;
  responses: TicketResponse[];
  resolution?: string;
  resolutionTime?: number;
  satisfaction?: number;
  tags: string[];
  metadata: TicketMetadata;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  closedAt?: Date;
}

/**
 * Ticket response
 */
export interface TicketResponse {
  id: string;
  userId: string;
  userName: string;
  isStaff: boolean;
  content: string;
  attachments?: string[];
  internal?: boolean;
  createdAt: Date;
}

/**
 * Ticket metadata
 */
export interface TicketMetadata {
  source: 'discord' | 'email' | 'web' | 'api';
  userAgent?: string;
  ipAddress?: string;
  relatedTicketId?: string;
  escalatedFrom?: string;
  aiSuggestedResponse?: string;
  aiConfidence?: number;
}

/**
 * Knowledge article entity
 */
export interface KnowledgeArticle {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  category: string;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  authorId: string;
  authorName: string;
  reviewerId?: string;
  reviewerName?: string;
  version: number;
  relatedArticles: string[];
  attachments?: string[];
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  lastReviewedAt?: Date;
  metadata: ArticleMetadata;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

/**
 * Article metadata
 */
export interface ArticleMetadata {
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  readingTime: number;
  language?: string;
  featured: boolean;
  verified: boolean;
  lastVersionNotes?: string;
}

/**
 * FAQ entry entity
 */
export interface FAQEntry {
  id: string;
  question: string;
  answer: string;
  category: string;
  order: number;
  isActive: boolean;
  viewCount: number;
  helpfulCount: number;
  tags: string[];
  relatedArticles?: string[];
  relatedFaqs?: string[];
  language?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Developer profile entity
 */
export interface DeveloperProfile {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  skills: DeveloperSkill[];
  projects: DeveloperProject[];
  socialLinks: SocialLinks;
  availability: 'available' | 'busy' | 'unavailable';
  hourlyRate?: number;
  location?: string;
  timezone?: string;
  languages: string[];
  ratingSummary: DeveloperRatingSummary;
  stats: DeveloperStats;
  isVerified: boolean;
  isHireable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Developer skill
 */
export interface DeveloperSkill {
  name: string;
  category: string;
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  yearsExperience?: number;
  verified?: boolean;
}

/**
 * Developer project
 */
export interface DeveloperProject {
  id: string;
  name: string;
  description: string;
  repository?: string;
  liveUrl?: string;
  technologies: string[];
  status: 'active' | 'completed' | 'archived';
  startDate?: Date;
  endDate?: Date;
  featured?: boolean;
}

/**
 * Developer rating summary
 */
export interface DeveloperRatingSummary {
  average: number;
  count: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

/**
 * Developer stats
 */
export interface DeveloperStats {
  contributions: number;
  pullRequests: number;
  issuesResolved: number;
  projectsCompleted: number;
  hoursContributed: number;
  lastActiveAt: Date;
}

/**
 * Contribution entity
 */
export interface Contribution {
  id: string;
  contributorId: string;
  contributorName: string;
  contributorAvatar?: string;
  type: ContributionType;
  title: string;
  description: string;
  repository?: string;
  pullRequestUrl?: string;
  issueUrl?: string;
  status: ContributionStatus;
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  reviewers: string[];
  labels: string[];
  metadata: ContributionMetadata;
  createdAt: Date;
  updatedAt: Date;
  mergedAt?: Date;
}

/**
 * Contribution types
 */
export type ContributionType =
  | 'code'
  | 'documentation'
  | 'bug_fix'
  | 'feature'
  | 'translation'
  | 'design'
  | 'testing'
  | 'review';

/**
 * Contribution status
 */
export type ContributionStatus = 'open' | 'in_progress' | 'merged' | 'closed';

/**
 * Contribution metadata
 */
export interface ContributionMetadata {
  linesAdded?: number;
  linesRemoved?: number;
  filesChanged?: number;
  complexity?: 'low' | 'medium' | 'high';
  estimatedHours?: number;
  actualHours?: number;
}

// ============================================================================
// REPOSITORY TYPES
// ============================================================================

/**
 * Community member search options
 */
export interface MemberSearchOptions {
  query?: string;
  role?: CommunityRole;
  status?: CommunityStatus;
  skills?: string[];
  interests?: string[];
  guildId?: string;
  minReputation?: number;
  isVerified?: boolean;
}

/**
 * Community event search options
 */
export interface EventSearchOptions {
  query?: string;
  type?: EventType;
  status?: string;
  category?: string;
  organizerId?: string;
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
}

/**
 * Support ticket search options
 */
export interface TicketSearchOptions {
  query?: string;
  userId?: string;
  category?: SupportCategory;
  priority?: TicketPriority;
  status?: TicketStatus;
  assignedTo?: string;
  guildId?: string;
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
}

/**
 * Knowledge article search options
 */
export interface ArticleSearchOptions {
  query?: string;
  category?: string;
  tags?: string[];
  status?: string;
  authorId?: string;
  difficulty?: string;
  language?: string;
  featured?: boolean;
}

/**
 * Developer profile search options
 */
export interface DeveloperSearchOptions {
  query?: string;
  skills?: string[];
  availability?: string;
  location?: string;
  timezone?: string;
  languages?: string[];
  minRating?: number;
  isVerified?: boolean;
  isHireable?: boolean;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * Pagination result
 */
export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// ============================================================================
// DATABASE SCHEMA
// ============================================================================

/**
 * Community members table schema
 */
export const COMMUNITY_MEMBERS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(20) NOT NULL,
  guild_id VARCHAR(20) NOT NULL,
  username VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar VARCHAR(255),
  email VARCHAR(255),
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'developer', 'contributor', 'member', 'guest')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'banned', 'pending')),
  bio TEXT,
  skills TEXT[] DEFAULT '{}',
  interests TEXT[] DEFAULT '{}',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  warning_count INTEGER DEFAULT 0,
  ban_count INTEGER DEFAULT 0,
  contribution_count INTEGER DEFAULT 0,
  reputation INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{"notificationPreferences": {"email": true, "dm": true, "mentions": true, "events": true, "announcements": true, "updates": true}, "badges": [], "isVerified": false, "isSponsor": false}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, guild_id)
);

CREATE INDEX IF NOT EXISTS idx_community_members_user_id ON community_members(user_id);
CREATE INDEX IF NOT EXISTS idx_community_members_guild_id ON community_members(guild_id);
CREATE INDEX IF NOT EXISTS idx_community_members_role ON community_members(role);
CREATE INDEX IF NOT EXISTS idx_community_members_status ON community_members(status);
CREATE INDEX IF NOT EXISTS idx_community_members_reputation ON community_members(reputation DESC);
CREATE INDEX IF NOT EXISTS idx_community_members_skills ON community_members USING GIN(skills);
CREATE INDEX IF NOT EXISTS idx_community_members_interests ON community_members USING GIN(interests);
CREATE INDEX IF NOT EXISTS idx_community_members_last_active_at ON community_members(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_members_metadata_verified ON community_members((metadata->>'isVerified'));
`;

/**
 * Community events table schema
 */
export const COMMUNITY_EVENTS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS community_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('meetup', 'webinar', 'hackathon', 'workshop', 'ama', 'release', 'announcement', 'social')),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'ongoing', 'completed', 'cancelled')),
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  location VARCHAR(255),
  platform VARCHAR(100),
  max_attendees INTEGER,
  current_attendees INTEGER DEFAULT 0,
  organizer_id VARCHAR(20) NOT NULL,
  organizer_name VARCHAR(100) NOT NULL,
  image VARCHAR(255),
  tags TEXT[] DEFAULT '{}',
  requirements TEXT[] DEFAULT '{}',
  agenda JSONB DEFAULT '[]',
  attendees TEXT[] DEFAULT '{}',
  waitlist TEXT[] DEFAULT '{}',
  recurring JSONB,
  metadata JSONB DEFAULT '{"feedbackEnabled": true, "feedbackCollected": 0}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_events_type ON community_events(type);
CREATE INDEX IF NOT EXISTS idx_community_events_status ON community_events(status);
CREATE INDEX IF NOT EXISTS idx_community_events_start_time ON community_events(start_time);
CREATE INDEX IF NOT EXISTS idx_community_events_organizer_id ON community_events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_community_events_tags ON community_events USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_community_events_attendees ON community_events USING GIN(attendees);
`;

/**
 * Community guidelines table schema
 */
export const COMMUNITY_GUIDELINES_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS community_guidelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  priority INTEGER DEFAULT 0,
  severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_active BOOLEAN DEFAULT TRUE,
  content TEXT NOT NULL,
  examples TEXT[] DEFAULT '{}',
  consequences TEXT[] DEFAULT '{}',
  version INTEGER DEFAULT 1,
  effective_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_guidelines_category ON community_guidelines(category);
CREATE INDEX IF NOT EXISTS idx_community_guidelines_is_active ON community_guidelines(is_active);
CREATE INDEX IF NOT EXISTS idx_community_guidelines_priority ON community_guidelines(priority);
CREATE INDEX IF NOT EXISTS idx_community_guidelines_severity ON community_guidelines(severity);
`;

/**
 * Support tickets table schema
 */
export const SUPPORT_TICKETS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number VARCHAR(20) UNIQUE NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  user_name VARCHAR(100) NOT NULL,
  user_avatar VARCHAR(255),
  guild_id VARCHAR(20),
  category VARCHAR(20) NOT NULL CHECK (category IN ('general', 'technical', 'bug_report', 'feature_request', 'account', 'billing', 'integration', 'api', 'documentation', 'other')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent', 'critical')),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed', 'escalated')),
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  attachments TEXT[] DEFAULT '{}',
  assigned_to VARCHAR(20),
  assigned_to_name VARCHAR(100),
  responses JSONB DEFAULT '[]',
  resolution TEXT,
  resolution_time INTEGER,
  satisfaction INTEGER CHECK (satisfaction >= 1 AND satisfaction <= 5),
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{"source": "discord"}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_number ON support_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_guild_id ON support_tickets(guild_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_tags ON support_tickets USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);
`;

/**
 * Knowledge articles table schema
 */
export const KNOWLEDGE_ARTICLES_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  tags TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  author_id VARCHAR(20) NOT NULL,
  author_name VARCHAR(100) NOT NULL,
  reviewer_id VARCHAR(20),
  reviewer_name VARCHAR(100),
  version INTEGER DEFAULT 1,
  related_articles TEXT[] DEFAULT '{}',
  attachments TEXT[] DEFAULT '{}',
  view_count INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  last_reviewed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{"difficulty": "intermediate", "readingTime": 5, "featured": false, "verified": false}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_slug ON knowledge_articles(slug);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_category ON knowledge_articles(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_status ON knowledge_articles(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_author_id ON knowledge_articles(author_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_tags ON knowledge_articles USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_view_count ON knowledge_articles(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_metadata_featured ON knowledge_articles((metadata->>'featured'));
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_metadata_difficulty ON knowledge_articles((metadata->>'difficulty'));
`;

/**
 * FAQ entries table schema
 */
export const FAQ_ENTRIES_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS faq_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question VARCHAR(500) NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  "order" INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  view_count INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  related_articles TEXT[] DEFAULT '{}',
  related_faqs TEXT[] DEFAULT '{}',
  language VARCHAR(10) DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faq_entries_category ON faq_entries(category);
CREATE INDEX IF NOT EXISTS idx_faq_entries_is_active ON faq_entries(is_active);
CREATE INDEX IF NOT EXISTS idx_faq_entries_order ON faq_entries("order");
CREATE INDEX IF NOT EXISTS idx_faq_entries_tags ON faq_entries USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_faq_entries_language ON faq_entries(language);
`;

/**
 * Developer profiles table schema
 */
export const DEVELOPER_PROFILES_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS developer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(20) UNIQUE NOT NULL,
  username VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar VARCHAR(255),
  bio TEXT,
  skills JSONB DEFAULT '[]',
  projects JSONB DEFAULT '[]',
  social_links JSONB DEFAULT '{}',
  availability VARCHAR(20) DEFAULT 'available' CHECK (availability IN ('available', 'busy', 'unavailable')),
  hourly_rate NUMERIC(10, 2),
  location VARCHAR(100),
  timezone VARCHAR(50),
  languages TEXT[] DEFAULT '{}',
  rating_summary JSONB DEFAULT '{"average": 0, "count": 0, "distribution": {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}}',
  stats JSONB DEFAULT '{"contributions": 0, "pullRequests": 0, "issuesResolved": 0, "projectsCompleted": 0, "hoursContributed": 0}',
  is_verified BOOLEAN DEFAULT FALSE,
  is_hireable BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_developer_profiles_user_id ON developer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_username ON developer_profiles(username);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_availability ON developer_profiles(availability);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_location ON developer_profiles(location);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_timezone ON developer_profiles(timezone);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_languages ON developer_profiles USING GIN(languages);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_rating_summary ON developer_profiles((rating_summary->>'average') DESC);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_is_verified ON developer_profiles(is_verified);
CREATE INDEX IF NOT EXISTS idx_developer_profiles_is_hireable ON developer_profiles(is_hireable);
`;

/**
 * Contributions table schema
 */
export const CONTRIBUTIONS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id VARCHAR(20) NOT NULL,
  contributor_name VARCHAR(100) NOT NULL,
  contributor_avatar VARCHAR(255),
  type VARCHAR(20) NOT NULL CHECK (type IN ('code', 'documentation', 'bug_fix', 'feature', 'translation', 'design', 'testing', 'review')),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  repository VARCHAR(255),
  pull_request_url VARCHAR(255),
  issue_url VARCHAR(255),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'merged', 'closed')),
  review_status VARCHAR(20) DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'changes_requested')),
  reviewers TEXT[] DEFAULT '{}',
  labels TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  merged_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_contributions_contributor_id ON contributions(contributor_id);
CREATE INDEX IF NOT EXISTS idx_contributions_type ON contributions(type);
CREATE INDEX IF NOT EXISTS idx_contributions_status ON contributions(status);
CREATE INDEX IF NOT EXISTS idx_contributions_review_status ON contributions(review_status);
CREATE INDEX IF NOT EXISTS idx_contributions_repository ON contributions(repository);
CREATE INDEX IF NOT EXISTS idx_contributions_labels ON contributions USING GIN(labels);
CREATE INDEX IF NOT EXISTS idx_contributions_created_at ON contributions(created_at DESC);
`;
