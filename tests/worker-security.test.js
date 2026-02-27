import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRequestSource,
  checkFetchDest,
  getAllowedOrigin,
  VALID_API_PATH_REGEX,
  PRODUCTION_DOMAIN
} from '../src/worker-utils.js';

// Mock Request object helper
const createRequest = (headers = {}) => ({
  headers: {
    get: (key) => headers[key] || null
  }
});

// Default target URL (Production)
const PROD_URL = new URL('https://circuit-weather.racing/api/test');

describe('Worker Security Utils', () => {

  describe('checkRequestSource (Hotlink Protection)', () => {
    it('allows requests with Sec-Fetch-Site: same-origin', () => {
      const req = createRequest({ 'Sec-Fetch-Site': 'same-origin' });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('allows requests with Sec-Fetch-Site: same-site', () => {
      const req = createRequest({ 'Sec-Fetch-Site': 'same-site' });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('allows requests with Sec-Fetch-Site: none (direct navigation)', () => {
      const req = createRequest({ 'Sec-Fetch-Site': 'none' });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('allows requests from Production Domain (Origin)', () => {
      const req = createRequest({ 'Origin': PRODUCTION_DOMAIN });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('allows requests from Production Domain (Referer)', () => {
      const req = createRequest({ 'Referer': PRODUCTION_DOMAIN });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('allows requests from Localhost (Origin)', () => {
      const req = createRequest({ 'Origin': 'http://localhost:8787' });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('allows requests from Localhost (Referer)', () => {
      const req = createRequest({ 'Referer': 'http://localhost:8787/' });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('allows Same-Origin requests from Workers.dev (Preview)', () => {
      const origin = 'https://circuit-weather.user.workers.dev';
      const req = createRequest({ 'Origin': origin });
      const url = new URL(origin + '/api/test');

      // Should be allowed because Origin matches Request URL Origin
      expect(checkRequestSource(req, url)).toBe(true);
    });

    it('blocks Cross-Origin requests from Attacker Worker', () => {
      const attackerOrigin = 'https://circuit-weather.attacker.workers.dev';
      const targetUrl = PROD_URL; // Target is Production
      const req = createRequest({ 'Origin': attackerOrigin });

      // Should be blocked because it's not Same-Origin AND not in Allowlist (regex removed)
      expect(checkRequestSource(req, targetUrl)).toBe(false);
    });

    it('blocks requests from unknown Origin', () => {
      const req = createRequest({ 'Origin': 'https://evil.com' });
      expect(checkRequestSource(req, PROD_URL)).toBe(false);
    });

    it('blocks requests from unknown Referer', () => {
      const req = createRequest({ 'Referer': 'https://evil.com/hack' });
      expect(checkRequestSource(req, PROD_URL)).toBe(false);
    });

    it('blocks requests with no identity headers (Script Scraping)', () => {
      const req = createRequest({}); // No Origin, Referer, or Sec-Fetch-Site
      expect(checkRequestSource(req, PROD_URL)).toBe(false);
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

  describe('Malicious Origin Validation', () => {
    it('rejects attacker origins spoofing preview domain via path', () => {
      const attackerOrigin = 'https://attacker.com/foo.circuit-weather.pages.dev/';
      const targetUrl = PROD_URL;
      const req = createRequest({ 'Origin': attackerOrigin });

      expect(checkRequestSource(req, targetUrl)).toBe(false);
      expect(getAllowedOrigin(req)).toBe(null);
    });

    it('rejects attacker origins spoofing preview domain via subdomain', () => {
      const attackerOrigin = 'https://circuit-weather.pages.dev.attacker.com/';
      const targetUrl = PROD_URL;
      const req = createRequest({ 'Origin': attackerOrigin });

      expect(checkRequestSource(req, targetUrl)).toBe(false);
      expect(getAllowedOrigin(req)).toBe(null);
    });

    it('allows legitimate preview domains', () => {
      const origin = 'https://feature-branch.circuit-weather.pages.dev';
      const targetUrl = PROD_URL;
      const req = createRequest({ 'Origin': origin });

      // In checkRequestSource, cross-origin requests matching preview regex without same-origin check:
      // Oh wait, checkRequestSource checks Origin against ALLOWED_PREVIEW_REGEX, so it returns true!
      expect(checkRequestSource(req, targetUrl)).toBe(true);
      expect(getAllowedOrigin(req)).toBe(origin);
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
