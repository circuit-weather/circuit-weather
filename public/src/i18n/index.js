import { getUserLocale } from '../utils/locale.js';
import { SafeStorage } from '../utils/storage.js';
import { de } from './locales/de.js';
import { en } from './locales/en.js';
import { enGB } from './locales/en-GB.js';
import { enNZ } from './locales/en-NZ.js';
import { enUS } from './locales/en-US.js';
import { es } from './locales/es.js';
import { fr } from './locales/fr.js';
import { hu } from './locales/hu.js';
import { it } from './locales/it.js';
import { ja } from './locales/ja.js';
import { ptBR } from './locales/pt-BR.js';
import { zhCN } from './locales/zh-CN.js';

// TODO: Localisation roadmap (see AGENTS.md) — keep translations complete and
// consistent against en.js as the source of truth, and add widely used languages
// over time. The i18n-locales-completeness test guards key parity; prioritise
// quality and consistency when extending coverage.
const TRANSLATIONS = {
    en,
    'en-GB': enGB,
    'en-NZ': enNZ,
    'en-US': enUS,
    es,
    fr,
    de,
    hu,
    it,
    ja,
    'pt-BR': ptBR,
    'zh-CN': zhCN,
};

export const LANGUAGE_NAMES = {
    'en-NZ': 'English (NZ)',
    'en-GB': 'English (UK)',
    'en-US': 'English (US)',
    'de': 'Deutsch',
    'es': 'Español',
    'fr': 'Français',
    'hu': 'Magyar',
    'it': 'Italiano',
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

    if (TRANSLATIONS[localeString]) return localeString;

    if (TRANSLATIONS[base]) return base;
    if (LOCALE_ALIASES[base]) return LOCALE_ALIASES[base];
    return 'en-NZ';
}

class I18n {
    constructor() {
        this.locale = 'en-NZ';
    }

    init(locale = getUserLocale()) {
        const stored = SafeStorage.getItem('language');
        this.locale = normalise(stored || locale);
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.lang = this.locale;
        }
    }

    setLocale(locale) {
        this.locale = normalise(locale);
        SafeStorage.setItem('language', this.locale);
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.lang = this.locale;
            this.apply();
            document.dispatchEvent(new CustomEvent('i18n:change', { detail: { locale: this.locale } }));
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

        root.querySelectorAll('[data-i18n]').forEach((element) => {
            const key = element.getAttribute('data-i18n');
            if (!key) return;
            element.textContent = this.t(key);
        });

        root.querySelectorAll('[data-i18n-attr]').forEach((element) => {
            const rule = element.getAttribute('data-i18n-attr');
            if (!rule) return;

            const mappings = rule.split(',').map((entry) => entry.trim()).filter(Boolean);
            mappings.forEach((mapping) => {
                const [attr, key] = mapping.split(':').map((part) => part.trim());
                if (!attr || !key) return;
                element.setAttribute(attr, this.t(key));
            });
        });
    }
}

export const i18n = new I18n();
