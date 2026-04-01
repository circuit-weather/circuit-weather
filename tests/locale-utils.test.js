/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import { getLocaleMeta, getUserLocale, usesImperialUnits } from '../public/src/utils/locale.js';
import { t } from '../public/src/utils/localeText.js';
import { i18n } from '../public/src/i18n/index.js';

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
        i18n.init('en-NZ');
    });

    it('parses language and region from locale strings', () => {
        expect(getLocaleMeta('en-US')).toEqual({ language: 'en', region: 'US' });
        expect(getLocaleMeta('en_NZ')).toEqual({ language: 'en', region: 'NZ' });
    });

    it('detects imperial unit regions correctly', () => {
        expect(usesImperialUnits('en-US')).toBe(true);
        expect(usesImperialUnits('en-GB')).toBe(false);
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
        i18n.init();
        expect(t('unitMetricLabel')).toBe('Kilometers');
        expect(t('recenterOnCircuit')).toBe('Recenter on circuit');

        Object.defineProperty(navigator, 'languages', {
            value: ['en-NZ'],
            configurable: true,
        });
        i18n.init();
        expect(t('unitMetricLabel')).toBe('Kilometres');
        expect(t('recenterOnCircuit')).toBe('Recentre on circuit');
    });


    it('handles invalid locale types in parseLocale', () => {
        expect(getLocaleMeta(null)).toEqual({ language: 'en', region: 'NZ' });
        expect(getLocaleMeta(123)).toEqual({ language: 'en', region: 'NZ' });
    });

    it('returns default locale when navigator is undefined', () => {
        const originalNavigator = globalThis.navigator;
        Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });


        expect(getUserLocale()).toBe('en-NZ');

        Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
    });

});
