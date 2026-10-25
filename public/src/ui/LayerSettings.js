import { CONFIG } from '../config.js';
import { SafeStorage } from '../utils/storage.js';

/**
 * Sidebar switches for the radar layers: storm motion arrows, storm cells,
 * lightning, satellite clouds and weather warnings, plus the radar colour
 * scheme. Choices persist in localStorage.
 *
 * Only LibreWXR supports the radar extras; while the RainViewer fallback is
 * active they are disabled (weather warnings come from a separate endpoint and
 * stay available).
 */
const SWITCHES = Object.freeze({
    arrows: { id: 'radarArrowsToggle', storageKey: 'radarArrows', default: false, needsLibreWxr: true },
    cells: { id: 'radarCellsToggle', storageKey: 'radarCells', default: false, needsLibreWxr: true },
    lightning: { id: 'radarLightningToggle', storageKey: 'radarLightning', default: false, needsLibreWxr: true },
    satellite: { id: 'satelliteToggle', storageKey: 'radarSatellite', default: false, needsLibreWxr: true },
    alerts: { id: 'weatherAlertsToggle', storageKey: 'weatherAlerts', default: true, needsLibreWxr: false },
});

const COLOUR_STORAGE_KEY = 'radarColour';

export class LayerSettings {
    /**
     * @param {Function} onChange - Called with (key, settings) after a change
     */
    constructor(onChange = () => {}) {
        this.onChange = onChange;
        this.settings = {};
        this.buttons = {};

        for (const [key, config] of Object.entries(SWITCHES)) {
            const stored = SafeStorage.getItem(config.storageKey);
            // SEC: Only accept the two values we write
            this.settings[key] = stored === 'true' ? true : stored === 'false' ? false : config.default;
            this.bindSwitch(key, document.getElementById(config.id));
        }

        const storedColour = Number.parseInt(SafeStorage.getItem(COLOUR_STORAGE_KEY), 10);
        this.settings.colour = Number.isInteger(storedColour) ? storedColour : CONFIG.RADAR_DEFAULT_COLOUR;

        this.colourSelect = document.getElementById('radarColourSelect');
        this.colourSchemeIds = [];
        if (this.colourSelect) {
            this.colourSelect.addEventListener('change', (e) => {
                const colour = Number.parseInt(e.target.value, 10);
                if (!Number.isInteger(colour)) return;
                this.settings.colour = colour;
                SafeStorage.setItem(COLOUR_STORAGE_KEY, String(colour));
                this.onChange('colour', this.get());
            });
        }
    }

    bindSwitch(key, button) {
        if (!button) return;
        this.buttons[key] = button;
        button.setAttribute('aria-checked', String(this.settings[key]));
        const toggle = () => {
            if (button.disabled) return;
            this.set(key, !this.settings[key]);
        };
        button.addEventListener('click', toggle);
        // Palette A11y: Ensure keyboard users can activate the switch
        button.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                toggle();
            }
        });
    }

    set(key, value) {
        this.settings[key] = value;
        SafeStorage.setItem(SWITCHES[key].storageKey, value ? 'true' : 'false');
        if (this.buttons[key]) this.buttons[key].setAttribute('aria-checked', String(value));
        this.onChange(key, this.get());
    }

    get() {
        return { ...this.settings };
    }

    /** Radar tile options (see RadarFrames.buildTileUrl) */
    getTileOptions() {
        const { colour, arrows, cells, lightning } = this.settings;
        return { colour, arrows, cells, lightning };
    }

    /**
     * Match the controls to the radar provider's capabilities.
     * @param {{ provider: string|null, colorSchemes: Array<{id: number, name: string}> }} metadata
     */
    applyMetadata({ provider, colorSchemes }) {
        const supported = provider === 'librewxr';
        for (const [key, config] of Object.entries(SWITCHES)) {
            const button = this.buttons[key];
            if (button && config.needsLibreWxr) {
                button.disabled = !supported;
                button.setAttribute('aria-disabled', String(!supported));
            }
        }

        if (!this.colourSelect) return;
        const schemes = supported && Array.isArray(colorSchemes) ? colorSchemes : [];
        this.populateColourSchemes(schemes);
        this.colourSelect.disabled = schemes.length === 0;
        this.colourSelect.setAttribute('aria-disabled', String(schemes.length === 0));
    }

    populateColourSchemes(schemes) {
        const ids = schemes.map(scheme => scheme.id);
        if (ids.join() === this.colourSchemeIds.join()) return;
        this.colourSchemeIds = ids;

        this.colourSelect.textContent = '';
        for (const scheme of schemes) {
            const option = document.createElement('option');
            option.value = String(scheme.id);
            // Scheme names are proper nouns from the provider; set as text, never HTML
            option.textContent = scheme.name;
            this.colourSelect.appendChild(option);
        }

        // Fall back to the default if the stored scheme is no longer offered
        if (schemes.length && !ids.includes(this.settings.colour)) {
            this.settings.colour = ids.includes(CONFIG.RADAR_DEFAULT_COLOUR) ? CONFIG.RADAR_DEFAULT_COLOUR : ids[0];
            this.onChange('colour', this.get());
        }
        this.colourSelect.value = String(this.settings.colour);
    }
}
