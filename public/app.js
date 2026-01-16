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

        // Close on window resize to desktop
        window.addEventListener('resize', () => {
            if (window.innerWidth > this.mobileBreakpoint && this.isOpen) {
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
        }
    }

    close() {
        if (this.sidebar) {
            this.sidebar.classList.remove('sidebar--open');
            this.isOpen = false;
            document.body.style.overflow = '';
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
        this.baseUrl = 'https://api.open-meteo.com/v1/forecast';
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
                const url = `${this.baseUrl}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,weather_code&current=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation&timeformat=unixtime&forecast_days=16`;

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
        this.currentFrame = 0;
        this.layers = [];
        this.isPlaying = false;
        this.animationTimer = null;
        this.sessionTime = null;
        this.speedIndex = CONFIG.defaultSpeedIndex; // Track current speed
        this.pollingInterval = null;
        this.pendingFrames = null;
        this.bindEvents();
    }

    bindEvents() {
        const playBtn = document.getElementById('radarPlayBtn');
        const slider = document.getElementById('radarSlider');
        const speedBtn = document.getElementById('radarSpeedBtn');

        if (playBtn) playBtn.addEventListener('click', () => this.togglePlay());
        if (slider) {
            slider.addEventListener('input', (e) => {
                this.currentFrame = parseInt(e.target.value, 10);
                this.showFrame(this.currentFrame);
                this.pause();
            });
        }
        if (speedBtn) {
            speedBtn.addEventListener('click', () => this.cycleSpeed());
        }
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
        const speedLabel = document.getElementById('radarSpeedLabel');
        if (speedLabel) {
            speedLabel.textContent = CONFIG.radarSpeeds[this.speedIndex].label;
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
        this.layers.forEach(layer => this.map.removeLayer(layer));
        this.layers = [];

        this.frames.forEach((frame, index) => {
            const layer = this.createLayer(frame, index);
            this.layers.push(layer);
        });

        this.currentFrame = this.frames.length - 1;

        // Force map to recalculate size
        this.map.invalidateSize();
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
        const currentLayer = this.layers[this.currentFrame];
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
        if (index < 0 || index >= this.layers.length) return;

        this.layers.forEach((layer, i) => {
            layer.setOpacity(i === index ? CONFIG.radarOpacity : 0);
        });

        this.updateTimeDisplay(this.frames[index]?.time);

        const slider = document.getElementById('radarSlider');
        if (slider) slider.value = index;
    }

    updateTimeDisplay(timestamp) {
        const timeEl = document.getElementById('radarTime');
        const relEl = document.getElementById('radarRelative');
        const slider = document.getElementById('radarSlider');
        if (!timeEl || !timestamp) return;

        const date = new Date(timestamp * 1000);
        const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
        timeEl.textContent = timeStr;

        let relativeText = '';

        // Show relative to session if available
        if (relEl && this.sessionTime) {
            const diff = (timestamp * 1000 - this.sessionTime.getTime()) / 60000; // minutes
            if (Math.abs(diff) < 1) {
                relativeText = 'Session start';
            } else if (diff < 0) {
                relativeText = `${Math.abs(Math.round(diff))}m before`;
            } else {
                relativeText = `${Math.round(diff)}m after`;
            }
            relEl.textContent = relativeText;
        } else if (relEl) {
            const now = Date.now() / 1000;
            const diff = timestamp - now;
            if (diff > 60) {
                relativeText = 'Forecast';
            }
            relEl.textContent = relativeText;
        }

        if (slider) {
            const ariaText = relativeText ? `${timeStr}, ${relativeText}` : timeStr;
            slider.setAttribute('aria-valuetext', ariaText);
        }
    }

    updateSlider() {
        const slider = document.getElementById('radarSlider');
        if (slider) {
            slider.max = this.frames.length - 1;
            slider.value = this.currentFrame;
        }
    }

    play() {
        // Clear any existing timer first to prevent double animations
        if (this.animationTimer) {
            clearInterval(this.animationTimer);
            this.animationTimer = null;
        }

        // Apply any pending updates before starting
        if (this.pendingFrames) {
            this.applyFrameUpdate(this.pendingFrames);
            this.pendingFrames = null;
        }

        this.isPlaying = true;
        const playBtn = document.getElementById('radarPlayBtn');
        if (playBtn) playBtn.classList.add('playing');

        this.animationTimer = setInterval(() => {
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
            this.showFrame(this.currentFrame);
        }, this.getCurrentSpeed());
    }

    pause() {
        this.isPlaying = false;
        const playBtn = document.getElementById('radarPlayBtn');
        if (playBtn) playBtn.classList.remove('playing');
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
        const controls = document.getElementById('radarControls');
        if (controls) controls.style.display = visible ? 'flex' : 'none';
    }

    destroy() {
        this.stopPolling();
        this.pause();
        this.layers.forEach(layer => this.map.removeLayer(layer));
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
// Countdown Timer
// ===================================

class CountdownTimer {
    constructor() {
        this.timer = null;
        this.targetTime = null;
        this.sessionName = '';
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

        // Update both sidebar and mobile countdown elements
        const timerEl = document.getElementById('countdownTimer');
        const sessionEl = document.getElementById('countdownSession');
        const mobileTimerEl = document.getElementById('mobileCountdownTimer');
        const mobileSessionEl = document.getElementById('mobileCountdownSession');

        if (diff <= 0) {
            if (timerEl) timerEl.textContent = 'NOW';
            if (mobileTimerEl) mobileTimerEl.textContent = 'NOW';
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

        if (timerEl) timerEl.textContent = timeText;
        if (mobileTimerEl) mobileTimerEl.textContent = timeText;
        if (sessionEl) sessionEl.textContent = this.sessionName;
        if (mobileSessionEl) mobileSessionEl.textContent = this.sessionName;
    }

    show(visible) {
        const card = document.getElementById('countdownCard');
        const mobileCard = document.getElementById('mobileCountdown');
        if (card) card.style.display = visible ? 'block' : 'none';
        // Only show mobile countdown on mobile viewports
        if (mobileCard) {
            const isMobile = window.innerWidth <= 768;
            mobileCard.style.display = (visible && isMobile) ? 'block' : 'none';
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
        this.button.title = 'Recentre on circuit';
        this.button.setAttribute('role', 'button');
        this.button.setAttribute('aria-label', 'Recentre on circuit');
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
    }

    init() {
        this.map = L.map('map', {
            center: CONFIG.defaultCenter,
            zoom: CONFIG.defaultZoom,
            zoomControl: true,
        });

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
        if (!this.loaded) {
            await this.loadContent();
        }
        if (this.backdrop) {
            this.backdrop.classList.add('visible');
            document.body.style.overflow = 'hidden';
        }
    }

    close() {
        if (this.backdrop) {
            this.backdrop.classList.remove('visible');
            document.body.style.overflow = '';
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
        return md
            // Remove the main title (we have it in the header)
            .replace(/^# Privacy Policy\s*\n*/m, '')
            // Headers
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
                if (block.startsWith('<h') || block.startsWith('<ul')) return block;
                if (!block.startsWith('<')) return `<p>${block}</p>`;
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
        this.countdown = new CountdownTimer();
        this.recentreControl = null;
        this.currentCircuitCenter = null;
        this.races = [];
        this.selectedRace = null;
        this.selectedSession = null;
        this.router = new Router(params => this.handleRoute(params));
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
            const roundSelect = document.getElementById('roundSelect');
            if (roundSelect) roundSelect.value = nextRace.round;
            this.selectRound(nextRace.round);

            // Find next upcoming session within this round
            const nextSession = nextRace.sessions.find(session => {
                if (!session.date || !session.time) return false;
                const sessionTime = new Date(`${session.date}T${session.time}`);
                return sessionTime > now;
            });

            if (nextSession) {
                const sessionSelect = document.getElementById('sessionSelect');
                if (sessionSelect) sessionSelect.value = nextSession.id;
                this.selectSession(nextSession.id);
            }
        }
    }

    bindResizeHandler() {
        let lastIsMobile = window.innerWidth <= 768;
        let resizeTimeout = null;

        window.addEventListener('resize', () => {
            const isMobile = window.innerWidth <= 768;

            // Always invalidate map size on resize (debounced)
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (this.mapManager && this.mapManager.map) {
                    this.mapManager.map.invalidateSize();
                }
            }, 150);

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
        const mobileRaceInfo = document.getElementById('mobileRaceInfo');
        if (mobileRaceInfo && this.selectedRace) {
            mobileRaceInfo.style.display = isMobile ? 'flex' : 'none';
        }

        // Update mobile countdown visibility
        const mobileCountdown = document.getElementById('mobileCountdown');
        if (mobileCountdown && this.selectedSession && this.countdown.targetTime) {
            mobileCountdown.style.display = isMobile ? 'block' : 'none';
        }

        // Update mobile weather card visibility
        const mobileWeather = document.getElementById('mobileWeatherCard');
        // Only show if we have a selected session AND forecast content is NOT hidden (meaning data is available)
        const weatherAvailable = document.getElementById('forecastContent')?.style.display !== 'none';
        if (mobileWeather && this.selectedSession && weatherAvailable) {
            mobileWeather.style.display = isMobile ? 'flex' : 'none';
        }

        // Invalidate map size multiple times with staggered delays
        // to ensure CSS transitions have completed
        if (this.mapManager && this.mapManager.map) {
            const map = this.mapManager.map;
            // Immediate
            map.invalidateSize();
            // After short delay
            setTimeout(() => map.invalidateSize(), 100);
            // After medium delay (for CSS transitions)
            setTimeout(() => map.invalidateSize(), 300);
            // After longer delay (final cleanup)
            setTimeout(() => map.invalidateSize(), 500);
        }
    }

    bindEvents() {
        const roundSelect = document.getElementById('roundSelect');
        const sessionSelect = document.getElementById('sessionSelect');

        if (roundSelect) {
            roundSelect.addEventListener('change', (e) => {
                if (e.target.value) this.selectRound(e.target.value);
            });
        }

        if (sessionSelect) {
            sessionSelect.addEventListener('change', (e) => {
                if (e.target.value && this.selectedRace) {
                    this.selectSession(e.target.value);
                }
            });
        }
    }

    populateRoundSelect() {
        const select = document.getElementById('roundSelect');
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

        this.router.navigate('f1', round, null);
    }

    updateRaceInfo(race) {
        const country = race.location?.country;
        const code = COUNTRY_CODES[country];
        const flagUrl = code ? `https://flagcdn.com/w80/${code}.png` : '';

        // Sidebar banner
        const bannerEl = document.getElementById('raceInfoBanner');
        const flagEl = document.getElementById('countryFlag');
        const countryEl = document.getElementById('raceInfoCountry');
        const nameEl = document.getElementById('raceInfoName');
        const circuitEl = document.getElementById('raceInfoCircuit');

        if (bannerEl) {
            bannerEl.style.display = race ? 'flex' : 'none';
        }
        if (flagEl && flagUrl) {
            flagEl.src = flagUrl;
            flagEl.alt = `${country} flag`;
        }
        if (countryEl) countryEl.textContent = country || '';
        if (nameEl) nameEl.textContent = race.name || '';
        if (circuitEl) circuitEl.textContent = race.circuit?.circuitName || '';

        // Mobile overlay
        const mobileEl = document.getElementById('mobileRaceInfo');
        const mobileFlagEl = document.getElementById('mobileCountryFlag');
        const mobileNameEl = document.getElementById('mobileRaceInfoName');
        const mobileCircuitEl = document.getElementById('mobileRaceInfoCircuit');

        if (mobileEl) {
            // Only show mobile race info on mobile viewports
            const isMobile = window.innerWidth <= 768;
            mobileEl.style.display = (race && isMobile) ? 'flex' : 'none';
        }
        if (mobileFlagEl && flagUrl) {
            mobileFlagEl.src = flagUrl;
            mobileFlagEl.alt = `${country} flag`;
        }
        if (mobileNameEl) mobileNameEl.textContent = race.name || '';
        if (mobileCircuitEl) mobileCircuitEl.textContent = race.circuit?.circuitName || '';
    }

    populateSessionSelect(sessions) {
        const select = document.getElementById('sessionSelect');
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

    selectSession(sessionId) {
        const session = this.selectedRace?.sessions.find(s => s.id === sessionId);
        if (!session) return;

        this.selectedSession = session;

        // Calculate session time
        const sessionTime = new Date(`${session.date}T${session.time}`);

        // Start countdown
        this.countdown.start(sessionTime, `${this.selectedRace.name} - ${session.name}`);

        // Set session time for radar relative display
        this.radar.setSessionTime(sessionTime);

        // Load radar
        this.radar.load();

        // Update Weather Dashboard
        this.updateWeatherDashboard(sessionTime);

        // Show forecast section
        const forecastSection = document.getElementById('forecastSection');
        if (forecastSection) forecastSection.style.display = 'block';

        this.router.navigate('f1', this.selectedRace.round, sessionId);
    }

    async updateWeatherDashboard(sessionTime) {
        if (!this.selectedRace || !this.selectedRace.location) return;

        const { lat, long } = this.selectedRace.location;
        const weather = await this.weatherClient.getForecast(lat, long, sessionTime);

        this.renderWeather(weather, sessionTime);
    }

    renderWeather(weather, sessionTime) {
        const content = document.getElementById('forecastContent');
        const unavailable = document.getElementById('forecastUnavailable');
        const mobileCard = document.getElementById('mobileWeatherCard');

        if (!weather.available) {
            if (content) content.style.display = 'none';
            if (unavailable) unavailable.style.display = 'block';
            if (mobileCard) mobileCard.style.display = 'none';
            return;
        }

        if (content) content.style.display = 'block';
        if (unavailable) unavailable.style.display = 'none';

        // Show mobile card if we have data
        const isMobile = window.innerWidth <= 768;
        if (mobileCard) mobileCard.style.display = isMobile ? 'flex' : 'none';

        // Update Current/Overview Metrics (using first hourly point or current if available)
        // Prefer 'current' for the big numbers, but 'hourly' closest to session start is also good.
        // Let's use 'current' for the big numbers to show "Right Now" at the track?
        // Actually user asked for "forecast around the timings of the session".
        // But "Current" implies right now. Let's use the current API data for the "Current" block.

        const tempEl = document.getElementById('weatherTemp');
        const rainEl = document.getElementById('weatherRain');
        const windEl = document.getElementById('weatherWind');
        const windDirEl = document.getElementById('weatherWindDir');

        // Mobile elements
        const mobTempEl = document.getElementById('mobileWeatherTemp');
        const mobRainEl = document.getElementById('mobileWeatherRain');
        const mobWindEl = document.getElementById('mobileWeatherWind');

        if (weather.current) {
            const temp = Math.round(weather.current.temperature_2m);
            const rain = weather.current.precipitation || 0; // Current precip amount (mm) not prob.
            // For probability, we might need to look at the hourly slot for "now"
            // Let's use current wind and temp.
            const wind = Math.round(weather.current.wind_speed_10m);
            const dir = weather.current.wind_direction_10m;

            if (tempEl) tempEl.textContent = `${temp}${weather.units.temperature_2m}`;
            if (windEl) windEl.textContent = `${wind} ${weather.units.wind_speed_10m}`;
            if (windDirEl) windDirEl.textContent = `${dir}°`;

            // For rain % in the "Current" box, usually people want probability.
            // Let's find the hourly slot closest to NOW.
            const nowTs = Math.floor(Date.now() / 1000);
            // Open-Meteo hourly.time is unixtime
            // Note: weather.hourly is ALREADY filtered to session time in getForecast!
            // We need to look at the raw data or just show the session average?
            // Let's just use the max probability from the session window for the "Rain" metric
            // to give a "Session Risk" overview? Or just --% if not in window?

            // Actually, let's use the first available hourly point from our filtered list
            // as the "start of session" condition, or if the session is active, the current time.

            // Use the first filtered hourly point (closest to session start - 1h)
            if (weather.hourly && weather.hourly.length > 0) {
                 // Find max precip probability in the window
                 const maxPrecip = Math.max(...weather.hourly.map(h => h.precipProb));
                 if (rainEl) rainEl.textContent = `${maxPrecip}%`;
                 if (mobRainEl) mobRainEl.textContent = `${maxPrecip}%`;
            } else {
                 if (rainEl) rainEl.textContent = '--%';
                 if (mobRainEl) mobRainEl.textContent = '--%';
            }

            if (mobTempEl) mobTempEl.textContent = `${temp}${weather.units.temperature_2m}`;
            if (mobWindEl) mobWindEl.textContent = `${wind} ${weather.units.wind_speed_10m}`;
        }

        // Render Timeline
        const timelineEl = document.getElementById('weatherTimeline');
        if (timelineEl && weather.hourly) {
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
    }

    async handleRoute({ series, round, session }) {
        if (series !== 'f1') return;

        if (round) {
            const roundSelect = document.getElementById('roundSelect');
            if (roundSelect) roundSelect.value = round;
            this.selectRound(round);

            if (session) {
                const sessionSelect = document.getElementById('sessionSelect');
                if (sessionSelect) sessionSelect.value = session;
                this.selectSession(session);
            }
        }
    }

    showLoading(visible) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.toggle('visible', visible);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const app = new CircuitWeatherApp();
    app.init();
    new PrivacyModal();
});
