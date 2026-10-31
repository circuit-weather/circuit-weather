import { getUserLocale } from '../utils/locale.js';
import { SafeStorage } from '../utils/storage.js';
import { en } from './locales/en.js';
import { enGB } from './locales/en-GB.js';
import { enNZ } from './locales/en-NZ.js';
import { enUS } from './locales/en-US.js';

// English ships with the page: it is the default and every other locale's
// fallback (the en-* variants are a few lines each on top of `en`). Other
// languages are fetched only when chosen, so most visitors never download them.
export const LOCALE_LOADERS = {
    de: () => import('./locales/de.js').then(m => m.de),
    es: () => import('./locales/es.js').then(m => m.es),
    fr: () => import('./locales/fr.js').then(m => m.fr),
    hu: () => import('./locales/hu.js').then(m => m.hu),
    it: () => import('./locales/it.js').then(m => m.it),
    ja: () => import('./locales/ja.js').then(m => m.ja),
    ko: () => import('./locales/ko.js').then(m => m.ko),
    nl: () => import('./locales/nl.js').then(m => m.nl),
    'pt-BR': () => import('./locales/pt-BR.js').then(m => m.ptBR),
    'zh-CN': () => import('./locales/zh-CN.js').then(m => m.zhCN),
};

// Locales loaded so far
const TRANSLATIONS = {
    en,
    'en-GB': enGB,
    'en-NZ': enNZ,
    'en-US': enUS,
};

/**
 * Every shipped locale, keyed by code. Used by
 * tests/i18n-locales-completeness.test.js, which checks every locale against
 * `en`; building it from LOCALE_LOADERS means a newly added language can't be
 * skipped by that guard. Intentionally exported despite having no other
 * importer: do not sweep it.
 */
export async function loadAllTranslations() {
    await Promise.all(Object.keys(LOCALE_LOADERS).map(loadLocale));
    return { ...TRANSLATIONS };
}

/**
 * Loads a locale's strings if they aren't loaded yet. English is always loaded.
 * @param {string} locale - A normalised locale code
 */
export async function loadLocale(locale) {
    if (!TRANSLATIONS[locale] && LOCALE_LOADERS[locale]) {
        TRANSLATIONS[locale] = await LOCALE_LOADERS[locale]();
    }
    return TRANSLATIONS[locale];
}

function isSupported(locale) {
    return Boolean(TRANSLATIONS[locale] || LOCALE_LOADERS[locale]);
}

export const LANGUAGE_NAMES = {
    'en-NZ': 'English (NZ)',
    'en-GB': 'English (UK)',
    'en-US': 'English (US)',
    'de': 'Deutsch',
    'es': 'Español',
    'fr': 'Français',
    'hu': 'Magyar',
    'it': 'Italiano',
    'ko': '한국어',
    'nl': 'Nederlands',
    'pt-BR': 'Português (BR)',
    'zh-CN': '简体中文',
    'ja': '日本語',
};

const LOCALE_ALIASES = {
    pt: 'pt-BR',
    zh: 'zh-CN',
};

function getByPath(object, path) {
    return path.split('.').reduce((value, part) => (value && value[part] !== undefined ? value[part] : undefined), object);
}

function interpolate(template, params = {}) {
    return String(template).replace(/{{\s*(\w+)\s*}}/g, (_, key) => (params[key] !== undefined ? String(params[key]) : ''));
}

function normalise(locale) {
    if (!locale) return 'en-NZ';

    const rawLocale = String(locale).replace('_', '-');
    let localeString = rawLocale;
    try {
        localeString = new Intl.Locale(rawLocale).toString();
    } catch {
        localeString = 'en-NZ';
    }

    const base = localeString.split('-')[0];
    if (base === 'en') {
        if (localeString.startsWith('en-GB')) return 'en-GB';
        if (localeString.startsWith('en-US')) return 'en-US'
        return 'en-NZ';
    }

    if (isSupported(localeString)) return localeString;

    if (isSupported(base)) return base;
    if (LOCALE_ALIASES[base]) return LOCALE_ALIASES[base];
    return 'en-NZ';
}

class I18n {
    constructor() {
        this.locale = 'en-NZ';
    }

    /**
     * Picks the locale and loads its strings. Strings fall back to English
     * until they arrive, so await this before the first apply().
     * @returns {Promise<void>}
     */
    async init(locale = getUserLocale()) {
        const stored = SafeStorage.getItem('language');
        this.locale = normalise(stored || locale);
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.lang = this.locale;
        }
        await this.load(this.locale);
    }

    /**
     * Switches language, loading it first so the page changes in one step.
     * @returns {Promise<void>}
     */
    async setLocale(locale) {
        const next = normalise(locale);
        await this.load(next);
        this.locale = next;
        SafeStorage.setItem('language', this.locale);
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.lang = this.locale;
            this.apply();
            document.dispatchEvent(new CustomEvent('i18n:change', { detail: { locale: this.locale } }));
        }
    }

    async load(locale) {
        try {
            await loadLocale(locale);
        } catch (error) {
            // Offline or blocked: English strings stand in until it loads
            console.error(`Failed to load the ${locale} translations:`, error);
        }
    }

    t(key, params = {}) {
        const current = getByPath(TRANSLATIONS[this.locale], key);
        const fallback = getByPath(TRANSLATIONS['en-NZ'], key) ?? getByPath(TRANSLATIONS.en, key);
        const value = current !== undefined ? current : fallback;
        if (value === undefined) return key;
        return interpolate(value, params);
    }

    apply(root = document) {
        if (!root || typeof root.querySelectorAll !== 'function') return;

        const elements = root.querySelectorAll('[data-i18n], [data-i18n-attr]');
        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];

            const key = element.getAttribute('data-i18n');
            if (key) {
                element.textContent = this.t(key);
            }

            const rule = element.getAttribute('data-i18n-attr');
            if (rule) {
                const mappings = rule.split(',');
                for (let j = 0; j < mappings.length; j++) {
                    const entry = mappings[j].trim();
                    if (!entry) continue;

                    const colonIdx = entry.indexOf(':');
                    if (colonIdx <= 0) continue;

                    const attr = entry.slice(0, colonIdx).trim();
                    const attrKey = entry.slice(colonIdx + 1).trim();
                    if (attr && attrKey) {
                        element.setAttribute(attr, this.t(attrKey));
                    }
                }
            }
        }
    }
}

export const i18n = new I18n();
