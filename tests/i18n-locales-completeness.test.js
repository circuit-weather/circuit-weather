import { describe, expect, it } from 'vitest';
import { en } from '../public/src/i18n/locales/en.js';
import { de } from '../public/src/i18n/locales/de.js';
import { es } from '../public/src/i18n/locales/es.js';
import { fr } from '../public/src/i18n/locales/fr.js';
import { it } from '../public/src/i18n/locales/it.js';
import { ja } from '../public/src/i18n/locales/ja.js';
import { enUS } from '../public/src/i18n/locales/en-US.js';
import { ptBR } from '../public/src/i18n/locales/pt-BR.js';
import { zhCN } from '../public/src/i18n/locales/zh-CN.js';

const locales = {
    de,
    'en-US': enUS,
    es,
    fr,
    it,
    ja,
    'pt-BR': ptBR,
    'zh-CN': zhCN,
};

function collectLeafKeys(object, prefix = '') {
    const entries = [];
    Object.entries(object).forEach(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            entries.push(...collectLeafKeys(value, path));
        } else {
            entries.push(path);
        }
    });
    return entries;
}

function getValueByPath(object, path) {
    return path.split('.').reduce((value, key) => (value ? value[key] : undefined), object);
}

describe('i18n locale completeness', () => {
    const englishKeys = collectLeafKeys(en);

    it('keeps all translated locales aligned to english key coverage', () => {
        Object.entries(locales).forEach(([locale, dictionary]) => {
            englishKeys.forEach((key) => {
                const value = getValueByPath(dictionary, key);
                expect(value, `Missing key "${key}" in locale "${locale}"`).toBeDefined();
            });
        });
    });
});
