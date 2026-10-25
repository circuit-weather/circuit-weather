// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LayerSettings } from '../public/src/ui/LayerSettings.js';
import { CONFIG } from '../public/src/config.js';

const SWITCH_IDS = ['radarArrowsToggle', 'radarCellsToggle', 'radarLightningToggle', 'satelliteToggle', 'weatherAlertsToggle'];

function renderControls() {
    document.body.innerHTML = `
        <select id="radarColourSelect"></select>
        ${SWITCH_IDS.map(id => `<button id="${id}" role="switch"></button>`).join('')}
    `;
}

const SCHEMES = [{ id: 1, name: 'Rainviewer Original' }, { id: 2, name: 'Universal Blue' }, { id: 6, name: 'NEXRAD <b>' }];

describe('LayerSettings', () => {
    beforeEach(() => {
        localStorage.clear();
        renderControls();
    });

    it('defaults to warnings on and everything else off', () => {
        const settings = new LayerSettings();
        expect(settings.get()).toEqual({
            arrows: false, cells: false, lightning: false, satellite: false, alerts: true,
            colour: CONFIG.RADAR_DEFAULT_COLOUR,
        });
        expect(document.getElementById('weatherAlertsToggle').getAttribute('aria-checked')).toBe('true');
        expect(document.getElementById('radarArrowsToggle').getAttribute('aria-checked')).toBe('false');
    });

    it('restores stored choices and ignores tampered values', () => {
        localStorage.setItem('radarArrows', 'true');
        localStorage.setItem('weatherAlerts', 'false');
        localStorage.setItem('radarCells', '<img onerror>');
        localStorage.setItem('radarColour', '6');
        const settings = new LayerSettings();
        expect(settings.get()).toMatchObject({ arrows: true, alerts: false, cells: false, colour: 6 });
        expect(settings.getTileOptions()).toEqual({ colour: 6, arrows: true, cells: false, lightning: false });
    });

    it('toggles on click and keyboard, persisting and notifying', () => {
        const onChange = vi.fn();
        new LayerSettings(onChange);
        const button = document.getElementById('radarLightningToggle');

        button.click();
        expect(onChange).toHaveBeenLastCalledWith('lightning', expect.objectContaining({ lightning: true }));
        expect(localStorage.getItem('radarLightning')).toBe('true');
        expect(button.getAttribute('aria-checked')).toBe('true');

        button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(onChange).toHaveBeenLastCalledWith('lightning', expect.objectContaining({ lightning: false }));
        button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
        expect(localStorage.getItem('radarLightning')).toBe('true');

        button.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        expect(onChange).toHaveBeenCalledTimes(3);
    });

    it('disables the LibreWXR-only controls for the RainViewer fallback', () => {
        const onChange = vi.fn();
        const settings = new LayerSettings(onChange);
        settings.applyMetadata({ provider: 'rainviewer', colorSchemes: SCHEMES });

        const arrows = document.getElementById('radarArrowsToggle');
        expect(arrows.disabled).toBe(true);
        expect(arrows.getAttribute('aria-disabled')).toBe('true');
        expect(document.getElementById('weatherAlertsToggle').disabled).toBe(false);
        expect(document.getElementById('radarColourSelect').disabled).toBe(true);

        arrows.click();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('populates colour schemes as text and keeps the stored choice', () => {
        localStorage.setItem('radarColour', '6');
        const onChange = vi.fn();
        const settings = new LayerSettings(onChange);
        settings.applyMetadata({ provider: 'librewxr', colorSchemes: SCHEMES });

        const select = document.getElementById('radarColourSelect');
        expect(select.disabled).toBe(false);
        expect([...select.options].map(o => o.textContent)).toEqual(['Rainviewer Original', 'Universal Blue', 'NEXRAD <b>']);
        expect(select.querySelector('b')).toBeNull();
        expect(select.value).toBe('6');
        expect(onChange).not.toHaveBeenCalled();

        // Same list again does not rebuild the options
        const first = select.options[0];
        settings.applyMetadata({ provider: 'librewxr', colorSchemes: SCHEMES });
        expect(select.options[0]).toBe(first);
    });

    it('falls back to the default (or first) scheme when the stored one is gone', () => {
        localStorage.setItem('radarColour', '9');
        const onChange = vi.fn();
        const settings = new LayerSettings(onChange);
        settings.applyMetadata({ provider: 'librewxr', colorSchemes: SCHEMES });
        expect(settings.get().colour).toBe(CONFIG.RADAR_DEFAULT_COLOUR);
        expect(onChange).toHaveBeenCalledWith('colour', expect.objectContaining({ colour: CONFIG.RADAR_DEFAULT_COLOUR }));

        settings.applyMetadata({ provider: 'librewxr', colorSchemes: [{ id: 11, name: 'MRMS' }] });
        expect(settings.get().colour).toBe(11);

        settings.applyMetadata({ provider: 'librewxr', colorSchemes: null });
        expect(document.getElementById('radarColourSelect').options).toHaveLength(0);
    });

    it('saves colour changes and ignores invalid values', () => {
        const onChange = vi.fn();
        const settings = new LayerSettings(onChange);
        settings.applyMetadata({ provider: 'librewxr', colorSchemes: SCHEMES });
        const select = document.getElementById('radarColourSelect');

        select.value = '1';
        select.dispatchEvent(new Event('change'));
        expect(onChange).toHaveBeenLastCalledWith('colour', expect.objectContaining({ colour: 1 }));
        expect(localStorage.getItem('radarColour')).toBe('1');

        const option = document.createElement('option');
        option.value = 'x';
        select.appendChild(option);
        select.value = 'x';
        select.dispatchEvent(new Event('change'));
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('works without the controls in the page', () => {
        document.body.innerHTML = '';
        const settings = new LayerSettings();
        settings.set('arrows', true);
        settings.applyMetadata({ provider: 'librewxr', colorSchemes: SCHEMES });
        expect(settings.get().arrows).toBe(true);
    });
});
