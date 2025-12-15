import { BaseEventHandler } from './base';
import { DiscordEvent } from '../../types';
import { Logger } from '../../utils/logger';

export class MessageCreateEventHandler extends BaseEventHandler {
  constructor(logger: Logger) {
    super(logger);
  }

  async handle(event: DiscordEvent): Promise<void> {
    try {
      const message = event.data;
      
      // Ignore bot messages to prevent loops
      if (message.author?.bot) {
        this.logger.debug('Ignoring bot message');
        return;
      }

      // Emit message metrics
      this.emitMetrics('message_received', {
        timestamp: event.timestamp,
        messageId: message.id,
        authorId: message.author?.id,
        authorName: message.author?.username,
        guildId: message.guildId,
        channelId: message.channelId,
        content: message.content?.length || 0,
        hasEmbeds: message.embeds?.length > 0,
        hasAttachments: message.attachments?.length > 0,
      });

      this.logger.debug(`Message from ${message.author?.username}: ${message.content?.substring(0, 50)}${message.content?.length > 50 ? '...' : ''}`);
      
      // Message will be processed by the message processing pipeline
      // This handler just collects metrics and passes to processing
      
    } catch (error) {
      this.emitError(error as Error, {
        event: 'messageCreate',
        messageId: event.data?.id,
        authorId: event.data?.author?.id,
        guildId: event.guildId,
      });
    }
  }
}