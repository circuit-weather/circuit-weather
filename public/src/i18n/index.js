import { getUserLocale } from '../utils/locale.js';
import { de } from './locales/de.js';
import { en } from './locales/en.js';
import { enUS } from './locales/en-US.js';
import { es } from './locales/es.js';
import { fr } from './locales/fr.js';
import { it } from './locales/it.js';
import { ja } from './locales/ja.js';
import { ptBR } from './locales/pt-BR.js';
import { zhCN } from './locales/zh-CN.js';

const TRANSLATIONS = {
    en,
    'en-US': enUS,
    es,
    fr,
    de,
    it,
    ja,
    'pt-BR': ptBR,
    'zh-CN': zhCN,
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
    if (!locale) return 'en';

    const rawLocale = String(locale).replace('_', '-');
    let localeString = rawLocale;
    try {
        localeString = new Intl.Locale(rawLocale).toString();
    } catch {
        localeString = rawLocale;
    }

    if (TRANSLATIONS[localeString]) return localeString;

    const base = localeString.split('-')[0];
    if (TRANSLATIONS[base]) return base;
    if (LOCALE_ALIASES[base]) return LOCALE_ALIASES[base];
    return 'en';
}

class I18n {
    constructor() {
        this.locale = 'en';
    }

    init(locale = getUserLocale()) {
        this.locale = normalise(locale);
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.lang = this.locale;
        }
    }

    setLocale(locale) {
        this.locale = normalise(locale);
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.lang = this.locale;
            this.apply();
            document.dispatchEvent(new CustomEvent('i18n:change', { detail: { locale: this.locale } }));
        }
    }

    t(key, params = {}) {
        const current = getByPath(TRANSLATIONS[this.locale], key);
        const fallback = getByPath(TRANSLATIONS.en, key);
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
