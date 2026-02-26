import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Global Mocks ---
const createMockElement = (id) => ({
    id,
    addEventListener: vi.fn(),
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn().mockReturnValue(false),
    },
    style: {},
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    textContent: '',
    innerHTML: '',
    focus: vi.fn(),
    querySelectorAll: vi.fn(() => []),
});

vi.stubGlobal('document', {
    getElementById: vi.fn((id) => createMockElement(id)),
    addEventListener: vi.fn(),
    activeElement: { tagName: 'BODY' },
    body: { style: {} },
});

const { PrivacyModal } = await import('../public/src/ui/PrivacyModal.js');

describe('PrivacyModal', () => {
    let modal;

    beforeEach(() => {
        vi.clearAllMocks();
        modal = new PrivacyModal();
    });

    // ---------------------------------------------------------------
    // sanitizeUrl is a closure inside parseMarkdown, so we test it
    // indirectly by passing markdown containing links and inspecting
    // the href attribute in the rendered HTML.
    // ---------------------------------------------------------------
    describe('sanitizeUrl (via parseMarkdown)', () => {
        const extractHref = (html) => {
            const match = html.match(/href="([^"]*)"/);
            return match ? match[1] : null;
        };

        it('allows https URLs', () => {
            const md = '[link](https://example.com)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('https://example.com');
        });

        it('allows http URLs', () => {
            const md = '[link](http://example.com)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('http://example.com');
        });

        it('allows mailto URLs', () => {
            const md = '[email](mailto:user@example.com)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('mailto:user@example.com');
        });

        it('allows relative URLs (no scheme)', () => {
            const md = '[page](/about)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('/about');
        });

        it('blocks javascript: URLs', () => {
            const md = '[click](javascript:alert(1))';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('#unsafe-url');
        });

        it('blocks vbscript: URLs', () => {
            const md = '[click](vbscript:MsgBox)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('#unsafe-url');
        });

        it('blocks data: URLs', () => {
            const md = '[click](data:text/html,<h1>XSS</h1>)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('#unsafe-url');
        });

        it('blocks file: URLs', () => {
            const md = '[click](file:///etc/passwd)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('#unsafe-url');
        });

        it('blocks blob: URLs', () => {
            const md = '[click](blob:http://example.com/uuid)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('#unsafe-url');
        });

        it('blocks whitespace bypass (java\\nscript:)', () => {
            const md = '[click](java\nscript:alert(1))';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('#unsafe-url');
        });

        it('blocks control character bypass (java\\x00script:)', () => {
            const md = '[click](java\x00script:alert(1))';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('#unsafe-url');
        });

        it('handles case-insensitive scheme detection', () => {
            const md = '[click](JAVASCRIPT:alert(1))';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('#unsafe-url');
        });

        it('allows HTTPS in uppercase', () => {
            const md = '[link](HTTPS://EXAMPLE.COM)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('HTTPS://EXAMPLE.COM');
        });
    });

    // ---------------------------------------------------------------
    // parseMarkdown rendering tests
    // ---------------------------------------------------------------
    describe('parseMarkdown', () => {
        it('removes the main "# Privacy Policy" heading', () => {
            const md = '# Privacy Policy\n\nSome content.';
            const html = modal.parseMarkdown(md);
            expect(html).not.toContain('Privacy Policy');
            expect(html).toContain('Some content.');
        });

        it('converts ## headings to <h2>', () => {
            const md = '## Section Title';
            const html = modal.parseMarkdown(md);
            expect(html).toContain('<h2>Section Title</h2>');
        });

        it('converts ### headings to <h3>', () => {
            const md = '### Sub-Section';
            const html = modal.parseMarkdown(md);
            expect(html).toContain('<h3>Sub-Section</h3>');
        });

        it('converts **bold** to <strong>', () => {
            const md = 'This is **bold** text.';
            const html = modal.parseMarkdown(md);
            expect(html).toContain('<strong>bold</strong>');
        });

        it('converts list items to <li> wrapped in <ul>', () => {
            const md = '- Item 1\n- Item 2';
            const html = modal.parseMarkdown(md);
            expect(html).toContain('<li>Item 1</li>');
            expect(html).toContain('<li>Item 2</li>');
            expect(html).toContain('<ul>');
            expect(html).toContain('</ul>');
        });

        it('escapes HTML to prevent XSS', () => {
            const md = '<script>alert("xss")</script>';
            const html = modal.parseMarkdown(md);
            expect(html).not.toContain('<script>');
            expect(html).toContain('&lt;script&gt;');
        });

        it('wraps plain text blocks in <p> tags', () => {
            const md = 'Just a paragraph.';
            const html = modal.parseMarkdown(md);
            expect(html).toContain('<p>');
            expect(html).toContain('Just a paragraph.');
        });

        it('renders links with target="_blank" and rel="noopener noreferrer"', () => {
            const md = '[Example](https://example.com)';
            const html = modal.parseMarkdown(md);
            expect(html).toContain('target="_blank"');
            expect(html).toContain('rel="noopener noreferrer"');
        });

        it('returns empty string for empty input', () => {
            const html = modal.parseMarkdown('');
            expect(html).toBe('');
        });
    });
});
