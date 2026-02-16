/**
 * Theme Initialization
 *
 * Executed in <head> to prevent Flash of Unstyled Content (FOUC).
 * Sets the initial theme based on localStorage or system preference.
 */
(function () {
    try {
        const stored = localStorage.getItem('theme');
        const theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);

        // Palette: Set theme-color meta tag for mobile browsers
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.content = theme === 'dark' ? '#1e293b' : '#e10600';
        }
    } catch (e) { }
})();
