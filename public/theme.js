/**
 * Theme Initialization (and an early start on the schedule request)
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

/**
 * Web font, without blocking the first paint
 *
 * A stylesheet in the HTML holds rendering until it arrives from Google
 * (a full round trip on a slow connection). Added from script it doesn't, and
 * with display=swap text shows straight away in the system font.
 */
(function () {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
})();

/**
 * Early schedule request
 *
 * The app's modules take a while to arrive on a slow connection, and the
 * schedule request used to wait for all of them. Preloading it here starts it
 * with the page; SeriesAPI/F1API then pick up the same response. Skipped when
 * the app will use its saved copy instead, so returning visitors fetch nothing
 * extra. Keep the series list and cache rules in step with SERIES_IDS
 * (src/config.js) and the cache rules in src/utils/schedule.js
 * (getScheduleCacheMs) and src/api/SeriesAPI.js.
 */
(function () {
    try {
        var SERIES = ['f1', 'f2', 'f3', 'fe', 'wec', 'imsa', 'supercars', 'indycar', 'nascar', 'motogp', 'wsbk'];
        var WEEK_MS = 7 * 24 * 60 * 60 * 1000;
        var EVENT_DAY_MS = 60 * 60 * 1000;
        var PARTIAL_MS = 5 * 60 * 1000;

        // The URL's series, else the visitor's saved one, else F1, as in CircuitWeatherApp.init
        var first = window.location.pathname.split('/')[1];
        var saved = localStorage.getItem('series');
        var series = SERIES.indexOf(first) !== -1 ? first : (SERIES.indexOf(saved) !== -1 ? saved : 'f1');

        var stored;
        if (series === 'f1') {
            stored = JSON.parse(localStorage.getItem('f1_schedule_cache') || 'null');
        } else {
            var all = JSON.parse(localStorage.getItem('series_schedule_cache') || 'null');
            stored = all && all[series];
        }
        // Any session starting today (local date), as isEventDay in src/utils/schedule.js
        var today = new Date().toDateString();
        var startsToday = function (s) {
            if (!s || typeof s.date !== 'string') return false;
            return new Date(s.time ? s.date + 'T' + s.time : s.date + 'T12:00:00Z').toDateString() === today;
        };
        var eventDay = function (races) {
            for (var i = 0; i < races.length; i++) {
                var race = races[i];
                if (!race) continue;
                if (startsToday(race)) return true;
                for (var key in race) {
                    var v = race[key];
                    if (Array.isArray(v) ? v.some(startsToday) : startsToday(v)) return true;
                }
            }
            return false;
        };
        var maxAge = series === 'f1' || (stored && stored.complete) ? WEEK_MS : PARTIAL_MS;
        if (maxAge === WEEK_MS && stored && Array.isArray(stored.races) && eventDay(stored.races)) maxAge = EVENT_DAY_MS;
        if (stored && Array.isArray(stored.races) && Date.now() - stored.timestamp < maxAge) return;

        var link = document.createElement('link');
        link.rel = 'preload';
        link.setAttribute('as', 'fetch');
        link.setAttribute('crossorigin', 'anonymous');
        link.href = series === 'f1' ? '/api/f1/current.json' : '/api/schedule/' + series;
        document.head.appendChild(link);
    } catch (e) { }
})();
