/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import { getUserLocale, usesImperialUnits } from '../public/src/utils/locale.js';
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

    it('detects imperial unit regions correctly from locale strings', () => {
        // Imperial regions (US, LR, MM)
        expect(usesImperialUnits('en-US')).toBe(true);
        expect(usesImperialUnits('en_US')).toBe(true);
        expect(usesImperialUnits('en-LR')).toBe(true);
        expect(usesImperialUnits('my-MM')).toBe(true);

        // Metric regions
        expect(usesImperialUnits('en-NZ')).toBe(false);
        expect(usesImperialUnits('en_NZ')).toBe(false);
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
        expect(i18n.t('controls.metricLabel')).toBe('Kilometers');
        expect(i18n.t('map.recenterOnCircuit')).toBe('Recenter on circuit');

        Object.defineProperty(navigator, 'languages', {
            value: ['en-NZ'],
            configurable: true,
        });
        i18n.init();
        expect(i18n.t('controls.metricLabel')).toBe('Kilometres');
        expect(i18n.t('map.recenterOnCircuit')).toBe('Recentre on circuit');
    });


    it('handles invalid locale types in usesImperialUnits', () => {
        expect(usesImperialUnits(null)).toBe(false); // Default NZ (metric)
        expect(usesImperialUnits(123)).toBe(false); // Default NZ (metric)
    });

    it('handles cases where Intl.Locale fails or returns missing data in usesImperialUnits', () => {
        // Fallback catch block handles non-standard but string formats
        expect(usesImperialUnits('english')).toBe(false);
        expect(usesImperialUnits('-')).toBe(false);
        expect(usesImperialUnits('en-')).toBe(false);
        expect(usesImperialUnits('-US')).toBe(true); // US is imperial

        // Mock Intl.Locale returning empty language/region
        const originalIntlLocale = globalThis.Intl.Locale;
        try {
            globalThis.Intl.Locale = class {
                constructor() {
                    this.language = '';
                    this.region = ''; // Maps to metric
                }
            };
            expect(usesImperialUnits('mock')).toBe(false);
        } finally {
            globalThis.Intl.Locale = originalIntlLocale;
        }
    });

    it('returns default locale when navigator is undefined', () => {
        const originalNavigator = globalThis.navigator;
        Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });

        expect(getUserLocale()).toBe('en-NZ');

        Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
    });

    it('handles navigator.languages edge cases in getUserLocale', () => {
        // Empty navigator.languages array falls back to navigator.language
        Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true });
        Object.defineProperty(navigator, 'languages', { value: [], configurable: true });
        expect(getUserLocale()).toBe('fr-FR');

        // First element in navigator.languages is empty string/falsy
        Object.defineProperty(navigator, 'languages', { value: [''], configurable: true });
        expect(getUserLocale()).toBe('fr-FR');

        // navigator.languages is not an array
        Object.defineProperty(navigator, 'languages', { value: null, configurable: true });
        expect(getUserLocale()).toBe('fr-FR');

        // Both navigator.languages and navigator.language are empty/falsy
        Object.defineProperty(navigator, 'language', { value: '', configurable: true });
        Object.defineProperty(navigator, 'languages', { value: [], configurable: true });
        expect(getUserLocale()).toBe('en-NZ');
    });

    it('uses default getUserLocale parameter in usesImperialUnits when called with no arguments', () => {
        Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
        Object.defineProperty(navigator, 'languages', { value: ['en-US'], configurable: true });
        expect(usesImperialUnits()).toBe(true);

        Object.defineProperty(navigator, 'language', { value: 'en-GB', configurable: true });
        Object.defineProperty(navigator, 'languages', { value: ['en-GB'], configurable: true });
        expect(usesImperialUnits()).toBe(false);
    });

    it('handles locales without region in usesImperialUnits', () => {
        expect(usesImperialUnits('en')).toBe(false);
        expect(usesImperialUnits('')).toBe(false);
    });
});
