/**
 * @vitest-environment jsdom
 *
 * Real-DOM coverage for PrivacyModal.parseMarkdown.
 *
 * The suite in privacy-modal.test.js stubs `document` wholesale, which is fine
 * for asserting call patterns but cannot show what the browser actually builds.
 * Because parseMarkdown is the one place untrusted-looking markdown becomes
 * nodes, the security properties are proven here against a genuine DOM.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PrivacyModal } from '../public/src/ui/PrivacyModal.js';

// parseMarkdown only touches `this` for i18n, so a bare prototype instance is
// enough and avoids constructing the whole modal.
const render = (md) => {
    const modal = Object.create(PrivacyModal.prototype);
    const out = modal.parseMarkdown(md);
    const host = document.createElement('div');
    host.appendChild(out);
    return host;
};

describe('PrivacyModal.parseMarkdown (real DOM)', () => {
    describe('injection resistance', () => {
        it('renders a script tag as inert text, not an element', () => {
            const host = render('<script>alert("xss")</script>');
            expect(host.querySelectorAll('script')).toHaveLength(0);
            expect(host.textContent).toContain('<script>');
        });

        it('does not build an img element from an onerror payload', () => {
            const host = render('<img src=x onerror=alert(1)>');
            expect(host.querySelectorAll('img')).toHaveLength(0);
            expect(host.querySelector('[onerror]')).toBeNull();
        });

        it('strips a javascript: link target', () => {
            const host = render('[click](javascript:alert(1))');
            const href = host.querySelector('a').getAttribute('href');
            expect(href).not.toMatch(/^javascript:/i);
        });

        it('strips a data: link target', () => {
            const host = render('[click](data:text/html,<script>alert(1)</script>)');
            const anchor = host.querySelector('a');
            if (anchor) {
                expect(anchor.getAttribute('href')).not.toMatch(/^data:/i);
            }
        });

        it('cannot break out of the href into a new attribute', () => {
            const host = render('[x](https://example.com/&quot;onmouseover=&quot;alert=1)');
            const anchor = host.querySelector('a');
            expect(anchor.getAttribute('onmouseover')).toBeNull();
            expect(anchor.attributes.length).toBeLessThanOrEqual(5);
        });

        it('leaves a legitimate https URL untouched', () => {
            const host = render('[ok](https://example.com/a?b=1&c=2)');
            expect(host.querySelector('a').getAttribute('href')).toBe('https://example.com/a?b=1&c=2');
        });
    });

    describe('rendering the shipped privacy policy', () => {
        let host;

        beforeAll(() => {
            const md = fs.readFileSync(
                path.join(process.cwd(), 'public/privacy/PRIVACY.en-GB.md'),
                'utf8'
            );
            host = render(md);
        });

        it('drops the h1, which the modal header already shows', () => {
            expect(host.querySelectorAll('h1')).toHaveLength(0);
        });

        it('builds the expected block structure', () => {
            expect(host.querySelectorAll('h2').length).toBeGreaterThan(3);
            expect(host.querySelectorAll('h3').length).toBeGreaterThan(1);
            expect(host.querySelectorAll('ul li').length).toBeGreaterThan(5);
            expect(host.querySelectorAll('a[href^="https://"]').length).toBeGreaterThan(3);
        });

        it('consumes every piece of markdown syntax', () => {
            const text = host.textContent;
            expect(text).not.toContain('**');
            expect(text).not.toMatch(/\]\(http/);
            expect(text).not.toMatch(/^##/m);
        });

        it('does not spill body copy into a heading', () => {
            for (const heading of host.querySelectorAll('h2, h3')) {
                expect(heading.textContent.trim()).not.toBe('');
                expect(heading.textContent).not.toContain('\n');
            }
        });

        it('marks every link as a safe external link', () => {
            const anchors = host.querySelectorAll('a');
            expect(anchors.length).toBeGreaterThan(0);
            for (const anchor of anchors) {
                expect(anchor.getAttribute('rel')).toBe('noopener noreferrer');
                expect(anchor.getAttribute('target')).toBe('_blank');
            }
        });
    });
});
