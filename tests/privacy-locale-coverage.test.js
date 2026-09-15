import { describe, it, expect, vi } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// PrivacyModal's constructor only reaches for elements and wires listeners, so
// a minimal document stub is enough to exercise the locale resolution logic.
vi.stubGlobal('document', {
    getElementById: vi.fn(() => null),
    addEventListener: vi.fn(),
});

const { PrivacyModal } = await import('../public/src/ui/PrivacyModal.js');
const { LANGUAGE_NAMES } = await import('../public/src/i18n/index.js');

const PRIVACY_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'privacy');

// Derive the shipped policies from disk rather than restating them here, so a
// new PRIVACY.<locale>.md is covered the moment it lands. `hu` previously
// shipped a translation that resolvePrivacyLocale() did not list as supported,
// silently serving Hungarian users the English policy.
const shippedLocales = readdirSync(PRIVACY_DIR)
    .map((file) => /^PRIVACY\.(.+)\.md$/.exec(file))
    .filter(Boolean)
    .map((match) => match[1])
    .sort();

describe('privacy policy locale coverage', () => {
    const modal = new PrivacyModal();

    it('finds the shipped privacy policy translations', () => {
        expect(shippedLocales.length).toBeGreaterThan(0);
    });

    it.each(shippedLocales)('serves the %s translation to its own speakers', (locale) => {
        expect(modal.resolvePrivacyLocale(locale)).toBe(locale);
    });

    it.each(Object.keys(LANGUAGE_NAMES))('resolves the %s UI language to a policy that exists', (locale) => {
        const resolved = modal.resolvePrivacyLocale(locale);
        expect(existsSync(join(PRIVACY_DIR, `PRIVACY.${resolved}.md`))).toBe(true);
    });

    // A translation that quietly drops a paragraph still renders fine and still
    // passes every other guard here -- de, fr, it and pt-BR had all lost the
    // "this data stays on your device" sentence that way. Pin each translation
    // to the English source's shape instead: same headings in the same order,
    // and the same block count plus the one disclaimer.
    describe('structural parity with the English source', () => {
        const SOURCE = 'en-NZ';

        const blocksOf = (locale) =>
            readFileSync(join(PRIVACY_DIR, `PRIVACY.${locale}.md`), 'utf8')
                .trim()
                .split('\n\n');

        const headingShape = (blocks) =>
            blocks.filter((b) => b.startsWith('#')).map((b) => b.match(/^#+/)[0]);

        const sourceBlocks = blocksOf(SOURCE);
        const others = shippedLocales.filter((locale) => locale !== SOURCE);

        it.each(others)('%s has the same heading structure as the source', (locale) => {
            expect(headingShape(blocksOf(locale))).toEqual(headingShape(sourceBlocks));
        });

        it.each(others)('%s has the same block count as the source', (locale) => {
            const isEnglish = locale.startsWith('en-');
            // Translations carry one extra block: the machine-translation notice.
            const expected = sourceBlocks.length + (isEnglish ? 0 : 1);
            expect(blocksOf(locale).length).toBe(expected);
        });
    });

    // Every translation is machine-generated, so each must say so above its
    // first section. Asserted structurally rather than by matching the wording
    // in ten languages: the disclaimer is the bold paragraph sitting between
    // the "last updated" line and the first heading, which English has not got.
    describe('machine-translation disclaimer', () => {
        const isEnglish = (locale) => locale === 'en' || locale.startsWith('en-');

        const blocksOf = (locale) =>
            readFileSync(join(PRIVACY_DIR, `PRIVACY.${locale}.md`), 'utf8')
                .trim()
                .split('\n\n');

        const translated = shippedLocales.filter((locale) => !isEnglish(locale));
        const english = shippedLocales.filter(isEnglish);

        it('ships both translated and English policies to compare', () => {
            expect(translated.length).toBeGreaterThan(0);
            expect(english.length).toBeGreaterThan(0);
        });

        it.each(translated)('%s declares itself machine-translated', (locale) => {
            const [title, updated, disclaimer] = blocksOf(locale);
            expect(title.startsWith('# ')).toBe(true);
            expect(updated.startsWith('**')).toBe(true);
            expect(disclaimer.startsWith('**')).toBe(true);
            expect(disclaimer).not.toContain('\n');
        });

        it.each(english)('%s carries no disclaimer, being the source language', (locale) => {
            expect(blocksOf(locale)[2].startsWith('##')).toBe(true);
        });
    });

    it('never resolves to a policy that is missing from disk', () => {
        const candidates = [...shippedLocales, ...Object.keys(LANGUAGE_NAMES),
            'en-AU', 'pt-PT', 'zh-TW', 'fr-CA', 'de-AT', 'hu-HU', 'xx-YY', '', null, undefined];

        for (const candidate of candidates) {
            const resolved = modal.resolvePrivacyLocale(candidate);
            expect(existsSync(join(PRIVACY_DIR, `PRIVACY.${resolved}.md`))).toBe(true);
        }
    });
});
