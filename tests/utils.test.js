import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { escapeHtml } from '../public/src/utils/escapeHtml.js';

describe('Utility Functions', () => {

  describe('escapeHtml', () => {
    it('returns empty string for null or undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('converts numbers to strings', () => {
      expect(escapeHtml(123)).toBe('123');
      expect(escapeHtml(0)).toBe('0');
      expect(escapeHtml(-45.6)).toBe('-45.6');
    });

    it('escapes dangerous characters correctly', () => {
      const input = '& < > " \'';
      // Expected: &amp; &lt; &gt; &quot; &#39;
      const expected = '&amp; &lt; &gt; &quot; &#39;';
      expect(escapeHtml(input)).toBe(expected);
    });

    it('handles mixed content safely', () => {
      const input = '<script>alert("xss")</script>';
      const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
      expect(escapeHtml(input)).toBe(expected);
    });

    it('leaves safe strings untouched', () => {
      const input = 'Hello World! 123';
      expect(escapeHtml(input)).toBe(input);
    });
  });

});
