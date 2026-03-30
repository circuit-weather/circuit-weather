import { beforeEach, describe, expect, it } from 'vitest';
import { getEnglishVariant, getLocaleMeta, getUserLocale, usesImperialUnits } from '../public/src/utils/locale.js';
import { t } from '../public/src/utils/localeText.js';

describe('Locale helpers', () => {
    beforeEach(() => {
        Object.defineProperty(navigator, 'language', {
            value: 'en-NZ',
            configurable: true,
        });
        Object.defineProperty(navigator, 'languages', {
            value: ['en-NZ'],
            configurable: true,
        });
    });

    it('parses language and region from locale strings', () => {
        expect(getLocaleMeta('en-US')).toEqual({ language: 'en', region: 'US' });
        expect(getLocaleMeta('en_NZ')).toEqual({ language: 'en', region: 'NZ' });
    });

    it('detects imperial unit regions correctly', () => {
        expect(usesImperialUnits('en-US')).toBe(true);
        expect(usesImperialUnits('en-GB')).toBe(false);
    });

    it('selects english spelling variant by region', () => {
        expect(getEnglishVariant('en-US')).toBe('us');
        expect(getEnglishVariant('en-NZ')).toBe('intl');
        expect(getEnglishVariant('fr-FR')).toBe('intl');
    });

    it('prefers navigator.languages over navigator.language', () => {
        Object.defineProperty(navigator, 'language', {
            value: 'en-US',
            configurable: true,
        });
        Object.defineProperty(navigator, 'languages', {
            value: ['en-GB', 'en-US'],
            configurable: true,
        });

        expect(getUserLocale()).toBe('en-GB');
    });

    it('returns locale-specific UI copy for english variants', () => {
        Object.defineProperty(navigator, 'languages', {
            value: ['en-US'],
            configurable: true,
        });
        expect(t('unitMetricLabel')).toBe('Kilometers');
        expect(t('recenterOnCircuit')).toBe('Recenter on circuit');

        Object.defineProperty(navigator, 'languages', {
            value: ['en-NZ'],
            configurable: true,
        });
        expect(t('unitMetricLabel')).toBe('Kilometres');
        expect(t('recenterOnCircuit')).toBe('Recentre on circuit');
    });
});
