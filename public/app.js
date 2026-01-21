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
    f1ApiBase: isLocal ? 'https://api.jolpi.ca/ergast/f1' : '/api/f1',
    rainViewerApi: isLocal ? 'https://api.rainviewer.com/public/weather-maps.json' : '/api/radar',
    trackApi: isLocal ? 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits' : '/api/track',
    weatherApi: isLocal ? 'https://api.open-meteo.com/v1/forecast' : '/api/weather',
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
    // Range circles by zoom level (metric/imperial)
    // Deprecated: Logic now dynamic in RangeCircles class
};

// Country code mappings for flags (ISO 3166-1 alpha-2)
const COUNTRY_CODES = {
    'Australia': 'au', 'Austria': 'at', 'Azerbaijan': 'az', 'Bahrain': 'bh',
    'Belgium': 'be', 'Brazil': 'br', 'Canada': 'ca', 'China': 'cn',
    'Hungary': 'hu', 'Italy': 'it', 'Japan': 'jp', 'Mexico': 'mx',
    'Monaco': 'mc', 'Netherlands': 'nl', 'Qatar': 'qa', 'Saudi Arabia': 'sa',
    'Singapore': 'sg', 'Spain': 'es', 'UAE': 'ae', 'UK': 'gb',
    'USA': 'us', 'United States': 'us', 'Las Vegas': 'us', 'Miami': 'us',
};

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

// ===================================
// Forecast
// ===================================

class Forecast {
    constructor(weatherClient) {
        this.weatherClient = weatherClient;
        this.ui = {
            section: document.getElementById('forecastSection'),
            content: document.getElementById('forecastContent'),
            unavailable: document.getElementById('forecastUnavailable'),
            temp: document.getElementById('weatherTemp'),
            rain: document.getElementById('weatherRain'),
            wind: document.getElementById('weatherWind'),
            windDir: document.getElementById('weatherWindDir'),
            timeline: document.getElementById('weatherTimeline'),
        };
    }

    update(weather, sessionTime, selectedSessionId, currentSessionId) {
        // Guard: If no session is currently selected, or if the session ID doesn't match
        // the requested one (to prevent race conditions), do not render.
        if (!currentSessionId || (selectedSessionId && currentSessionId !== selectedSessionId)) {
            this.hide();
            return;
        }

        if (!weather.available) {
            this.showUnavailable();
            return;
        }

        this.show();
        this.renderCurrent(weather, sessionTime);
        this.renderTimeline(weather, sessionTime);
    }

    renderCurrent(weather, sessionTime) {
        if (!weather.current) return;

        const temp = Math.round(weather.current.temperature_2m);
        const wind = Math.round(weather.current.wind_speed_10m);
        const dir = weather.current.wind_direction_10m;

        let maxPrecip = 0;
        if (weather.hourly && weather.hourly.length > 0) {
            maxPrecip = Math.max(...weather.hourly.map(h => h.precipProb));
        }

        if (this.ui.temp) this.ui.temp.textContent = `${temp}${weather.units.temperature_2m}`;
        if (this.ui.wind) this.ui.wind.textContent = `${wind} ${weather.units.wind_speed_10m}`;
        if (this.ui.windDir) this.ui.windDir.textContent = `${dir}°`;
        if (this.ui.rain) this.ui.rain.textContent = `${maxPrecip}%`;
    }

    renderTimeline(weather, sessionTime) {
        const timelineEl = this.ui.timeline;
        if (!timelineEl || !weather.hourly) return;

        timelineEl.innerHTML = '';
        weather.hourly.forEach(hour => {
            const item = document.createElement('div');
            item.className = 'weather-timeline-item';

            const relTime = this.weatherClient.getRelativeTime(hour.time, sessionTime);
            const desc = this.weatherClient.getWeatherDescription(hour.code);

            item.innerHTML = `
                <div class="weather-timeline-time">${relTime}</div>
                <div class="weather-timeline-condition">
                    ${desc}
                    <div style="font-size: 0.65em; color: var(--color-text-secondary);">${hour.windSpeed} km/h</div>
                </div>
                <div class="weather-timeline-temp">
                    <div>${Math.round(hour.temp)}°</div>
                    <div style="font-size: 0.8em; color: #3b82f6;">${hour.precipProb}%</div>
                </div>
            `;
            timelineEl.appendChild(item);
        });
    }

    show() {
        if (this.ui.section) this.ui.section.style.display = 'block';
        if (this.ui.content) this.ui.content.style.display = 'block';
        if (this.ui.unavailable) this.ui.unavailable.style.display = 'none';
    }

    showUnavailable() {
        if (this.ui.section) this.ui.section.style.display = 'block';
        if (this.ui.content) this.ui.content.style.display = 'none';
        if (this.ui.unavailable) this.ui.unavailable.style.display = 'block';
    }

    hide() {
        if (this.ui.section) this.ui.section.style.display = 'none';
    }
}


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
        const stored = localStorage.getItem('theme');
        if (stored) return stored;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        if (this.onThemeChange) this.onThemeChange(this.theme);
    }

    toggle() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme();
        localStorage.setItem('theme', this.theme);
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
            return { available: false, reason: 'too_far' };
        }

        try {
            // Check cache
            const cacheKey = `${lat},${lon}`;
            let data;

            if (this.cache.has(cacheKey)) {
                const entry = this.cache.get(cacheKey);
                if (Date.now() - entry.timestamp < this.cacheTTL) {
                    data = entry.data;
                }
            }

            if (!data) {
                let url;
                if (isLocal) {
                    url = `${this.baseUrl}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,weather_code&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation&timeformat=unixtime&forecast_days=16`;
                } else {
                    url = `${this.baseUrl}?lat=${lat}&lon=${lon}`;
                }

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

        const indices = hourly.time.reduce((acc, time, index) => {
            if (time >= startTs && time <= endTs) acc.push(index);
            return acc;
        }, []);

        return indices.map(i => ({
            time: hourly.time[i],
            temp: hourly.temperature_2m[i],
            humidity: hourly.relative_humidity_2m ? hourly.relative_humidity_2m[i] : null,
            precipProb: hourly.precipitation_probability[i],
            windSpeed: hourly.wind_speed_10m[i],
            windDir: hourly.wind_direction_10m[i],
            code: hourly.weather_code[i]
        }));
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
        if (diffMins < 0) return `${Math.round(diffMins/60)}h`;
        return `+${Math.round(diffMins/60)}h`;
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
            let data;

            // Check cache first
            if (this.cache.has(circuitId)) {
                data = this.cache.get(circuitId);
            } else {
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

                data = await response.json();
                this.cache.set(circuitId, data);
            }

            // Double check before rendering
            if (this.currentCircuitId !== circuitId) return;

            this.layer = L.geoJSON(data, {
                style: {
                    color: '#e10600',
                    weight: 4, // Initial, will be updated immediately
                    opacity: 0.8,
                    fillOpacity: 0,
                    lineCap: 'round',
                    lineJoin: 'round',
                    className: 'track-path'
                }
            }).addTo(this.map);

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
        this.animationTimer = null; // Deprecated: kept for cleanup safety
        this.animationFrameId = null;
        this.lastFrameTime = 0;
        this.sessionTime = null;
        this.speedIndex = CONFIG.defaultSpeedIndex; // Track current speed
        this.pollingInterval = null;
        this.pendingFrames = null;

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
            controls: document.getElementById('radarControls')
        };

        // Bolt Optimization: Reuse DateTimeFormat
        this.timeFormatter = new Intl.DateTimeFormat(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

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
            this.ui.speedLabel.textContent = CONFIG.radarSpeeds[this.speedIndex].label;
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
            url: `${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
        }));
    }

    async load() {
        this.stopPolling();
        try {
            await this.fetchAndFilter();
            if (this.frames.length === 0) return;

            this.createLayers();
            this.updateSlider();
            this.showControls(true);

            // Wait for tiles to load before starting animation
            await this.waitForTilesToLoad();
            this.play();
        } catch (error) {
            console.error('Radar load failed:', error);
        } finally {
            // Always start polling, even if initial load failed
            this.startPolling();
        }
    }

    startPolling() {
        this.stopPolling();
        // Poll every 30 seconds to catch updates quickly
        this.pollingInterval = setInterval(() => this.checkForUpdates(), 30000);
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
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

    getLayer(index) {
        if (index < 0 || index >= this.frames.length) return null;

        if (!this.layers[index]) {
            this.layers[index] = this.createLayer(this.frames[index], index);
        }
        return this.layers[index];
    }

    createLayer(frame, index) {
        const layer = L.tileLayer(frame.url, {
            tileSize: 256,
            opacity: 0.01, // Small opacity to trigger tile loading
            zIndex: 100 + index, // Will be updated later
            maxNativeZoom: 10,
            maxZoom: 18,
            updateWhenIdle: false,
            updateWhenZooming: false,
            keepBuffer: 2,
        });
        layer.addTo(this.map);
        // Store frame info on the layer for easier matching later
        layer.frameTime = frame.time;
        layer.framePath = frame.path;
        return layer;
    }

    applyFrameUpdate(newFrames) {
        // Store current timestamp to restore view
        const currentTimestamp = this.frames[this.currentFrame]?.time;

        // Update frames data
        this.frames = newFrames;

        // Full rebuild of layers to ensure consistency
        // This eliminates "diffing bloat" and potential z-index bugs
        this.createLayers();

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

    showFrame(index) {
        if (index < 0 || index >= this.frames.length) return;

        // Optimization: Only update layers that need changing
        if (this.visibleLayerIndex === index) return; // No change needed

        // Hide previous layer
        if (this.visibleLayerIndex !== -1 && this.layers[this.visibleLayerIndex]) {
            this.layers[this.visibleLayerIndex].setOpacity(0);
        }

        // Get or create new layer
        const layer = this.getLayer(index);

        // Show new layer
        if (layer) {
            layer.setOpacity(CONFIG.radarOpacity);
        }

        this.visibleLayerIndex = index;

        this.updateTimeDisplay(this.frames[index]?.time);

        if (this.ui.slider) this.ui.slider.value = index;

        // Bolt Optimization: Preload next frame for smooth animation
        const nextIndex = (index + 1) % this.frames.length;
        this.getLayer(nextIndex);
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
        if (this.ui.playBtn) this.ui.playBtn.classList.add('playing');

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

        this.animationFrameId = requestAnimationFrame(() => this.loop());
    }

    pause() {
        this.isPlaying = false;
        if (this.ui.playBtn) this.ui.playBtn.classList.remove('playing');

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Legacy cleanup (safe to keep)
        if (this.animationTimer) {
            clearInterval(this.animationTimer);
            this.animationTimer = null;
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
        this.bindEvents();
        this.updateToggleUI();
    }

    getInitialUnit() {
        const stored = localStorage.getItem('unit');
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
        localStorage.setItem('unit', unit);
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

        this.clear();

        const multiplier = this.unit === 'metric' ? 1000 : 1609.34;

        steps.forEach((distance, index) => {
            // Outline only - no fill
            const circle = L.circle(center, {
                radius: distance * multiplier,
                color: '#e10600',
                fillColor: 'transparent',
                fillOpacity: 0,
                weight: index === 0 ? 2 : 1,
                dashArray: index > 0 ? '4, 4' : null,
                opacity: 0.7,
            });
            circle.addTo(this.map);
            this.circles.push(circle);

            // Add label at the right edge of the circle
            const labelLatLng = this.getPointAtDistance(center, distance * multiplier, 90);
            const label = L.divIcon({
                className: 'range-label',
                html: `<span>${distance}</span>`,
                iconSize: [30, 12],
                iconAnchor: [0, 6],
            });
            const labelMarker = L.marker(labelLatLng, { icon: label });
            labelMarker.addTo(this.map);
            this.labels.push(labelMarker);
        });

        // Circuit center marker
        const marker = L.circleMarker(center, {
            radius: 6,
            color: '#e10600',
            fillColor: '#ffffff',
            fillOpacity: 1,
            weight: 2,
        });
        marker.addTo(this.map);
        this.circles.push(marker);
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
        this.circles = [];
        this.labels = [];
    }

    updateVisibility() {
        // Redraw circles with appropriate distances for current zoom
        if (this.center) {
            this.draw(this.center);
        }
    }
}

// ===================================
// Live Weather
// ===================================

class LiveWeather {
    constructor(map) {
        this.desktopWidget = this.createDesktopWidget(map);
        this.ui = {
            // Mobile elements
            mobileCard: document.getElementById('mobileWeatherCard'),
            mobileTemp: document.getElementById('mobileWeatherTemp'),
            mobileWind: document.getElementById('mobileWeatherWind'),
            mobileHumidity: document.getElementById('mobileWeatherHumidity'),
        };
    }

    createDesktopWidget(map) {
        const widget = L.Control.extend({
            onAdd: function () {
                this._div = L.DomUtil.create('div', 'leaflet-control-weather');
                this.update(null); // Initial state
                return this._div;
            },
            update: function (weather) {
                if (!this._div) return;
                this._div.innerHTML = this.getContentHtml(weather);
            },
            getContentHtml: function(weather) {
                if (!weather || !weather.current) {
                    return `
                        <div class="weather-widget-metric" title="Temperature">
                            <svg class="icon-weather icon-temp" viewBox="0 0 24 24"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>
                            <span>--</span>
                        </div>
                        <div class="weather-widget-metric" title="Humidity">
                            <svg class="icon-weather icon-humidity" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></svg>
                            <span>--%</span>
                        </div>
                        <div class="weather-widget-metric" title="Wind">
                            <svg class="icon-weather icon-wind" viewBox="0 0 24 24"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" /></svg>
                            <span>--</span>
                        </div>
                         <div class="weather-widget-metric" title="Precipitation">
                            <svg class="icon-weather icon-precip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
                                <path d="M8 14v1" /><path d="M8 19v1" /><path d="M12 15v1" /><path d="M12 20v1" /><path d="M16 14v1" /><path d="M16 19v1" />
                            </svg>
                            <span>--%</span>
                        </div>
                    `;
                }
                const temp = Math.round(weather.current.temperature_2m);
                const humidity = Math.round(weather.current.relative_humidity_2m || 0);
                const wind = Math.round(weather.current.wind_speed_10m);
                const precip = Math.round(weather.current.precipitation_probability || 0);
                return `
                    <div class="weather-widget-metric" title="Temperature">
                        <svg class="icon-weather icon-temp" viewBox="0 0 24 24"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>
                        <span>${temp}${weather.units.temperature_2m}</span>
                    </div>
                    <div class="weather-widget-metric" title="Humidity">
                        <svg class="icon-weather icon-humidity" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></svg>
                        <span>${humidity}%</span>
                    </div>
                    <div class="weather-widget-metric" title="Wind">
                        <svg class="icon-weather icon-wind" viewBox="0 0 24 24"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" /></svg>
                        <span>${wind} ${weather.units.wind_speed_10m}</span>
                    </div>
                    <div class="weather-widget-metric" title="Precipitation">
                        <svg class="icon-weather icon-precip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
                            <path d="M8 14v1" /><path d="M8 19v1" /><path d="M12 15v1" /><path d="M12 20v1" /><path d="M16 14v1" /><path d="M16 19v1" />
                        </svg>
                        <span>${precip}%</span>
                    </div>
                `;
            }
        });
        const instance = new widget({ position: 'topright' });
        map.addControl(instance);
        return instance;
    }

    update(weather) {
        // Update Desktop Widget
        this.desktopWidget.update(weather);

        // Update Mobile Card
        const { mobileCard, mobileTemp, mobileWind, mobileHumidity } = this.ui;
        if (!mobileCard) return;

        if (!weather || !weather.available || !weather.current) {
            mobileCard.style.display = 'none';
            return;
        }

        const isMobile = window.innerWidth <= 768;
        mobileCard.style.display = isMobile ? 'flex' : 'none';

        const temp = Math.round(weather.current.temperature_2m);
        const wind = Math.round(weather.current.wind_speed_10m);
        const humidity = Math.round(weather.current.relative_humidity_2m || 0);

        if (mobileTemp) mobileTemp.textContent = `${temp}${weather.units.temperature_2m}`;
        if (mobileWind) mobileWind.textContent = `${wind} ${weather.units.wind_speed_10m}`;
        if (mobileHumidity) mobileHumidity.textContent = `${humidity}%`;
    }
}


// ===================================
// Countdown Timer
// ===================================

class CountdownTimer {
    constructor() {
        this.timer = null;
        this.targetTime = null;
        this.sessionName = '';

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
            if (this.ui.timer) this.ui.timer.textContent = 'NOW';
            if (this.ui.mobileTimer) this.ui.mobileTimer.textContent = 'NOW';
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

        if (this.ui.timer) this.ui.timer.textContent = timeText;
        if (this.ui.mobileTimer) this.ui.mobileTimer.textContent = timeText;
        if (this.ui.session) this.ui.session.textContent = this.sessionName;
        if (this.ui.mobileSession) this.ui.mobileSession.textContent = this.sessionName;
    }

    show(visible) {
        if (this.ui.card) this.ui.card.style.display = visible ? 'block' : 'none';
        // Only show mobile countdown on mobile viewports
        if (this.ui.mobileCard) {
            const isMobile = window.innerWidth <= 768;
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
        this.bindEvents();
    }

    bindEvents() {
        if (this.privacyLink) {
            this.privacyLink.addEventListener('click', (e) => {
                e.preventDefault();
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
        }
    }

    close() {
        if (this.backdrop) {
            this.backdrop.classList.remove('visible');
            document.body.style.overflow = '';
            // Restore focus to trigger element
            if (this.triggerElement) {
                this.triggerElement.focus();
                this.triggerElement = null;
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
        // SEC: Escape HTML characters to prevent XSS injection
        const escapeHtml = (str) => {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
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
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
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
        this.liveWeather = null;
        this.forecast = null;
        this.countdown = new CountdownTimer();
        this.recentreControl = null;
        this.currentCircuitCenter = null;
        this.lastLiveWeather = null;
        this.races = [];
        this.selectedRace = null;
        this.selectedSession = null;
        this.router = new Router(params => this.handleRoute(params));

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
            this.liveWeather = new LiveWeather(map);
            this.forecast = new Forecast(this.weatherClient);


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

            // Initial weather update for map center
            this.updateLiveWeatherForMapCenter();


            this.showLoading(false);
        } catch (error) {
            console.error('Failed to initialize:', error);
            this.showLoading(false);
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
        let lastIsMobile = window.innerWidth <= 768;

        window.addEventListener('resize', () => {
            const isMobile = window.innerWidth <= 768;

            // Note: Map resizing is handled by ResizeObserver in MapManager

            // Update visibility when crossing the breakpoint
            if (isMobile !== lastIsMobile) {
                lastIsMobile = isMobile;
                this.updateMobileVisibility();
            }
        });
    }

    updateMobileVisibility() {
        const isMobile = window.innerWidth <= 768;

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
        if (this.liveWeather) {
            this.liveWeather.update(this.lastLiveWeather);
        }

        // Note: Map resizing is handled by ResizeObserver in MapManager
    }

    bindEvents() {
        if (this.ui.roundSelect) {
            this.ui.roundSelect.addEventListener('change', (e) => {
                if (e.target.value) this.selectRound(e.target.value);
            });
        }

        if (this.ui.sessionSelect) {
            this.ui.sessionSelect.addEventListener('change', (e) => {
                if (e.target.value && this.selectedRace) {
                    this.selectSession(e.target.value);
                }
            });
        }

        this.mapManager.map.on('moveend', debounce(() => this.updateLiveWeatherForMapCenter(), 500));
    }

    populateRoundSelect() {
        const select = this.ui.roundSelect;
        if (!select) return;

        select.innerHTML = '<option value="">Select round...</option>';

        this.races.forEach(race => {
            const option = document.createElement('option');
            option.value = race.round;
            const date = new Date(race.date);
            const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            option.textContent = `R${race.round}: ${race.name} (${dateStr})`;
            select.appendChild(option);
        });
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
        this.forecast.hide();

        // Fetch current "Live" weather for the widgets
        this.updateLiveWeatherForMapCenter();

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
            const isMobile = window.innerWidth <= 768;
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
            select.appendChild(option);
        });
    }

    async selectSession(sessionId) {
        const session = this.selectedRace?.sessions.find(s => s.id === sessionId);
        if (!session) return;

        this.showLoading(true);

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

            // Show forecast section container
            if (this.ui.forecastSection) this.ui.forecastSection.style.display = 'block';

            // Ensure mobile elements are visible
            this.updateMobileVisibility();

            this.router.navigate('f1', this.selectedRace.round, sessionId);
        } catch (error) {
            console.error('Error selecting session:', error);
        } finally {
            this.showLoading(false);
        }
    }

    async updateLiveWeatherForMapCenter() {
        const center = this.mapManager.map.getCenter();
        const weather = await this.weatherClient.getForecast(center.lat, center.lng, new Date());
        this.lastLiveWeather = weather;
        this.liveWeather.update(weather);
    }


    async updateSessionForecast(sessionTime, sessionId) {
        if (!this.selectedRace || !this.selectedRace.location) return;

        const { lat, long } = this.selectedRace.location;
        const weather = await this.weatherClient.getForecast(lat, long, sessionTime);

        this.forecast.update(weather, sessionTime, sessionId, this.selectedSession?.id);
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
