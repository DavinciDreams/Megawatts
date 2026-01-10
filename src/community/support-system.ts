/**
 * Support System
 *
 * AI-powered support system for community management.
 * Provides automated support, ticket management, knowledge base integration,
 * ticket routing and escalation, and response templates.
 */

import { CommunityRepository } from './community-repository';
import { ConversationalAIProviderRouter } from '../ai/providers/conversationalAIProviderRouter';
import { Logger } from '../utils/logger';
import {
  SupportTicket,
  KnowledgeArticle,
  FAQEntry,
  TicketStatus,
  TicketPriority,
  SupportCategory,
  TicketResponse
} from './community-models';
import { ConversationalAIRequest, ConversationalAIResponse } from '../types/conversational';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Support system configuration
 */
export interface SupportSystemConfig {
  enableAutoResponse: boolean;
  enableKnowledgeBase: boolean;
  enableTicketRouting: boolean;
  autoResponseThreshold: number;
  escalationThresholdHours: number;
  maxAutoResponses: number;
  defaultPriority: TicketPriority;
  aiModel: string;
  responseTemplates: ResponseTemplate[];
}

/**
 * Response template
 */
export interface ResponseTemplate {
  id: string;
  name: string;
  category: SupportCategory;
  priority?: TicketPriority;
  subject?: string;
  content: string;
  variables?: string[];
  isActive: boolean;
}

/**
 * Auto-response result
 */
export interface AutoResponseResult {
  shouldAutoRespond: boolean;
  response?: string;
  confidence: number;
  suggestedArticles?: KnowledgeArticle[];
  suggestedFaqs?: FAQEntry[];
  suggestedPriority?: TicketPriority;
  suggestedCategory?: SupportCategory;
  shouldEscalate: boolean;
}

/**
 * Ticket routing result
 */
export interface TicketRoutingResult {
  assignedTo?: string;
  assignedToName?: string;
  reason: string;
  confidence: number;
}

/**
 * Support statistics
 */
export interface SupportStatistics {
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  escalatedTickets: number;
  averageResolutionTime: number;
  autoResponsesSent: number;
  knowledgeBaseHits: number;
  satisfactionScore: number;
  ticketsByCategory: Record<string, number>;
  ticketsByPriority: Record<string, number>;
}

/**
 * Escalation rule
 */
export interface EscalationRule {
  id: string;
  name: string;
  condition: string;
  action: 'escalate' | 'notify' | 'assign';
  target?: string;
  priority?: TicketPriority;
  isActive: boolean;
}

// ============================================================================
// SUPPORT SYSTEM CLASS
// ============================================================================

/**
 * SupportSystem class for AI-powered community support
 */
export class SupportSystem {
  private repository: CommunityRepository;
  private aiRouter: ConversationalAIProviderRouter;
  private logger: Logger;
  private config: SupportSystemConfig;
  private responseTemplates: Map<string, ResponseTemplate> = new Map();
  private escalationRules: EscalationRule[] = [];
  private statistics: SupportStatistics;

  constructor(
    repository: CommunityRepository,
    aiRouter: ConversationalAIProviderRouter,
    logger: Logger,
    config?: Partial<SupportSystemConfig>
  ) {
    this.repository = repository;
    this.aiRouter = aiRouter;
    this.logger = logger;
    this.config = {
      enableAutoResponse: true,
      enableKnowledgeBase: true,
      enableTicketRouting: true,
      autoResponseThreshold: 0.8,
      escalationThresholdHours: 48,
      maxAutoResponses: 2,
      defaultPriority: 'medium' as any,
      aiModel: 'gpt-4-turbo',
      responseTemplates: this.getDefaultResponseTemplates(),
      ...config
    };

    this.statistics = {
      totalTickets: 0,
      openTickets: 0,
      resolvedTickets: 0,
      closedTickets: 0,
      escalatedTickets: 0,
      averageResolutionTime: 0,
      autoResponsesSent: 0,
      knowledgeBaseHits: 0,
      satisfactionScore: 0,
      ticketsByCategory: {},
      ticketsByPriority: {}
    };

    // Initialize response templates
    this.initializeResponseTemplates();

    this.logger.info('SupportSystem initialized', { config: this.config });
  }

  // ============================================================================
  // TICKET CREATION AND MANAGEMENT
  // ============================================================================

  /**
   * Create support ticket with AI analysis
   */
  async createTicket(
    userId: string,
    userName: string,
    userAvatar: string | undefined,
    guildId: string | undefined,
    category: SupportCategory,
    priority: TicketPriority,
    subject: string,
    description: string,
    attachments?: string[],
    metadata?: Record<string, any>
  ): Promise<SupportTicket> {
    try {
      // Analyze ticket for auto-response
      const analysis = await this.analyzeTicketForAutoResponse(
        category,
        priority,
        subject,
        description
      );

      // Determine if auto-response should be sent
      const shouldAutoRespond = this.config.enableAutoResponse &&
        analysis.confidence >= this.config.autoResponseThreshold &&
        !analysis.shouldEscalate;

      // Create ticket
      const ticketData: Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt' | 'ticketNumber'> = {
        userId,
        userName,
        userAvatar,
        guildId,
        category: analysis.suggestedCategory || category,
        priority: analysis.suggestedPriority || priority,
        status: 'open',
        subject,
        description,
        attachments,
        responses: [],
        tags: this.extractTags(subject, description),
        metadata: {
          source: 'discord',
          ...metadata,
          aiSuggestedResponse: shouldAutoRespond ? analysis.response : undefined,
          aiConfidence: shouldAutoRespond ? analysis.confidence : undefined
        }
      };

      const ticket = await this.repository.createTicket(ticketData);

      // Update statistics
      this.statistics.totalTickets++;
      this.statistics.openTickets++;
      this.statistics.ticketsByCategory[ticket.category] = 
        (this.statistics.ticketsByCategory[ticket.category] || 0) + 1;
      this.statistics.ticketsByPriority[ticket.priority] = 
        (this.statistics.ticketsByPriority[ticket.priority] || 0) + 1;

      // Send auto-response if appropriate
      if (shouldAutoRespond && analysis.response) {
        await this.sendAutoResponse(ticket.id, analysis.response, 'system');
        this.statistics.autoResponsesSent++;
      }

      // Route ticket if enabled
      if (this.config.enableTicketRouting) {
        const routing = await this.routeTicket(ticket);
        if (routing.assignedTo) {
          await this.repository.assignTicket(
            ticket.id,
            routing.assignedTo,
            routing.assignedToName!
          );
        }
      }

      this.logger.info('Support ticket created', {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        userId,
        category: ticket.category,
        priority: ticket.priority,
        autoResponded: shouldAutoRespond
      });

      return ticket;
    } catch (error) {
      this.logger.error('Failed to create support ticket:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get ticket by ID
   */
  async getTicket(ticketId: string): Promise<SupportTicket | null> {
    return await this.repository.getTicket(ticketId);
  }

  /**
   * Get ticket by ticket number
   */
  async getTicketByNumber(ticketNumber: string): Promise<SupportTicket | null> {
    return await this.repository.getTicketByNumber(ticketNumber);
  }

  /**
   * Update ticket status
   */
  async updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
    const ticket = await this.repository.getTicket(ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    await this.repository.updateTicketStatus(ticketId, status);

    // Update statistics
    if (ticket.status === 'open' && status !== 'open') {
      this.statistics.openTickets--;
    }

    if (status === 'resolved') {
      this.statistics.resolvedTickets++;
    } else if (status === 'closed') {
      this.statistics.closedTickets++;
    }

    this.logger.info('Ticket status updated', {
      ticketId,
      status
    });
  }

  /**
   * Add response to ticket
   */
  async addTicketResponse(
    ticketId: string,
    userId: string,
    userName: string,
    content: string,
    isStaff: boolean,
    attachments?: string[],
    internal: boolean = false
  ): Promise<void> {
    const response: Omit<TicketResponse, 'id' | 'createdAt'> = {
      userId,
      userName,
      isStaff,
      content,
      attachments,
      internal
    };

    await this.repository.addTicketResponse(ticketId, response);

    // Update ticket status if staff response
    if (isStaff && !internal) {
      await this.repository.updateTicketStatus(ticketId, 'in_progress');
    }

    this.logger.info('Ticket response added', {
      ticketId,
      userId,
      isStaff
    });
  }

  /**
   * Resolve ticket
   */
  async resolveTicket(ticketId: string, resolution: string): Promise<void> {
    const ticket = await this.repository.getTicket(ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    const resolutionTime = Date.now() - new Date(ticket.createdAt).getTime();
    const resolutionTimeHours = resolutionTime / (1000 * 60 * 60);

    await this.repository.resolveTicket(ticketId, resolution, resolutionTime);

    // Update statistics
    const currentAvg = this.statistics.averageResolutionTime;
    const resolvedCount = this.statistics.resolvedTickets;
    this.statistics.averageResolutionTime = 
      ((currentAvg * (resolvedCount - 1)) + resolutionTimeHours) / resolvedCount;

    this.logger.info('Ticket resolved', {
      ticketId,
      resolutionTime: resolutionTimeHours
    });
  }

  /**
   * Assign ticket to staff member
   */
  async assignTicket(ticketId: string, assignedTo: string, assignedToName: string): Promise<void> {
    await this.repository.assignTicket(ticketId, assignedTo, assignedToName);
    this.logger.info('Ticket assigned', {
      ticketId,
      assignedTo,
      assignedToName
    });
  }

  // ============================================================================
  // AI-POWERED AUTOMATED SUPPORT
  // ============================================================================

  /**
   * Analyze ticket for auto-response
   */
  async analyzeTicketForAutoResponse(
    category: SupportCategory,
    priority: TicketPriority,
    subject: string,
    description: string
  ): Promise<AutoResponseResult> {
    try {
      // Check for matching response template
      const template = this.findResponseTemplate(category, subject, description);
      if (template) {
        return {
          shouldAutoRespond: true,
          response: this.applyTemplateVariables(template, { subject, description }),
          confidence: 0.95,
          suggestedCategory: category,
          suggestedPriority: priority,
          shouldEscalate: false
        };
      }

      // Search knowledge base for relevant articles
      const articles = await this.searchKnowledgeBase(subject, description);
      if (articles.length > 0 && this.config.enableKnowledgeBase) {
        this.statistics.knowledgeBaseHits++;

        const topArticle = articles[0];
        return {
          shouldAutoRespond: true,
          response: this.generateKnowledgeBaseResponse(topArticle),
          confidence: 0.85,
          suggestedArticles: articles.slice(0, 3),
          suggestedCategory: category,
          suggestedPriority: priority,
          shouldEscalate: false
        };
      }

      // Search FAQs
      const faqs = await this.searchFAQs(subject, description);
      if (faqs.length > 0) {
        return {
          shouldAutoRespond: true,
          response: this.generateFAQResponse(faqs[0]),
          confidence: 0.8,
          suggestedFaqs: faqs.slice(0, 3),
          suggestedCategory: category,
          suggestedPriority: priority,
          shouldEscalate: false
        };
      }

      // Use AI to generate response
      if (this.config.enableAutoResponse) {
        const aiResponse = await this.generateAIResponse(category, subject, description);
        if (aiResponse && aiResponse.confidence >= this.config.autoResponseThreshold) {
          return {
            shouldAutoRespond: true,
            response: aiResponse.content,
            confidence: aiResponse.confidence,
            suggestedCategory: aiResponse.suggestedCategory,
            suggestedPriority: aiResponse.suggestedPriority,
            shouldEscalate: aiResponse.shouldEscalate
          };
        }
      }

      // No auto-response available
      return {
        shouldAutoRespond: false,
        confidence: 0,
        suggestedCategory: category,
        suggestedPriority: priority,
        shouldEscalate: priority === 'critical' || priority === 'urgent'
      };
    } catch (error) {
      this.logger.error('Failed to analyze ticket for auto-response:', error instanceof Error ? error : new Error(String(error)));
      return {
        shouldAutoRespond: false,
        confidence: 0,
        suggestedCategory: category,
        suggestedPriority: priority,
        shouldEscalate: false
      };
    }
  }

  /**
   * Generate AI response for ticket
   */
  private async generateAIResponse(
    category: SupportCategory,
    subject: string,
    description: string
  ): Promise<{ content: string; confidence: number; suggestedCategory?: SupportCategory; suggestedPriority?: TicketPriority; shouldEscalate: boolean } | null> {
    try {
      const prompt = this.buildAIPrompt(category, subject, description);
      
      const aiRequest: ConversationalAIRequest = {
        message: prompt,
        context: {
          userId: 'support-system',
          conversationId: `support_${Date.now()}`,
          messageHistory: []
        },
        config: {
          maxTokens: 500,
          temperature: 0.7,
          tone: 'friendly',
          contextWindow: 4000,
          features: {
            toolCalling: false
          }
        },
        systemPrompt: `You are a helpful support assistant for a Discord bot community. 
Provide clear, concise, and accurate responses to user support requests.
Always be friendly and professional. If you're unsure, suggest escalating to a human.`
      };

      const response = await this.aiRouter.routeRequest(aiRequest);

      // Parse AI response
      const content = response.content;
      const confidence = response.metadata?.confidence || 0.7;

      // Determine if escalation is needed
      const shouldEscalate = content.toLowerCase().includes('escalate') ||
        content.toLowerCase().includes('human') ||
        category === 'api' ||
        category === 'billing';

      // Extract suggested category and priority from response
      const suggestedCategory = this.extractSuggestedCategory(content, category);
      const suggestedPriority = this.extractSuggestedPriority(content);

      return {
        content,
        confidence,
        suggestedCategory,
        suggestedPriority,
        shouldEscalate
      };
    } catch (error) {
      this.logger.error('Failed to generate AI response:', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Build AI prompt for ticket analysis
   */
  private buildAIPrompt(category: SupportCategory, subject: string, description: string): string {
    return `Support Ticket Analysis:

Category: ${category}
Subject: ${subject}
Description: ${description}

Please provide a helpful response to this support request. Consider:
1. The specific issue described
2. Common solutions for this type of problem
3. Clear next steps for the user
4. Whether this requires human intervention (if unsure, say so)

Keep your response concise and actionable.`;
  }

  /**
   * Extract suggested category from AI response
   */
  private extractSuggestedCategory(content: string, defaultCategory: SupportCategory): SupportCategory | undefined {
    const categoryMatch = content.match(/(?:category|type):\s*(\w+)/i);
    if (categoryMatch) {
      const category = categoryMatch[1].toLowerCase();
      if (Object.values(SupportCategory).includes(category as SupportCategory)) {
        return category as SupportCategory;
      }
    }
    return undefined;
  }

  /**
   * Extract suggested priority from AI response
   */
  private extractSuggestedPriority(content: string): TicketPriority | undefined {
    const priorityMatch = content.match(/(?:priority|urgency):\s*(\w+)/i);
    if (priorityMatch) {
      const priority = priorityMatch[1].toLowerCase();
      if (Object.values(TicketPriority).includes(priority as TicketPriority)) {
        return priority as TicketPriority;
      }
    }
    return undefined;
  }

  /**
   * Send auto-response to ticket
   */
  private async sendAutoResponse(ticketId: string, response: string, sender: string): Promise<void> {
    await this.repository.addTicketResponse(ticketId, {
      userId: sender,
      userName: 'Auto-Response',
      isStaff: true,
      content: response
    });
  }

  // ============================================================================
  // KNOWLEDGE BASE INTEGRATION
  // ============================================================================

  /**
   * Search knowledge base for relevant articles
   */
  async searchKnowledgeBase(query: string, description?: string): Promise<KnowledgeArticle[]> {
    try {
      const searchQuery = description ? `${query} ${description}` : query;
      const result = await this.repository.searchArticles({
        query: searchQuery,
        status: 'published',
        page: 1,
        pageSize: 5
      });

      return result.data;
    } catch (error) {
      this.logger.error('Failed to search knowledge base:', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Get knowledge article by slug
   */
  async getKnowledgeArticle(slug: string): Promise<KnowledgeArticle | null> {
    return await this.repository.getArticleBySlug(slug);
  }

  /**
   * Generate response from knowledge base article
   */
  private generateKnowledgeBaseResponse(article: KnowledgeArticle): string {
    return `Based on our knowledge base, here's some information that might help:

**${article.title}**

${article.summary}

For more details, please see: [${article.slug}](/kb/${article.slug})

If this doesn't solve your issue, please let us know and we'll be happy to assist further.`;
  }

  /**
   * Search FAQs for relevant entries
   */
  async searchFAQs(query: string, description?: string): Promise<FAQEntry[]> {
    try {
      const searchQuery = description ? `${query} ${description}` : query;
      const faqs = await this.repository.getActiveFAQs();

      // Simple relevance scoring
      const scored = faqs.map(faq => {
        const questionLower = faq.question.toLowerCase();
        const queryLower = searchQuery.toLowerCase();
        const score = this.calculateRelevanceScore(questionLower, queryLower);
        return { faq, score };
      }).filter(item => item.score > 0);

      // Sort by score and return top results
      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(item => item.faq);
    } catch (error) {
      this.logger.error('Failed to search FAQs:', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevanceScore(text: string, query: string): number {
    const queryWords = query.split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return 0;

    let matches = 0;
    for (const word of queryWords) {
      if (text.includes(word)) {
        matches++;
      }
    }

    return matches / queryWords.length;
  }

  /**
   * Generate response from FAQ
   */
  private generateFAQResponse(faq: FAQEntry): string {
    return `Here's a quick answer to your question:

**Q: ${faq.question}**

**A:** ${faq.answer}

${faq.helpfulCount > 0 ? `This answer has been helpful to ${faq.helpfulCount} users.` : ''}

If you need more information or this doesn't fully address your issue, please let us know!`;
  }

  // ============================================================================
  // TICKET ROUTING AND ESCALATION
  // ============================================================================

  /**
   * Route ticket to appropriate staff member
   */
  async routeTicket(ticket: SupportTicket): Promise<TicketRoutingResult> {
    try {
      // Check escalation rules
      for (const rule of this.escalationRules) {
        if (!rule.isActive) continue;

        if (this.matchesRule(ticket, rule)) {
          if (rule.action === 'assign' && rule.target) {
            return {
              assignedTo: rule.target,
              assignedToName: rule.target,
              reason: `Matched escalation rule: ${rule.name}`,
              confidence: 0.9
            };
          } else if (rule.action === 'escalate') {
            await this.escalateTicket(ticket.id, rule.name);
            return {
              reason: `Escalated due to rule: ${rule.name}`,
              confidence: 0.9
            };
          }
        }
      }

      // Default routing based on category and priority
      const assignedTo = this.getDefaultAssignee(ticket);
      if (assignedTo) {
        return {
          assignedTo: assignedTo.id,
          assignedToName: assignedTo.name,
          reason: `Default routing for ${ticket.category} / ${ticket.priority}`,
          confidence: 0.7
        };
      }

      return {
        reason: 'No suitable assignee found',
        confidence: 0
      };
    } catch (error) {
      this.logger.error('Failed to route ticket:', error instanceof Error ? error : new Error(String(error)));
      return {
        reason: 'Routing error',
        confidence: 0
      };
    }
  }

  /**
   * Check if ticket matches escalation rule
   */
  private matchesRule(ticket: SupportTicket, rule: EscalationRule): boolean {
    const condition = rule.condition.toLowerCase();
    
    // Check category
    if (condition.includes('category:') && !condition.includes(ticket.category)) {
      return false;
    }

    // Check priority
    if (condition.includes('priority:') && !condition.includes(ticket.priority)) {
      return false;
    }

    // Check for specific keywords
    if (condition.includes('contains:')) {
      const keyword = condition.split('contains:')[1].trim().toLowerCase();
      const content = `${ticket.subject} ${ticket.description}`.toLowerCase();
      if (!content.includes(keyword)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get default assignee for ticket
   */
  private getDefaultAssignee(ticket: SupportTicket): { id: string; name: string } | null {
    // This would typically integrate with a staff management system
    // For now, return null to indicate no automatic assignment
    return null;
  }

  /**
   * Escalate ticket
   */
  async escalateTicket(ticketId: string, reason: string): Promise<void> {
    const ticket = await this.repository.getTicket(ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    await this.repository.updateTicketStatus(ticketId, 'escalated');

    // Add escalation response
    await this.repository.addTicketResponse(ticketId, {
      userId: 'system',
      userName: 'Escalation System',
      isStaff: true,
      content: `This ticket has been escalated. Reason: ${reason}`,
      internal: true
    });

    this.statistics.escalatedTickets++;

    this.logger.info('Ticket escalated', {
      ticketId,
      reason
    });
  }

  /**
   * Check for tickets needing escalation
   */
  async checkEscalationEligibility(): Promise<string[]> {
    const result = await this.repository.searchTickets({
      status: 'open' as any,
      page: 1,
      pageSize: 100
    });

    const escalated: string[] = [];
    const thresholdMs = this.config.escalationThresholdHours * 60 * 60 * 1000;
    const now = Date.now();

    for (const ticket of result.data) {
      const ticketAge = now - new Date(ticket.createdAt).getTime();
      if (ticketAge > thresholdMs) {
        escalated.push(ticket.id);
      }
    }

    return escalated;
  }

  // ============================================================================
  // RESPONSE TEMPLATES
  // ============================================================================

  /**
   * Find response template
   */
  private findResponseTemplate(
    category: SupportCategory,
    subject: string,
    description: string
  ): ResponseTemplate | null {
    for (const template of this.config.responseTemplates) {
      if (!template.isActive) continue;
      if (template.category !== category) continue;

      // Check for keyword matches
      const content = `${subject} ${description}`.toLowerCase();
      const keywords = this.extractKeywords(template.content);
      const hasKeywordMatch = keywords.some(kw => content.includes(kw.toLowerCase()));

      if (hasKeywordMatch) {
        return template;
      }
    }

    return null;
  }

  /**
   * Apply template variables
   */
  private applyTemplateVariables(
    template: ResponseTemplate,
    variables: Record<string, string>
  ): string {
    let content = template.content;

    if (template.variables) {
      for (const variable of template.variables) {
        const placeholder = `{{${variable}}}`;
        if (content.includes(placeholder)) {
          content = content.replace(new RegExp(placeholder, 'g'), variables[variable] || '');
        }
      }
    }

    return content;
  }

  /**
   * Extract keywords from template
   */
  private extractKeywords(content: string): string[] {
    const matches = content.match(/{{(\w+)}}/g);
    return matches ? matches.map(m => m.replace(/[{}]/g, '')) : [];
  }

  /**
   * Get default response templates
   */
  private getDefaultResponseTemplates(): ResponseTemplate[] {
    return [
      {
        id: 'template_welcome',
        name: 'Welcome',
        category: 'general',
        content: 'Welcome to our community! We\'re glad to have you here. If you have any questions or need assistance, feel free to create a support ticket.',
        isActive: true
      },
      {
        id: 'template_bot_commands',
        name: 'Bot Commands',
        category: 'technical',
        content: 'Here are the available bot commands:\n- `/help` - Show all commands\n- `/config` - Configure bot settings\n- `/support` - Create a support ticket\n\nFor more details, check our documentation.',
        isActive: true
      },
      {
        id: 'template_account_issues',
        name: 'Account Issues',
        category: 'account',
        content: 'I understand you\'re having account issues. Please verify:\n1. You\'re using the correct Discord account\n2. Your permissions are properly configured\n3. You\'ve tried logging out and back in\n\nIf the issue persists, please provide more details about what\'s happening.',
        isActive: true
      },
      {
        id: 'template_feature_request',
        name: 'Feature Request',
        category: 'feature_request',
        content: 'Thank you for your feature request! We\'ve logged it and our team will review it. We appreciate your feedback and suggestions for improving the community.',
        isActive: true
      }
    ];
  }

  /**
   * Initialize response templates
   */
  private initializeResponseTemplates(): void {
    for (const template of this.config.responseTemplates) {
      this.responseTemplates.set(template.id, template);
    }
  }

  /**
   * Add response template
   */
  addResponseTemplate(template: ResponseTemplate): void {
    this.responseTemplates.set(template.id, template);
    this.config.responseTemplates.push(template);
  }

  /**
   * Update response template
   */
  updateResponseTemplate(templateId: string, updates: Partial<ResponseTemplate>): boolean {
    const template = this.responseTemplates.get(templateId);
    if (!template) return false;

    const updated = { ...template, ...updates };
    this.responseTemplates.set(templateId, updated);

    const index = this.config.responseTemplates.findIndex(t => t.id === templateId);
    if (index !== -1) {
      this.config.responseTemplates[index] = updated;
    }

    return true;
  }

  /**
   * Delete response template
   */
  deleteResponseTemplate(templateId: string): boolean {
    const deleted = this.responseTemplates.delete(templateId);
    if (deleted) {
      this.config.responseTemplates = this.config.responseTemplates.filter(t => t.id !== templateId);
    }
    return deleted;
  }

  // ============================================================================
  // ESCALATION RULES
  // ============================================================================

  /**
   * Add escalation rule
   */
  addEscalationRule(rule: EscalationRule): void {
    this.escalationRules.push(rule);
  }

  /**
   * Update escalation rule
   */
  updateEscalationRule(ruleId: string, updates: Partial<EscalationRule>): boolean {
    const index = this.escalationRules.findIndex(r => r.id === ruleId);
    if (index === -1) return false;

    this.escalationRules[index] = { ...this.escalationRules[index], ...updates };
    return true;
  }

  /**
   * Delete escalation rule
   */
  deleteEscalationRule(ruleId: string): boolean {
    const index = this.escalationRules.findIndex(r => r.id === ruleId);
    if (index === -1) return false;

    this.escalationRules.splice(index, 1);
    return true;
  }

  /**
   * Get escalation rules
   */
  getEscalationRules(): EscalationRule[] {
    return [...this.escalationRules];
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update support system configuration
   */
  updateConfig(config: Partial<SupportSystemConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Support system config updated', { config: this.config });
  }

  /**
   * Get support system configuration
   */
  getConfig(): SupportSystemConfig {
    return { ...this.config };
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get support statistics
   */
  getStatistics(): SupportStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.statistics = {
      totalTickets: 0,
      openTickets: 0,
      resolvedTickets: 0,
      closedTickets: 0,
      escalatedTickets: 0,
      averageResolutionTime: 0,
      autoResponsesSent: 0,
      knowledgeBaseHits: 0,
      satisfactionScore: 0,
      ticketsByCategory: {},
      ticketsByPriority: {}
    };
    this.logger.info('Support statistics reset');
  }

  /**
   * Extract tags from ticket content
   */
  private extractTags(subject: string, description: string): string[] {
    const content = `${subject} ${description}`.toLowerCase();
    const tags: string[] = [];

    // Common technical tags
    const techKeywords = ['api', 'bug', 'error', 'crash', 'feature', 'request', 'help', 'issue'];
    for (const keyword of techKeywords) {
      if (content.includes(keyword)) {
        tags.push(keyword);
      }
    }

    return [...new Set(tags)];
  }
}
