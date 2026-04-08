/**
 * Theme Initialization
 *
 * Executed in <head> to prevent Flash of Unstyled Content (FOUC).
 * Sets the initial theme based on localStorage or system preference.
 */
(function () {
    try {
        const stored = localStorage.getItem('theme');
        // SEC: Validate stored theme to prevent DOM attribute injection via poisoned localStorage
        const isValidTheme = stored === 'dark' || stored === 'light';
        const theme = isValidTheme ? stored : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);

        // Palette: Set theme-color meta tag for mobile browsers
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.content = theme === 'dark' ? '#1e293b' : '#e10600';
        }
    } catch (e) { }
})();
