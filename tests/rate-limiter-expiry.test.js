import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/worker-utils.js';

describe('RateLimiter Expiry Logic', () => {
  let limiter;
  const WINDOW_MS = 1000;
  const LIMIT = 10;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    limiter = new RateLimiter(LIMIT, WINDOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('migrates valid records from oldGen to currentGen (within window)', () => {
    // 1. Arrange: Create a record and update its lastCheck so it survives cleanup
    // T=0
    limiter.check('valid-ip');

    // Advance to T=500. Update lastCheck.
    vi.setSystemTime(500);
    limiter.check('valid-ip');

    // 2. Act: Trigger cleanup (move to oldGen)
    // Advance to T=1100 (diff > 1000 since lastCleanup=0)
    vi.setSystemTime(1100);
    limiter.check('trigger-cleanup');

    // Verify state: 'valid-ip' is in oldGen
    expect(limiter.oldGen.has('valid-ip')).toBe(true);
    expect(limiter.currentGen.has('valid-ip')).toBe(false);

    // 3. Act: Access 'valid-ip' again
    // T=1100. lastCheck=500. Diff=600 <= 1000. Valid!
    limiter.check('valid-ip');

    // 4. Assert: Migration happened
    // 'valid-ip' should be moved to currentGen
    expect(limiter.currentGen.has('valid-ip')).toBe(true);
    // 'valid-ip' should be REMOVED from oldGen
    expect(limiter.oldGen.has('valid-ip')).toBe(false);
  });

  it('expires stale oldGen records without migration (beyond window)', () => {
    // 1. Arrange: Create a record that will become stale
    // T=0. lastCheck=0.
    limiter.check('stale-ip');

    // 2. Act: Trigger cleanup (move to oldGen)
    // Advance to T=1100 (diff > 1000 since lastCleanup=0)
    vi.setSystemTime(1100);
    limiter.check('trigger-cleanup');

    // Verify state: 'stale-ip' is in oldGen
    expect(limiter.oldGen.has('stale-ip')).toBe(true);
    expect(limiter.currentGen.has('stale-ip')).toBe(false);

    // 3. Act: Access 'stale-ip' again
    // T=1100. lastCheck=0. Diff=1100 > 1000. Expired!
    limiter.check('stale-ip');

    // 4. Assert: Expiration happened (New Record Created)
    // 'stale-ip' should be in currentGen (as a new record)
    expect(limiter.currentGen.has('stale-ip')).toBe(true);

    // CRITICAL: 'stale-ip' should REMAIN in oldGen because migration logic was skipped
    // The code path `if (now - record.lastCheck <= this.windowMs)` is false,
    // so `this.oldGen.delete(ip)` inside that block is never called.
    expect(limiter.oldGen.has('stale-ip')).toBe(true);

    // Verify that the objects are different instances (new vs old)
    const newRecord = limiter.currentGen.get('stale-ip');
    const oldRecord = limiter.oldGen.get('stale-ip');
    expect(newRecord).not.toBe(oldRecord);

    // Verify tokens are reset for new record
    // New record starts with limit - 1
    expect(newRecord.tokens).toBe(LIMIT - 1);
  });
});
