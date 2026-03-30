/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '../public/src/i18n/index.js';

describe('i18n', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
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

    afterEach(() => {
        i18n.init('en-NZ');
    });

    it('detects and normalises the locale from navigator', () => {
        Object.defineProperty(navigator, 'languages', {
            value: ['es-ES'],
            configurable: true,
        });

        i18n.init();

        expect(i18n.locale).toBe('es');
        expect(i18n.t('controls.session')).toBe('Sesion');
    });

    it('falls back to english for unsupported locales', () => {
        i18n.init('sv-SE');
        expect(i18n.locale).toBe('en-NZ');
        expect(i18n.t('controls.round')).toBe('Round');
    });

    it('supports english regional variants for spelling differences', () => {
        i18n.init('en-US');
        expect(i18n.locale).toBe('en-US');
        expect(i18n.t('controls.metricLabel')).toBe('Kilometers');
        expect(i18n.t('map.recenterOnCircuit')).toBe('Recenter on circuit');
    });

    it('resolves en-GB as its own locale variant', () => {
        i18n.init('en-GB');
        expect(i18n.locale).toBe('en-GB');
        expect(i18n.t('controls.metricLabel')).toBe('Kilometres');
        expect(i18n.t('map.recenterOnCircuit')).toBe('Recentre on circuit');
    });

    it('renders translated text and attributes with data-i18n bindings', () => {
        document.body.innerHTML = `
            <label id="sessionLabel" data-i18n="controls.session">Session</label>
            <button id="menuButton" data-i18n-attr="aria-label:common.openMenu,title:common.openMenu">Menu</button>
        `;

        i18n.init('fr-FR');
        i18n.apply();

        const sessionLabel = document.getElementById('sessionLabel');
        const menuButton = document.getElementById('menuButton');

        expect(sessionLabel.textContent).toBe('Session');
        expect(menuButton.getAttribute('aria-label')).toBe('Ouvrir le menu');
        expect(menuButton.getAttribute('title')).toBe('Ouvrir le menu');
    });

    it('interpolates variables in translated strings', () => {
        i18n.init('de-DE');
        const text = i18n.t('forecast.availableFrom', { date: '1 Jan, 10:00' });
        expect(text).toContain('1 Jan, 10:00');
    });
});
