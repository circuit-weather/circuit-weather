import { describe, it, expect } from 'vitest';
import { checkRequestSource } from '../src/worker-utils.js';

const createRequest = (headers = {}) => ({
    headers: {
        get: (key) => headers[key] || null
    }
});

describe('Worker Utils - checkRequestSource', () => {
  it('blocks cross-site requests lacking origin or referer', () => {
    const req = createRequest({ 'Sec-Fetch-Site': 'cross-site' });
    const url = new URL('https://api.example.com');
    expect(checkRequestSource(req, url)).toBe(false);
  });
});
