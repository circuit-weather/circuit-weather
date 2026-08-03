import { describe, it, expect } from 'vitest';
import { fullyDecodePath } from '../src/worker-utils.js';

describe('fullyDecodePath', () => {
    it('decodes single encoded string', () => {
        expect(fullyDecodePath('%2e%2e')).toBe('..');
    });

    it('decodes double encoded string', () => {
        expect(fullyDecodePath('%252e%252e')).toBe('..');
    });

    it('returns partially decoded string on malformed encoding', () => {
        expect(fullyDecodePath('%ZZ')).toBe('%ZZ');
    });

    it('returns null if depth limit is reached', () => {
        // %25 -> %
        // 1: %25252525252e -> %252525252e
        // 2: %252525252e -> %2525252e
        // 3: %2525252e -> %25252e
        // 4: %25252e -> %252e
        // 5: %252e -> %2e
        expect(fullyDecodePath('%25252525252e')).toBeNull();
    });

    it('handles legitimate percent characters without throwing', () => {
        // First pass decodes to 100%_valid.png. Second pass hits literal % and stops.
        expect(fullyDecodePath('100%25_valid.png')).toBe('100%_valid.png');
    });
});
