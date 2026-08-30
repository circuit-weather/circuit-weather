import { i18n } from '../i18n/index.js';

export class PrivacyModal {
  constructor() {
    this.modal = document.getElementById("privacyModal");
    this.content = document.getElementById("privacyModalContent");
    this.closeBtn = document.getElementById("privacyModalClose");
    this.privacyLink = document.getElementById("privacyLink");
    this.loaded = false;
    this.triggerElement = null;
    this.bindEvents();
  }

  bindEvents() {
    if (this.privacyLink) {
      this.privacyLink.addEventListener("click", (e) => {
        e.preventDefault();
        this.open();
      });
      // Palette A11y: Ensure keyboard users can activate the link functioning as a button
      this.privacyLink.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          this.open();
        }
      });
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener("click", () => this.close());
    }

    if (this.modal) {
      this.modal.addEventListener("click", (e) => {
        if (e.target === this.modal) this.close();
      });

      this.modal.addEventListener("close", () => {
        document.body.style.overflow = "";
        if (this.triggerElement) {
          this.triggerElement.focus();
          this.triggerElement = null;
        }
      });
    }
  }

  async open() {
    this.triggerElement = document.activeElement;

    // Palette UX: Show modal immediately to prevent perceived lag
    if (this.modal) {
      this.modal.showModal();
      document.body.style.overflow = "hidden";
    }

    if (!this.loaded) {
      // Palette UX: Show skeleton loading state while fetching
      if (this.content) {
        this.content.textContent = '';
        const fragment = document.createDocumentFragment();

        const skeletonStyles = [
          "height: 1.5rem; width: 30%; margin-bottom: 1rem; border-radius: var(--radius-sm);",
          "height: 1rem; width: 100%; margin-bottom: 0.5rem; border-radius: var(--radius-sm);",
          "height: 1rem; width: 95%; margin-bottom: 0.5rem; border-radius: var(--radius-sm);",
          "height: 1rem; width: 90%; margin-bottom: 1.5rem; border-radius: var(--radius-sm);",
          "height: 1.25rem; width: 25%; margin-bottom: 0.75rem; border-radius: var(--radius-sm);",
          "height: 1rem; width: 100%; margin-bottom: 0.5rem; border-radius: var(--radius-sm);",
          "height: 1rem; width: 85%; margin-bottom: 0.5rem; border-radius: var(--radius-sm);"
        ];

        for (const style of skeletonStyles) {
          const div = document.createElement("div");
          div.className = "skeleton";
          // Use cssText or standard style properties
          div.style.cssText = style;
          fragment.appendChild(div);
        }

        this.content.appendChild(fragment);
      }
      await this.loadContent();
    }
  }

  close() {
    if (this.modal) {
      this.modal.close();
    }
  }

  async loadContent() {
    const paths = this.getPrivacyPolicyPaths();

    try {
      let markdown = null;

      for (const path of paths) {
        // SEC: Add timeout to prevent hanging connections during document fetch
        const response = await fetch(path, {
            signal: AbortSignal.timeout(3000)
        });
        if (!response.ok) continue;
        markdown = await response.text();
        break;
      }

      if (!markdown) {
        throw new Error('No privacy policy translation available');
      }

      if (this.content) {
        this.content.textContent = '';
        this.content.appendChild(this.parseMarkdown(markdown));
      }
      this.loaded = true;
    } catch (error) {
      console.error("Failed to load privacy policy:", error);
      if (this.content) {
        this.content.textContent = '';
        const p = document.createElement('p');
        p.textContent = i18n.t('privacy.loadFailed');
        this.content.appendChild(p);
      }
    }
  }

  parseMarkdown(md) {
    // Simple markdown parser for privacy policy content

    // SEC: Sanitize URLs to prevent XSS (e.g. javascript: links)
    const sanitizeUrl = (url) => {
      // SEC: Remove all whitespace/control chars to prevent scheme bypass (e.g. java\nscript:)
      let clean = String(url).replace(/[\s\x00-\x1F\x7F-\x9F]/g, "");

      // SEC: Decode ALL HTML entities that could bypass the scheme check (e.g. j&#x61;vascript:alert(1))
      // The browser decodes entities in the href attribute before parsing the URL scheme,
      // so we must check the fully decoded value.
      try {
        const doc = new DOMParser().parseFromString(clean, "text/html");
        if (doc && doc.documentElement) {
          clean = doc.documentElement.textContent || clean;
        } else {
          return "#unsafe-url";
        }
      } catch (e) {
        // Fallback if DOMParser fails
        return "#unsafe-url";
      }

      // Remove control characters and whitespace AGAIN after decoding, as entities might decode to them
      clean = clean.replace(/[\s\x00-\x1F\x7F-\x9F]/g, "");

      // Allowlist approach: Check for protocol scheme
      // Regex: Start with letter, followed by valid scheme chars, then colon
      if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) {
        // If scheme exists, it MUST be in our allowlist
        if (/^(?:https?|mailto):/i.test(clean)) {
          return clean; // Safely return the decoded link
        }
        // Block file:, javascript:, vbscript:, data:, blob:, etc.
        return "#unsafe-url";
      }
      // No scheme (relative URL), allow
      return clean; // Safely return the decoded link
    };

    const fragment = document.createDocumentFragment();

    // Remove the top-level title (we have it in the header)
    md = md.replace(/^#\s+.+\s*\n*/m, "");
    const blocks = md.split("\n\n");

    const parseInline = (text, container) => {
      const regex = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          container.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
        }

        if (match[1]) {
          // Bold
          const strong = document.createElement('strong');
          strong.textContent = match[1];
          container.appendChild(strong);
        } else if (match[2]) {
          // Link
          const a = document.createElement('a');
          a.href = sanitizeUrl(match[3]);
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.className = 'external-link';
          a.textContent = match[2] + ' ';

          // Palette A11y: Add external link indicator and SR text
          const svgNS = 'http://www.w3.org/2000/svg';
          const svg = document.createElementNS(svgNS, 'svg');
          svg.setAttribute('class', 'icon-external');
          svg.setAttribute('aria-hidden', 'true');
          svg.setAttribute('viewBox', '0 0 24 24');
          svg.setAttribute('fill', 'none');
          svg.setAttribute('stroke', 'currentColor');
          svg.setAttribute('stroke-width', '2');
          svg.setAttribute('stroke-linecap', 'round');
          svg.setAttribute('stroke-linejoin', 'round');

          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6');
          svg.appendChild(path);

          const polyline = document.createElementNS(svgNS, 'polyline');
          polyline.setAttribute('points', '15 3 21 3 21 9');
          svg.appendChild(polyline);

          const line = document.createElementNS(svgNS, 'line');
          line.setAttribute('x1', '10');
          line.setAttribute('y1', '14');
          line.setAttribute('x2', '21');
          line.setAttribute('y2', '3');
          svg.appendChild(line);

          a.appendChild(svg);

          const sr = document.createElement('span');
          sr.className = 'sr-only';
          sr.textContent = '(' + i18n.t('privacy.opensInNewTab') + ')';
          a.appendChild(sr);

          container.appendChild(a);
        }
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < text.length) {
        container.appendChild(document.createTextNode(text.substring(lastIndex)));
      }
    };

    for (let block of blocks) {
      block = block.trim();
      if (!block) continue;

      if (block.startsWith('### ')) {
        const h3 = document.createElement('h3');
        parseInline(block.substring(4), h3);
        fragment.appendChild(h3);
      } else if (block.startsWith('## ')) {
        const h2 = document.createElement('h2');
        parseInline(block.substring(3), h2);
        fragment.appendChild(h2);
      } else if (block.startsWith('- ')) {
        const ul = document.createElement('ul');
        const items = block.split('\n');
        for (const item of items) {
          if (item.trim().startsWith('- ')) {
            const li = document.createElement('li');
            parseInline(item.trim().substring(2), li);
            ul.appendChild(li);
          }
        }
        fragment.appendChild(ul);
      } else {
        const p = document.createElement('p');
        parseInline(block, p);
        fragment.appendChild(p);
      }
    }

    return fragment;
  }

  getPrivacyPolicyPaths() {
    const locale = this.resolvePrivacyLocale(i18n.locale || 'en-NZ');
    const base = locale.split('-')[0];
    const paths = [];

    paths.push(`/privacy/PRIVACY.${locale}.md`);

    if (base === 'en') {
      if (locale === 'en-US') {
        paths.push('/privacy/PRIVACY.en-GB.md');
        paths.push('/privacy/PRIVACY.en-NZ.md');
      } else if (locale === 'en-GB') {
        paths.push('/privacy/PRIVACY.en-NZ.md');
        paths.push('/privacy/PRIVACY.en-US.md');
      } else {
        paths.push('/privacy/PRIVACY.en-GB.md');
        paths.push('/privacy/PRIVACY.en-US.md');
      }
    } else {
      paths.push('/privacy/PRIVACY.en-GB.md');
      paths.push('/privacy/PRIVACY.en-NZ.md');
      paths.push('/privacy/PRIVACY.en-US.md');
    }
    paths.push('/PRIVACY.md');

    return [...new Set(paths)];
  }

  resolvePrivacyLocale(locale) {
    const supported = new Set([
      'en-NZ',
      'en-GB',
      'en-US',
      'es',
      'fr',
      'de',
      'it',
      'ja',
      'pt-BR',
      'zh-CN',
    ]);

    const value = String(locale || 'en-NZ').replace('_', '-');
    if (supported.has(value)) return value;

    const base = value.split('-')[0];
    if (base === 'en') return 'en-NZ';
    if (base === 'pt') return 'pt-BR';
    if (base === 'zh') return 'zh-CN';
    if (supported.has(base)) return base;
    return 'en-NZ';
  }
}
