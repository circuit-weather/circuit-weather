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
        // Bolt Optimization: Use DocumentFragment to batch DOM insertions
        // Reduces reflows when populating the language menu
        const fragment = document.createDocumentFragment();

        Object.entries(LANGUAGE_NAMES).forEach(([locale, name]) => {
            const button = document.createElement('button');
            button.className = 'language-item';
            button.dataset.locale = locale;
            button.textContent = name;
            button.type = 'button';
            button.setAttribute('role', 'menuitem');

            button.addEventListener('click', () => {
                i18n.setLocale(locale);
                this.close();
            });

            // Palette UX: Add keyboard navigation for menu items
            button.addEventListener('keydown', (e) => {
                const items = Array.from(this.menu.querySelectorAll('.language-item'));
                const index = items.indexOf(e.target);

                let nextIndex = -1;
                if (e.key === 'ArrowDown') {
                    nextIndex = (index + 1) % items.length;
                } else if (e.key === 'ArrowUp') {
                    nextIndex = (index - 1 + items.length) % items.length;
                } else if (e.key === 'Home') {
                    nextIndex = 0;
                } else if (e.key === 'End') {
                    nextIndex = items.length - 1;
                }

                if (nextIndex !== -1) {
                    e.preventDefault();
                    items[nextIndex].focus();
                }
            });

            fragment.appendChild(button);
        });

        this.menu.appendChild(fragment);
    }

    bindEvents() {
        this.toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // Palette UX: Open menu with arrow keys from the toggle button
        this.toggleBtn.addEventListener('keydown', (e) => {
            if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !this.isOpen) {
                e.preventDefault();
                this.open();
            }
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

        // Palette UX: Restore focus to toggle button if focus is currently within the menu
        if (this.menu.contains(document.activeElement)) {
            this.toggleBtn.focus();
        }
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
