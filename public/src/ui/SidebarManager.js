export class SidebarManager {
    constructor() {
        this.sidebar = document.getElementById('sidebar');
        this.toggleBtn = document.getElementById('sidebarToggle');
        this.mobileMenuBtn = document.getElementById('mobileMenuBtn');
        this.backdrop = document.getElementById('sidebarBackdrop');
        this.isOpen = false;
        this.mobileBreakpoint = 768;
        this._handleFocusTrap = this.handleFocusTrap.bind(this);
        this.bindEvents();
    }

    bindEvents() {
        // Toggle button click (inside sidebar)
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
        }

        // Mobile header menu button
        if (this.mobileMenuBtn) {
            this.mobileMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
        }

        // Backdrop click to close
        if (this.backdrop) {
            this.backdrop.addEventListener('click', () => this.close());
        }

        // Bolt Optimization: Use matchMedia for zero-overhead breakpoint detection
        // instead of a resize listener (even debounced). Fires only when state changes.
        const desktopQuery = window.matchMedia(`(min-width: ${this.mobileBreakpoint + 1}px)`);

        // Handle initial state if needed (optional, but safe)
        // Note: matchMedia doesn't fire on init, so we rely on current state,
        // but since sidebar starts closed, we only care about transitions while open.

        desktopQuery.addEventListener('change', (e) => {
            if (e.matches && this.isOpen) {
                this.close();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
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
        if (this.sidebar) {
            this.sidebar.classList.add('sidebar--open');
            this.isOpen = true;
            // Prevent body scroll when sidebar is open
            document.body.style.overflow = 'hidden';

            // Palette A11y: Enable focus trap
            this.sidebar.addEventListener('keydown', this._handleFocusTrap);

            // Update ARIA states
            if (this.mobileMenuBtn) this.mobileMenuBtn.setAttribute('aria-expanded', 'true');
            if (this.toggleBtn) this.toggleBtn.setAttribute('aria-expanded', 'true');

            // Move focus to close button inside sidebar for accessibility
            if (this.toggleBtn) {
                // Small timeout to allow transition/display change
                setTimeout(() => this.toggleBtn.focus(), 50);
            }
        }
    }

    close() {
        if (this.sidebar) {
            this.sidebar.classList.remove('sidebar--open');
            this.isOpen = false;
            document.body.style.overflow = '';

            // Palette A11y: Disable focus trap
            this.sidebar.removeEventListener('keydown', this._handleFocusTrap);

            // Update ARIA states
            if (this.mobileMenuBtn) this.mobileMenuBtn.setAttribute('aria-expanded', 'false');
            if (this.toggleBtn) this.toggleBtn.setAttribute('aria-expanded', 'false');

            // Return focus to menu button if it's visible (mobile)
            // This restores context to the user after closing the menu
            if (this.mobileMenuBtn && window.getComputedStyle(this.mobileMenuBtn).display !== 'none') {
                this.mobileMenuBtn.focus();
            }
        }
    }

    handleFocusTrap(e) {
        if (e.key !== 'Tab') return;

        // We only want to trap focus within the sidebar
        const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const focusableElements = this.sidebar.querySelectorAll(focusableSelectors);

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
}
