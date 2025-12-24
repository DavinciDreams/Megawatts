import { BucketManager } from '../bucketManager';
import { MemoryRateLimitStore } from '../store';
import { QueuedRequest, RequestPriority } from '../types';

describe('BucketManager', () => {
  let store: MemoryRateLimitStore;
  let bucketManager: BucketManager;

  beforeEach(() => {
    store = new MemoryRateLimitStore();
    bucketManager = new BucketManager(store);
  });

  describe('getBucket', () => {
    it('should create a new bucket if one does not exist', async () => {
      const bucket = await bucketManager.getBucket('test-bucket');
      expect(bucket).toBeDefined();
      expect(bucket.id).toBe('test-bucket');
    });

    it('should return an existing bucket', async () => {
      const bucket = await bucketManager.getBucket('test-bucket');
      const bucket2 = await bucketManager.getBucket('test-bucket');
      expect(bucket).toBe(bucket2);
    });
  });

  describe('deleteBucket', () => {
    it('should delete a bucket', async () => {
      await bucketManager.getBucket('test-bucket');
      await bucketManager.deleteBucket('test-bucket');
      const bucket = await store.getBucket('test-bucket');
      expect(bucket).toBeUndefined();
    });

    it('should reject queued requests when deleting a bucket', async () => {
      const request: QueuedRequest = {
        id: '1',
        url: 'https://discord.com/api/v9/channels/123/messages',
        method: 'POST',
        priority: RequestPriority.NORMAL,
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        resolve: jest.fn(),
        reject: jest.fn(),
      };

      await bucketManager.queueRequest('test-bucket', request);
      await bucketManager.deleteBucket('test-bucket');
      expect(request.reject).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
