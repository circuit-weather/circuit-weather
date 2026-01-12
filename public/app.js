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
    rainViewerApi: 'https://api.rainviewer.com/public/weather-maps.json',
    // Use Carto basemaps (reliable, free, no key)
    mapTiles: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    mapTilesDark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    defaultCenter: [48.8566, 2.3522],
    defaultZoom: 4,
    circuitZoom: 11,
    radarOpacity: 0.65,
    radarAnimationSpeed: 600,
    rangeCirclesMetric: [5, 10, 25, 50],
    rangeCirclesImperial: [3, 6, 15, 30],
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
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggle());
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

        const response = await fetch(`${CONFIG.f1ApiBase}/current`);
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
        this.bindEvents();
    }

    bindEvents() {
        const playBtn = document.getElementById('radarPlayBtn');
        const slider = document.getElementById('radarSlider');

        if (playBtn) playBtn.addEventListener('click', () => this.togglePlay());
        if (slider) {
            slider.addEventListener('input', (e) => {
                this.currentFrame = parseInt(e.target.value, 10);
                this.showFrame(this.currentFrame);
                this.pause();
            });
        }
    }

    setSessionTime(sessionTime) {
        this.sessionTime = sessionTime;
    }

    async fetchAndFilter() {
        const response = await fetch(CONFIG.rainViewerApi);
        const data = await response.json();

        const past = data.radar?.past || [];
        const nowcast = data.radar?.nowcast || [];

        this.frames = [...past, ...nowcast].map(frame => ({
            time: frame.time,
            path: frame.path,
            url: `${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
        }));

        return this.frames;
    }

    async load() {
        await this.fetchAndFilter();
        if (this.frames.length === 0) return;

        this.createLayers();
        this.updateSlider();
        this.showControls(true);

        // Wait for tiles to load before starting animation
        await this.waitForTilesToLoad();
        this.play();
    }

    createLayers() {
        this.layers.forEach(layer => this.map.removeLayer(layer));
        this.layers = [];

        this.frames.forEach((frame, index) => {
            const layer = L.tileLayer(frame.url, {
                tileSize: 256,
                opacity: 0.01, // Small opacity to trigger tile loading
                zIndex: 100 + index,
                crossOrigin: 'anonymous',
                updateWhenIdle: false,
                updateWhenZooming: false,
                keepBuffer: 2,
            });
            layer.addTo(this.map);
            this.layers.push(layer);
        });

        this.currentFrame = this.frames.length - 1;

        // Force map to recalculate size
        this.map.invalidateSize();
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
        if (!timeEl || !timestamp) return;

        const date = new Date(timestamp * 1000);
        const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
        timeEl.textContent = timeStr;

        // Show relative to session if available
        if (relEl && this.sessionTime) {
            const diff = (timestamp * 1000 - this.sessionTime.getTime()) / 60000; // minutes
            if (Math.abs(diff) < 1) {
                relEl.textContent = 'Session start';
            } else if (diff < 0) {
                relEl.textContent = `${Math.abs(Math.round(diff))}m before`;
            } else {
                relEl.textContent = `${Math.round(diff)}m after`;
            }
        } else if (relEl) {
            const now = Date.now() / 1000;
            const diff = timestamp - now;
            if (diff > 60) {
                relEl.textContent = 'Forecast';
            } else {
                relEl.textContent = '';
            }
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
        this.isPlaying = true;
        const playBtn = document.getElementById('radarPlayBtn');
        if (playBtn) playBtn.classList.add('playing');

        this.animationTimer = setInterval(() => {
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
            this.showFrame(this.currentFrame);
        }, CONFIG.radarAnimationSpeed);
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
        this.unit = localStorage.getItem('unit') || 'imperial';
        this.center = null;
        this.bindEvents();
        this.updateToggleUI();
    }

    bindEvents() {
        const toggle = document.getElementById('unitToggle');
        if (toggle) {
            toggle.addEventListener('click', (e) => {
                const option = e.target.closest('.unit-option');
                if (option) this.setUnit(option.dataset.unit);
            });
        }
    }

    setUnit(unit) {
        this.unit = unit;
        localStorage.setItem('unit', unit);
        this.updateToggleUI();
        if (this.center) this.draw(this.center);
    }

    updateToggleUI() {
        document.querySelectorAll('.unit-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.unit === this.unit);
        });
    }

    draw(center) {
        this.clear();
        this.center = center;

        const distances = this.unit === 'metric' ? CONFIG.rangeCirclesMetric : CONFIG.rangeCirclesImperial;
        const unitLabel = this.unit === 'metric' ? 'km' : 'mi';
        const multiplier = this.unit === 'metric' ? 1000 : 1609.34;

        distances.forEach((distance, index) => {
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

        const timerEl = document.getElementById('countdownTimer');
        const sessionEl = document.getElementById('countdownSession');

        if (diff <= 0) {
            if (timerEl) timerEl.textContent = 'NOW';
            this.stop();
            return;
        }

        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);

        if (timerEl) {
            if (hours > 24) {
                const days = Math.floor(hours / 24);
                timerEl.textContent = `${days}d ${hours % 24}h`;
            } else {
                timerEl.textContent = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        }
        if (sessionEl) sessionEl.textContent = this.sessionName;
    }

    show(visible) {
        const card = document.getElementById('countdownCard');
        if (card) card.style.display = visible ? 'block' : 'none';
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
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
// Main Application
// ===================================

class CircuitWeatherApp {
    constructor() {
        this.mapManager = new MapManager();
        this.themeManager = null;
        this.f1Api = new F1API();
        this.radar = null;
        this.rangeCircles = null;
        this.countdown = new CountdownTimer();
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

            this.rangeCircles = new RangeCircles(map);
            this.radar = new WeatherRadar(map);

            const races = await this.f1Api.getSchedule();
            this.races = races.map(race => this.f1Api.parseRace(race));
            this.populateRoundSelect();
            this.bindEvents();

            const params = this.router.getParams();
            if (params.round) await this.handleRoute(params);

            this.showLoading(false);
        } catch (error) {
            console.error('Failed to initialize:', error);
            this.showLoading(false);
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
            this.mapManager.setView(lat, lng);
            this.rangeCircles.draw([lat, lng]);
        }

        // Hide radar until session selected
        this.radar.destroy();
        this.countdown.show(false);

        this.router.navigate('f1', round, null);
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

        // Show forecast section
        const forecastSection = document.getElementById('forecastSection');
        if (forecastSection) forecastSection.style.display = 'block';

        this.router.navigate('f1', this.selectedRace.round, sessionId);
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
    new CircuitWeatherApp().init();
});
