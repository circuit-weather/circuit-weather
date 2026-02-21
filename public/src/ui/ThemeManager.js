import { SafeStorage } from '../utils/storage.js';

export class ThemeManager {
    constructor(onThemeChange) {
        this.theme = this.getInitialTheme();
        this.onThemeChange = onThemeChange;
        this.applyTheme();
        this.bindEvents();
    }

    getInitialTheme() {
        const stored = SafeStorage.getItem('theme');
        if (stored) return stored;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);

        // Palette UX: Update theme-color meta tag for mobile browsers
        // Matches sidebar color in dark mode (#1e293b) and brand color in light mode (#e10600)
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.content = this.theme === 'dark' ? '#1e293b' : '#e10600';
        }

        // Palette UX: Update toggle button labels for better accessibility
        // Dynamic labels clarify the action (e.g., "Switch to light mode") rather than just describing the current state
        const nextTheme = this.theme === 'dark' ? 'light' : 'dark';
        const label = `Switch to ${nextTheme} mode`;

        const updateBtn = (id) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.setAttribute('aria-label', label);
                btn.setAttribute('title', label);
            }
        };

        updateBtn('themeToggle');
        updateBtn('mobileThemeToggle');

        if (this.onThemeChange) this.onThemeChange(this.theme);
    }

    toggle() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme();
        SafeStorage.setItem('theme', this.theme);
    }

    bindEvents() {
        // Sidebar theme toggle
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggle());
        }

        // Mobile header theme toggle
        const mobileToggleBtn = document.getElementById('mobileThemeToggle');
        if (mobileToggleBtn) {
            mobileToggleBtn.addEventListener('click', () => this.toggle());
        }
    }
}
