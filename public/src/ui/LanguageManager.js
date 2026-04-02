import { i18n, LANGUAGE_NAMES } from '../i18n/index.js';

export class LanguageManager {
    constructor() {
        this.toggleBtn = document.getElementById('languageToggle');
        this.menu = document.getElementById('languageMenu');
        this.isOpen = false;

        if (this.toggleBtn && this.menu) {
            this.init();
        }
    }

    init() {
        this.populateMenu();
        this.bindEvents();
        this.updateActiveLanguage();

        // Listen for language changes from other sources
        document.addEventListener('i18n:change', () => {
            this.updateActiveLanguage();
        });
    }

    populateMenu() {
        this.menu.innerHTML = '';
        Object.entries(LANGUAGE_NAMES).forEach(([locale, name]) => {
            const button = document.createElement('button');
            button.className = 'language-item';
            button.dataset.locale = locale;
            button.textContent = name;
            button.type = 'button';

            button.addEventListener('click', () => {
                i18n.setLocale(locale);
                this.close();
            });

            this.menu.appendChild(button);
        });
    }

    bindEvents() {
        this.toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.menu.contains(e.target) && !this.toggleBtn.contains(e.target)) {
                this.close();
            }
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });

        // Palette A11y: Close when focus moves outside the menu (e.g., tabbing away)
        this.menu.addEventListener('focusout', (e) => {
            if (!this.isOpen) return;

            // Wait a tick to let the browser update document.activeElement
            requestAnimationFrame(() => {
                if (!this.menu.contains(document.activeElement) &&
                    document.activeElement !== this.toggleBtn) {
                    this.close();
                }
            });
        });
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        this.isOpen = true;
        this.menu.classList.add('visible');
        this.toggleBtn.setAttribute('aria-expanded', 'true');

        // Focus first item
        const firstItem = this.menu.querySelector('.language-item');
        if (firstItem) {
            setTimeout(() => firstItem.focus(), 50);
        }
    }

    close() {
        this.isOpen = false;
        this.menu.classList.remove('visible');
        this.toggleBtn.setAttribute('aria-expanded', 'false');
    }

    updateActiveLanguage() {
        const currentLocale = i18n.locale;
        this.menu.querySelectorAll('.language-item').forEach(item => {
            const isActive = item.dataset.locale === currentLocale;
            item.classList.toggle('active', isActive);
            item.setAttribute('aria-current', isActive ? 'true' : 'false');
        });
    }
}
