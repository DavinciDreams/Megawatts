import { RateLimitBucket, RateLimitInfo, QueuedRequest } from './types';
import { RateLimitStore } from './store';
import { Logger } from '../../utils/logger';
import { calculateBackoffDelay } from './config';

const logger = new Logger('BucketManager');

/**
 * Manages rate limit buckets for Discord API endpoints
 */
export class BucketManager {
  constructor(public store: RateLimitStore) {}

  /**
   * Get or create a rate limit bucket
   */
  async getBucket(bucketId: string, defaultLimit: number = 5, defaultResetAfter: number = 5000): Promise<RateLimitBucket> {
    let bucket = await this.store.getBucket(bucketId);
    
    if (!bucket) {
      bucket = {
        id: bucketId,
        limit: defaultLimit,
        remaining: defaultLimit,
        resetAt: Date.now() + defaultResetAfter,
        resetAfter: defaultResetAfter,
        maxRetries: 3,
        lastUsed: Date.now(),
        requests: [],
      };
      
      await this.store.setBucket(bucketId, bucket);
      logger.debug(`Created new rate limit bucket: ${bucketId}`, {
        limit: defaultLimit,
        resetAfter: defaultResetAfter,
      });
    }
    
    return bucket;
  }

  /**
   * Update bucket with rate limit info from API response
   */
  async updateBucket(bucketId: string, info: RateLimitInfo): Promise<void> {
    const bucket = await this.getBucket(bucketId, info.limit, info.resetAfter);
    
    // Update bucket with new rate limit info
    bucket.limit = info.limit;
    bucket.remaining = info.remaining;
    bucket.resetAt = Date.now() + info.resetAfter;
    bucket.resetAfter = info.resetAfter;
    bucket.lastUsed = Date.now();
    
    await this.store.setBucket(bucketId, bucket);
    
    logger.debug(`Updated rate limit bucket: ${bucketId}`, {
      limit: info.limit,
      remaining: info.remaining,
      resetAfter: info.resetAfter,
      global: info.global,
    });
  }

  /**
   * Check if a bucket is rate limited
   */
  async isRateLimited(bucketId: string): Promise<boolean> {
    const bucket = await this.store.getBucket(bucketId);
    
    if (!bucket) {
      return false;
    }
    
    const now = Date.now();
    
    // Check if bucket is reset
    if (now >= bucket.resetAt) {
      return false;
    }
    
    // Check if remaining requests are exhausted
    return bucket.remaining <= 0;
  }

  /**
   * Get wait time for a bucket
   */
  async getWaitTime(bucketId: string): Promise<number> {
    const bucket = await this.store.getBucket(bucketId);
    
    if (!bucket) {
      return 0;
    }
    
    const now = Date.now();
    
    // If bucket is reset, no wait time
    if (now >= bucket.resetAt) {
      return 0;
    }
    
    // If remaining requests > 0, no wait time
    if (bucket.remaining > 0) {
      return 0;
    }
    
    // Return time until reset
    return bucket.resetAt - now;
  }

  /**
   * Consume a request from the bucket
   */
  async consumeRequest(bucketId: string): Promise<boolean> {
    const bucket = await this.getBucket(bucketId);
    
    const now = Date.now();
    
    // Reset bucket if time has passed
    if (now >= bucket.resetAt) {
      bucket.remaining = bucket.limit;
      bucket.resetAt = now + bucket.resetAfter;
    }
    
    // Check if we can consume a request
    if (bucket.remaining <= 0) {
      return false;
    }
    
    // Consume the request
    bucket.remaining--;
    bucket.lastUsed = now;
    
    await this.store.setBucket(bucketId, bucket);
    
    return true;
  }

  /**
   * Add a request to the bucket's queue
   */
  async queueRequest(bucketId: string, request: QueuedRequest): Promise<void> {
    const bucket = await this.getBucket(bucketId);
    
    request.bucketId = bucketId;
    bucket.requests.push(request);
    
    // Sort requests by priority and timestamp
    bucket.requests.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.timestamp - b.timestamp;
    });
    
    await this.store.setBucket(bucketId, bucket);
  }

  /**
   * Get next request from bucket queue
   */
  async getNextRequest(bucketId: string): Promise<QueuedRequest | null> {
    const bucket = await this.store.getBucket(bucketId);
    
    if (!bucket || bucket.requests.length === 0) {
      return null;
    }
    
    const request = bucket.requests.shift();
    await this.store.setBucket(bucketId, bucket);
    
    return request || null;
  }

  /**
   * Remove failed requests from bucket
   */
  async removeFailedRequests(bucketId: string, maxRetries: number = 3): Promise<number> {
    const bucket = await this.store.getBucket(bucketId);
    
    if (!bucket) {
      return 0;
    }
    
    const now = Date.now();
    let removed = 0;
    
    bucket.requests = bucket.requests.filter((request: QueuedRequest) => {
      // Remove requests that have exceeded max retries
      if (request.retryCount >= maxRetries) {
        request.reject(new Error(`Request failed after ${maxRetries} retries`));
        removed++;
        return false;
      }
      
      // Remove expired requests
      if (now - request.timestamp > 30000) { // 30 seconds timeout
        request.reject(new Error('Request timed out'));
        removed++;
        return false;
      }
      
      return true;
    });
    
    await this.store.setBucket(bucketId, bucket);
    
    if (removed > 0) {
      logger.debug(`Removed ${removed} failed requests from bucket: ${bucketId}`);
    }
    
    return removed;
  }

  /**
   * Handle rate limit response
   */
  async handleRateLimit(bucketId: string, info: RateLimitInfo): Promise<void> {
    await this.updateBucket(bucketId, info);
    
    if (info.global) {
      await this.store.setGlobalLimit(info);
      logger.warn('Global rate limit applied', {
        retryAfter: info.retryAfter,
        limit: info.limit,
      });
    } else {
      logger.warn('Bucket rate limit applied', {
        bucketId,
        retryAfter: info.retryAfter,
        remaining: info.remaining,
      });
    }
  }

  /**
   * Calculate retry delay for a request
   */
  calculateRetryDelay(request: QueuedRequest, rateLimitInfo?: RateLimitInfo): number {
    // If we have specific retry after from Discord, use that
    if (rateLimitInfo?.retryAfter) {
      return rateLimitInfo.retryAfter;
    }
    
    // Otherwise use exponential backoff
    return calculateBackoffDelay(request.retryCount);
  }

  /**
   * Get bucket statistics
   */
  async getBucketStats(bucketId: string): Promise<Record<string, any> | null> {
    const bucket = await this.store.getBucket(bucketId);
    
    if (!bucket) {
      return null;
    }
    
    const now = Date.now();
    
    return {
      id: bucket.id,
      limit: bucket.limit,
      remaining: bucket.remaining,
      resetAt: bucket.resetAt,
      resetAfter: bucket.resetAfter,
      lastUsed: bucket.lastUsed,
      timeUntilReset: Math.max(0, bucket.resetAt - now),
      isRateLimited: bucket.remaining <= 0 && now < bucket.resetAt,
      queuedRequests: bucket.requests.length,
      requestsByPriority: bucket.requests.reduce((acc: Record<number, number>, req: QueuedRequest) => {
        acc[req.priority] = (acc[req.priority] || 0) + 1;
        return acc;
      }, {} as Record<number, number>),
    };
  }

  /**
   * Get all bucket statistics
   */
  async getAllBucketStats(): Promise<Record<string, any>> {
    const buckets = await this.store.getAllBuckets();
    const stats: Record<string, any> = {
      totalBuckets: buckets.length,
      activeBuckets: 0,
      rateLimitedBuckets: 0,
      totalQueuedRequests: 0,
      buckets: [],
    };
    
    const now = Date.now();
    
    for (const bucket of buckets) {
      if (now < bucket.resetAt) {
        stats.activeBuckets++;
        
        if (bucket.remaining <= 0) {
          stats.rateLimitedBuckets++;
        }
      }
      
      stats.totalQueuedRequests += bucket.requests.length;
      
      stats.buckets.push({
        id: bucket.id,
        limit: bucket.limit,
        remaining: bucket.remaining,
        resetAt: bucket.resetAt,
        isRateLimited: bucket.remaining <= 0 && now < bucket.resetAt,
        queuedRequests: bucket.requests.length,
      });
    }
    
    return stats;
  }

  /**
   * Cleanup expired buckets
   */
  async cleanup(): Promise<number> {
    await this.store.clearExpiredBuckets();
    
    // Also cleanup failed requests in active buckets
    const buckets = await this.store.getAllBuckets();
    let totalCleaned = 0;
    
    for (const bucket of buckets) {
      const cleaned = await this.removeFailedRequests(bucket.id);
      totalCleaned += cleaned;
    }
    
    return totalCleaned;
  }

  /**
   * Reset a bucket to its initial state
   */
  async resetBucket(bucketId: string): Promise<void> {
    const bucket = await this.store.getBucket(bucketId);
    
    if (!bucket) {
      return;
    }
    
    // Reject all queued requests
    for (const request of bucket.requests) {
      request.reject(new Error(`Bucket ${bucketId} was reset`));
    }
    
    // Reset bucket state
    bucket.remaining = bucket.limit;
    bucket.resetAt = Date.now() + bucket.resetAfter;
    bucket.requests = [];
    bucket.lastUsed = Date.now();
    
    await this.store.setBucket(bucketId, bucket);
    
    logger.debug(`Reset rate limit bucket: ${bucketId}`);
  }

  /**
   * Delete a bucket
   */
  async deleteBucket(bucketId: string): Promise<boolean> {
    const bucket = await this.store.getBucket(bucketId);
    
    if (bucket) {
      // Reject all queued requests
      for (const request of bucket.requests) {
        request.reject(new Error(`Bucket ${bucketId} was deleted`));
      }
    }
    
    logger.debug(`Deleted rate limit bucket: ${bucketId}`);
    return this.store.deleteBucket(bucketId);
  }
}
