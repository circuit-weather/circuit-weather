import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/worker-utils.js';

describe('RateLimiter New IP Exhaustion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('evicts oldest when full in new record creation', () => {
    const LIMIT = 5;
    const WINDOW = 10000;
    const MAX_IPS = 2; // small size

    vi.setSystemTime(0);
    const limiter = new RateLimiter(LIMIT, WINDOW, MAX_IPS);

    // Add 2 IPs (consumes 1 token each)
    limiter.check('IP_A');
    limiter.check('IP_B');

    // The set is full (size = 2).
    // Now add a 3rd IP. It should evict the oldest (IP_A) from currentGen.
    expect(limiter.check('IP_C')).toBe(true);

    // Verify IP_A was evicted and acts as a new user.
    // If it was still in the system, it would have 4 tokens left.
    // Since it was evicted, it will have 5 tokens left when checked again.
    let successCount = 0;
    for(let i=0; i<6; i++) {
        if(limiter.check('IP_A')) successCount++;
    }

    // Total success for IP_A in this check burst should be 5
    // since it was reset as a new user.
    expect(successCount).toBe(5);
  });
});
