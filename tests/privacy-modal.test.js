import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Global Mocks ---
const createMockElement = (id) => {
    const el = {
        id,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
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
        focus: vi.fn(function() {
             // Correctly update activeElement when focus is called
            mockActiveElement = this;
        }),
        querySelectorAll: vi.fn(() => []),
        offsetParent: {},
    };
    return el;
};

// We need a way to control activeElement for tests
let mockActiveElement = { tagName: 'BODY' };

vi.stubGlobal('document', {
    getElementById: vi.fn((id) => createMockElement(id)),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    get activeElement() { return mockActiveElement; },
    set activeElement(el) { mockActiveElement = el; },
    body: { style: {} },
});

vi.stubGlobal('fetch', vi.fn());

// Mock DOMParser for tests since it's not natively available in the Node.js test environment
class MockDOMParser {
    parseFromString(str, type) {
        // Simple mock implementation to handle entity decoding for our specific test cases
        let decoded = str;
        // Run a few times to handle nested encoded strings like `&amp;colon;` becoming `&colon;` then `:`
        for (let i = 0; i < 3; i++) {
            decoded = decoded
                .replace(/&amp;/gi, '&')
                .replace(/&colon;/gi, ':')
                .replace(/&#58;/gi, ':')
                .replace(/&#x3a;/gi, ':')
                .replace(/&quot;/gi, '"');
        }

        return {
            documentElement: {
                textContent: decoded
            }
        };
    }
}
vi.stubGlobal('DOMParser', MockDOMParser);

const { PrivacyModal } = await import('../public/src/ui/PrivacyModal.js');

describe('PrivacyModal', () => {
    let modal;

    beforeEach(() => {
        vi.clearAllMocks();
        mockActiveElement = { tagName: 'BODY', focus: vi.fn() };
        // Reset fetch to a default success
        global.fetch.mockResolvedValue({
            ok: true,
            text: async () => 'Privacy Policy Content',
        });
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

        it('blocks HTML entity encoded scheme bypasses (&colon;)', () => {
            const md = '[click](javascript&colon;alert(1))';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('#unsafe-url');
        });

        it('blocks HTML entity encoded scheme bypasses (&#58;)', () => {
            const md = '[click](javascript&#58;alert(1))';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('#unsafe-url');
        });

        it('blocks HTML entity encoded scheme bypasses (&#x3a;)', () => {
            const md = '[click](javascript&#x3a;alert(1))';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('#unsafe-url');
        });

        it('allows HTTPS in uppercase', () => {
            const md = '[link](HTTPS://EXAMPLE.COM)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('HTTPS://EXAMPLE.COM');
        });

        it('re-escapes entities that decode to quotes to prevent attribute breakout', () => {
            const md = '[link](https://example.com/&quot;onmouseover=&quot;alert=1)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('https://example.com/&quot;onmouseover=&quot;alert=1');
        });

        it('falls back to original string if DOMParser fails', () => {
            // Temporarily mock DOMParser to throw an error
            const originalDOMParser = global.DOMParser;
            class ErrorDOMParser {
                parseFromString() {
                    throw new Error('Simulated DOMParser error');
                }
            }
            global.DOMParser = ErrorDOMParser;

            const md = '[link](https://example.com/safe)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('https://example.com/safe');

            // Restore original mock
            global.DOMParser = originalDOMParser;
        });

        it('handles DOMParser returning null doc', () => {
            const originalDOMParser = global.DOMParser;
            class NullDocDOMParser {
                parseFromString() {
                    return null;
                }
            }
            global.DOMParser = NullDocDOMParser;

            const md = '[link](https://example.com/safe)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('https://example.com/safe');

            // Restore original mock
            global.DOMParser = originalDOMParser;
        });

        it('handles DOMParser returning doc without documentElement', () => {
            const originalDOMParser = global.DOMParser;
            class NullDocDOMParser {
                parseFromString() {
                    return {};
                }
            }
            global.DOMParser = NullDocDOMParser;

            const md = '[link](https://example.com/safe)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('https://example.com/safe');

            // Restore original mock
            global.DOMParser = originalDOMParser;
        });

        it('handles DOMParser missing documentElement textContent', () => {
            const originalDOMParser = global.DOMParser;
            class NoTextContentDOMParser {
                parseFromString() {
                    return { documentElement: {} };
                }
            }
            global.DOMParser = NoTextContentDOMParser;

            const md = '[link](https://example.com/safe)';
            const html = modal.parseMarkdown(md);
            expect(extractHref(html)).toBe('https://example.com/safe');

            // Restore original mock
            global.DOMParser = originalDOMParser;
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


        it('returns block unchanged if it starts with < but not h or ul', () => {
            const md = '**bold**';
            const html = modal.parseMarkdown(md);
            expect(html).toBe('<strong>bold</strong>');
        });

        it('returns empty string for empty input', () => {
            const html = modal.parseMarkdown('');
            expect(html).toBe('');
        });
    });

    // ---------------------------------------------------------------
    // Interaction & Logic Tests
    // ---------------------------------------------------------------
    describe('Interaction Logic', () => {
        it('binds events on initialization', () => {
            // Check that event listeners were attached to key elements
            expect(modal.privacyLink.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
            expect(modal.closeBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
            expect(modal.backdrop.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
            expect(document.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
        });




        it('triggers open when privacy link is clicked', () => {
            const openSpy = vi.spyOn(modal, 'open').mockImplementation(() => {});
            const clickHandler = modal.privacyLink.addEventListener.mock.calls.find(call => call[0] === 'click')[1];
            clickHandler({ preventDefault: vi.fn() });
            expect(openSpy).toHaveBeenCalled();
        });



        it('triggers open when privacy link is activated via keyboard (Space)', () => {
            const openSpy = vi.spyOn(modal, 'open').mockImplementation(() => {});
            const keydownHandler = modal.privacyLink.addEventListener.mock.calls.find(call => call[0] === 'keydown')[1];

            const event = { key: ' ', preventDefault: vi.fn() };
            keydownHandler(event);

            expect(event.preventDefault).toHaveBeenCalled();
            expect(openSpy).toHaveBeenCalled();
        });

        it('triggers open when privacy link is activated via keyboard (Spacebar)', () => {
            const openSpy = vi.spyOn(modal, 'open').mockImplementation(() => {});
            const keydownHandler = modal.privacyLink.addEventListener.mock.calls.find(call => call[0] === 'keydown')[1];

            const event = { key: 'Spacebar', preventDefault: vi.fn() };
            keydownHandler(event);

            expect(event.preventDefault).toHaveBeenCalled();
            expect(openSpy).toHaveBeenCalled();
        });

        it('does not trigger open for other keys on privacy link', () => {
            const openSpy = vi.spyOn(modal, 'open').mockImplementation(() => {});
            const keydownHandler = modal.privacyLink.addEventListener.mock.calls.find(call => call[0] === 'keydown')[1];

            const event = { key: 'Enter', preventDefault: vi.fn() };
            keydownHandler(event);

            expect(event.preventDefault).not.toHaveBeenCalled();
            expect(openSpy).not.toHaveBeenCalled();
        });

        it('closes when backdrop is clicked directly', () => {
            const closeSpy = vi.spyOn(modal, 'close').mockImplementation(() => {});
            const clickHandler = modal.backdrop.addEventListener.mock.calls.find(call => call[0] === 'click')[1];
            clickHandler({ target: modal.backdrop });
            expect(closeSpy).toHaveBeenCalled();
        });

        it('does not close when inner content of backdrop is clicked', () => {
            const closeSpy = vi.spyOn(modal, 'close').mockImplementation(() => {});
            const clickHandler = modal.backdrop.addEventListener.mock.calls.find(call => call[0] === 'click')[1];
            clickHandler({ target: {} });
            expect(closeSpy).not.toHaveBeenCalled();
        });

        it('opens, fetches content, and locks focus', async () => {
            // Setup a trigger element
            const trigger = { tagName: 'BUTTON', focus: vi.fn(), id: 'trigger-btn' };
            document.activeElement = trigger;

            await modal.open();

            // Verify content fetch
            expect(global.fetch).toHaveBeenCalledWith('/PRIVACY.md');
            expect(modal.loaded).toBe(true);

            // Verify visibility
            expect(modal.backdrop.classList.add).toHaveBeenCalledWith('visible');
            expect(document.body.style.overflow).toBe('hidden');

            // Verify focus management
            expect(modal.closeBtn.focus).toHaveBeenCalled();
            expect(modal.triggerElement).toBe(trigger); // Should store the trigger
        });

        it('does not re-fetch content if already loaded', async () => {
            modal.loaded = true;
            await modal.open();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('closes, restores focus, and unlocks body', async () => {
            // Setup open state
            const trigger = { tagName: 'BUTTON', focus: vi.fn(), id: 'trigger-btn' };
            modal.triggerElement = trigger;
            modal.backdrop.classList.contains.mockReturnValue(true);

            modal.close();

            expect(modal.backdrop.classList.remove).toHaveBeenCalledWith('visible');
            expect(document.body.style.overflow).toBe('');
            expect(trigger.focus).toHaveBeenCalled();
            expect(modal.triggerElement).toBeNull();
        });

        it('closes on Escape key press when visible', () => {
            // Spy on close
            const closeSpy = vi.spyOn(modal, 'close');
            // Setup visible state
            modal.backdrop.classList.contains.mockReturnValue(true);

            // Simulate Escape key
            // Note: We need to find the listener bound in constructor
            const calls = document.addEventListener.mock.calls;
            const keydownHandler = calls.find(call => call[0] === 'keydown')[1];

            keydownHandler({ key: 'Escape' });

            expect(closeSpy).toHaveBeenCalled();
        });

        it('ignores Escape key press when not visible', () => {
            const closeSpy = vi.spyOn(modal, 'close');
            modal.backdrop.classList.contains.mockReturnValue(false);

            const calls = document.addEventListener.mock.calls;
            const keydownHandler = calls.find(call => call[0] === 'keydown')[1];

            keydownHandler({ key: 'Escape' });

            expect(closeSpy).not.toHaveBeenCalled();
        });

        it('handles fetch errors gracefully', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            global.fetch.mockRejectedValue(new Error('Network error'));

            await modal.open();

            expect(modal.content.innerHTML).toContain('Failed to load privacy policy');
            // Even if failed, it might set loaded to false or just show error.
            // Implementation sets loaded=true only on success? No, let's check code.
            // Code sets loaded=true ONLY in try block. So it remains false.
            expect(modal.loaded).toBe(false);
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });
    });

    describe('Focus Trap', () => {
        let firstElement, lastElement;

        beforeEach(async () => {
            // Open modal to attach focus trap listener
            await modal.open();

            // Setup mock focusable elements
            firstElement = { id: 'first', focus: vi.fn(), offsetParent: {} };
            lastElement = { id: 'last', focus: vi.fn(), offsetParent: {} };

            // Mock querySelectorAll to return our elements
            modal.backdrop.querySelectorAll.mockReturnValue([firstElement, lastElement]);
        });

        it('loops focus to first element when tabbing from last element', () => {
            document.activeElement = lastElement;

            // Trigger handler directly (it's bound to backdrop keydown)
            // Find the listener added to backdrop in open()
            const calls = modal.backdrop.addEventListener.mock.calls;
            const trapHandler = calls.find(call => call[0] === 'keydown')[1];

            const event = {
                key: 'Tab',
                shiftKey: false,
                preventDefault: vi.fn(),
            };

            trapHandler(event);

            expect(event.preventDefault).toHaveBeenCalled();
            expect(firstElement.focus).toHaveBeenCalled();
        });

        it('loops focus to last element when shift-tabbing from first element', () => {
            document.activeElement = firstElement;

            const calls = modal.backdrop.addEventListener.mock.calls;
            const trapHandler = calls.find(call => call[0] === 'keydown')[1];

            const event = {
                key: 'Tab',
                shiftKey: true,
                preventDefault: vi.fn(),
            };

            trapHandler(event);

            expect(event.preventDefault).toHaveBeenCalled();
            expect(lastElement.focus).toHaveBeenCalled();
        });

        it('does nothing for non-Tab keys', () => {
            const calls = modal.backdrop.addEventListener.mock.calls;
            const trapHandler = calls.find(call => call[0] === 'keydown')[1];

            const event = {
                key: 'Enter',
                preventDefault: vi.fn(),
            };

            trapHandler(event);

            expect(event.preventDefault).not.toHaveBeenCalled();
        });

        it('does nothing if no focusable elements found', () => {
            modal.backdrop.querySelectorAll.mockReturnValue([]);

            const calls = modal.backdrop.addEventListener.mock.calls;
            const trapHandler = calls.find(call => call[0] === 'keydown')[1];

            const event = {
                key: 'Tab',
                preventDefault: vi.fn(),
            };

            trapHandler(event);
            expect(event.preventDefault).not.toHaveBeenCalled();
        });
    });
});
