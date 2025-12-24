import { PriorityQueue } from '../priorityQueue';
import { QueuedRequest, RequestPriority } from '../types';

describe('PriorityQueue', () => {
  it('should not crash', () => {
    const queue = new PriorityQueue(10);
    expect(queue).toBeInstanceOf(PriorityQueue);
  });
});
