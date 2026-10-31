import { describe, it, expect } from 'vitest';
import { formatStatusLabel } from '../public/src/utils/status.js';

describe('status utils', () => {
    describe('formatStatusLabel', () => {
        it('formats LIVE correctly', () => {
            expect(formatStatusLabel('Round 1', 'LIVE', false)).toBe('🔴 LIVE Round 1');
            expect(formatStatusLabel('Round 1', 'LIVE', true)).toBe('🔴 LIVE Round 1');
        });

        it('formats CURRENT correctly', () => {
            expect(formatStatusLabel('Round 1', 'CURRENT', false)).toBe('(Current) Round 1');
        });

        it('formats NEXT correctly', () => {
            expect(formatStatusLabel('Round 2', 'FUTURE', true)).toBe('(Next) Round 2');
        });

        it('formats others correctly', () => {
            expect(formatStatusLabel('Round 3', 'FUTURE', false)).toBe('Round 3');
            expect(formatStatusLabel('Round 0', 'PAST', false)).toBe('Round 0');
        });
    });
});
