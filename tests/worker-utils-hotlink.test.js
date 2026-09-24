import { describe, it, expect } from 'vitest';
import { checkRequestSource } from '../src/worker-utils.js';

const PRODUCTION_DOMAIN = 'https://circuit-weather.racing';

const createRequest = (headers = {}) => ({
  headers: {
    get: (key) => headers[key] || null
  }
});

const PROD_URL = new URL('https://circuit-weather.racing/api/test');

describe('Worker Utils - checkRequestSource (Hotlink & CSRF Protection)', () => {
  describe('Sec-Fetch-Site header branch', () => {
    it('allows requests with Sec-Fetch-Site: same-origin', () => {
      const req = createRequest({ 'Sec-Fetch-Site': 'same-origin' });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('allows requests with Sec-Fetch-Site: same-site', () => {
      const req = createRequest({ 'Sec-Fetch-Site': 'same-site' });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('allows requests with Sec-Fetch-Site: none (direct browser navigation/bookmarks)', () => {
      const req = createRequest({ 'Sec-Fetch-Site': 'none' });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('blocks cross-site requests lacking valid Origin or Referer', () => {
      const req = createRequest({ 'Sec-Fetch-Site': 'cross-site' });
      expect(checkRequestSource(req, PROD_URL)).toBe(false);
    });

    it('allows cross-site requests carrying a whitelisted Origin', () => {
      const req = createRequest({
        'Sec-Fetch-Site': 'cross-site',
        'Origin': PRODUCTION_DOMAIN
      });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('blocks cross-site requests carrying a hostile Origin', () => {
      const req = createRequest({
        'Sec-Fetch-Site': 'cross-site',
        'Origin': 'https://evil.com'
      });
      expect(checkRequestSource(req, PROD_URL)).toBe(false);
    });
  });

  describe('Origin header branch', () => {
    it('allows Strict Same-Origin requests matching Request URL origin', () => {
      const origin = 'https://custom-worker-domain.com';
      const req = createRequest({ Origin: origin });
      const url = new URL(`${origin}/api/v1/test`);
      expect(checkRequestSource(req, url)).toBe(true);
    });

    it('allows requests from Production Domain', () => {
      const req = createRequest({ Origin: PRODUCTION_DOMAIN });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('allows requests from Localhost / 127.0.0.1 development domains', () => {
      const reqLocalhost = createRequest({ Origin: 'http://localhost:8787' });
      expect(checkRequestSource(reqLocalhost, PROD_URL)).toBe(true);

      const req127 = createRequest({ Origin: 'http://127.0.0.1:8787' });
      expect(checkRequestSource(req127, PROD_URL)).toBe(true);
    });

    it('allows requests from Cloudflare Pages preview domains', () => {
      const req = createRequest({ Origin: 'https://preview-123.circuit-weather.pages.dev' });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('blocks requests from invalid / untrusted Origin', () => {
      const req = createRequest({ Origin: 'https://evil-site.com' });
      expect(checkRequestSource(req, PROD_URL)).toBe(false);
    });
  });

  describe('Referer header branch', () => {
    it('allows Referer matching production domain exact or with path', () => {
      const reqExact = createRequest({ Referer: PRODUCTION_DOMAIN });
      expect(checkRequestSource(reqExact, PROD_URL)).toBe(true);

      const reqPath = createRequest({ Referer: `${PRODUCTION_DOMAIN}/race/monaco` });
      expect(checkRequestSource(reqPath, PROD_URL)).toBe(true);
    });

    it('allows Same-Origin Referer on self-hosted or custom deployments', () => {
      const selfHostedOrigin = 'https://my-custom-weather.org';
      const url = new URL(`${selfHostedOrigin}/api/data`);
      const req = createRequest({ Referer: `${selfHostedOrigin}/dashboard` });
      expect(checkRequestSource(req, url)).toBe(true);
    });

    it('allows Referer from Localhost / 127.0.0.1 development origins', () => {
      const reqLocalhost = createRequest({ Referer: 'http://localhost:8787/' });
      expect(checkRequestSource(reqLocalhost, PROD_URL)).toBe(true);

      const req127 = createRequest({ Referer: 'http://127.0.0.1:8787/app' });
      expect(checkRequestSource(req127, PROD_URL)).toBe(true);
    });

    it('allows Referer from Cloudflare Pages preview domains', () => {
      const req = createRequest({ Referer: 'https://branch-feat.circuit-weather.pages.dev/preview' });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('blocks requests with invalid / untrusted Referer', () => {
      const req = createRequest({ Referer: 'https://evil.com/phishing' });
      expect(checkRequestSource(req, PROD_URL)).toBe(false);
    });
  });

  describe('Missing Identity Headers & Combined Header Edge Cases', () => {
    it('blocks requests when no Sec-Fetch-Site, Origin, or Referer is present', () => {
      const req = createRequest({});
      expect(checkRequestSource(req, PROD_URL)).toBe(false);
    });

    it('allows when both Origin and Referer are valid', () => {
      const req = createRequest({
        Origin: PRODUCTION_DOMAIN,
        Referer: `${PRODUCTION_DOMAIN}/live`
      });
      expect(checkRequestSource(req, PROD_URL)).toBe(true);
    });

    it('blocks when Origin is valid but Referer is hostile', () => {
      const req = createRequest({
        Origin: PRODUCTION_DOMAIN,
        Referer: 'https://evil.com/hack'
      });
      expect(checkRequestSource(req, PROD_URL)).toBe(false);
    });

    it('blocks when Origin is hostile even if Referer is valid', () => {
      const req = createRequest({
        Origin: 'https://evil.com',
        Referer: PRODUCTION_DOMAIN
      });
      expect(checkRequestSource(req, PROD_URL)).toBe(false);
    });
  });
});
