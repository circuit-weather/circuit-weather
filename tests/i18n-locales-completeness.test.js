import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../public/src/i18n/index.js';

// Derive the set of shipped locales directly from the i18n registry so this
// guard can never silently skip a locale again (it previously omitted `hu`,
// leaving Hungarian translations unguarded). `en` is the source of truth and
// is compared against, not validated against itself.
const { en, ...translatedLocales } = TRANSLATIONS;

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

// Extract the {{placeholder}} tokens from a translation string, sorted for
// order-independent comparison. Translators must preserve every interpolation
// token or the rendered UI will be missing data (e.g. a temperature value).
function placeholders(value) {
    return [...String(value).matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();
}

const englishKeys = collectLeafKeys(en);
const localeEntries = Object.entries(translatedLocales);

describe('i18n locale completeness', () => {
    it('ships more than just English', () => {
        // Guards against the registry (or this test) accidentally collapsing to
        // a single locale and rendering the parity checks vacuous.
        expect(localeEntries.length).toBeGreaterThan(1);
    });

    it.each(localeEntries)('locale "%s" defines every English key', (locale, dictionary) => {
        englishKeys.forEach((key) => {
            const value = getValueByPath(dictionary, key);
            expect(value, `Missing key "${key}" in locale "${locale}"`).toBeDefined();
        });
    });

    it.each(localeEntries)('locale "%s" has no empty string translations', (locale, dictionary) => {
        englishKeys.forEach((key) => {
            const value = getValueByPath(dictionary, key);
            if (typeof value === 'string') {
                expect(value.trim(), `Empty translation for "${key}" in locale "${locale}"`).not.toBe('');
            }
        });
    });

    it.each(localeEntries)('locale "%s" preserves every interpolation placeholder', (locale, dictionary) => {
        englishKeys.forEach((key) => {
            const value = getValueByPath(dictionary, key);
            if (typeof value !== 'string') return;
            const expected = placeholders(getValueByPath(en, key));
            const actual = placeholders(value);
            expect(actual, `Placeholder mismatch for "${key}" in locale "${locale}"`).toEqual(expected);
        });
    });

    it.each(localeEntries)('locale "%s" has no orphan keys absent from English', (locale, dictionary) => {
        const localeKeys = collectLeafKeys(dictionary);
        const orphans = localeKeys.filter((key) => !englishKeys.includes(key));
        expect(orphans, `Orphan keys in locale "${locale}" not present in English`).toEqual([]);
    });
});
