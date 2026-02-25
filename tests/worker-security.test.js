import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRequestSource,
  checkFetchDest,
  VALID_API_PATH_REGEX,
  PRODUCTION_DOMAIN
} from '../src/worker-utils.js';

// Mock Request object helper
const createRequest = (headers = {}) => ({
  headers: {
    get: (key) => headers[key] || null
  }
});

describe('Worker Security Utils', () => {

  describe('checkRequestSource (Hotlink Protection)', () => {
    it('allows requests with Sec-Fetch-Site: same-origin', () => {
      const req = createRequest({ 'Sec-Fetch-Site': 'same-origin' });
      expect(checkRequestSource(req)).toBe(true);
    });

    it('allows requests with Sec-Fetch-Site: same-site', () => {
      const req = createRequest({ 'Sec-Fetch-Site': 'same-site' });
      expect(checkRequestSource(req)).toBe(true);
    });

    it('allows requests with Sec-Fetch-Site: none (direct navigation)', () => {
      const req = createRequest({ 'Sec-Fetch-Site': 'none' });
      expect(checkRequestSource(req)).toBe(true);
    });

    it('allows requests from Production Domain (Origin)', () => {
      const req = createRequest({ 'Origin': PRODUCTION_DOMAIN });
      expect(checkRequestSource(req)).toBe(true);
    });

    it('allows requests from Production Domain (Referer)', () => {
      const req = createRequest({ 'Referer': PRODUCTION_DOMAIN });
      expect(checkRequestSource(req)).toBe(true);
    });

    it('allows requests from Localhost (Origin)', () => {
      const req = createRequest({ 'Origin': 'http://localhost:8787' });
      expect(checkRequestSource(req)).toBe(true);
    });

    it('allows requests from Localhost (Referer)', () => {
      const req = createRequest({ 'Referer': 'http://localhost:8787/' });
      expect(checkRequestSource(req)).toBe(true);
    });

    it('blocks requests from unknown Origin', () => {
      const req = createRequest({ 'Origin': 'https://evil.com' });
      expect(checkRequestSource(req)).toBe(false);
    });

    it('blocks requests from unknown Referer', () => {
      const req = createRequest({ 'Referer': 'https://evil.com/hack' });
      expect(checkRequestSource(req)).toBe(false);
    });

    it('blocks requests with no identity headers (Script Scraping)', () => {
      const req = createRequest({}); // No Origin, Referer, or Sec-Fetch-Site
      expect(checkRequestSource(req)).toBe(false);
    });
  });

  describe('checkFetchDest (XSSI Protection)', () => {
    it('allows standard fetch destinations', () => {
      expect(checkFetchDest(createRequest({ 'Sec-Fetch-Dest': 'empty' }))).toBe(true);
      expect(checkFetchDest(createRequest({ 'Sec-Fetch-Dest': 'image' }))).toBe(true);
    });

    it('blocks script destination', () => {
      expect(checkFetchDest(createRequest({ 'Sec-Fetch-Dest': 'script' }))).toBe(false);
    });

    it('blocks object destination', () => {
      expect(checkFetchDest(createRequest({ 'Sec-Fetch-Dest': 'object' }))).toBe(false);
    });

    it('blocks iframe destination', () => {
      expect(checkFetchDest(createRequest({ 'Sec-Fetch-Dest': 'iframe' }))).toBe(false);
    });
  });

  describe('Regex Validation', () => {
    it('validates API paths correctly', () => {
      expect(VALID_API_PATH_REGEX.test('current')).toBe(true);
      expect(VALID_API_PATH_REGEX.test('2023/1/results')).toBe(true);
      expect(VALID_API_PATH_REGEX.test('drivers/max_verstappen')).toBe(true);

      expect(VALID_API_PATH_REGEX.test('invalid<script>')).toBe(false);
      expect(VALID_API_PATH_REGEX.test('drop table')).toBe(false);
    });
  });
});
