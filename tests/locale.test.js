/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import { getUserLocale, usesImperialUnits } from '../public/src/utils/locale.js';
import { i18n } from '../public/src/i18n/index.js';

describe('Locale helpers (getUserLocale & usesImperialUnits)', () => {
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

    describe('getUserLocale', () => {
        it('prefers navigator.languages[0] over navigator.language when available', () => {
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

        it('falls back to navigator.language when navigator.languages is empty or not an array', () => {
            Object.defineProperty(navigator, 'language', {
                value: 'fr-FR',
                configurable: true,
            });

            Object.defineProperty(navigator, 'languages', {
                value: [],
                configurable: true,
            });
            expect(getUserLocale()).toBe('fr-FR');

            Object.defineProperty(navigator, 'languages', {
                value: null,
                configurable: true,
            });
            expect(getUserLocale()).toBe('fr-FR');
        });

        it('returns default fallback en-NZ when navigator.languages is empty and navigator.language is falsy', () => {
            Object.defineProperty(navigator, 'language', {
                value: '',
                configurable: true,
            });
            Object.defineProperty(navigator, 'languages', {
                value: [],
                configurable: true,
            });

            expect(getUserLocale()).toBe('en-NZ');
        });

        it('returns default locale en-NZ when navigator is undefined', () => {
            const originalNavigator = globalThis.navigator;
            Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });

            try {
                expect(getUserLocale()).toBe('en-NZ');
            } finally {
                Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
            }
        });
    });

    describe('usesImperialUnits', () => {
        it('uses getUserLocale() as default parameter when no argument is provided', () => {
            Object.defineProperty(navigator, 'languages', {
                value: ['en-US'],
                configurable: true,
            });

            expect(usesImperialUnits()).toBe(true);

            Object.defineProperty(navigator, 'languages', {
                value: ['en-NZ'],
                configurable: true,
            });

            expect(usesImperialUnits()).toBe(false);
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
            expect(usesImperialUnits('fr-FR')).toBe(false);
            expect(usesImperialUnits('de-DE')).toBe(false);
        });

        it('handles invalid locale types in usesImperialUnits', () => {
            expect(usesImperialUnits(null)).toBe(false);
            expect(usesImperialUnits(123)).toBe(false);
            expect(usesImperialUnits(true)).toBe(false);
            expect(usesImperialUnits({})).toBe(false);
        });

        it('handles cases where Intl.Locale throws or returns missing region data', () => {
            // Non-standard formats that trigger catch fallback parsing
            expect(usesImperialUnits('english')).toBe(false);
            expect(usesImperialUnits('-')).toBe(false);
            expect(usesImperialUnits('en-')).toBe(false);
            expect(usesImperialUnits('-US')).toBe(true);
            expect(usesImperialUnits('custom_US')).toBe(true);

            // Mock Intl.Locale throwing an error
            const originalIntlLocale = globalThis.Intl.Locale;
            try {
                globalThis.Intl.Locale = class {
                    constructor() {
                        throw new Error('Intl.Locale unsupported');
                    }
                };
                expect(usesImperialUnits('en_US')).toBe(true);
                expect(usesImperialUnits('en_GB')).toBe(false);
            } finally {
                globalThis.Intl.Locale = originalIntlLocale;
            }

            // Mock Intl.Locale returning empty language/region
            try {
                globalThis.Intl.Locale = class {
                    constructor() {
                        this.language = '';
                        this.region = '';
                    }
                };
                expect(usesImperialUnits('mock')).toBe(false);
            } finally {
                globalThis.Intl.Locale = originalIntlLocale;
            }
        });
    });

    describe('i18n locale formatting', () => {
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
    });
});
