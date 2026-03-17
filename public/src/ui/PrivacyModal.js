import { escapeHtml } from '../utils/escapeHtml.js';

export class PrivacyModal {
    constructor() {
        this.backdrop = document.getElementById('privacyModalBackdrop');
        this.content = document.getElementById('privacyModalContent');
        this.closeBtn = document.getElementById('privacyModalClose');
        this.privacyLink = document.getElementById('privacyLink');
        this.loaded = false;
        this.triggerElement = null;
        this._handleFocusTrap = this.handleFocusTrap.bind(this);
        this.bindEvents();
    }

    bindEvents() {
        if (this.privacyLink) {
            this.privacyLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.open();
            });
            // Palette A11y: Ensure keyboard users can activate the link functioning as a button
            this.privacyLink.addEventListener('keydown', (e) => {
                if (e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault();
                    this.open();
                }
            });
        }

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        if (this.backdrop) {
            this.backdrop.addEventListener('click', (e) => {
                if (e.target === this.backdrop) this.close();
            });
        }

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.backdrop?.classList.contains('visible')) {
                this.close();
            }
        });
    }

    async open() {
        this.triggerElement = document.activeElement;

        // Palette UX: Show modal immediately to prevent perceived lag
        if (this.backdrop) {
            this.backdrop.classList.add('visible');
            document.body.style.overflow = 'hidden';
            // Move focus to close button for accessibility
            if (this.closeBtn) this.closeBtn.focus();
            // Enable focus trap
            this.backdrop.addEventListener('keydown', this._handleFocusTrap);
        }

        if (!this.loaded) {
            // Palette UX: Show skeleton loading state while fetching
            if (this.content) {
                this.content.innerHTML = `
                    <div class="skeleton" style="height: 1.5rem; width: 30%; margin-bottom: 1rem; border-radius: var(--radius-sm);"></div>
                    <div class="skeleton" style="height: 1rem; width: 100%; margin-bottom: 0.5rem; border-radius: var(--radius-sm);"></div>
                    <div class="skeleton" style="height: 1rem; width: 95%; margin-bottom: 0.5rem; border-radius: var(--radius-sm);"></div>
                    <div class="skeleton" style="height: 1rem; width: 90%; margin-bottom: 1.5rem; border-radius: var(--radius-sm);"></div>

                    <div class="skeleton" style="height: 1.25rem; width: 25%; margin-bottom: 0.75rem; border-radius: var(--radius-sm);"></div>
                    <div class="skeleton" style="height: 1rem; width: 100%; margin-bottom: 0.5rem; border-radius: var(--radius-sm);"></div>
                    <div class="skeleton" style="height: 1rem; width: 85%; margin-bottom: 0.5rem; border-radius: var(--radius-sm);"></div>
                `;
            }
            await this.loadContent();
        }
    }

    close() {
        if (this.backdrop) {
            this.backdrop.classList.remove('visible');
            document.body.style.overflow = '';
            // Remove focus trap
            this.backdrop.removeEventListener('keydown', this._handleFocusTrap);
            // Restore focus to trigger element
            if (this.triggerElement) {
                this.triggerElement.focus();
                this.triggerElement = null;
            }
        }
    }

    handleFocusTrap(e) {
        if (e.key !== 'Tab') return;

        const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        // Palette A11y: Filter out hidden elements to prevent focus trap from getting stuck
        const focusableElements = Array.from(this.backdrop.querySelectorAll(focusableSelectors))
            .filter(el => el.offsetParent !== null);

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        } else {
            if (document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    }

    async loadContent() {
        try {
            const response = await fetch('/PRIVACY.md');
            const markdown = await response.text();
            if (this.content) {
                this.content.innerHTML = this.parseMarkdown(markdown);
            }
            this.loaded = true;
        } catch (error) {
            console.error('Failed to load privacy policy:', error);
            if (this.content) {
                this.content.innerHTML = '<p>Failed to load privacy policy. Please try again later.</p>';
            }
        }
    }

    parseMarkdown(md) {
        // Simple markdown parser for privacy policy content

        // SEC: Sanitize URLs to prevent XSS (e.g. javascript: links)
        const sanitizeUrl = (url) => {
            // SEC: Remove all whitespace/control chars to prevent scheme bypass (e.g. java\nscript:)
            let clean = String(url).replace(/[\s\x00-\x1F\x7F-\x9F]/g, '');

            // SEC: Decode ALL HTML entities that could bypass the scheme check (e.g. j&#x61;vascript:alert(1))
            // The browser decodes entities in the href attribute before parsing the URL scheme,
            // so we must check the fully decoded value.
            try {
                const doc = new DOMParser().parseFromString(clean, 'text/html');
                if (doc && doc.documentElement) {
                    clean = doc.documentElement.textContent || clean;
                }
            } catch (e) {
                // Fallback if DOMParser fails
            }

            // Remove control characters and whitespace AGAIN after decoding, as entities might decode to them
            clean = clean.replace(/[\s\x00-\x1F\x7F-\x9F]/g, '');

            // Allowlist approach: Check for protocol scheme
            // Regex: Start with letter, followed by valid scheme chars, then colon
            if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) {
                // If scheme exists, it MUST be in our allowlist
                if (/^(?:https?|mailto):/i.test(clean)) {
                    // SEC: Return the original (encoded) string if it's safe, or the decoded one?
                    // Safe to return the decoded one since it's verified.
                    return escapeHtml(clean);
                }
                // Block file:, javascript:, vbscript:, data:, blob:, etc.
                return '#unsafe-url';
            }
            // No scheme (relative URL), allow
            return escapeHtml(clean);
        };

        return escapeHtml(md)
            // Remove the main title (we have it in the header)
            .replace(/^# Privacy Policy\s*\n*/m, '')
            // Headers (Escaped chars mean we look for escaped # if they were escaped, but # is safe)
            // Note: Since we escaped first, we must match safe content.
            // Standard markdown # is safe from escapeHtml unless it was &#... but # is not escaped.
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            // Bold
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            // Links
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                // Palette A11y: Add external link indicator and SR text
                const icon = `<svg class="icon-external" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
                return `<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer" class="external-link">${text} ${icon}<span class="sr-only">(opens in a new tab)</span></a>`;
            })
            // List items
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            // Wrap consecutive list items in ul
            .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
            // Paragraphs (lines that aren't headers, lists, or empty)
            .split('\n\n')
            .map(block => {
                block = block.trim();
                if (!block) return '';
                // Since we generate safe HTML tags above (h3, h2, strong, a, li, ul)
                // we can trust lines starting with these tags.
                // The inputs $1, $2 are already escaped.
                if (block.startsWith('<h') || block.startsWith('<ul')) return block;
                // If it doesn't start with a generated tag, wrap it in p
                // Note: The original check `block.startsWith('<')` would fail for escaped content like &lt;
                // so we just check against our known safe tags.
                if (!block.startsWith('<')) return `<p>${block}</p>`;
                // If it starts with < but isn't one of ours (shouldn't happen due to escape), treat as text?
                // But wait, if I have `&lt;img...` it starts with `&`.
                // So the `startsWith('<')` check is actually tricky now.
                // Let's refine:
                // If I escaped everything, the ONLY things starting with < are the ones I just replaced.
                // So if it starts with <, it's safe.
                // If it starts with &lt;, it's text.
                return block;
            })
            .join('\n');
    }
}
