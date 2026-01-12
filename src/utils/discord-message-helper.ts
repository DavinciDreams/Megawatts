/**
 * Discord Message Helper Utility
 *
 * This module provides utilities for handling Discord message length limits.
 * Discord has a 2000 character limit per message.
 */

import { Message, TextChannel } from 'discord.js';
import { Logger } from './logger';

// Discord's maximum message length
const DISCORD_MAX_MESSAGE_LENGTH = 2000;

// Safety margin to avoid hitting the exact limit
const MESSAGE_LENGTH_SAFETY_MARGIN = 50;

// Maximum usable length per message
const MAX_USABLE_LENGTH = DISCORD_MAX_MESSAGE_LENGTH - MESSAGE_LENGTH_SAFETY_MARGIN;

/**
 * Options for handling long messages
 */
export interface LongMessageOptions {
  /**
   * Strategy for handling long messages
   * - 'split': Split into multiple messages
   * - 'truncate': Truncate with indicator
   * - 'embed': Use embeds (not implemented yet)
   */
  strategy?: 'split' | 'truncate';

  /**
   * Whether to add continuation markers like "(1/2)", "(2/2)"
   */
  addContinuationMarkers?: boolean;

  /**
   * Maximum number of messages to send when splitting
   */
  maxMessages?: number;

  /**
   * Custom logger instance
   */
  logger?: Logger;
}

/**
 * Result of sending a long message
 */
export interface LongMessageResult {
  /**
   * Number of messages sent
   */
  messageCount: number;

  /**
   * IDs of sent messages
   */
  messageIds: string[];

  /**
   * Whether the message was truncated
   */
  wasTruncated: boolean;
}

/**
 * Default options for long message handling
 */
const DEFAULT_OPTIONS: Required<LongMessageOptions> = {
  strategy: 'split',
  addContinuationMarkers: true,
  maxMessages: 10,
  logger: new Logger('DiscordMessageHelper'),
};

/**
 * Split a long message into chunks that fit within Discord's character limit
 *
 * @param content - The message content to split
 * @param options - Options for handling the split
 * @returns Array of message chunks
 */
export function splitMessage(
  content: string,
  options: LongMessageOptions = {}
): string[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // If content fits within limit, return as-is
  if (content.length <= MAX_USABLE_LENGTH) {
    return [content];
  }

  const chunks: string[] = [];
  let remainingContent = content;
  let chunkIndex = 0;

  while (remainingContent.length > 0 && chunkIndex < opts.maxMessages) {
    // Calculate available length for this chunk
    let availableLength = MAX_USABLE_LENGTH;

    // Reserve space for continuation marker if enabled
    if (opts.addContinuationMarkers && chunkIndex > 0) {
      const marker = ` (${chunkIndex + 1}/${opts.maxMessages})`;
      availableLength -= marker.length;
    }

    // Take chunk from the beginning
    let chunk = remainingContent.substring(0, availableLength);

    // Try to find a natural break point
    chunk = findNaturalBreakPoint(chunk, availableLength);

    // Add continuation marker if enabled
    if (opts.addContinuationMarkers && chunkIndex > 0) {
      const marker = ` (${chunkIndex + 1}/${opts.maxMessages})`;
      chunk = marker + chunk;
    }

    chunks.push(chunk);

    // Remove the chunk from remaining content
    remainingContent = remainingContent.substring(chunk.length - (opts.addContinuationMarkers && chunkIndex > 0 ? ` (${chunkIndex}/${opts.maxMessages})`.length : 0));

    chunkIndex++;
  }

  // If there's still content left and we hit maxMessages, truncate the last chunk
  if (remainingContent.length > 0 && chunks.length > 0) {
    const lastChunk = chunks[chunks.length - 1];
    const truncationIndicator = '...\n\n*(Message truncated due to length limit)*';

    // Reserve space for truncation indicator
    const maxLastChunkLength = MAX_USABLE_LENGTH - truncationIndicator.length;
    if (lastChunk.length > maxLastChunkLength) {
      chunks[chunks.length - 1] = lastChunk.substring(0, maxLastChunkLength) + truncationIndicator;
    } else {
      chunks[chunks.length - 1] = lastChunk + truncationIndicator;
    }

    opts.logger?.warn(
      `Message truncated after ${opts.maxMessages} chunks. ${remainingContent.length} characters remaining.`
    );
  }

  return chunks;
}

/**
 * Find a natural break point in the text to avoid cutting in the middle of words
 *
 * @param text - The text to find a break point in
 * @param maxLength - Maximum length of the chunk
 * @returns Text with a natural break point
 */
function findNaturalBreakPoint(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Look for newlines first (best break point)
  const lastNewline = text.lastIndexOf('\n', maxLength);
  if (lastNewline > maxLength * 0.7) {
    // Only use newline if it's in the last 30% of the available space
    return text.substring(0, lastNewline);
  }

  // Look for sentence endings (period, exclamation, question mark)
  const sentenceEndings = ['! ', '. ', '? ', '\n', '!.\n', '.\n', '?\n'];
  for (const ending of sentenceEndings) {
    const lastOccurrence = text.lastIndexOf(ending, maxLength);
    if (lastOccurrence > maxLength * 0.7) {
      return text.substring(0, lastOccurrence + ending.length);
    }
  }

  // Look for spaces (word boundaries)
  const lastSpace = text.lastIndexOf(' ', maxLength);
  if (lastSpace > maxLength * 0.8) {
    // Only use space if it's in the last 20% of the available space
    return text.substring(0, lastSpace);
  }

  // No natural break point found, hard cut
  return text.substring(0, maxLength);
}

/**
 * Truncate a message to fit within Discord's character limit
 *
 * @param content - The message content to truncate
 * @param options - Options for truncation
 * @returns Truncated message content
 */
export function truncateMessage(
  content: string,
  options: LongMessageOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (content.length <= MAX_USABLE_LENGTH) {
    return content;
  }

  const truncationIndicator = '...\n\n*(Message truncated due to length limit)*';
  const maxContentLength = MAX_USABLE_LENGTH - truncationIndicator.length;

  // Find a natural break point
  const truncated = findNaturalBreakPoint(content, maxContentLength);

  opts.logger?.warn(
    `Message truncated from ${content.length} to ${truncated.length + truncationIndicator.length} characters.`
  );

  return truncated + truncationIndicator;
}

/**
 * Send a message to a Discord channel, handling length limits automatically
 *
 * @param channel - The Discord channel to send to
 * @param content - The message content to send
 * @param options - Options for handling long messages
 * @returns Result of sending the message(s)
 */
export async function sendLongMessage(
  channel: TextChannel,
  content: string,
  options: LongMessageOptions = {}
): Promise<LongMessageResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (content.length <= MAX_USABLE_LENGTH) {
    // Message fits, send directly
    const message = await channel.send(content);
    return {
      messageCount: 1,
      messageIds: [message.id],
      wasTruncated: false,
    };
  }

  // Handle long message based on strategy
  if (opts.strategy === 'truncate') {
    const truncated = truncateMessage(content, opts);
    const message = await channel.send(truncated);
    return {
      messageCount: 1,
      messageIds: [message.id],
      wasTruncated: true,
    };
  }

  // Split into multiple messages
  const chunks = splitMessage(content, opts);
  const messageIds: string[] = [];

  for (const chunk of chunks) {
    const message = await channel.send(chunk);
    messageIds.push(message.id);
  }

  opts.logger?.info(
    `Sent ${messageIds.length} message(s) for content of ${content.length} characters.`
  );

  return {
    messageCount: messageIds.length,
    messageIds,
    wasTruncated: chunks.length * MAX_USABLE_LENGTH < content.length,
  };
}

/**
 * Send a reply to a Discord message, handling length limits automatically
 *
 * @param message - The Discord message to reply to
 * @param content - The reply content to send
 * @param options - Options for handling long messages
 * @returns Result of sending the reply message(s)
 */
export async function sendLongReply(
  message: Message,
  content: string,
  options: LongMessageOptions = {}
): Promise<LongMessageResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Guard clause: Validate content is not empty or whitespace-only
  // Discord API rejects empty messages with error 50006
  if (!content || content.trim().length === 0) {
    opts.logger?.warn('Attempted to send empty message - skipping to prevent Discord API error 50006');
    return {
      messageCount: 0,
      messageIds: [],
      wasTruncated: false,
    };
  }

  if (content.length <= MAX_USABLE_LENGTH) {
    // Message fits, send directly
    const reply = await message.reply(content);
    return {
      messageCount: 1,
      messageIds: [reply.id],
      wasTruncated: false,
    };
  }

  // Handle long message based on strategy
  if (opts.strategy === 'truncate') {
    const truncated = truncateMessage(content, opts);
    const reply = await message.reply(truncated);
    return {
      messageCount: 1,
      messageIds: [reply.id],
      wasTruncated: true,
    };
  }

  // Split into multiple messages
  const chunks = splitMessage(content, opts);
  const messageIds: string[] = [];

  // Send first chunk as reply
  const firstReply = await message.reply(chunks[0]);
  messageIds.push(firstReply.id);

  // Send remaining chunks as follow-up messages
  for (let i = 1; i < chunks.length; i++) {
    const channel = message.channel as TextChannel;
    if (channel && typeof channel.send === 'function') {
      const followUp = await channel.send(chunks[i]);
      messageIds.push(followUp.id);
    }
  }

  opts.logger?.info(
    `Sent ${messageIds.length} message(s) as reply for content of ${content.length} characters.`
  );

  return {
    messageCount: messageIds.length,
    messageIds,
    wasTruncated: chunks.length * MAX_USABLE_LENGTH < content.length,
  };
}
