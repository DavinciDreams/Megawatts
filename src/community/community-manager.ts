/**
 * Community Manager
 *
 * Main community orchestrator for community building features.
 * Provides community member management, event scheduling and management,
 * developer ecosystem management, and community analytics.
 */

import { CommunityRepository } from './community-repository';
import { ModerationTools } from './moderation-tools';
import { SupportSystem } from './support-system';
import { KnowledgeBase } from './knowledge-base';
import { Logger } from '../utils/logger';
import {
  CommunityMember,
  CommunityEvent,
  DeveloperProfile,
  Contribution,
  CommunityRole,
  CommunityStatus,
  EventType,
  MemberSearchOptions,
  EventSearchOptions,
  DeveloperSearchOptions,
  PaginationOptions,
  PaginationResult,
  EventAgendaItem,
  DeveloperProject
} from './community-models';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Community manager configuration
 */
export interface CommunityManagerConfig {
  enableAutoModeration: boolean;
  enableSupportSystem: boolean;
  enableKnowledgeBase: boolean;
  enableEventManagement: boolean;
  enableDeveloperEcosystem: boolean;
  maxEventAttendees: number;
  defaultEventDurationHours: number;
  enableAnalytics: boolean;
}

/**
 * Community analytics
 */
export interface CommunityAnalytics {
  totalMembers: number;
  activeMembers: number;
  newMembersThisWeek: number;
  totalEvents: number;
  upcomingEvents: number;
  pastEvents: number;
  totalDevelopers: number;
  activeDevelopers: number;
  totalContributions: number;
  contributionsThisMonth: number;
  averageReputation: number;
  topContributors: string[];
  memberRoles: Record<string, number>;
  memberStatuses: Record<string, number>;
  eventTypes: Record<string, number>;
  mostActiveMembers: string[];
  mostHelpfulMembers: string[];
  generatedAt: Date;
}

/**
 * Event management result
 */
export interface EventManagementResult {
  success: boolean;
  event?: CommunityEvent;
  message?: string;
  attendeesNotified?: string[];
}

/**
 * Developer ecosystem statistics
 */
export interface DeveloperEcosystemStats {
  totalDevelopers: number;
  verifiedDevelopers: number;
  hireableDevelopers: number;
  averageRating: number;
  totalContributions: number;
  totalProjects: number;
  topSkills: Array<{ skill: string; count: number }>;
  topLocations: Array<{ location: string; count: number }>;
  availabilityBreakdown: Record<string, number>;
}

// ============================================================================
// COMMUNITY MANAGER CLASS
// ============================================================================

/**
 * CommunityManager class for orchestrating community features
 */
export class CommunityManager {
  private repository: CommunityRepository;
  private moderationTools: ModerationTools;
  private supportSystem: SupportSystem;
  private knowledgeBase: KnowledgeBase;
  private logger: Logger;
  private config: CommunityManagerConfig;

  constructor(
    repository: CommunityRepository,
    moderationTools: ModerationTools,
    supportSystem: SupportSystem,
    knowledgeBase: KnowledgeBase,
    logger: Logger,
    config?: Partial<CommunityManagerConfig>
  ) {
    this.repository = repository;
    this.moderationTools = moderationTools;
    this.supportSystem = supportSystem;
    this.knowledgeBase = knowledgeBase;
    this.logger = logger;
    this.config = {
      enableAutoModeration: true,
      enableSupportSystem: true,
      enableKnowledgeBase: true,
      enableEventManagement: true,
      enableDeveloperEcosystem: true,
      maxEventAttendees: 100,
      defaultEventDurationHours: 1,
      enableAnalytics: true,
      ...config
    };

    this.logger.info('CommunityManager initialized', { config: this.config });
  }

  // ============================================================================
  // COMMUNITY MEMBER MANAGEMENT
  // ============================================================================

  /**
   * Register community member
   */
  async registerMember(
    userId: string,
    guildId: string,
    username: string,
    displayName: string,
    avatar?: string,
    email?: string,
    options?: {
      bio?: string;
      skills?: string[];
      interests?: string[];
      role?: CommunityRole;
    }
  ): Promise<CommunityMember> {
    try {
      const memberData: Omit<CommunityMember, 'id' | 'createdAt' | 'updatedAt'> = {
        userId,
        guildId,
        username,
        displayName,
        avatar,
        email,
        role: options?.role || CommunityRole.MEMBER,
        status: CommunityStatus.ACTIVE,
        bio: options?.bio,
        skills: options?.skills || [],
        interests: options?.interests || [],
        joinedAt: new Date(),
        lastActiveAt: new Date(),
        warningCount: 0,
        banCount: 0,
        contributionCount: 0,
        reputation: 0,
        metadata: {
          notificationPreferences: {
            email: true,
            dm: true,
            mentions: true,
            events: true,
            announcements: true,
            updates: true
          },
          socialLinks: {},
          badges: [],
          isVerified: false,
          isSponsor: false
        }
      };

      const member = await this.repository.create(memberData);

      this.logger.info('Community member registered', {
        userId,
        username,
        role: member.role
      });

      return member;
    } catch (error) {
      this.logger.error('Failed to register member:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update community member
   */
  async updateMember(
    userId: string,
    guildId: string,
    updates: Partial<CommunityMember>
  ): Promise<CommunityMember | null> {
    try {
      const member = await this.repository.findMember(userId, guildId);
      if (!member) {
        throw new Error(`Member ${userId} not found in guild ${guildId}`);
      }

      const updated = await this.repository.create({
        ...member,
        ...updates
      } as Omit<CommunityMember, 'id' | 'createdAt' | 'updatedAt'>);

      this.logger.info('Community member updated', {
        userId,
        updates: Object.keys(updates)
      });

      return updated;
    } catch (error) {
      this.logger.error('Failed to update member:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get community member
   */
  async getMember(userId: string, guildId: string): Promise<CommunityMember | null> {
    return await this.repository.findMember(userId, guildId);
  }

  /**
   * Search community members
   */
  async searchMembers(
    options: MemberSearchOptions & PaginationOptions = {}
  ): Promise<PaginationResult<CommunityMember>> {
    return await this.repository.searchMembers(options);
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    userId: string,
    guildId: string,
    role: CommunityRole
  ): Promise<void> {
    await this.repository.updateMemberRole(userId, guildId, role);
    this.logger.info('Member role updated', { userId, role });
  }

  /**
   * Update member status
   */
  async updateMemberStatus(
    userId: string,
    guildId: string,
    status: CommunityStatus
  ): Promise<void> {
    await this.repository.updateMemberStatus(userId, guildId, status);
    this.logger.info('Member status updated', { userId, status });
  }

  /**
   * Award reputation to member
   */
  async awardReputation(
    userId: string,
    guildId: string,
    amount: number,
    reason?: string
  ): Promise<void> {
    await this.repository.updateReputation(userId, guildId, amount);

    // Also increment contribution count if positive reputation
    if (amount > 0) {
      await this.repository.incrementContributionCount(userId, guildId);
    }

    this.logger.info('Reputation awarded', {
      userId,
      amount,
      reason
    });
  }

  /**
   * Get top members by reputation
   */
  async getTopMembersByReputation(
    guildId: string,
    limit: number = 10
  ): Promise<CommunityMember[]> {
    const result = await this.repository.searchMembers({
      guildId,
      minReputation: 0,
      pageSize: limit,
      sortBy: 'reputation',
      sortOrder: 'DESC'
    });

    return result.data;
  }

  /**
   * Get members by role
   */
  async getMembersByRole(
    guildId: string,
    role: CommunityRole
  ): Promise<CommunityMember[]> {
    const result = await this.repository.searchMembers({
      guildId,
      role,
      pageSize: 100
    });

    return result.data;
  }

  // ============================================================================
  // EVENT SCHEDULING AND MANAGEMENT
  // ============================================================================

  /**
   * Create community event
   */
  async createEvent(
    title: string,
    description: string,
    type: EventType,
    startTime: Date,
    organizerId: string,
    organizerName: string,
    options?: {
      endTime?: Date;
      location?: string;
      platform?: string;
      maxAttendees?: number;
      image?: string;
      tags?: string[];
      requirements?: string[];
      agenda?: EventAgendaItem[];
      recurring?: {
        frequency: 'daily' | 'weekly' | 'monthly';
        interval: number;
        endDate?: Date;
        daysOfWeek?: number[];
      };
    }
  ): Promise<EventManagementResult> {
    try {
      if (!this.config.enableEventManagement) {
        return {
          success: false,
          message: 'Event management is disabled'
        };
      }

      const maxAttendees = options?.maxAttendees || this.config.maxEventAttendees;

      const eventData: Omit<CommunityEvent, 'id' | 'createdAt' | 'updatedAt'> = {
        title,
        description,
        type,
        status: 'draft',
        startTime,
        endTime: options?.endTime || new Date(startTime.getTime() + this.config.defaultEventDurationHours * 60 * 60 * 1000),
        location: options?.location,
        platform: options?.platform,
        maxAttendees,
        currentAttendees: 0,
        organizerId,
        organizerName,
        image: options?.image,
        tags: options?.tags || [],
        requirements: options?.requirements,
        agenda: options?.agenda || [],
        attendees: [],
        waitlist: [],
        recurring: options?.recurring,
        metadata: {
          feedbackEnabled: true,
          feedbackCollected: 0
        }
      };

      const event = await this.repository.createEvent(eventData);

      this.logger.info('Community event created', {
        eventId: event.id,
        title,
        type,
        organizerId
      });

      return {
        success: true,
        event
      };
    } catch (error) {
      this.logger.error('Failed to create event:', error instanceof Error ? error : new Error(String(error)));
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create event'
      };
    }
  }

  /**
   * Update event
   */
  async updateEvent(
    eventId: string,
    updates: Partial<CommunityEvent>
  ): Promise<EventManagementResult> {
    try {
      const existingEvent = await this.repository.getEvent(eventId);
      if (!existingEvent) {
        throw new Error(`Event ${eventId} not found`);
      }

      const updated = await this.repository.createEvent({
        ...existingEvent,
        ...updates
      } as Omit<CommunityEvent, 'id' | 'createdAt' | 'updatedAt'>);

      this.logger.info('Event updated', {
        eventId,
        updates: Object.keys(updates)
      });

      return {
        success: true,
        event: updated
      };
    } catch (error) {
      this.logger.error('Failed to update event:', error instanceof Error ? error : new Error(String(error)));
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update event'
      };
    }
  }

  /**
   * Get event by ID
   */
  async getEvent(eventId: string): Promise<CommunityEvent | null> {
    return await this.repository.getEvent(eventId);
  }

  /**
   * Search community events
   */
  async searchEvents(
    options: EventSearchOptions & PaginationOptions = {}
  ): Promise<PaginationResult<CommunityEvent>> {
    return await this.repository.searchEvents(options);
  }

  /**
   * Register for event
   */
  async registerForEvent(
    eventId: string,
    userId: string
  ): Promise<EventManagementResult> {
    try {
      const event = await this.repository.getEvent(eventId);
      if (!event) {
        return {
          success: false,
          message: 'Event not found'
        };
      }

      if (event.currentAttendees >= (event.maxAttendees || this.config.maxEventAttendees)) {
        // Add to waitlist
        await this.repository.createEvent({
          ...event,
          waitlist: [...event.waitlist, userId]
        } as Omit<CommunityEvent, 'id' | 'createdAt' | 'updatedAt'>);

        this.logger.info('User added to event waitlist', {
          eventId,
          userId
        });

        return {
          success: true,
          message: 'Event is full, added to waitlist'
        };
      }

      // Add as attendee
      await this.repository.addEventAttendee(eventId, userId);

      // Update event attendee count
      await this.repository.createEvent({
        ...event,
        currentAttendees: event.currentAttendees + 1
      } as Omit<CommunityEvent, 'id' | 'createdAt' | 'updatedAt'>);

      this.logger.info('User registered for event', {
        eventId,
        userId
      });

      return {
        success: true,
        event
      };
    } catch (error) {
      this.logger.error('Failed to register for event:', error instanceof Error ? error : new Error(String(error)));
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to register for event'
      };
    }
  }

  /**
   * Unregister from event
   */
  async unregisterFromEvent(
    eventId: string,
    userId: string
  ): Promise<EventManagementResult> {
    try {
      const event = await this.repository.getEvent(eventId);
      if (!event) {
        return {
          success: false,
          message: 'Event not found'
        };
      }

      // Remove from attendees or waitlist
      const updatedEvent = await this.repository.createEvent({
        ...event,
        attendees: event.attendees.filter(id => id !== userId),
        waitlist: event.waitlist.filter(id => id !== userId),
        currentAttendees: Math.max(0, event.currentAttendees - 1)
      } as Omit<CommunityEvent, 'id' | 'createdAt' | 'updatedAt'>);

      this.logger.info('User unregistered from event', {
        eventId,
        userId
      });

      return {
        success: true,
        event: updatedEvent
      };
    } catch (error) {
      this.logger.error('Failed to unregister from event:', error instanceof Error ? error : new Error(String(error)));
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to unregister from event'
      };
    }
  }

  /**
   * Update event status
   */
  async updateEventStatus(
    eventId: string,
    status: 'draft' | 'scheduled' | 'ongoing' | 'completed' | 'cancelled'
  ): Promise<void> {
    await this.repository.updateEventStatus(eventId, status);
    this.logger.info('Event status updated', { eventId, status });
  }

  /**
   * Delete event
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    return await this.repository.deleteEvent(eventId);
  }

  /**
   * Get upcoming events
   */
  async getUpcomingEvents(guildId?: string, limit: number = 10): Promise<CommunityEvent[]> {
    const result = await this.repository.searchEvents({
      status: 'scheduled' as any,
      sortBy: 'startTime',
      sortOrder: 'ASC',
      pageSize: limit
    });

    return result.data;
  }

  // ============================================================================
  // DEVELOPER ECOSYSTEM MANAGEMENT
  // ============================================================================

  /**
   * Create developer profile
   */
  async createDeveloperProfile(
    userId: string,
    username: string,
    displayName: string,
    options?: {
      bio?: string;
      skills?: Array<{ name: string; category: string; proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert'; yearsExperience?: number; verified?: boolean }>;
      projects?: Array<DeveloperProject>;
      socialLinks?: { github?: string; twitter?: string; linkedin?: string; website?: string; discord?: string };
      availability?: 'available' | 'busy' | 'unavailable';
      hourlyRate?: number;
      location?: string;
      timezone?: string;
      languages?: string[];
      isVerified?: boolean;
      isHireable?: boolean;
    }
  ): Promise<DeveloperProfile> {
    try {
      if (!this.config.enableDeveloperEcosystem) {
        throw new Error('Developer ecosystem is disabled');
      }

      const profileData: Omit<DeveloperProfile, 'id' | 'createdAt' | 'updatedAt'> = {
        userId,
        username,
        displayName,
        avatar: undefined,
        bio: options?.bio,
        skills: options?.skills || [],
        projects: (options?.projects || []) as DeveloperProject[],
        socialLinks: options?.socialLinks || {},
        availability: options?.availability || 'available',
        hourlyRate: options?.hourlyRate,
        location: options?.location,
        timezone: options?.timezone,
        languages: options?.languages || [],
        ratingSummary: {
          average: 0,
          count: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        },
        stats: {
          contributions: 0,
          pullRequests: 0,
          issuesResolved: 0,
          projectsCompleted: 0,
          hoursContributed: 0,
          lastActiveAt: new Date()
        },
        isVerified: options?.isVerified || false,
        isHireable: options?.isHireable || false
      };

      const profile = await this.repository.createDeveloperProfile(profileData);

      this.logger.info('Developer profile created', {
        userId,
        username,
        isVerified: profile.isVerified
      });

      return profile;
    } catch (error) {
      this.logger.error('Failed to create developer profile:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get developer profile
   */
  async getDeveloperProfile(userId: string): Promise<DeveloperProfile | null> {
    return await this.repository.getDeveloperProfile(userId);
  }

  /**
   * Update developer profile
   */
  async updateDeveloperProfile(
    userId: string,
    updates: Partial<DeveloperProfile>
  ): Promise<DeveloperProfile | null> {
    try {
      const updated = await this.repository.updateDeveloperProfile(userId, updates);

      this.logger.info('Developer profile updated', {
        userId,
        updates: Object.keys(updates)
      });

      return updated;
    } catch (error) {
      this.logger.error('Failed to update developer profile:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Search developer profiles
   */
  async searchDeveloperProfiles(
    options: DeveloperSearchOptions & PaginationOptions = {}
  ): Promise<PaginationResult<DeveloperProfile>> {
    return await this.repository.searchDeveloperProfiles(options);
  }

  /**
   * Track contribution
   */
  async trackContribution(
    contributorId: string,
    contributorName: string,
    contributorAvatar: string | undefined,
    type: 'code' | 'documentation' | 'bug_fix' | 'feature' | 'translation' | 'design' | 'testing' | 'review',
    title: string,
    description: string,
    options?: {
      repository?: string;
      pullRequestUrl?: string;
      issueUrl?: string;
      labels?: string[];
    }
  ): Promise<Contribution> {
    try {
      const contributionData: Omit<Contribution, 'id' | 'createdAt' | 'updatedAt'> = {
        contributorId,
        contributorName,
        contributorAvatar,
        type,
        title,
        description,
        repository: options?.repository,
        pullRequestUrl: options?.pullRequestUrl,
        issueUrl: options?.issueUrl,
        status: 'open',
        reviewStatus: 'pending',
        reviewers: [],
        labels: options?.labels || [],
        metadata: {}
      };

      const contribution = await this.repository.createContribution(contributionData);

      // Increment contribution count for member
      await this.repository.incrementContributionCount(contributorId, 'default-guild'); // Using default guild for now

      this.logger.info('Contribution tracked', {
        contributionId: contribution.id,
        contributorId,
        type
      });

      return contribution;
    } catch (error) {
      this.logger.error('Failed to track contribution:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get contributions by contributor
   */
  async getContributionsByContributor(
    contributorId: string,
    options?: {
      status?: 'open' | 'in_progress' | 'merged' | 'closed';
      type?: string;
      limit?: number;
    }
  ): Promise<Contribution[]> {
    const queryOptions: any = { guildId: 'default-guild' };
    if (options?.status) {
      queryOptions.where = `status = '${options.status}'`;
    }
    if (options?.type) {
      queryOptions.where = queryOptions.where ? `${queryOptions.where} AND type = '${options.type}'` : `type = '${options.type}'`;
    }
    if (options?.limit) {
      queryOptions.limit = options.limit;
    }

    return await this.repository.getContributionsByContributor(contributorId, queryOptions);
  }

  /**
   * Update contribution status
   */
  async updateContributionStatus(
    contributionId: string,
    status: 'open' | 'in_progress' | 'merged' | 'closed'
  ): Promise<void> {
    await this.repository.updateContributionStatus(contributionId, status);
    this.logger.info('Contribution status updated', { contributionId, status });
  }

  /**
   * Get developer ecosystem statistics
   */
  async getDeveloperEcosystemStats(): Promise<DeveloperEcosystemStats> {
    try {
      const allProfiles = await this.repository.searchDeveloperProfiles({
        pageSize: 1000
      });

      const verifiedCount = allProfiles.data.filter(p => p.isVerified).length;
      const hireableCount = allProfiles.data.filter(p => p.isHireable).length;
      const totalContributions = allProfiles.data.reduce((sum, p) => sum + p.stats.contributions, 0);
      const totalProjects = allProfiles.data.reduce((sum, p) => sum + p.projects.length, 0);

      // Calculate top skills
      const skillCounts: Record<string, number> = {};
      for (const profile of allProfiles.data) {
        for (const skill of profile.skills) {
          const skillName = skill.name;
          skillCounts[skillName] = (skillCounts[skillName] || 0) + 1;
        }
      }

      const topSkills = Object.entries(skillCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([skill, count]) => ({ skill, count }));

      // Calculate top locations
      const locationCounts: Record<string, number> = {};
      for (const profile of allProfiles.data) {
        if (profile.location) {
          locationCounts[profile.location] = (locationCounts[profile.location] || 0) + 1;
        }
      }

      const topLocations = Object.entries(locationCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([location, count]) => ({ location, count }));

      // Calculate availability breakdown
      const availabilityBreakdown: Record<string, number> = {
        available: 0,
        busy: 0,
        unavailable: 0
      };

      for (const profile of allProfiles.data) {
        availabilityBreakdown[profile.availability]++;
      }

      // Calculate average rating
      const profilesWithRatings = allProfiles.data.filter(p => p.ratingSummary.count > 0);
      const averageRating = profilesWithRatings.length > 0
        ? profilesWithRatings.reduce((sum, p) => sum + p.ratingSummary.average, 0) / profilesWithRatings.length
        : 0;

      return {
        totalDevelopers: allProfiles.total,
        verifiedDevelopers: verifiedCount,
        hireableDevelopers: hireableCount,
        averageRating,
        totalContributions,
        totalProjects,
        topSkills,
        topLocations,
        availabilityBreakdown
      };
    } catch (error) {
      this.logger.error('Failed to get developer ecosystem stats:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // ============================================================================
  // COMMUNITY ANALYTICS
  // ============================================================================

  /**
   * Get community analytics
   */
  async getCommunityAnalytics(guildId?: string): Promise<CommunityAnalytics> {
    try {
      if (!this.config.enableAnalytics) {
        throw new Error('Analytics is disabled');
      }

      // Get member statistics
      const allMembers = await this.repository.searchMembers({
        guildId,
        pageSize: 10000
      });

      const activeMembers = allMembers.data.filter(m => m.status === CommunityStatus.ACTIVE);
      const newMembersThisWeek = allMembers.data.filter(m => {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return new Date(m.joinedAt) > weekAgo;
      });

      // Get event statistics
      const allEvents = await this.repository.searchEvents({
        pageSize: 10000
      });

      const now = new Date();
      const upcomingEvents = allEvents.data.filter(e => new Date(e.startTime) > now);
      const pastEvents = allEvents.data.filter(e => new Date(e.startTime) <= now);

      // Get developer statistics
      const allDevelopers = await this.repository.searchDeveloperProfiles({
        pageSize: 10000
      });

      const activeDevelopers = allDevelopers.data.filter(d => d.availability === 'available');

      // Get contributions
      const allContributions = await this.repository.getContributionsByContributor('all', {
        limit: 10000
      });

      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const contributionsThisMonth = allContributions.filter(c => new Date(c.createdAt) > monthAgo).length;

      // Calculate average reputation
      const totalReputation = allMembers.data.reduce((sum, m) => sum + m.reputation, 0);
      const averageReputation = allMembers.data.length > 0 ? totalReputation / allMembers.data.length : 0;

      // Get top contributors (by contribution count)
      const topContributors = allMembers.data
        .sort((a, b) => b.contributionCount - a.contributionCount)
        .slice(0, 10)
        .map(m => m.userId);

      // Get member roles breakdown
      const memberRoles: Record<string, number> = {};
      for (const member of allMembers.data) {
        memberRoles[member.role] = (memberRoles[member.role] || 0) + 1;
      }

      // Get member statuses breakdown
      const memberStatuses: Record<string, number> = {};
      for (const member of allMembers.data) {
        memberStatuses[member.status] = (memberStatuses[member.status] || 0) + 1;
      }

      // Get event types breakdown
      const eventTypes: Record<string, number> = {};
      for (const event of allEvents.data) {
        eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
      }

      // Get most active members (by last active time)
      const mostActiveMembers = allMembers.data
        .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
        .slice(0, 10)
        .map(m => m.userId);

      // Get most helpful members (by reputation)
      const mostHelpfulMembers = allMembers.data
        .sort((a, b) => b.reputation - a.reputation)
        .slice(0, 10)
        .map(m => m.userId);

      return {
        totalMembers: allMembers.total,
        activeMembers: activeMembers.length,
        newMembersThisWeek: newMembersThisWeek.length,
        totalEvents: allEvents.total,
        upcomingEvents: upcomingEvents.length,
        pastEvents: pastEvents.length,
        totalDevelopers: allDevelopers.total,
        activeDevelopers: activeDevelopers.length,
        totalContributions: allContributions.length,
        contributionsThisMonth,
        averageReputation,
        topContributors,
        memberRoles,
        memberStatuses,
        eventTypes,
        mostActiveMembers,
        mostHelpfulMembers,
        generatedAt: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to get community analytics:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get member activity summary
   */
  async getMemberActivitySummary(userId: string, guildId: string, days: number = 30): Promise<{
    messageCount: number;
    contributionCount: number;
    reputationChange: number;
    eventsAttended: number;
    eventsCreated: number;
  }> {
    try {
      const member = await this.repository.findMember(userId, guildId);
      if (!member) {
        throw new Error(`Member ${userId} not found`);
      }

      // Get contributions
      const contributions = await this.repository.getContributionsByContributor(userId, {
        limit: 100
      });

      // Get events attended (would need event attendee tracking)
      const eventsAttended = 0; // Placeholder - would need actual tracking

      // Get events created (would need organizer tracking)
      const eventsCreated = 0; // Placeholder - would need actual tracking

      return {
        messageCount: 0, // Would need message tracking
        contributionCount: contributions.length,
        reputationChange: member.reputation,
        eventsAttended,
        eventsCreated
      };
    } catch (error) {
      this.logger.error('Failed to get member activity summary:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update community manager configuration
   */
  updateConfig(config: Partial<CommunityManagerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Community manager config updated', { config: this.config });
  }

  /**
   * Get community manager configuration
   */
  getConfig(): CommunityManagerConfig {
    return { ...this.config };
  }

  // ============================================================================
  // SUBSYSTEM ACCESS
  // ============================================================================

  /**
   * Get moderation tools instance
   */
  getModerationTools(): ModerationTools {
    return this.moderationTools;
  }

  /**
   * Get support system instance
   */
  getSupportSystem(): SupportSystem {
    return this.supportSystem;
  }

  /**
   * Get knowledge base instance
   */
  getKnowledgeBase(): KnowledgeBase {
    return this.knowledgeBase;
  }

  /**
   * Get repository instance
   */
  getRepository(): CommunityRepository {
    return this.repository;
  }
}
