import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRequestSource,
  checkFetchDest,
  getAllowedOrigin,
  VALID_API_PATH_REGEX,
  recursivelyDecodePath
} from '../src/worker-utils.js';
import { PRODUCTION_DOMAIN } from './helpers/constants.js';

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

    // --- Referer-specific branches (no Sec-Fetch-Site, so it falls through) ---

    it('allows a Referer on the production domain that carries a path', () => {
      // Exercises the `startsWith(PRODUCTION_DOMAIN + '/')` fast path, distinct
      // from an exact bare-domain match.
      const req = createRequest({ Referer: `${PRODUCTION_DOMAIN}/f1/3/race` });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('allows a same-origin Referer on a self-hosted/custom worker domain', () => {
      // Not production and not a known preview/localhost host, but the Referer
      // matches the request URL's own origin (self-hosted deployment).
      const selfHosted = 'https://circuit-weather.example.workers.dev';
      const url = new URL(`${selfHosted}/api/test`);
      const req = createRequest({ Referer: `${selfHosted}/dashboard` });
      expect(checkRequestSource(req, url)).toBe(true);
    });

    it('allows requests from 127.0.0.1 (Origin)', () => {
      const req = createRequest({ Origin: 'http://127.0.0.1:8787' });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('allows requests from 127.0.0.1 (Referer)', () => {
      const req = createRequest({ Referer: 'http://127.0.0.1:8787/' });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('allows a Referer on a legitimate preview domain', () => {
      const req = createRequest({ Referer: 'https://feature-branch.circuit-weather.pages.dev/app' });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    // --- Origin + Referer combinations (both checks must agree) ---

    it('allows when both Origin and Referer are valid', () => {
      const req = createRequest({ Origin: PRODUCTION_DOMAIN, Referer: `${PRODUCTION_DOMAIN}/` });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('blocks when the Origin is valid but the Referer is hostile', () => {
      // A valid Origin must not whitelist a request that also carries a
      // disallowed Referer — both headers are checked when present.
      const req = createRequest({ Origin: PRODUCTION_DOMAIN, Referer: 'https://evil.com/hack' });
      expect(checkRequestSource(req, PROD_URL)).toBe(false);
    });

    it('blocks when the Origin is hostile even if the Referer is valid', () => {
      // The Origin check short-circuits before the Referer is ever consulted.
      const req = createRequest({ Origin: 'https://evil.com', Referer: PRODUCTION_DOMAIN });
      expect(checkRequestSource(req, PROD_URL)).toBe(false);
    });

    // --- Sec-Fetch-Site: cross-site (not auto-allowed; falls through to checks) ---

    it('allows cross-site requests that carry a whitelisted Origin', () => {
      const req = createRequest({ 'Sec-Fetch-Site': 'cross-site', Origin: PRODUCTION_DOMAIN });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('blocks cross-site requests carrying a hostile Origin', () => {
      const req = createRequest({ 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.com' });
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

    it('blocks embed destination', () => {
      expect(checkFetchDest(createRequest({ 'Sec-Fetch-Dest': 'embed' }))).toBe(false);
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

  describe('recursivelyDecodePath (SSRF/Traversal Protection)', () => {
    it('decodes standard url encoding', () => {
      expect(recursivelyDecodePath('%2e%2e/')).toBe('../');
      expect(recursivelyDecodePath('test%20path')).toBe('test path');
    });

    it('decodes multiple encodings', () => {
      // Double encoded ../
      expect(recursivelyDecodePath('%252e%252e/')).toBe('../');
      // Triple encoded ../
      expect(recursivelyDecodePath('%25252e%25252e/')).toBe('../');
    });

    it('handles legitimate % characters safely', () => {
      expect(recursivelyDecodePath('invalid%')).toBe('invalid%');
      expect(recursivelyDecodePath('test%25')).toBe('test%');
    });

    it('returns null if max depth is exceeded', () => {
      // 6 times encoded
      expect(recursivelyDecodePath('%2525252525252e/')).toBeNull();
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
