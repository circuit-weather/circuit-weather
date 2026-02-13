/**
 * Circuit Weather - F1 Race Circuit Weather Radar
 * Main application JavaScript
 */

// ===================================
// Configuration
// ===================================

const isLocal = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.protocol === 'file:';

const CONFIG = {
    f1ApiBase: '/api/f1',
    rainViewerApi: '/api/radar',
    trackApi: '/api/track',
    weatherApi: 'https://api.open-meteo.com/v1/forecast',
    // Use Carto basemaps (reliable, free, no key)
    mapTiles: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    mapTilesDark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    defaultCenter: [48.8566, 2.3522],
    defaultZoom: 3,
    circuitZoom: 11,
    radarOpacity: 0.65,
    radarAnimationSpeed: 1000, // Default to 1x speed (1000ms per frame)
    // Speed options: slower = higher ms, faster = lower ms
    radarSpeeds: [
        { label: '0.5x', speed: 2000 },
        { label: '1x', speed: 1000 },
        { label: '2x', speed: 500 }
    ],
    defaultSpeedIndex: 1, // Start at 1x
};
// SEC: Prevent runtime tampering with configuration
Object.freeze(CONFIG);

// Feature Flags - Toggle features on/off without removing code
const FEATURE_FLAGS = {
    // Disabled to reduce Open-Meteo API calls (429 rate limiting)
    // The current weather widget requires an API call per circuit change
    // Re-enable when API access is increased or rate limiting is resolved
    enableCurrentWeather: true,
};
Object.freeze(FEATURE_FLAGS);

// Country code mappings for flags (ISO 3166-1 alpha-2)
const COUNTRY_CODES = {
    'Australia': 'au', 'Austria': 'at', 'Azerbaijan': 'az', 'Bahrain': 'bh',
    'Belgium': 'be', 'Brazil': 'br', 'Canada': 'ca', 'China': 'cn',
    'Hungary': 'hu', 'Italy': 'it', 'Japan': 'jp', 'Mexico': 'mx',
    'Monaco': 'mc', 'Netherlands': 'nl', 'Qatar': 'qa', 'Saudi Arabia': 'sa',
    'Singapore': 'sg', 'Spain': 'es', 'UAE': 'ae', 'UK': 'gb',
    'USA': 'us', 'United States': 'us', 'Las Vegas': 'us', 'Miami': 'us',
};
// SEC: Prevent runtime tampering with country codes
Object.freeze(COUNTRY_CODES);

// Circuit ID Mapping (Ergast -> bacinger/f1-circuits)
// Keys must match Ergast Circuit IDs
const CIRCUIT_MAP = {
    'albert_park': 'au-1953',
    'americas': 'us-2012',
    'bahrain': 'bh-2002',
    'baku': 'az-2016',
    'catalunya': 'es-1991',
    'hungaroring': 'hu-1986',
    'imola': 'it-1953',
    'interlagos': 'br-1940',
    'jeddah': 'sa-2021',
    'las_vegas': 'us-2023',
    'losail': 'qa-2004',
    'magny_cours': 'fr-1960', // Historic
    'marina_bay': 'sg-2008',
    'miami': 'us-2022',
    'monaco': 'mc-1929',
    'monza': 'it-1922',
    'nurburgring': 'de-1927', // Historic
    'red_bull_ring': 'at-1969',
    'ricard': 'fr-1969', // Historic
    'rodriguez': 'mx-1962',
    'sepang': 'my-1999', // Historic
    'shanghai': 'cn-2004',
    'silverstone': 'gb-1948',
    'sochi': 'ru-2014', // Historic
    'spa': 'be-1925',
    'suzuka': 'jp-1962',
    'villeneuve': 'ca-1978',
    'yas_marina': 'ae-2009',
    'zandvoort': 'nl-1948'
};
// SEC: Prevent runtime tampering with circuit mappings
Object.freeze(CIRCUIT_MAP);

// ===================================
// Utility Functions
// ===================================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Escapes HTML characters to prevent XSS injection
 * @param {any} str - The input string (or value to be converted)
 * @returns {string} The escaped string
 */
const ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
};
const ESCAPE_REGEX = /[&<>"']/g;

function escapeHtml(str) {
    if (str == null) return '';
    // Bolt Optimization: Use single regex replacement with map lookup
    // ~3x faster than chained .replace() calls
    return String(str).replace(ESCAPE_REGEX, char => ESCAPE_MAP[char]);
}

// ===================================
// Safe Storage Helper
// ===================================

const SafeStorage = {
    getItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            // SEC: Fail securely if storage is disabled/blocked (e.g. privacy settings)
            return null;
        }
    },
    setItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            // SEC: Fail securely if storage is disabled/blocked
        }
    }
};


// ===================================
// Theme Manager
// ===================================

class ThemeManager {
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


// ===================================
// Sidebar Manager (Mobile)
// ===================================

class SidebarManager {
    constructor() {
        this.sidebar = document.getElementById('sidebar');
        this.toggleBtn = document.getElementById('sidebarToggle');
        this.mobileMenuBtn = document.getElementById('mobileMenuBtn');
        this.backdrop = document.getElementById('sidebarBackdrop');
        this.isOpen = false;
        this.mobileBreakpoint = 768;
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
}

// ===================================
// F1 API Client
// ===================================

class F1API {
    constructor() {
        this.cache = new Map();
    }

    async getSchedule() {
        const cacheKey = 'schedule';
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        const response = await fetch(`${CONFIG.f1ApiBase}/current.json`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const races = data.MRData?.RaceTable?.Races || [];

        this.cache.set(cacheKey, races);
        return races;
    }

    parseRace(race) {
        const sessions = [];

        if (race.FirstPractice) sessions.push({ id: 'fp1', name: 'FP1', ...race.FirstPractice });
        if (race.SecondPractice) sessions.push({ id: 'fp2', name: 'FP2', ...race.SecondPractice });
        if (race.ThirdPractice) sessions.push({ id: 'fp3', name: 'FP3', ...race.ThirdPractice });
        if (race.SprintQualifying) sessions.push({ id: 'sprint-quali', name: 'Sprint Quali', ...race.SprintQualifying });
        if (race.Sprint) sessions.push({ id: 'sprint', name: 'Sprint', ...race.Sprint });
        if (race.Qualifying) sessions.push({ id: 'qualifying', name: 'Qualifying', ...race.Qualifying });
        sessions.push({ id: 'race', name: 'Race', date: race.date, time: race.time });

        return {
            round: race.round,
            name: race.raceName,
            circuit: race.Circuit,
            location: race.Circuit?.Location,
            sessions,
            date: race.date,
        };
    }
}

// ===================================
// Weather Client
// ===================================

class WeatherClient {
    constructor() {
        this.baseUrl = CONFIG.weatherApi;
        this.cache = new Map();
        this.cacheTTL = 15 * 60 * 1000; // 15 minutes
    }

    async getForecast(lat, lon, sessionTime) {
        // Check if session is too far in future (> 10 days)
        // Open-Meteo free tier goes up to 14-16 days but accuracy drops
        const now = new Date();
        const diffDays = (sessionTime - now) / (1000 * 60 * 60 * 24);

        if (diffDays > 14) {
            // Palette UX: Calculate when the forecast will become available
            // Open-Meteo offers ~14-16 days forecast. We use 14 for safety.
            const availableFrom = new Date(sessionTime.getTime() - (14 * 24 * 60 * 60 * 1000));
            return { available: false, reason: 'too_far', availableFrom };
        }

        try {
            // Check cache
            // Bolt Optimization: Round coordinates to increase cache hit rate during map panning
            // 2 decimal places is approx 1.1km, sufficient for general weather accuracy
            const rLat = Number(lat).toFixed(2);
            const rLon = Number(lon).toFixed(2);
            const cacheKey = `${rLat},${rLon}`;
            let data;

            if (this.cache.has(cacheKey)) {
                const entry = this.cache.get(cacheKey);
                if (Date.now() - entry.timestamp < this.cacheTTL) {
                    data = entry.data;
                }
            }

            if (!data) {
                // Bolt Optimization: Use rounded coordinates in URL to improve browser cache hit rate
                // Direct call to Open-Meteo (Client-side)
                const url = `${this.baseUrl}?latitude=${rLat}&longitude=${rLon}&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,weather_code&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation&timeformat=unixtime&forecast_days=16`;

                const response = await fetch(url);
                if (!response.ok) throw new Error('Weather API error');

                data = await response.json();
                this.cache.set(cacheKey, { timestamp: Date.now(), data });
            }

            return {
                available: true,
                current: data.current,
                hourly: this.filterHourly(data.hourly, sessionTime),
                units: data.current_units
            };
        } catch (error) {
            console.error('Weather fetch failed:', error);
            return { available: false, reason: 'error' };
        }
    }

    filterHourly(hourly, sessionTime) {
        const sessionTs = Math.floor(sessionTime.getTime() / 1000);
        // Range: -1 hour to +3 hours relative to session start
        const startTs = sessionTs - 3600;
        const endTs = sessionTs + (3 * 3600);

        const result = [];
        const times = hourly.time;
        // Destructure for faster access
        const {
            temperature_2m: temps,
            relative_humidity_2m: humids,
            precipitation_probability: precips,
            wind_speed_10m: winds,
            wind_direction_10m: windDirs,
            weather_code: codes
        } = hourly;

        for (let i = 0; i < times.length; i++) {
            const time = times[i];
            // Bolt Optimization: Stop iterating once we pass the end time
            if (time > endTs) break;

            if (time >= startTs && time <= endTs) {
                result.push({
                    time: time,
                    temp: temps[i],
                    humidity: humids ? humids[i] : null,
                    precipProb: precips[i],
                    windSpeed: winds[i],
                    windDir: windDirs[i],
                    code: codes[i]
                });
            }
        }
        return result;
    }

    getWeatherDescription(code) {
        // WMO Weather interpretation codes (WW)
        // https://open-meteo.com/en/docs
        if (code === 0) return 'Clear sky';
        if (code <= 3) return 'Partly cloudy';
        if (code <= 48) return 'Fog';
        if (code <= 55) return 'Drizzle';
        if (code <= 67) return 'Rain';
        if (code <= 77) return 'Snow grains';
        if (code <= 82) return 'Rain showers';
        if (code <= 86) return 'Snow showers';
        if (code <= 99) return 'Thunderstorm';
        return 'Unknown';
    }

    getRelativeTime(timestamp, sessionTime) {
        const diffMins = (timestamp * 1000 - sessionTime.getTime()) / 60000;

        if (Math.abs(diffMins) < 30) return 'Start';
        if (diffMins < 0) return `${Math.round(diffMins / 60)}h`;
        return `+${Math.round(diffMins / 60)}h`;
    }

    getAccessibleRelativeTime(timestamp, sessionTime) {
        const diffMins = (timestamp * 1000 - sessionTime.getTime()) / 60000;

        if (Math.abs(diffMins) < 30) return 'Session start';
        const hours = Math.round(diffMins / 60);
        if (hours < 0) return `${Math.abs(hours)} hour${Math.abs(hours) !== 1 ? 's' : ''} before session`;
        return `${hours} hour${hours !== 1 ? 's' : ''} after session`;
    }
}

// ===================================
// Track Layout Layer
// ===================================

class TrackLayer {
    constructor(map) {
        this.map = map;
        this.layer = null;
        this.currentCircuitId = null;
        this.cache = new Map();
        this.bindEvents();
    }

    bindEvents() {
        this.map.on('zoomend', () => this.updateStyle());
    }

    updateStyle() {
        if (!this.layer) return;

        const zoom = this.map.getZoom();
        let weight = 4;

        if (zoom >= 12) weight = 5;
        else if (zoom >= 11) weight = 4;
        else if (zoom >= 10) weight = 3;
        else if (zoom >= 8) weight = 2;
        else weight = 1;

        this.layer.setStyle({ weight: weight });
    }

    async loadTrack(circuitId) {
        this.clear();
        this.currentCircuitId = circuitId;

        const geoJsonId = CIRCUIT_MAP[circuitId];
        if (!geoJsonId) {
            console.log(`No track map found for circuit: ${circuitId}`);
            return;
        }

        try {
            // Check cache first (Bolt Optimization: Cache L.geoJSON layer instead of raw data)
            if (this.cache.has(circuitId)) {
                this.layer = this.cache.get(circuitId);

                // Check if this is still the requested circuit
                if (this.currentCircuitId !== circuitId) return;

                if (!this.map.hasLayer(this.layer)) {
                    this.layer.addTo(this.map);
                }

                this.updateStyle();
                this.layer.bringToBack();
                return;
            }

            let url;
            if (CONFIG.trackApi.startsWith('/')) {
                // Worker proxy (no extension)
                url = `${CONFIG.trackApi}/${geoJsonId}`;
            } else {
                // Direct GitHub (needs extension)
                url = `${CONFIG.trackApi}/${geoJsonId}.geojson`;
            }

            const response = await fetch(url);

            if (!response.ok) throw new Error(`Track fetch failed: ${response.status}`);

            // Check if this is still the requested circuit
            if (this.currentCircuitId !== circuitId) return;

            const data = await response.json();

            // Double check before rendering
            if (this.currentCircuitId !== circuitId) return;

            this.layer = L.geoJSON(data, {
                style: {
                    interactive: false,
                    color: '#e10600',
                    weight: 4, // Initial, will be updated immediately
                    opacity: 0.8,
                    fillOpacity: 0,
                    lineCap: 'round',
                    lineJoin: 'round',
                    className: 'track-path'
                }
            });

            // Cache the created layer
            this.cache.set(circuitId, this.layer);

            this.layer.addTo(this.map);

            // Apply correct weight for current zoom
            this.updateStyle();

            // Ensure track is below other overlays (like the center dot)
            this.layer.bringToBack();

        } catch (error) {
            console.warn('Failed to load track layout:', error);
        }
    }

    clear() {
        if (this.layer) {
            this.map.removeLayer(this.layer);
            this.layer = null;
        }
        this.currentCircuitId = null;
    }
}

// ===================================
// Weather Radar
// ===================================

class WeatherRadar {
    constructor(map) {
        this.map = map;
        this.frames = [];
        this.pastFrameCount = 0; // Track where the forecast starts
        this.currentFrame = 0;
        this.visibleLayerIndex = -1; // Track currently visible layer for optimization
        this.layers = [];
        this.isPlaying = false;
        this.animationFrameId = null;
        this.lastFrameTime = 0;
        this.sessionTime = null;
        this.speedIndex = CONFIG.defaultSpeedIndex; // Track current speed
        this.pollingInterval = null;
        this.pendingFrames = null;

        // Tile error tracking
        this.tileErrorCount = 0;
        this.tileErrorThreshold = 3; // Show warning after this many errors
        this.lastTileErrorTime = 0;

        // Bolt Optimization: Cache DOM elements
        this.ui = {
            playBtn: document.getElementById('radarPlayBtn'),
            slider: document.getElementById('radarSlider'),
            speedBtn: document.getElementById('radarSpeedBtn'),
            speedLabel: document.getElementById('radarSpeedLabel'),
            time: document.getElementById('radarTime'),
            relative: document.getElementById('radarRelative'),
            timeStart: document.getElementById('radarTimeStart'),
            timeEnd: document.getElementById('radarTimeEnd'),
            controls: document.getElementById('radarControls'),
            // New Error Toast UI
            errorToast: document.getElementById('errorToast'),
            errorTitle: document.getElementById('errorTitle'),
            errorMessage: document.getElementById('errorMessage'),
            errorTimer: document.getElementById('errorTimer')
        };

        // Rate Limiting & Error Handling
        this.rateLimitResetTime = 0;
        this.retryTimer = null;
        this.checkStatusController = null;
        this.failedTiles = new Set(); // Track unique failed tile elements for accurate counting

        // Bolt Optimization: Reuse DateTimeFormat
        this.timeFormatter = new Intl.DateTimeFormat(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        // Bolt Optimization: Bind loop function once to avoid allocation churn in rAF
        this.boundLoop = this.loop.bind(this);
        this.updateErrorUIBound = this.updateErrorUI.bind(this); // Pre-bind for frequent updates

        // Palette Accessibility: Set initial state
        this.updateSpeedLabel();

        this.bindEvents();
    }

    bindEvents() {
        if (this.ui.playBtn) this.ui.playBtn.addEventListener('click', () => this.togglePlay());
        if (this.ui.slider) {
            this.ui.slider.addEventListener('input', (e) => {
                this.currentFrame = parseInt(e.target.value, 10);
                this.showFrame(this.currentFrame);
                this.pause();
            });
        }
        if (this.ui.speedBtn) {
            this.ui.speedBtn.addEventListener('click', () => this.cycleSpeed());
        }

        // Global shortcut: Space to toggle play/pause
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                const active = document.activeElement;
                const tag = active.tagName.toLowerCase();

                // Prevent conflict with inputs or focused buttons (which use Space to click)
                if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') {
                    return;
                }

                e.preventDefault();
                this.togglePlay();
            }
        });
    }

    cycleSpeed() {
        // Cycle to the next speed
        this.speedIndex = (this.speedIndex + 1) % CONFIG.radarSpeeds.length;
        this.updateSpeedLabel();

        // If playing, restart with the new speed
        if (this.isPlaying) {
            this.pause();
            this.play();
        }
    }

    updateSpeedLabel() {
        if (this.ui.speedLabel) {
            const label = CONFIG.radarSpeeds[this.speedIndex].label;
            this.ui.speedLabel.textContent = label;

            // Palette Accessibility: Update ARIA label with current state
            if (this.ui.speedBtn) {
                this.ui.speedBtn.setAttribute('aria-label', `Playback speed: ${label}`);
            }
        }
    }

    getCurrentSpeed() {
        return CONFIG.radarSpeeds[this.speedIndex].speed;
    }

    setSessionTime(sessionTime) {
        this.sessionTime = sessionTime;
    }

    async fetchAndFilter() {
        this.frames = await this.getFramesFromApi();
        return this.frames;
    }

    async getFramesFromApi() {
        const response = await fetch(CONFIG.rainViewerApi);
        const data = await response.json();

        const past = data.radar?.past || [];
        const nowcast = data.radar?.nowcast || [];

        // Store the count of past frames to identify the forecast start
        this.pastFrameCount = past.length;

        return [...past, ...nowcast].map(frame => ({
            time: frame.time,
            path: frame.path,
            url: `/api/tiles${frame.path}/512/{z}/{x}/{y}/2/1_1.png`,
        }));
    }

    async load() {
        this.stopPolling();
        try {
            await this.fetchAndFilter();
            if (this.frames.length === 0) {
                this.showControls(true);
                return;
            }

            this.createLayers();
            this.updateSlider();
            this.showControls(true);

            // Wait for tiles to load before starting animation
            await this.waitForTilesToLoad();
            this.hideTileError();

            // Start serial preload of remaining frames
            // This prevents "hammering" by loading one frame at a time in the background
            this.preloadSequence();

            this.play();
        } catch (error) {
            console.error('Radar load failed:', error);
        } finally {
            // Always start polling, even if initial load failed
            this.startPolling();
        }
    }

    /**
     * Start the smart polling cycle for radar updates.
     * Uses sync polling instead of fixed intervals - see scheduleNextPoll().
     */
    startPolling() {
        this.stopPolling();
        this.scheduleNextPoll();
    }

    /**
     * Schedule the next poll to sync with RainViewer's update cycle.
     * 
     * RATE LIMITING STRATEGY:
     * Instead of polling every 30 seconds (120 API calls/hour), we sync with
     * RainViewer's 10-minute update cycle. We poll 1 minute after each :X0 mark
     * (e.g., :01, :11, :21) when new data is available.
     * 
     * This reduces API calls from ~120/hour to ~6/hour while still getting
     * fresh data within 1 minute of it becoming available.
     */
    scheduleNextPoll() {
        const now = Date.now();
        const msPerMin = 60000;
        const updateIntervalMs = 10 * msPerMin; // RainViewer updates every 10 minutes
        const offsetMs = 1 * msPerMin; // Poll 1 minute after update to ensure data is ready

        // Calculate ms since last :X0 mark (e.g., :00, :10, :20, etc.)
        const msSinceLastUpdate = now % updateIntervalMs;

        // Calculate delay until next update + offset
        let delay = updateIntervalMs - msSinceLastUpdate + offsetMs;

        // If we're already past the offset window, wait for next cycle
        if (delay > updateIntervalMs) {
            delay -= updateIntervalMs;
        }

        // Minimum delay of 30 seconds to avoid tight loops on clock edge cases
        delay = Math.max(delay, 30000);

        this.pollingTimeout = setTimeout(() => {
            this.checkForUpdates();
            this.scheduleNextPoll(); // Schedule next poll recursively
        }, delay);
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        if (this.pollingTimeout) {
            clearTimeout(this.pollingTimeout);
            this.pollingTimeout = null;
        }
    }

    async checkForUpdates() {
        try {
            const newFrames = await this.getFramesFromApi();
            if (!newFrames || newFrames.length === 0) return;

            // Bolt Optimization: Check if frames have changed
            if (this.areFramesEqual(this.frames, newFrames)) {
                return;
            }

            // Always attempt update - rebuild logic is cheap and robust
            if (this.isPlaying) {
                this.applyFrameUpdate(newFrames);
            } else {
                // Defer update until played
                this.pendingFrames = newFrames;
            }
        } catch (error) {
            console.error('Failed to check for radar updates:', error);
        }
    }

    areFramesEqual(a, b) {
        if (!a || !b) return false;
        if (a.length !== b.length) return false;

        // Check timestamps and paths
        for (let i = 0; i < a.length; i++) {
            if (a[i].time !== b[i].time || a[i].path !== b[i].path) {
                return false;
            }
        }
        return true;
    }

    createLayers() {
        if (!this.map) return;

        // Reset error tracking on full layer rebuild
        if (this.failedTiles) this.failedTiles.clear();
        this.updateErrorUI();

        // Clear existing layers if any (full reset)
        this.layers.forEach(layer => {
            if (layer) this.map.removeLayer(layer);
        });
        // Bolt Optimization: Lazy initialize layers array with nulls
        // We only create the Leaflet layer when it's needed (or preloaded)
        this.layers = new Array(this.frames.length).fill(null);
        this.visibleLayerIndex = -1;

        this.currentFrame = this.frames.length - 1;

        // Force map to recalculate size
        this.map.invalidateSize();

        // Create the current (latest) frame immediately so it's ready
        if (this.currentFrame >= 0) {
            this.getLayer(this.currentFrame);
        }
    }

    /**
     * Get or create a radar layer for the given frame index.
     * The layer is NOT automatically added to the map - this is intentional.
     * See showFrame() for the rate limiting strategy explanation.
     * 
     * @param {number} index - Frame index
     * @returns {L.TileLayer|null} The layer, or null if index is invalid
     */
    getLayer(index) {
        if (index < 0 || index >= this.frames.length) return null;

        if (!this.layers[index]) {
            this.layers[index] = this.createLayer(this.frames[index], index);
        }
        return this.layers[index];
    }

    /**
     * Create a new Leaflet TileLayer for a radar frame.
     * 
     * IMPORTANT: This does NOT add the layer to the map.
     * Layers are added to map only in showFrame() to control tile requests.
     * 
     * Configuration notes:
     * - maxNativeZoom: 7 - RainViewer free tier limit as of Jan 2026
     *   Higher zoom levels will scale the zoom-7 tiles (pseudo-zoom)
     * - tileSize: 256 - Standard tile size
     * - keepBuffer: 2 - Keeps 2 tiles outside viewport for smooth panning
     * 
     * @param {Object} frame - Frame data with url, time, path
     * @param {number} index - Frame index for z-index ordering
     * @returns {L.TileLayer} The created layer (not on map yet)
     */
    createLayer(frame, index) {
        const layer = L.tileLayer(frame.url, {
            tileSize: 512,
            zoomOffset: -1,
            opacity: 0.01,
            zIndex: 100 + index,

            // RainViewer free tier limit (Jan 2026) is tile zoom 7.
            // With zoomOffset: -1, map zoom 8 requests tile zoom 7.
            maxNativeZoom: 8,
            minNativeZoom: 1,

            maxZoom: 18,
            updateWhenIdle: true, // Bolt Optimization: Only load tiles when panning stops (reduces requests)
            updateWhenZooming: false,
            keepBuffer: 2, // Restored for smoother animation; Serial Loader handles the initial burst
        });

        // Track tile loading errors for the error indicator UI
        layer.on('tileerror', (e) => {
            this.handleTileError(e);
        });

        // Track success/cleanup to decrement error count
        layer.on('tileload', (e) => {
            if (this.failedTiles.has(e.tile)) {
                this.failedTiles.delete(e.tile);
                this.updateErrorUI();
            }
        });
        layer.on('tileunload', (e) => {
            if (this.failedTiles.has(e.tile)) {
                this.failedTiles.delete(e.tile);
                this.updateErrorUI();
            }
        });

        // NOTE: Layer is NOT added to map here - this is critical for rate limiting!
        // If we added all 13+ animation frames to the map, every zoom/pan would
        // trigger ~170 tile requests, exceeding RainViewer's 100 req/min limit.
        // See showFrame() for the layer management strategy.

        // Store frame metadata for layer matching during reconciliation
        layer.frameTime = frame.time;
        layer.framePath = frame.path;
        return layer;
    }

    handleTileError(e) {
        // Always track the failure first
        // This ensures that if we are in a cooldown or checking status (returning early),
        // we still count these parallel failures so the user sees "Retrying 20 tiles..."
        this.failedTiles.add(e.tile);
        this.updateErrorUI();

        // If we represent a 404/Empty tile, just ignore (common in RainViewer for oceans)
        // If we are already in a rate limit cooldown, allow standard retries but suppress new alerts
        if (Date.now() < this.rateLimitResetTime) return;

        // Smart Error Diagnosis using API Health Check
        // process: We cannot check the tile URL directly due to CORS blocks on the tile cache.
        // Instead, we check the main RainViewer API. If IT is rate limited, we are definitely limited.
        // If it is OK (200), then the tile error is likely a benign 404 (empty/ocean).

        // Avoid spamming checks
        if (this.isCheckingStatus) return;
        this.isCheckingStatus = true;

        // Use direct API URL to avoid proxy nuances and ensure we check the source
        const checkUrl = 'https://api.rainviewer.com/public/weather-maps.json';

        fetch(checkUrl, { method: 'HEAD' })
            .then(response => {
                this.isCheckingStatus = false;

                if (response.status === 429) {
                    // Critical: Rate Limit Hit (API is blocked, so tiles likely are too)
                    this.triggerRateLimitCooldown();
                } else if (response.ok) {
                    // Ambiguous Case: API is fine (200), but tile failed.
                    // We treat this as a transient failure that needs retry.
                    // Count is already updated at top of method.
                    this.triggerRateLimitCooldown(15000, 'Connection Instability', `Retrying ${this.failedTiles.size} failed tiles...`);
                } else {
                    // Service Error
                    const now = Date.now();
                    if (now - this.lastTileErrorTime > 2000) {
                        this.lastTileErrorTime = now;
                        this.showErrorToast('Service Error', `Radar status: ${response.status}`, 5);
                    }
                }
            })
            .catch((err) => {
                this.isCheckingStatus = false;
                // Network error (likely offline)
                // Count already updated at top.
                this.updateErrorUI();
            });
    }

    updateErrorUI() {
        const count = this.failedTiles.size;
        if (count > 0) {
            // Cancel any pending hide timer since we have errors
            if (this.hideErrorTimer) {
                clearTimeout(this.hideErrorTimer);
                this.hideErrorTimer = null;
            }

            // Persistent toast while errors exist
            const message = `Retrying ${count} failed tile${count > 1 ? 's' : ''}...`;

            // Fix Timer Sync: Use actual remaining time if a retry cooldown is active
            let duration = 60;
            if (this.rateLimitResetTime > Date.now()) {
                duration = Math.ceil((this.rateLimitResetTime - Date.now()) / 1000);
                duration = Math.max(1, duration); // Ensure at least 1s
            }

            this.showErrorToast(
                this.activeErrorTitle || 'Connection Instability',
                message,
                duration
            );
        } else {
            // DEBOUNCE HIDE: Wait 1s before hiding to prevent "popping" during redraws
            // If errors reappear within 1s (e.g. strict redraw), the toast stays visible.
            if (!this.hideErrorTimer) {
                this.hideErrorTimer = setTimeout(() => {
                    this.hideErrorToast();
                    this.hideErrorTimer = null;
                }, 1000);
            }
        }
    }

    triggerRateLimitCooldown(waitTimeMs = 61000, title = 'High Traffic', message = 'Rate limit exceeded. Pausing momentarily.') {
        if (this.rateLimitResetTime > Date.now()) return; // Already triggered

        // Playback continues (removed pause) so valid tiles can load

        this.rateLimitResetTime = Date.now() + waitTimeMs;
        this.activeErrorTitle = title; // Track title for consistency

        // Show persistent toast
        this.showErrorToast(title, message, Math.ceil(waitTimeMs / 1000));

        // Schedule Retry
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
            this.retryTiles();
        }, waitTimeMs);
    }

    retryTiles() {
        this.rateLimitResetTime = 0;
        this.activeErrorTitle = null;

        // Manual Clean: Explicitly clear errors to prevent accumulation drift
        // We rely on new errors specifically from the new redraw
        this.failedTiles.clear();

        // Update UI (will trigger the debounce hide, but new errors will cancel it fast)
        this.updateErrorUI();

        // Force redraw of all active layers
        Object.values(this.layers).forEach(layer => {
            if (layer && this.map.hasLayer(layer)) {
                layer.redraw();
            }
        });
        console.log('[Radar] Retrying tiles after cooldown...');
    }

    showErrorToast(title, message, durationSec = 5) {
        if (!this.ui.errorToast) return;

        this.ui.errorTitle.textContent = title;
        this.ui.errorMessage.textContent = message;
        this.ui.errorToast.classList.add('visible');
        this.ui.errorToast.style.opacity = '1';

        // Handle Countdown UI
        const endTime = Date.now() + (durationSec * 1000);

        const updateTimer = () => {
            if (!this.ui.errorToast.classList.contains('visible')) return;

            const remaining = Math.ceil((endTime - Date.now()) / 1000);
            if (remaining > 0) {
                this.ui.errorTimer.textContent = `${remaining}s`;
                requestAnimationFrame(updateTimer);
            } else {
                this.ui.errorTimer.textContent = '';
                if (durationSec < 10 && this.rateLimitResetTime < Date.now()) {
                    this.hideErrorToast();
                }
            }
        };
        updateTimer();
    }

    hideErrorToast() {
        if (!this.ui.errorToast) return;
        this.ui.errorToast.classList.remove('visible');
        this.ui.errorToast.style.opacity = '0';
    }

    // Legacy method stubs
    showTileError() { }
    hideTileError() { }

    // Bolt Optimization: Reuse Leaflet layers to reduce DOM churn
    reconcileLayers(newFrames) {
        // Map (time + path) -> Layer
        const existingLayerMap = new Map();

        // Populate map with existing valid layers
        this.layers.forEach(layer => {
            if (layer) {
                const key = `${layer.frameTime}-${layer.framePath}`;
                existingLayerMap.set(key, layer);
            }
        });

        const newLayers = new Array(newFrames.length).fill(null);
        let newVisibleIndex = -1;

        // Current visible layer (reference)
        const visibleLayer = this.visibleLayerIndex >= 0 ? this.layers[this.visibleLayerIndex] : null;

        newFrames.forEach((frame, index) => {
            const key = `${frame.time}-${frame.path}`;
            if (existingLayerMap.has(key)) {
                // Reuse existing layer
                const layer = existingLayerMap.get(key);
                layer.setZIndex(100 + index);
                newLayers[index] = layer;

                // If this was the visible layer, track its new index
                if (layer === visibleLayer) {
                    newVisibleIndex = index;
                }

                // Remove from map so we know what's left is unused
                existingLayerMap.delete(key);
            } else {
                // Lazy Load: Leave as null.
                // Layer will be created by getLayer() when needed (e.g. by showFrame or preloading).
                newLayers[index] = null;
            }
        });

        // Remove unused layers
        existingLayerMap.forEach(layer => {
            this.map.removeLayer(layer);
        });

        // Update state
        this.layers = newLayers;
        this.visibleLayerIndex = newVisibleIndex;
    }

    applyFrameUpdate(newFrames) {
        // Store current timestamp to restore view
        const currentTimestamp = this.frames[this.currentFrame]?.time;

        // Bolt Optimization: Reconcile layers instead of full rebuild
        this.reconcileLayers(newFrames);
        this.frames = newFrames;

        // Restore view position
        if (currentTimestamp) {
            let closestIndex = 0;
            let minDiff = Infinity;

            this.frames.forEach((frame, i) => {
                const diff = Math.abs(frame.time - currentTimestamp);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = i;
                }
            });
            this.currentFrame = closestIndex;
        } else {
            this.currentFrame = 0;
        }

        // Ensure UI is synced
        this.updateSlider();
        this.showFrame(this.currentFrame);
    }

    async waitForTilesToLoad() {
        // Wait for the current frame's tiles to load
        const currentLayer = this.getLayer(this.currentFrame);
        if (!currentLayer) return;

        // Add to map if not already (needed to trigger tile loading)
        if (!this.map.hasLayer(currentLayer)) {
            currentLayer.addTo(this.map);
        }

        return new Promise((resolve) => {
            let resolved = false;

            const onLoad = () => {
                if (!resolved) {
                    resolved = true;
                    currentLayer.off('load', onLoad);
                    // Set proper opacity after load
                    this.showFrame(this.currentFrame);
                    resolve();
                }
            };

            currentLayer.on('load', onLoad);

            // Timeout fallback (3 seconds)
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    currentLayer.off('load', onLoad);
                    this.showFrame(this.currentFrame);
                    resolve();
                }
            }, 3000);
        });
    }

    /**
     * Serial Preloader: Loads frames one-by-one to prevent API hammering.
     * Prevents the "Wall of Requests" (50+ pending) issue.
     */
    async preloadSequence() {
        console.log('[Radar] Starting serial preload sequence...');

        // Order: Start from current frame + 1, wrap around.
        const sequence = [];
        for (let i = 0; i < this.frames.length; i++) {
            const index = (this.currentFrame + 1 + i) % this.frames.length;
            if (index !== this.currentFrame) {
                sequence.push(index);
            }
        }

        for (const index of sequence) {
            await this.preloadFrame(index);
        }
    }

    preloadFrame(index) {
        return new Promise(resolve => {
            const layer = this.getLayer(index);

            // If layer exists and is on map, it's likely already loaded or loading.
            // But we want to ensure it's loaded before moving to next.
            if (!layer) {
                resolve();
                return;
            }

            if (this.map.hasLayer(layer)) {
                // Already on map (maybe from showFrame). 
                // We assume it's handling itself, but we'll wait a small bit just to space out requests
                setTimeout(resolve, 500);
                return;
            }

            // Add to map hidden to trigger load
            layer.setOpacity(0);
            layer.addTo(this.map);

            const onComplete = () => {
                cleanup();
                resolve();
            };

            const cleanup = () => {
                layer.off('load', onComplete);
                layer.off('tileerror', onComplete);
            };

            layer.on('load', onComplete);
            layer.on('tileerror', onComplete);

            // Timeout to prevent stuck queue (3s per frame)
            setTimeout(() => {
                cleanup();
                resolve();
            }, 3000);
        });
    }

    /**
     * Display a specific animation frame on the map.
     * 
     * LAYER STRATEGY:
     * - All layers stay on the map once added (tiles are cached by browser)
     * - Toggle opacity to show/hide frames (prevents flash from re-adding)
     * - Preload next frame at opacity 0 so tiles load before transition
     * 
     * RATE LIMITING (RainViewer free tier - as of Jan 2026):
     * - maxNativeZoom: 7 prevents requests at invalid zoom levels
     * - Smart polling syncs with RainViewer's 10-min update cycle
     * - Tiles cache in browser after first load, so zoom/pan after initial
     *   load hits cache rather than making new requests
     * 
     * @param {number} index - Frame index to display (0 to frames.length-1)
     */
    showFrame(index) {
        if (index < 0 || index >= this.frames.length) return;

        // Skip if already showing this frame (prevents redundant updates)
        if (this.visibleLayerIndex === index) return;

        const previousIndex = this.visibleLayerIndex;

        // Get or create the current layer and add to map if needed
        const layer = this.getLayer(index);
        if (layer) {
            if (!this.map.hasLayer(layer)) {
                layer.addTo(this.map);
            }
            // Show this layer
            layer.setOpacity(CONFIG.radarOpacity);
        }

        // Hide the previous layer (keep on map - tiles are cached by browser)
        // We don't remove layers because:
        // 1. Removing/re-adding causes flash even with cached tiles
        // 2. Browser caches tiles, so staying on map doesn't re-fetch
        // 3. Zoom/pan will trigger tile requests either way
        if (previousIndex !== -1 && this.layers[previousIndex]) {
            this.layers[previousIndex].setOpacity(0);
        }

        // Preload next frame to map at opacity 0 (ensures tiles load ahead of time)
        const nextIndex = (index + 1) % this.frames.length;
        const nextLayer = this.getLayer(nextIndex);
        if (nextLayer && !this.map.hasLayer(nextLayer)) {
            nextLayer.addTo(this.map);
            nextLayer.setOpacity(0);
        }

        // Update state
        this.visibleLayerIndex = index;
        this.updateTimeDisplay(this.frames[index]?.time);
        if (this.ui.slider) this.ui.slider.value = index;
    }

    updateTimeDisplay(timestamp) {
        if (!this.ui.time || !timestamp) return;

        // Bolt Optimization: Use shared formatter and cached elements
        // This runs every animation frame, so efficiency matters.
        const date = new Date(timestamp * 1000);
        const timeStr = this.timeFormatter.format(date);

        this.ui.time.textContent = timeStr;

        let relativeText = '';

        // Show relative to session if available
        if (this.ui.relative && this.sessionTime) {
            const diff = (timestamp * 1000 - this.sessionTime.getTime()) / 60000; // minutes
            if (Math.abs(diff) < 1) {
                relativeText = 'Session start';
            } else if (diff < 0) {
                relativeText = `${Math.abs(Math.round(diff))}m before`;
            } else {
                relativeText = `${Math.round(diff)}m after`;
            }
            this.ui.relative.textContent = relativeText;
        } else if (this.ui.relative) {
            const now = Date.now() / 1000;
            const diff = timestamp - now;
            if (diff > 60) {
                relativeText = 'Forecast';
            }
            this.ui.relative.textContent = relativeText;
        }

        if (this.ui.slider) {
            const ariaText = relativeText ? `${timeStr}, ${relativeText}` : timeStr;
            this.ui.slider.setAttribute('aria-valuetext', ariaText);
        }
    }

    updateSlider() {
        if (this.ui.slider) {
            this.ui.slider.max = this.frames.length - 1;
            this.ui.slider.value = this.currentFrame;

            // Create a visual split between past and forecast frames
            if (this.frames.length > 1 && this.pastFrameCount > 0) {
                const forecastStartIndex = this.pastFrameCount;
                const splitPercentage = (forecastStartIndex / (this.frames.length - 1)) * 100;

                // Apply a gradient background to the slider track
                this.ui.slider.style.background = `linear-gradient(to right,
                    var(--color-border) 0%,
                    var(--color-border) ${splitPercentage}%,
                    var(--color-forecast-track) ${splitPercentage}%,
                    var(--color-forecast-track) 100%)`;
            } else {
                // Default style if no forecast frames
                this.ui.slider.style.background = 'var(--color-border)';
            }
        }

        if (this.ui.timeStart && this.ui.timeEnd && this.frames.length > 0) {
            this.ui.timeStart.textContent = this.timeFormatter.format(new Date(this.frames[0].time * 1000));
            this.ui.timeEnd.textContent = this.timeFormatter.format(new Date(this.frames[this.frames.length - 1].time * 1000));
        } else if (this.ui.timeStart && this.ui.timeEnd) {
            this.ui.timeStart.textContent = '--:--';
            this.ui.timeEnd.textContent = '--:--';
        }
    }

    play() {
        // Clear any existing timer/loop first to prevent double animations
        this.pause();

        // Apply any pending updates before starting
        if (this.pendingFrames) {
            this.applyFrameUpdate(this.pendingFrames);
            this.pendingFrames = null;
        }

        this.isPlaying = true;
        if (this.ui.playBtn) {
            this.ui.playBtn.classList.add('playing');
            this.ui.playBtn.setAttribute('aria-pressed', 'true');
        }

        // Bolt Optimization: Use requestAnimationFrame instead of setInterval
        // Prevents drift and saves battery in background tabs
        this.lastFrameTime = performance.now();
        this.loop();
    }

    loop() {
        if (!this.isPlaying) return;

        const now = performance.now();
        const elapsed = now - this.lastFrameTime;
        const speed = this.getCurrentSpeed();

        if (elapsed >= speed) {
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
            this.showFrame(this.currentFrame);
            // Adjust for drift while preserving the interval grid
            this.lastFrameTime = now - (elapsed % speed);
        }

        this.animationFrameId = requestAnimationFrame(this.boundLoop);
    }

    pause() {
        this.isPlaying = false;
        if (this.ui.playBtn) {
            this.ui.playBtn.classList.remove('playing');
            this.ui.playBtn.setAttribute('aria-pressed', 'false');
        }

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    togglePlay() {
        if (this.isPlaying) this.pause();
        else this.play();
    }

    showControls(visible) {
        if (this.ui.controls) this.ui.controls.style.display = visible ? 'flex' : 'none';
    }

    destroy() {
        this.stopPolling();
        this.pause();
        this.hideTileError();
        this.layers.forEach(layer => {
            if (layer) this.map.removeLayer(layer);
        });
        this.layers = [];
        this.showControls(false);
    }
}

// ===================================
// Range Circles (Outline Only)
// ===================================

class RangeCircles {
    constructor(map) {
        this.map = map;
        this.circles = [];
        this.labels = [];
        this.unit = this.getInitialUnit();
        this.center = null;
        this.visibleCount = 4; // How many circles to show based on zoom
        this.currentSteps = null;
        this.centerMarker = null;
        this.bindEvents();
        this.updateToggleUI();
    }

    getInitialUnit() {
        const stored = SafeStorage.getItem('unit');
        if (stored) return stored;
        // Detect from locale (imperial countries: US, Liberia, Myanmar)
        const lang = navigator.language || 'en-US';
        const imperialLocales = ['en-US', 'en-LR', 'my-MM'];
        return imperialLocales.some(l => lang.startsWith(l.split('-')[0]) && lang.includes(l.split('-')[1]))
            ? 'imperial'
            : 'metric';
    }

    bindEvents() {
        const toggle = document.getElementById('unitToggle');
        if (toggle) {
            toggle.addEventListener('click', (e) => {
                const option = e.target.closest('.unit-option');
                if (option) this.setUnit(option.dataset.unit);
            });
        }

        // Adjust visible circles based on zoom
        this.map.on('zoomend', () => this.updateVisibility());
    }

    setUnit(unit) {
        this.unit = unit;
        SafeStorage.setItem('unit', unit);
        this.updateToggleUI();
        if (this.center) this.draw(this.center);
    }

    updateToggleUI() {
        document.querySelectorAll('.unit-option').forEach(opt => {
            const isActive = opt.dataset.unit === this.unit;
            opt.classList.toggle('active', isActive);
            opt.setAttribute('aria-pressed', isActive);
        });
    }

    draw(center) {
        // Check if center has changed
        const centerChanged = !this.center || this.center[0] !== center[0] || this.center[1] !== center[1];
        const unitChanged = this.unit !== this.currentUnit;

        const steps = this.calculateSteps(center);
        const stepsChanged = !this.currentSteps || JSON.stringify(steps) !== JSON.stringify(this.currentSteps);

        // Optimization: Only redraw if nothing material has changed
        if (!centerChanged && !stepsChanged && !unitChanged) {
            return;
        }

        this.center = [...center];
        this.currentSteps = steps;
        this.currentUnit = this.unit;

        // Bolt Optimization: Reuse existing layers (Object Pooling)
        // prevents DOM thrashing during frequent zoom events.
        const multiplier = this.unit === 'metric' ? 1000 : 1609.34;
        // Get theme-aware color from CSS variable
        const rangeColor = getComputedStyle(document.documentElement).getPropertyValue('--color-range-circle').trim() || '#e10600';

        steps.forEach((distance, index) => {
            const radius = distance * multiplier;

            // 1. Rings
            if (this.circles[index]) {
                const circle = this.circles[index];
                circle.setLatLng(center);
                circle.setRadius(radius);
                circle.setStyle({
                    color: rangeColor,
                    weight: index === 0 ? 2 : 1,
                    dashArray: index > 0 ? '4, 4' : null
                });
                if (!this.map.hasLayer(circle)) circle.addTo(this.map);
            } else {
                const circle = L.circle(center, {
                    interactive: false,
                    radius: radius,
                    color: rangeColor,
                    fillColor: 'transparent',
                    fillOpacity: 0,
                    weight: index === 0 ? 2 : 1,
                    dashArray: index > 0 ? '4, 4' : null,
                    opacity: 0.7,
                });
                circle.addTo(this.map);
                this.circles.push(circle);
            }

            // 2. Labels
            const labelLatLng = this.getPointAtDistance(center, radius, 90);
            const html = `<span aria-hidden="true">${distance}</span>`;

            if (this.labels[index]) {
                const labelMarker = this.labels[index];
                labelMarker.setLatLng(labelLatLng);
                // Update icon content
                const newIcon = L.divIcon({
                    className: 'range-label',
                    html: html,
                    iconSize: [30, 12],
                    iconAnchor: [0, 6],
                });
                labelMarker.setIcon(newIcon);
                if (!this.map.hasLayer(labelMarker)) labelMarker.addTo(this.map);
            } else {
                const label = L.divIcon({
                    className: 'range-label',
                    html: html,
                    iconSize: [30, 12],
                    iconAnchor: [0, 6],
                });
                const labelMarker = L.marker(labelLatLng, { icon: label, interactive: false, keyboard: false });
                labelMarker.addTo(this.map);
                this.labels.push(labelMarker);
            }
        });

        // Cleanup extras
        while (this.circles.length > steps.length) {
            const c = this.circles.pop();
            this.map.removeLayer(c);
        }
        while (this.labels.length > steps.length) {
            const l = this.labels.pop();
            this.map.removeLayer(l);
        }

        // Circuit center marker
        if (this.centerMarker) {
            this.centerMarker.setLatLng(center);
            this.centerMarker.setStyle({ color: rangeColor });
            if (!this.map.hasLayer(this.centerMarker)) this.centerMarker.addTo(this.map);
        } else {
            this.centerMarker = L.circleMarker(center, {
                interactive: false,
                keyboard: false,
                radius: 6,
                color: rangeColor,
                fillColor: '#ffffff',
                fillOpacity: 1,
                weight: 2,
            });
            this.centerMarker.addTo(this.map);
        }
        if (this.centerMarker.bringToFront) {
            this.centerMarker.bringToFront();
        }
    }

    calculateSteps(center) {
        // Calculate dynamic steps based on current view bounds
        const bounds = this.map.getBounds();
        const north = bounds.getNorth();
        const centerLat = center[0];

        // Approximate visible radius in meters (center to top edge)
        // This is a rough heuristic to ensure rings fit on screen
        const topLatLng = L.latLng(north, center[1]);
        const visibleRadiusMeters = this.map.distance(center, topLatLng);

        // Convert to current unit
        const multiplier = this.unit === 'metric' ? 1000 : 1609.34;
        const visibleRadius = visibleRadiusMeters / multiplier;

        // Target around 3-4 rings
        const targetStep = visibleRadius / 4;

        // Find closest "nice" number
        // 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000...
        const magnitude = Math.pow(10, Math.floor(Math.log10(targetStep)));
        const normalized = targetStep / magnitude;

        let niceStep;
        if (normalized < 1.5) niceStep = 1 * magnitude;
        else if (normalized < 3.5) niceStep = 2 * magnitude; // or 2.5?
        else if (normalized < 7.5) niceStep = 5 * magnitude;
        else niceStep = 10 * magnitude;

        // Ensure strictly positive
        niceStep = Math.max(niceStep, 1);

        // Generate steps: 1x, 2x, 3x until out of view (or max 5 rings)
        const steps = [];
        for (let i = 1; i <= 5; i++) {
            const step = niceStep * i;
            // Only add if it's somewhat visible (radius < visibleRadius * 1.5 to allow corners)
            if (step > visibleRadius * 1.5) break;
            steps.push(step);
        }

        return steps;
    }

    getPointAtDistance(center, distance, bearing) {
        const R = 6371000; // Earth radius in meters
        const lat1 = center[0] * Math.PI / 180;
        const lng1 = center[1] * Math.PI / 180;
        const brng = bearing * Math.PI / 180;

        const lat2 = Math.asin(
            Math.sin(lat1) * Math.cos(distance / R) +
            Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng)
        );
        const lng2 = lng1 + Math.atan2(
            Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1),
            Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2)
        );

        return [lat2 * 180 / Math.PI, lng2 * 180 / Math.PI];
    }

    clear() {
        this.circles.forEach(c => this.map.removeLayer(c));
        this.labels.forEach(l => this.map.removeLayer(l));
        if (this.centerMarker) this.map.removeLayer(this.centerMarker);

        this.circles = [];
        this.labels = [];
        this.centerMarker = null;
    }

    updateVisibility() {
        // Redraw circles with appropriate distances for current zoom
        if (this.center) {
            this.draw(this.center);
        }
    }
}

// ===================================
// Countdown Timer
// ===================================

const MapWeatherWidget = L.Control.extend({
    onAdd: function (map) {
        this._div = L.DomUtil.create('div', 'leaflet-control-weather');

        // Bolt Optimization: Create DOM structure once and reuse
        // This avoids frequent innerHTML parsing/GC during map interactions
        this._div.innerHTML = `
            <div class="weather-widget-metric" role="group" aria-label="Temperature" title="Temperature">
                <svg class="icon-weather icon-temp" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>
                <span class="temp-value">--</span>
            </div>
            <div class="weather-widget-metric" role="group" aria-label="Humidity" title="Humidity">
                <svg class="icon-weather icon-humidity" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></svg>
                <span class="humid-value">--%</span>
            </div>
            <div class="weather-widget-metric" role="group" aria-label="Wind Speed" title="Wind">
                 <svg class="icon-weather icon-wind" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" /></svg>
                <span class="wind-value">--</span>
            </div>
        `;

        // Cache references to the dynamic elements
        this._ui = {
            temp: this._div.querySelector('.temp-value'),
            humid: this._div.querySelector('.humid-value'),
            wind: this._div.querySelector('.wind-value'),
            tempGroup: this._div.querySelector('.weather-widget-metric[title="Temperature"]'),
            humidGroup: this._div.querySelector('.weather-widget-metric[title="Humidity"]'),
            windGroup: this._div.querySelector('.weather-widget-metric[title="Wind"]')
        };

        return this._div;
    },

    onRemove: function (map) {
        this._ui = null;
    },

    update: function (weather) {
        if (!this._div || !this._ui) return;

        if (!weather || !weather.current) {
            this._ui.temp.textContent = '--';
            this._ui.humid.textContent = '--%';
            this._ui.wind.textContent = '--';
            return;
        }

        const temp = Math.round(weather.current.temperature_2m);
        const humidity = Math.round(weather.current.relative_humidity_2m || 0);
        const wind = Math.round(weather.current.wind_speed_10m);

        // Bolt Optimization: Update textContent instead of innerHTML
        this._ui.temp.textContent = `${temp}${weather.units.temperature_2m}`;
        this._ui.humid.textContent = `${humidity}%`;
        this._ui.wind.textContent = `${wind} ${weather.units.wind_speed_10m}`;

        // Palette Accessibility: Dynamic ARIA labels
        if (this._ui.tempGroup) this._ui.tempGroup.setAttribute('aria-label', `Temperature: ${this._ui.temp.textContent}`);
        if (this._ui.humidGroup) this._ui.humidGroup.setAttribute('aria-label', `Humidity: ${this._ui.humid.textContent}`);
        if (this._ui.windGroup) this._ui.windGroup.setAttribute('aria-label', `Wind Speed: ${this._ui.wind.textContent}`);
    }
});

class CountdownTimer {
    constructor() {
        this.timer = null;
        this.targetTime = null;
        this.sessionName = '';
        this.mobileQuery = window.matchMedia('(max-width: 768px)');

        // Bolt Optimization: Cache DOM elements
        this.ui = {
            timer: document.getElementById('countdownTimer'),
            session: document.getElementById('countdownSession'),
            mobileTimer: document.getElementById('mobileCountdownTimer'),
            mobileSession: document.getElementById('mobileCountdownSession'),
            card: document.getElementById('countdownCard'),
            mobileCard: document.getElementById('mobileCountdown')
        };
    }

    start(targetTime, sessionName) {
        this.stop();
        this.targetTime = targetTime;
        this.sessionName = sessionName;

        this.show(true);
        this.update();
        this.timer = setInterval(() => this.update(), 1000);
    }

    update() {
        const now = new Date();
        const diff = this.targetTime - now;

        if (diff <= 0) {
            if (this.ui.timer) {
                this.ui.timer.textContent = 'NOW';
                this.ui.timer.removeAttribute('aria-label');
            }
            if (this.ui.mobileTimer) {
                this.ui.mobileTimer.textContent = 'NOW';
                this.ui.mobileTimer.removeAttribute('aria-label');
            }
            this.stop();
            return;
        }

        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);

        let timeText;
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            timeText = `${days}d ${hours % 24}h`;
        } else {
            timeText = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        const accessibleText = this.getAccessibleDuration(diff);

        if (this.ui.timer) {
            this.ui.timer.textContent = timeText;
            this.ui.timer.setAttribute('aria-label', accessibleText);
        }
        if (this.ui.mobileTimer) {
            this.ui.mobileTimer.textContent = timeText;
            this.ui.mobileTimer.setAttribute('aria-label', accessibleText);
        }
        if (this.ui.session) this.ui.session.textContent = this.sessionName;
        if (this.ui.mobileSession) this.ui.mobileSession.textContent = this.sessionName;
    }

    getAccessibleDuration(diff) {
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);

        if (hours > 24) {
            const days = Math.floor(hours / 24);
            const remHours = hours % 24;
            return `${days} day${days !== 1 ? 's' : ''}, ${remHours} hour${remHours !== 1 ? 's' : ''}`;
        }

        const parts = [];
        if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
        if (mins > 0) parts.push(`${mins} minute${mins !== 1 ? 's' : ''}`);
        parts.push(`${secs} second${secs !== 1 ? 's' : ''}`);

        return parts.join(', ');
    }

    show(visible) {
        if (this.ui.card) this.ui.card.style.display = visible ? 'block' : 'none';
        // Only show mobile countdown on mobile viewports
        if (this.ui.mobileCard) {
            const isMobile = this.mobileQuery.matches;
            this.ui.mobileCard.style.display = (visible && isMobile) ? 'block' : 'none';
        }
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}


// ===================================
// Weather Widget (Desktop)
// ===================================

class WeatherWidget {
    constructor() {
        this.el = null;
        this.create();
    }

    create() {
        // Feature flag: Don't create widget if current weather is disabled
        if (!FEATURE_FLAGS.enableCurrentWeather) return;

        const container = document.querySelector('.main-content');
        if (!container) return;

        this.el = document.createElement('div');
        this.el.className = 'weather-widget';
        // HTML injected by JS
        this.el.innerHTML = `
            <div class="weather-widget-metric" id="widgetTempGroup" role="group" aria-label="Temperature" title="Temperature">
                <svg class="icon-weather icon-temp" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
                </svg>
                <span id="widgetTemp">--</span>
            </div>
            <div class="weather-widget-metric" id="widgetHumidGroup" role="group" aria-label="Humidity" title="Humidity">
                <svg class="icon-weather icon-humidity" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
                <span id="widgetHumidity">--</span>
            </div>
            <div class="weather-widget-metric" id="widgetWindGroup" role="group" aria-label="Wind Speed" title="Wind Speed">
                 <svg class="icon-weather icon-wind" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
                </svg>
                <span id="widgetWind">--</span>
            </div>
        `;

        container.appendChild(this.el);
    }

    update(weather) {
        if (!this.el) return;

        if (!weather || !weather.current) {
            this.el.style.display = 'none';
            return;
        }

        // Only toggle flex, visibility controlled by CSS media query (hidden on mobile)
        this.el.style.display = 'flex';

        const temp = Math.round(weather.current.temperature_2m);
        const humidity = Math.round(weather.current.relative_humidity_2m || 0);
        const wind = Math.round(weather.current.wind_speed_10m);

        const tempEl = document.getElementById('widgetTemp');
        const humidEl = document.getElementById('widgetHumidity');
        const windEl = document.getElementById('widgetWind');

        const tempGroup = document.getElementById('widgetTempGroup');
        const humidGroup = document.getElementById('widgetHumidGroup');
        const windGroup = document.getElementById('widgetWindGroup');

        if (tempEl) tempEl.textContent = `${temp}${weather.units.temperature_2m}`;
        if (humidEl) humidEl.textContent = `${humidity}%`;
        if (windEl) windEl.textContent = `${wind} ${weather.units.wind_speed_10m}`;

        // Palette Accessibility: Dynamic ARIA labels
        if (tempGroup && tempEl) tempGroup.setAttribute('aria-label', `Temperature: ${tempEl.textContent}`);
        if (humidGroup && humidEl) humidGroup.setAttribute('aria-label', `Humidity: ${humidEl.textContent}`);
        if (windGroup && windEl) windGroup.setAttribute('aria-label', `Wind Speed: ${windEl.textContent}`);
    }
}

// ===================================
// Recentre Control
// ===================================

class RecentreControl {
    constructor(map) {
        this.map = map;
        this.circuitCenter = null;
        this.circuitZoom = CONFIG.circuitZoom;
        this.button = null;
        this.init();
    }

    init() {
        // Find the zoom control container
        const zoomControl = document.querySelector('.leaflet-control-zoom');
        if (!zoomControl) return;

        // Create the recentre button as an anchor like zoom buttons
        this.button = document.createElement('a');
        this.button.className = 'leaflet-control-zoom-recentre';
        this.button.href = '#';
        this.button.title = 'Recentre on circuit (C)';
        this.button.setAttribute('role', 'button');
        this.button.setAttribute('aria-label', 'Recentre on circuit');
        this.button.setAttribute('aria-keyshortcuts', 'c');
        this.button.innerHTML = `
            <svg class="recentre-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
            </svg>
        `;
        this.button.style.display = 'none';

        // Insert at the top of the zoom control (before zoom in)
        zoomControl.insertBefore(this.button, zoomControl.firstChild);

        // Prevent map click propagation
        L.DomEvent.disableClickPropagation(this.button);

        this.button.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.circuitCenter) {
                this.map.setView(this.circuitCenter, this.circuitZoom);
            }
        });

        // Global shortcut: C to recentre
        document.addEventListener('keydown', (e) => {
            if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                // Check if we are focusing an input
                const tag = document.activeElement.tagName.toLowerCase();
                if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

                if (this.circuitCenter) {
                    this.map.setView(this.circuitCenter, this.circuitZoom);
                }
            }
        });

        // Show/hide based on map movement
        this.map.on('moveend', () => this.updateVisibility());
    }

    setCircuit(center, zoom = CONFIG.circuitZoom) {
        this.circuitCenter = center;
        this.circuitZoom = zoom;
        this.updateVisibility();
    }

    updateVisibility() {
        if (!this.circuitCenter || !this.map || !this.button) {
            if (this.button) this.button.style.display = 'none';
            return;
        }
        const mapCenter = this.map.getCenter();
        const dist = this.map.distance(mapCenter, L.latLng(this.circuitCenter));
        // Show button if more than 5km from circuit center
        this.button.style.display = dist > 5000 ? 'flex' : 'none';
    }
}

// ===================================
// Router
// ===================================

class Router {
    constructor(onRoute) {
        this.onRoute = onRoute;
        window.addEventListener('popstate', () => this.handleRoute());
    }

    handleRoute() {
        const parts = window.location.pathname.split('/').filter(Boolean);
        if (parts.length >= 1) {
            this.onRoute({ series: parts[0], round: parts[1] || null, session: parts[2] || null });
        }
    }

    navigate(series, round, session) {
        let path = `/${series}`;
        if (round) path += `/${round}`;
        if (session) path += `/${session}`;
        window.history.pushState({}, '', path);
    }

    getParams() {
        const parts = window.location.pathname.split('/').filter(Boolean);
        return { series: parts[0] || 'f1', round: parts[1] || null, session: parts[2] || null };
    }
}

// ===================================
// Map Manager
// ===================================

class MapManager {
    constructor() {
        this.map = null;
        this.tileLayer = null;
        this.currentTheme = 'light';
        this.resizeObserver = null;
    }

    init() {
        this.map = L.map('map', {
            center: CONFIG.defaultCenter,
            zoom: CONFIG.defaultZoom,
            zoomControl: true,
        });

        // Bolt Optimization: Use ResizeObserver to automatically handle map resizing
        // This is more efficient than window.resize listeners and manual timeouts
        const mapContainer = document.getElementById('map');
        if (mapContainer && window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                if (this.map) {
                    this.map.invalidateSize();
                }
            });
            this.resizeObserver.observe(mapContainer);
        }

        this.setTheme(document.documentElement.getAttribute('data-theme') || 'light');
        return this.map;
    }

    setTheme(theme) {
        this.currentTheme = theme;
        const tileUrl = theme === 'dark' ? CONFIG.mapTilesDark : CONFIG.mapTiles;

        if (this.tileLayer) this.map.removeLayer(this.tileLayer);

        this.tileLayer = L.tileLayer(tileUrl, {
            attribution: '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/copyright">OSM</a>',
            maxZoom: 18,
            subdomains: 'abcd',
        });
        this.tileLayer.addTo(this.map);
    }

    setView(lat, lng, zoom = CONFIG.circuitZoom) {
        if (this.map) this.map.setView([lat, lng], zoom);
    }
}

// ===================================
// Privacy Modal
// ===================================

class PrivacyModal {
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
            this.privacyLink.addEventListener('click', () => {
                this.open();
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
        if (!this.loaded) {
            await this.loadContent();
        }
        if (this.backdrop) {
            this.backdrop.classList.add('visible');
            document.body.style.overflow = 'hidden';
            // Move focus to close button for accessibility
            if (this.closeBtn) this.closeBtn.focus();
            // Enable focus trap
            this.backdrop.addEventListener('keydown', this._handleFocusTrap);
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
        const focusableElements = this.backdrop.querySelectorAll(focusableSelectors);

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
            const clean = String(url).replace(/[\s\x00-\x1F\x7F-\x9F]/g, '');

            // Allowlist approach: Check for protocol scheme
            // Regex: Start with letter, followed by valid scheme chars, then colon
            if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) {
                // If scheme exists, it MUST be in our allowlist
                if (/^(?:https?|mailto):/i.test(clean)) {
                    return clean;
                }
                // Block file:, javascript:, vbscript:, data:, blob:, etc.
                return '#unsafe-url';
            }
            // No scheme (relative URL), allow
            return clean;
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

// ===================================
// Main Application
// ===================================

class CircuitWeatherApp {
    constructor() {
        this.mapManager = new MapManager();
        this.themeManager = null;
        this.sidebarManager = null;
        this.f1Api = new F1API();
        this.weatherClient = new WeatherClient();
        this.radar = null;
        this.trackLayer = null;
        this.rangeCircles = null;
        this.weatherWidget = null;
        this.countdown = new CountdownTimer();
        this.recentreControl = null;
        this.currentCircuitCenter = null;
        this.races = [];
        this.selectedRace = null;
        this.selectedSession = null;
        this.router = new Router(params => this.handleRoute(params));
        this.mobileQuery = window.matchMedia('(max-width: 768px)');

        // Bolt Optimization: Cache frequently accessed DOM elements
        this.ui = {
            loadingOverlay: document.getElementById('loadingOverlay'),
            roundSelect: document.getElementById('roundSelect'),
            sessionSelect: document.getElementById('sessionSelect'),
            // Race Info Banner (Sidebar)
            raceInfoBanner: document.getElementById('raceInfoBanner'),
            countryFlag: document.getElementById('countryFlag'),
            raceInfoCountry: document.getElementById('raceInfoCountry'),
            raceInfoName: document.getElementById('raceInfoName'),
            raceInfoCircuit: document.getElementById('raceInfoCircuit'),
            // Forecast Section (Sidebar)
            forecastSection: document.getElementById('forecastSection'),
            forecastContent: document.getElementById('forecastContent'),
            forecastUnavailable: document.getElementById('forecastUnavailable'),
            weatherTemp: document.getElementById('weatherTemp'),
            weatherRain: document.getElementById('weatherRain'),
            weatherWind: document.getElementById('weatherWind'),
            weatherWindDir: document.getElementById('weatherWindDir'),
            weatherTimeline: document.getElementById('weatherTimeline'),
            // Mobile Race Info
            mobileRaceInfo: document.getElementById('mobileRaceInfo'),
            mobileCountryFlag: document.getElementById('mobileCountryFlag'),
            mobileRaceInfoName: document.getElementById('mobileRaceInfoName'),
            mobileRaceInfoCircuit: document.getElementById('mobileRaceInfoCircuit'),
            // Mobile Weather Card (Live)
            mobileWeatherCard: document.getElementById('mobileWeatherCard'),
            mobileWeatherTemp: document.getElementById('mobileWeatherTemp'),
            mobileWeatherWind: document.getElementById('mobileWeatherWind'),
            mobileWeatherHumidity: document.getElementById('mobileWeatherHumidity'),
        };
    }

    async init() {
        this.showLoading(true);

        try {
            const map = this.mapManager.init();

            // Theme manager with callback to update map tiles
            this.themeManager = new ThemeManager((theme) => {
                this.mapManager.setTheme(theme);
            });

            // Sidebar manager for mobile
            this.sidebarManager = new SidebarManager();

            // Handle resize events for mobile visibility
            this.bindResizeHandler();

            // Recentre control (added to zoom control container)
            this.recentreControl = new RecentreControl(map);

            this.rangeCircles = new RangeCircles(map);
            this.trackLayer = new TrackLayer(map);
            this.radar = new WeatherRadar(map);

            // Only create weather widget if feature is enabled
            if (FEATURE_FLAGS.enableCurrentWeather) {
                this.weatherWidget = new MapWeatherWidget({ position: 'topright' });
                this.mapManager.map.addControl(this.weatherWidget);
            }


            // Always load radar immediately
            this.radar.load();

            const races = await this.f1Api.getSchedule();
            this.races = races.map(race => this.f1Api.parseRace(race));
            this.populateRoundSelect();
            this.bindEvents();

            const params = this.router.getParams();
            if (params.round) {
                await this.handleRoute(params);
            } else {
                // Auto-select next upcoming round and session
                this.autoSelectNextRound();
            }

            // Initial weather update for circuit (deferred until circuit selected)
            // Note: Weather is now pinned to circuit, not map center
            this.startWeatherRefreshInterval();


            this.showLoading(false);
        } catch (error) {
            console.error('Failed to initialize:', error);
            this.showLoading(false);
            this.showInitError();
        }
    }

    showInitError() {
        const sidebarContent = document.querySelector('.sidebar-content');
        if (sidebarContent) {
            sidebarContent.innerHTML = `
                <div class="error-state">
                    <div class="error-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                    </div>
                    <h3>Connection Failed</h3>
                    <p>Unable to load race schedule.</p>
                    <button class="retry-btn" type="button">Retry</button>
                </div>
            `;
            const btn = sidebarContent.querySelector('.retry-btn');
            if (btn) {
                btn.addEventListener('click', () => window.location.reload());
            }
        }
    }

    autoSelectNextRound() {
        const now = new Date();
        // Find next race with a session in the future
        const nextRace = this.races.find(race => {
            const raceDate = new Date(race.date);
            // Add 3 hours buffer for race duration
            raceDate.setHours(raceDate.getHours() + 3);
            return raceDate > now;
        });

        if (nextRace) {
            if (this.ui.roundSelect) this.ui.roundSelect.value = nextRace.round;
            this.selectRound(nextRace.round);

            // Find next upcoming session within this round
            const nextSession = nextRace.sessions.find(session => {
                if (!session.date || !session.time) return false;
                const sessionTime = new Date(`${session.date}T${session.time}`);
                return sessionTime > now;
            });

            if (nextSession) {
                if (this.ui.sessionSelect) this.ui.sessionSelect.value = nextSession.id;
                this.selectSession(nextSession.id);
            }
        }
    }

    bindResizeHandler() {
        this.mobileQuery.addEventListener('change', () => {
            // Note: Map resizing is handled by ResizeObserver in MapManager
            // Update visibility when crossing the breakpoint
            this.updateMobileVisibility();
        });
    }

    updateMobileVisibility() {
        const isMobile = this.mobileQuery.matches;

        // Update mobile race info visibility
        if (this.ui.mobileRaceInfo) {
            this.ui.mobileRaceInfo.style.display = (this.selectedRace && isMobile) ? 'flex' : 'none';
        }

        // Update mobile countdown visibility
        const mobileCountdown = document.getElementById('mobileCountdown');
        if (mobileCountdown) {
            const shouldShow = this.selectedSession && this.countdown.targetTime;
            mobileCountdown.style.display = (shouldShow && isMobile) ? 'block' : 'none';
        }

        // Update mobile weather card visibility
        if (this.ui.mobileWeatherCard) {
            // Check if we have valid data (renderLiveWeather sets display to none if not)
            // But renderLiveWeather is async.
            // For now, let's assume if we have a selected race, we want to show it (unless data failed).
            // Actually, best to let renderLiveWeather handle the "if data exists" part,
            // and here we just handle the "if mobile" part.
            // But if renderLiveWeather hid it, we shouldn't show it.

            const hasData = this.ui.mobileWeatherCard.style.display !== 'none';
            if (hasData) {
                this.ui.mobileWeatherCard.style.display = isMobile ? 'flex' : 'none';
            }
        }

        // Note: Map resizing is handled by ResizeObserver in MapManager
    }

    bindEvents() {
        if (this.ui.roundSelect) {
            this.ui.roundSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.selectRound(e.target.value);
                } else {
                    // Palette UX: Reset session select when round is cleared
                    if (this.ui.sessionSelect) {
                        this.ui.sessionSelect.disabled = true;
                        this.ui.sessionSelect.innerHTML = '<option value="">Select a round first</option>';
                    }
                    this.selectedSession = null;
                    this.selectedRace = null;
                    if (this.ui.forecastSection) this.ui.forecastSection.style.display = 'none';
                    if (this.ui.raceInfoBanner) this.ui.raceInfoBanner.style.display = 'none';
                    this.countdown.show(false);
                    this.trackLayer.clear();
                    this.rangeCircles.clear();
                }
            });
        }

        if (this.ui.sessionSelect) {
            this.ui.sessionSelect.addEventListener('change', (e) => {
                if (e.target.value && this.selectedRace) {
                    this.selectSession(e.target.value);
                }
            });
        }

        // Note: Weather updates are now pinned to circuit, not triggered by map pan
        // This reduces API calls significantly - weather only updates when circuit changes or every 5 minutes
    }

    populateRoundSelect() {
        const select = this.ui.roundSelect;
        if (!select) return;

        select.innerHTML = '<option value="">Select round...</option>';

        // Bolt Optimization: Use DocumentFragment to batch DOM insertions
        // Reduces reflows when populating the race list (~24 items)
        const fragment = document.createDocumentFragment();

        this.races.forEach(race => {
            const option = document.createElement('option');
            option.value = race.round;
            const date = new Date(race.date);
            const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            option.textContent = `R${race.round}: ${race.name} (${dateStr})`;
            fragment.appendChild(option);
        });

        select.appendChild(fragment);
    }

    selectRound(round) {
        const race = this.races.find(r => r.round === round);
        if (!race) return;

        this.selectedRace = race;
        this.selectedSession = null;
        this.populateSessionSelect(race.sessions);

        if (race.location) {
            const lat = parseFloat(race.location.lat);
            const lng = parseFloat(race.location.long);
            this.currentCircuitCenter = [lat, lng];
            this.mapManager.setView(lat, lng);
            this.rangeCircles.draw([lat, lng]);

            // Load track layout
            if (race.circuit && race.circuit.circuitId) {
                this.trackLayer.loadTrack(race.circuit.circuitId);
            }

            // Update recentre control
            if (this.recentreControl) {
                this.recentreControl.setCircuit([lat, lng]);
            }
        }

        // Update race info banner
        this.updateRaceInfo(race);

        // Hide countdown until session selected (radar always shows)
        this.countdown.show(false);

        // Hide forecast section since no session is selected yet
        if (this.ui.forecastSection) {
            this.ui.forecastSection.style.display = 'none';
        }

        // Fetch current "Live" weather for the widgets
        this.updateLiveWeatherForCircuit();

        this.updateMobileVisibility();

        this.router.navigate('f1', round, null);
    }

    updateRaceInfo(race) {
        const country = race.location?.country;
        const code = COUNTRY_CODES[country];
        const flagUrl = code ? `https://flagcdn.com/w80/${code}.png` : '';

        // Sidebar banner
        if (this.ui.raceInfoBanner) {
            this.ui.raceInfoBanner.style.display = race ? 'flex' : 'none';
        }
        if (this.ui.countryFlag && flagUrl) {
            this.ui.countryFlag.src = flagUrl;
            this.ui.countryFlag.alt = `${country} flag`;
        }
        if (this.ui.raceInfoCountry) this.ui.raceInfoCountry.textContent = country || '';
        if (this.ui.raceInfoName) this.ui.raceInfoName.textContent = race.name || '';
        if (this.ui.raceInfoCircuit) this.ui.raceInfoCircuit.textContent = race.circuit?.circuitName || '';

        // Mobile overlay
        if (this.ui.mobileRaceInfo) {
            // Only show mobile race info on mobile viewports
            const isMobile = this.mobileQuery.matches;
            this.ui.mobileRaceInfo.style.display = (race && isMobile) ? 'flex' : 'none';
        }
        if (this.ui.mobileCountryFlag && flagUrl) {
            this.ui.mobileCountryFlag.src = flagUrl;
            this.ui.mobileCountryFlag.alt = `${country} flag`;
        }
        if (this.ui.mobileRaceInfoName) this.ui.mobileRaceInfoName.textContent = race.name || '';
        if (this.ui.mobileRaceInfoCircuit) this.ui.mobileRaceInfoCircuit.textContent = race.circuit?.circuitName || '';
    }

    populateSessionSelect(sessions) {
        const select = this.ui.sessionSelect;
        if (!select) return;

        select.disabled = false;
        select.innerHTML = '<option value="">Select session...</option>';

        // Bolt Optimization: Use DocumentFragment to batch DOM insertions
        const fragment = document.createDocumentFragment();

        sessions.forEach(session => {
            const option = document.createElement('option');
            option.value = session.id;

            let timeStr = '';
            if (session.date && session.time) {
                const dt = new Date(`${session.date}T${session.time}`);
                timeStr = ` - ${dt.toLocaleString(undefined, {
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                })}`;
            }

            option.textContent = session.name + timeStr;
            fragment.appendChild(option);
        });

        select.appendChild(fragment);
    }

    async selectSession(sessionId) {
        const session = this.selectedRace?.sessions.find(s => s.id === sessionId);
        if (!session) return;

        this.showLoading(true);
        // Palette UX: Show skeleton immediately to prevent layout shift
        this.renderForecastSkeleton();

        // Show forecast section container immediately
        if (this.ui.forecastSection) this.ui.forecastSection.style.display = 'block';

        try {
            this.selectedSession = session;

            // Calculate session time
            const sessionTime = new Date(`${session.date}T${session.time}`);

            // Start countdown
            this.countdown.start(sessionTime, `${this.selectedRace.name} - ${session.name}`);

            // Set session time for radar relative display
            this.radar.setSessionTime(sessionTime);

            // Load radar and session forecast in parallel
            // Note: We don't force a "Live" weather update here, as that's handled by selectRound
            // or by the initial load. However, we could refresh it if needed.
            await Promise.all([
                this.radar.load(),
                this.updateSessionForecast(sessionTime, session.id)
            ]);

            // Ensure mobile elements are visible
            this.updateMobileVisibility();

            this.router.navigate('f1', this.selectedRace.round, sessionId);
        } catch (error) {
            console.error('Error selecting session:', error);
        } finally {
            this.showLoading(false);
        }
    }

    async updateLiveWeatherForCircuit() {
        // Feature flag: Skip current weather to reduce API calls
        if (!FEATURE_FLAGS.enableCurrentWeather) {
            return;
        }

        // Only fetch weather if a circuit is selected
        if (!this.currentCircuitCenter) {
            return;
        }

        const [lat, lng] = this.currentCircuitCenter;
        const weather = await this.weatherClient.getForecast(lat, lng, new Date());
        this.weatherWidget.update(weather);
        this.renderLiveWeather(weather); // Also update mobile card
    }

    startWeatherRefreshInterval() {
        // Clear any existing interval
        if (this.weatherRefreshInterval) {
            clearInterval(this.weatherRefreshInterval);
        }

        // Refresh weather every 5 minutes (300000ms)
        this.weatherRefreshInterval = setInterval(() => {
            this.updateLiveWeatherForCircuit();
        }, 300000);
    }


    async updateSessionForecast(sessionTime, sessionId) {
        if (!this.selectedRace || !this.selectedRace.location) return;

        const { lat, long } = this.selectedRace.location;
        const weather = await this.weatherClient.getForecast(lat, long, sessionTime);

        this.renderForecast(weather, sessionTime, sessionId);
    }

    renderForecastSkeleton() {
        const content = this.ui.forecastContent;
        const unavailable = this.ui.forecastUnavailable;

        if (unavailable) unavailable.style.display = 'none';
        if (content) {
            // Palette A11y: Mark region as busy during loading
            content.setAttribute('aria-busy', 'true');
            content.style.display = 'block';
            content.innerHTML = `
                <div class="weather-dashboard" aria-hidden="true">
                    <div class="weather-current">
                        <div class="weather-metric">
                            <span class="weather-label skeleton"><span class="skeleton-text" style="width: 30px"></span></span>
                            <span class="weather-value skeleton"><span class="skeleton-text" style="width: 40px"></span></span>
                        </div>
                        <div class="weather-metric">
                            <span class="weather-label skeleton"><span class="skeleton-text" style="width: 30px"></span></span>
                            <span class="weather-value skeleton"><span class="skeleton-text" style="width: 40px"></span></span>
                        </div>
                        <div class="weather-metric">
                            <span class="weather-label skeleton"><span class="skeleton-text" style="width: 30px"></span></span>
                            <span class="weather-value skeleton"><span class="skeleton-text" style="width: 40px"></span></span>
                            <span class="weather-sub skeleton"><span class="skeleton-text" style="width: 20px"></span></span>
                        </div>
                    </div>
                    <div class="weather-timeline" id="weatherTimeline">
                        <div class="weather-timeline-item">
                            <div class="weather-timeline-time skeleton"><span class="skeleton-text" style="width: 30px"></span></div>
                            <div class="weather-timeline-condition skeleton"><span class="skeleton-text" style="width: 80px"></span></div>
                            <div class="weather-timeline-temp skeleton"><span class="skeleton-text" style="width: 30px"></span></div>
                        </div>
                        <div class="weather-timeline-item">
                            <div class="weather-timeline-time skeleton"><span class="skeleton-text" style="width: 30px"></span></div>
                            <div class="weather-timeline-condition skeleton"><span class="skeleton-text" style="width: 80px"></span></div>
                            <div class="weather-timeline-temp skeleton"><span class="skeleton-text" style="width: 30px"></span></div>
                        </div>
                        <div class="weather-timeline-item">
                            <div class="weather-timeline-time skeleton"><span class="skeleton-text" style="width: 30px"></span></div>
                            <div class="weather-timeline-condition skeleton"><span class="skeleton-text" style="width: 80px"></span></div>
                            <div class="weather-timeline-temp skeleton"><span class="skeleton-text" style="width: 30px"></span></div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    renderLiveWeather(weather) {
        // Updates Desktop Widget and Mobile Card (Live)
        // Independent of session forecast availability

        const mobileCard = this.ui.mobileWeatherCard;

        if (!weather.available || !weather.current) {
            if (mobileCard) mobileCard.style.display = 'none';
            return;
        }

        const isMobile = this.mobileQuery.matches;
        if (mobileCard && isMobile) {
            mobileCard.style.display = 'flex';
        } else if (mobileCard) {
            mobileCard.style.display = 'none';
        }

        const temp = Math.round(weather.current.temperature_2m);
        const wind = Math.round(weather.current.wind_speed_10m);
        const humidity = Math.round(weather.current.relative_humidity_2m || 0);
        const precip = Math.round(weather.current.precipitation_probability || 0);


        if (this.ui.mobileWeatherTemp) this.ui.mobileWeatherTemp.textContent = `${temp}${weather.units.temperature_2m}`;
        if (this.ui.mobileWeatherWind) this.ui.mobileWeatherWind.textContent = `${wind} ${weather.units.wind_speed_10m}`;
        if (this.ui.mobileWeatherHumidity) this.ui.mobileWeatherHumidity.textContent = `${humidity}%`;
    }

    renderForecast(weather, sessionTime, sessionId) {
        // Updates Sidebar Forecast Panel ONLY

        // Guard: If no session is currently selected (e.g., user switched rounds while fetching),
        // or if the session ID doesn't match the requested one, do not render.
        if (!this.selectedSession || (sessionId && this.selectedSession.id !== sessionId)) {
            return;
        }

        // Palette A11y: Clear busy state
        const content = this.ui.forecastContent;
        if (content) content.removeAttribute('aria-busy');

        const unavailable = this.ui.forecastUnavailable;

        if (!weather.available) {
            if (content) content.style.display = 'none';
            if (unavailable) {
                unavailable.style.display = 'block';

                // Palette UX: Provide helpful guidance on when data will be available
                const p = unavailable.querySelector('p');
                if (p) {
                    if (weather.reason === 'too_far' && weather.availableFrom) {
                        const dateStr = weather.availableFrom.toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric'
                        });
                        p.textContent = `Forecast available from ${dateStr}`;
                    } else if (weather.reason === 'error') {
                        p.textContent = 'Unable to load forecast data';
                    } else {
                        // Default fallback
                        p.textContent = 'Forecast available closer to session';
                    }
                }
            }
            return;
        }

        if (content) content.style.display = 'block';
        if (unavailable) unavailable.style.display = 'none';

        if (weather.current) {
            const temp = Math.round(weather.current.temperature_2m);
            const wind = Math.round(weather.current.wind_speed_10m);
            const dir = weather.current.wind_direction_10m;
            // For session forecast, we look at the hourly data to find max precip probability
            let maxPrecip = 0;
            if (weather.hourly && weather.hourly.length > 0) {
                maxPrecip = Math.max(...weather.hourly.map(h => h.precipProb));
            }

            if (this.ui.weatherTemp) this.ui.weatherTemp.textContent = `${temp}${weather.units.temperature_2m}`;
            if (this.ui.weatherWind) this.ui.weatherWind.textContent = `${wind} ${weather.units.wind_speed_10m}`;
            if (this.ui.weatherWindDir) this.ui.weatherWindDir.textContent = `${dir}°`;
            if (this.ui.weatherRain) this.ui.weatherRain.textContent = `${maxPrecip}%`;
        }

        // Render Timeline
        // Bolt Optimization: Re-query element as it may have been recreated by skeleton loader
        const timelineEl = document.getElementById('weatherTimeline');
        if (timelineEl && weather.hourly) {
            timelineEl.innerHTML = '';

            // Bolt Optimization: Use DocumentFragment to batch DOM insertions
            const fragment = document.createDocumentFragment();
            // Palette UX: Use semantic list for timeline items
            const list = document.createElement('ul');
            list.className = 'weather-timeline-list';

            weather.hourly.forEach(hour => {
                const item = document.createElement('li');
                item.className = 'weather-timeline-item';

                const relTime = this.weatherClient.getRelativeTime(hour.time, sessionTime);
                const desc = this.weatherClient.getWeatherDescription(hour.code);

                // Palette Accessibility: Generate descriptive label for screen readers
                const a11yTime = this.weatherClient.getAccessibleRelativeTime(hour.time, sessionTime);
                const temp = Math.round(hour.temp);
                const ariaLabel = `${a11yTime}. ${desc}. Temperature ${temp} degrees. Rain chance ${hour.precipProb}%. Wind ${hour.windSpeed} km/h.`;

                item.setAttribute('aria-label', ariaLabel);

                // SEC: Escape all upstream data to prevent XSS (even if trusted)
                // Palette Accessibility: Hide visual elements from screen readers to prevent fragmented reading
                item.innerHTML = `
                    <div class="weather-timeline-time" aria-hidden="true">${escapeHtml(relTime)}</div>
                    <div class="weather-timeline-condition" aria-hidden="true">
                        ${escapeHtml(desc)}
                        <div class="weather-timeline-wind">${escapeHtml(hour.windSpeed)} km/h</div>
                    </div>
                    <div class="weather-timeline-temp" aria-hidden="true">
                        <div>${escapeHtml(temp)}°</div>
                        <div class="weather-timeline-precip">${escapeHtml(hour.precipProb)}%</div>
                    </div>
                `;

                list.appendChild(item);
            });

            fragment.appendChild(list);
            timelineEl.appendChild(fragment);
        }
    }

    async handleRoute({ series, round, session }) {
        if (series !== 'f1') return;

        if (round) {
            if (this.ui.roundSelect) this.ui.roundSelect.value = round;
            this.selectRound(round);

            if (session) {
                if (this.ui.sessionSelect) this.ui.sessionSelect.value = session;
                this.selectSession(session);
            }
        }
    }

    showLoading(visible) {
        if (this.ui.loadingOverlay) this.ui.loadingOverlay.classList.toggle('visible', visible);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const app = new CircuitWeatherApp();
    app.init();
    new PrivacyModal();
});
