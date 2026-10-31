/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, LOCALE_LOADERS } from '../public/src/i18n/index.js';

describe('i18n', () => {
    beforeEach(async () => {
        document.body.innerHTML = '';
        Object.defineProperty(navigator, 'language', {
            value: 'en-NZ',
            configurable: true,
        });
        Object.defineProperty(navigator, 'languages', {
            value: ['en-NZ'],
            configurable: true,
        });
        await i18n.init('en-NZ');
    });

    afterEach(async () => {
        await i18n.init('en-NZ');
    });

    it('detects and normalises the locale from navigator', async () => {
        Object.defineProperty(navigator, 'languages', {
            value: ['es-ES'],
            configurable: true,
        });

        await i18n.init();

        expect(i18n.locale).toBe('es');
        expect(i18n.t('controls.session')).toBe('Sesión');
    });

    it('falls back to english for unsupported locales', async () => {
        await i18n.init('sv-SE');
        expect(i18n.locale).toBe('en-NZ');
        expect(i18n.t('controls.round')).toBe('Round');
    });

    it('supports english regional variants for spelling differences', async () => {
        await i18n.init('en-US');
        expect(i18n.locale).toBe('en-US');
        expect(i18n.t('controls.metricLabel')).toBe('Kilometers');
        expect(i18n.t('map.recenterOnCircuit')).toBe('Recenter on circuit');
    });

    it('resolves en-GB as its own locale variant', async () => {
        await i18n.init('en-GB');
        expect(i18n.locale).toBe('en-GB');
        expect(i18n.t('controls.metricLabel')).toBe('Kilometres');
        expect(i18n.t('map.recenterOnCircuit')).toBe('Recentre on circuit');
    });

    it('renders translated text and attributes with data-i18n bindings', async () => {
        document.body.innerHTML = `
            <label id="sessionLabel" data-i18n="controls.session">Session</label>
            <button id="menuButton" data-i18n-attr="aria-label:common.openMenu,title:common.openMenu">Menu</button>
        `;

        await i18n.init('fr-FR');
        i18n.apply();

        const sessionLabel = document.getElementById('sessionLabel');
        const menuButton = document.getElementById('menuButton');

        expect(sessionLabel.textContent).toBe('Session');
        expect(menuButton.getAttribute('aria-label')).toBe('Ouvrir le menu');
        expect(menuButton.getAttribute('title')).toBe('Ouvrir le menu');
    });

    it('interpolates variables in translated strings', async () => {
        await i18n.init('de-DE');
        const text = i18n.t('forecast.availableFrom', { date: '1 Jan, 10:00' });
        expect(text).toContain('1 Jan, 10:00');
    });




    it('handles invalid locale gracefully', async () => {
        await i18n.init('invalid!');
        expect(i18n.locale).toBe('en-NZ');
    });

    it('falls back to appropriate English variants for unrecognised English regions', async () => {
        await i18n.init('en-CA');
        expect(i18n.locale).toBe('en-NZ');

        await i18n.init('en-GB-oxendict');
        expect(i18n.locale).toBe('en-GB');

        await i18n.init('en-US-posix');
        expect(i18n.locale).toBe('en-US');
    });

    it('can dynamically set a new locale and apply it', async () => {
        document.body.innerHTML = `<label id="sessionLabel" data-i18n="controls.session">Session</label>`;
        let eventFired = false;

        const handler = (e) => {
            eventFired = true;
            expect(e.detail.locale).toBe('fr');
        };
        document.addEventListener('i18n:change', handler);

        await i18n.setLocale('fr');

        expect(document.documentElement.lang).toBe('fr');
        expect(i18n.locale).toBe('fr');
        const sessionLabel = document.getElementById('sessionLabel');
        expect(sessionLabel.textContent).toBe('Session');
        expect(eventFired).toBe(true);

        document.removeEventListener('i18n:change', handler);
    });

    it('handles invalid root or missing attributes gracefully in apply()', async () => {
        expect(() => i18n.apply(null)).not.toThrow();
        expect(() => i18n.apply({})).not.toThrow();

        document.body.innerHTML = '<label data-i18n="">Empty key</label>';
        expect(() => i18n.apply()).not.toThrow();

        document.body.innerHTML = '<button data-i18n-attr="">Empty rule</button>';
        expect(() => i18n.apply()).not.toThrow();

        document.body.innerHTML = '<button data-i18n-attr="aria-label:,:common.openMenu,invalidFormat">Bad Mapping</button>';
        expect(() => i18n.apply()).not.toThrow();
    });

});


describe('i18n branch coverage edge cases', () => {
    it('handles falsy locale in normalise via setLocale', async () => {
        await i18n.setLocale(null);
        expect(i18n.locale).toBe('en-NZ');
    });

    it('resolves aliased locales correctly', async () => {
        await i18n.setLocale('pt-PT');
        expect(i18n.locale).toBe('pt-BR');

        await i18n.setLocale('zh-TW');
        expect(i18n.locale).toBe('zh-CN');
    });

    it('returns the key if translation is missing', async () => {
        expect(i18n.t('missing.key')).toBe('missing.key');
    });

    it('returns the key if intermediate path is missing', async () => {
        expect(i18n.t('missing.path.key')).toBe('missing.path.key');
    });

    it('returns empty string if interpolation parameter is missing', async () => {
        await i18n.setLocale('en-NZ');
        const result = i18n.t('forecast.availableFrom');
        expect(result).toBe('Forecast available from ');
    });
});

describe('i18n lazy locales', () => {
    beforeEach(() => localStorage.clear());

    afterEach(async () => {
        vi.restoreAllMocks();
        localStorage.clear();
        await i18n.init('en-NZ');
    });

    it('loads a language only when it is chosen, then reuses it', async () => {
        const spy = vi.spyOn(LOCALE_LOADERS, 'ko');
        await i18n.setLocale('ko');
        expect(i18n.t('controls.round')).not.toBe('Round');
        await i18n.setLocale('en-NZ');
        await i18n.setLocale('ko');
        expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    });

    it('keeps English strings if a language fails to load', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(LOCALE_LOADERS, 'nl').mockRejectedValue(new Error('offline'));
        await i18n.init('nl-NL');
        expect(i18n.locale).toBe('nl');
        expect(i18n.t('controls.round')).toBe('Round');
        expect(console.error).toHaveBeenCalledWith('Failed to load the nl translations:', expect.any(Error));
    });
});
