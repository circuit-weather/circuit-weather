import { CONFIG, COUNTRY_CODES, SERIES_IDS } from './config.js';
import { F1API } from './api/F1API.js';
import { SeriesAPI } from './api/SeriesAPI.js';
import { WeatherClient } from './api/WeatherClient.js';
import { TrackLayer } from './map/TrackLayer.js';
import { WeatherRadar } from './map/WeatherRadar.js';
import { RangeCircles } from './map/RangeCircles.js';
import { WindOverlay } from './map/WindOverlay.js';
import { WeatherAlerts } from './map/WeatherAlerts.js';
import { TrackRain } from './map/TrackRain.js';
import { MapWeatherWidget } from './map/MapWeatherWidget.js';
import { RecentreControl } from './map/RecentreControl.js';
import { CountdownTimer } from './ui/CountdownTimer.js';
import { Router } from './routing/Router.js';
import { MapManager } from './map/MapManager.js';
import { ThemeManager } from './ui/ThemeManager.js';
import { SidebarManager } from './ui/SidebarManager.js';
import { LayerSettings } from './ui/LayerSettings.js';
import { SeoManager } from './ui/SeoManager.js';
import { AutoAdvance } from './ui/AutoAdvance.js';
import { ForecastRenderer } from './ui/ForecastRenderer.js';
import { formatStatusLabel } from './utils/status.js';
import { getRaceEndTime } from './utils/schedule.js';
import { findCurrentSession, findNextSession, roundStatus, sessionEnd, sessionStatus } from './utils/sessionTiming.js';
import { isRainBannerTimely, isNowcastRelevant } from './utils/rain.js';
import { i18n } from './i18n/index.js';
import { SafeStorage } from './utils/storage.js';

// A partial schedule (the Worker is still filling it, see SeriesAPI) is re-fetched
// after the Worker's 60-second cache, a few times at most
const SCHEDULE_RETRY_MS = 65000;
const SCHEDULE_MAX_RETRIES = 5;

// Radar nowcast states worth a banner; a dry reading shows nothing
// The series a visitor last picked, used when the URL doesn't name one.
// public/theme.js reads it too, to preload that series' schedule.
const SERIES_STORAGE_KEY = 'series';

const TRACK_RAIN_KEYS = Object.freeze({
    approaching: 'trackRain.approaching',
    raining: 'trackRain.raining',
    'raining-easing': 'trackRain.rainingEasing',
});

const sessionTimeFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
});

/**
 * Main application orchestrator for Circuit Weather.
 */
export class CircuitWeatherApp {
    constructor() {
        this.mapManager = new MapManager();
        this.themeManager = null;
        this.sidebarManager = null;
        this.f1Api = new F1API();
        this.seriesApi = new SeriesAPI();
        this.series = 'f1';
        this.scheduleRetryTimer = null;
        // { series, error } while a schedule failed to load, shown inline (see showScheduleError)
        this.scheduleFailure = null;
        this.weatherClient = new WeatherClient();
        this.forecastRenderer = new ForecastRenderer();
        this.radar = null;
        this.trackLayer = null;
        this.rangeCircles = null;
        this.windOverlay = null;
        this.weatherAlerts = null;
        this.layerSettings = null;
        this.countdown = new CountdownTimer();
        this.recentreControl = null;
        this.currentCircuitCenter = null;
        this.races = [];
        this.selectedRace = null;
        this.selectedSession = null;
        // Back/forward is a choice too: auto-advance leaves it until the next change
        this.router = new Router(params => this.handleRoute(params).then(() => this.autoAdvance?.noteManualSelection()));
        this.mobileQuery = window.matchMedia('(max-width: 768px)');
        this.liveWeatherDebounceTimer = null;

        this.ui = {};
        this.handleLanguageChange = this.handleLanguageChange.bind(this);
    }

    initUIElements() {
        // Bolt Optimization: Cache frequently accessed DOM elements
        this.ui = {
            loadingOverlay: document.getElementById('loadingOverlay'),
            seriesSelect: document.getElementById('seriesSelect'),
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
            sessionEmptyState: document.getElementById('sessionEmptyState'),
            // Mobile Race Info
            mobileRaceInfo: document.getElementById('mobileRaceInfo'),
            mobileCountryFlag: document.getElementById('mobileCountryFlag'),
            mobileRaceInfoName: document.getElementById('mobileRaceInfoName'),
            mobileRaceInfoCircuit: document.getElementById('mobileRaceInfoCircuit'),
            // Rain banner over the map (desktop) and in the mobile overlay stack
            rainBanner: document.getElementById('rainBanner'),
            mobileRainBanner: document.getElementById('mobileRainBanner'),
            mobileHeader: document.querySelector('.mobile-header'),
            radarControls: document.getElementById('radarControls'),
            mapContainer: document.getElementById('map'),
            dataSourceNotice: document.getElementById('dataSourceNotice'),
            scheduleCredit: document.getElementById('scheduleCredit'),
            scheduleError: document.getElementById('scheduleError'),
            scheduleErrorText: document.getElementById('scheduleErrorText'),
            scheduleRetry: document.getElementById('scheduleRetry'),
        };
    }

    async initMapComponents() {
        const map = await this.mapManager.init();
        this.map = map;
        // A restored WebGL context needs the style and every layer drawn again
        this.mapManager.onContextRestored = () => this.handleThemeChange(
            this.themeManager?.theme || 'light', { rebuild: true });

        // Sidebar manager for mobile
        this.sidebarManager = new SidebarManager();

        // Handle resize events for mobile visibility
        this.bindResizeHandler();
        this.initResizeObserver();

        // Recentre control (added to zoom control container)
        this.recentreControl = new RecentreControl(map);

        this.rangeCircles = new RangeCircles(map);
        this.trackLayer = new TrackLayer(map);
        this.layerSettings = new LayerSettings((key, settings) => this.handleLayerSettingChange(key, settings));
        const layers = this.layerSettings.get();
        this.trackRainStatus = null;
        this.sessionRainVerdict = null;
        this.trackRain = new TrackRain({ onChange: (status) => this.renderTrackRain(status) });
        this.radar = new WeatherRadar(map, {
            onMetadata: (metadata) => {
                this.layerSettings.applyMetadata(metadata);
                this.trackRain.setMetadata(metadata);
            },
        });
        this.radar.setTileOptions(this.layerSettings.getTileOptions());
        this.radar.setSatelliteEnabled(layers.satellite);
        this.weatherAlerts = new WeatherAlerts(map, { enabled: layers.alerts });
        this.windOverlay = new WindOverlay(map, {
            onToggle: (enabled) => { if (enabled) this.updateWindField(); },
            onViewChange: () => { this.updateWindField(); },
        });

        // Theme manager with callback to update map tiles and overlays
        // Bolt Optimization: Initialized after overlays so they can respond to the initial theme apply
        this.themeManager = new ThemeManager(this.handleThemeChange.bind(this));

        // Map weather widget (Leaflet/Mapbox control)
        this.mapWeatherWidget = new MapWeatherWidget();

        const isMapbox = !map.hasLayer;
        if (isMapbox) {
            map.addControl(this.mapWeatherWidget, 'top-right');
        } else {
            // Safely wrap the widget in a native Leaflet control to avoid recursive addTo calls
            const WeatherControl = L.Control.extend({
                options: { position: 'topright' },
                onAdd: () => this.mapWeatherWidget.onAdd(map),
                onRemove: () => this.mapWeatherWidget.onRemove(map)
            });
            map.addControl(new WeatherControl());
        }
    }

    async init() {
        this.initUIElements();

        this.showLoading(true, i18n.t('loading.schedule'));

        try {
            // Load the schedule for the series in the URL (F1 by default) while
            // the map sets up: it needs nothing from the map, and Mapbox's style
            // and first tiles take a while on mobile. A failed schedule must not
            // block the page: the user can still pick another series or retry
            // (see showScheduleError); tryLoadSchedule never rejects.
            const params = this.router.getParams();
            const series = this.isSupportedSeries(params.series) ? params.series : this.getSavedSeries();
            if (this.ui.seriesSelect) this.ui.seriesSelect.value = series;
            const scheduleLoad = this.tryLoadSchedule(series);

            await this.initMapComponents();

            this.bindEvents();

            const loaded = await scheduleLoad;
            this.populateRoundSelect();

            document.addEventListener('i18n:change', this.handleLanguageChange);

            // Check for initial route or auto-select next (nothing to select if the
            // schedule failed: the retry picks the next round once it loads)
            if (loaded && params.round) {
                await this.handleRoute(params);
            } else if (loaded) {
                this.autoSelectNextRound();
            }

            this.autoAdvance = new AutoAdvance({
                toggle: document.getElementById('autoAdvanceToggle'),
                getTarget: () => this.getCurrentTarget(),
                getSelection: () => (this.selectedRace
                    ? { round: this.selectedRace.round, sessionId: this.selectedSession?.id ?? null }
                    : null),
                apply: (target) => this.showTarget(target),
            });
            // A shared link to another session is respected until the next change
            if (params.round) this.autoAdvance.noteManualSelection();

            // Start live weather refresh interval
            this.startWeatherRefreshInterval();

            // Start session forecast refresh interval
            this.startSessionForecastInterval();

        } catch (error) {
            console.error('Initialization failed:', error);
            this.renderError(i18n.t('errors.initFailed'));
        } finally {
            this.showLoading(false);
        }
    }

    isSupportedSeries(series) {
        return SERIES_IDS.includes(series);
    }

    /** The series the visitor last picked, or Formula 1. */
    getSavedSeries() {
        const saved = SafeStorage.getItem(SERIES_STORAGE_KEY);
        return this.isSupportedSeries(saved) ? saved : 'f1';
    }

    /**
     * Starts a schedule load. Only the latest one may change the app: switching
     * series quickly leaves earlier loads in flight, and one finishing late would
     * otherwise swap its rounds in under the series now picked.
     * @returns {number} token for isCurrentScheduleLoad
     */
    beginScheduleLoad() {
        this.scheduleLoadToken = (this.scheduleLoadToken ?? 0) + 1;
        return this.scheduleLoadToken;
    }

    isCurrentScheduleLoad(token) {
        return token === this.scheduleLoadToken;
    }

    /**
     * Loads a series' schedule into this.races.
     * @returns {Promise<boolean>} false if a later load superseded this one (nothing changed)
     * @throws when every source for the series fails
     */
    async loadSchedule(series, token = this.beginScheduleLoad()) {
        this.clearScheduleRetry();
        let races;
        let complete = true;
        if (series === 'f1') {
            const schedule = await this.f1Api.getSchedule();
            if (!this.isCurrentScheduleLoad(token)) return false;
            races = schedule.map(r => this.f1Api.parseRace(r));
        } else {
            const result = await this.seriesApi.getSchedule(series);
            if (!this.isCurrentScheduleLoad(token)) return false;
            races = result.races.map(r => this.seriesApi.parseRace(r));
            complete = result.complete;
        }
        this.races = races;
        if (!complete) this.scheduleScheduleRetry(series, 1);
        this.series = series;
        this.hideScheduleError();
        this.updateDataSourceNotice();
        return true;
    }

    /**
     * Loads a series' schedule, showing a non-blocking error if every source fails.
     * Other series retry automatically (TheSportsDB may just be rate limiting).
     * @returns {Promise<boolean|null>} false if the schedule could not be loaded,
     *   null if a later load superseded this one (nothing changed)
     */
    async tryLoadSchedule(series, token = this.beginScheduleLoad()) {
        try {
            return (await this.loadSchedule(series, token)) ? true : null;
        } catch (error) {
            if (!this.isCurrentScheduleLoad(token)) return null;
            console.error('Schedule load failed:', error);
            // Still switch, so the dropdown and URL agree and the user can pick again
            this.races = [];
            this.series = series;
            this.updateDataSourceNotice();
            this.showScheduleError(series, error);
            if (series !== 'f1') this.scheduleScheduleRetry(series, 1);
            return false;
        }
    }

    /**
     * Shows why a schedule failed in the sidebar, leaving every control usable.
     */
    showScheduleError(series, error) {
        this.scheduleFailure = { series, error };
        if (!this.ui.scheduleError) return;
        let message;
        if (series === 'f1') {
            const sourcesTried = error?.message?.match(/^F1_SCHEDULE_UNAVAILABLE:([^:]+):/)?.[1];
            message = i18n.t(sourcesTried === 'jolpica,openf1' ? 'errors.scheduleAllUnavailable' : 'errors.scheduleUnavailable');
        } else {
            message = i18n.t('errors.seriesScheduleUnavailable', { series: i18n.t(`controls.${series}`) });
        }
        if (this.ui.scheduleErrorText) this.ui.scheduleErrorText.textContent = message;
        this.ui.scheduleError.hidden = false;
    }

    hideScheduleError() {
        this.scheduleFailure = null;
        if (this.ui.scheduleError) this.ui.scheduleError.hidden = true;
    }

    /**
     * Retry button: reload the current series and pick its next round.
     */
    async retrySchedule() {
        if (await this.selectSeries(this.series) && !this.selectedRace) this.autoSelectNextRound();
    }

    scheduleScheduleRetry(series, attempt) {
        this.scheduleRetryTimer = setTimeout(() => this.refreshPartialSchedule(series, attempt), SCHEDULE_RETRY_MS);
    }

    clearScheduleRetry() {
        if (this.scheduleRetryTimer) {
            clearTimeout(this.scheduleRetryTimer);
            this.scheduleRetryTimer = null;
        }
    }

    /**
     * Re-fetches a partial or failed schedule and refreshes the round list,
     * keeping the current selection.
     */
    async refreshPartialSchedule(series, attempt) {
        this.scheduleRetryTimer = null;
        if (this.series !== series) return;
        const token = this.scheduleLoadToken;
        try {
            const { races, complete } = await this.seriesApi.getSchedule(series, { refresh: true });
            // The series may have changed (or be changing) while this was loading
            if (this.series !== series || !this.isCurrentScheduleLoad(token)) return;
            const recovered = this.scheduleFailure !== null;
            const parsed = races.map(r => this.seriesApi.parseRace(r));
            // Keep the selected race object: it holds the session the user picked
            const selectedRound = this.selectedRace?.round;
            const fresh = parsed.find(r => r.round === selectedRound);
            if (fresh) this.updateSelectedRaceVenue(fresh);
            this.races = parsed.map(r => (r.round === selectedRound ? this.selectedRace : r));
            this.hideScheduleError();
            this.populateRoundSelect();
            if (selectedRound && this.ui.roundSelect) this.ui.roundSelect.value = selectedRound;
            // The first successful load after a failure picks the next round as usual
            if (recovered && !this.selectedRace) this.autoSelectNextRound();
            if (!complete && attempt < SCHEDULE_MAX_RETRIES) this.scheduleScheduleRetry(series, attempt + 1);
        } catch (error) {
            console.warn('Schedule refresh failed:', error);
            if (this.series === series && this.isCurrentScheduleLoad(token) && attempt < SCHEDULE_MAX_RETRIES) this.scheduleScheduleRetry(series, attempt + 1);
        }
    }

    /**
     * Switches to another series: clears the current round, loads the new
     * schedule and refills the round list.
     * @returns {Promise<boolean|null>} false if the schedule could not be loaded,
     *   null if the visitor switched again before it loaded (leave everything to
     *   that later switch)
     */
    async selectSeries(series) {
        if (!this.isSupportedSeries(series)) return false;
        const token = this.beginScheduleLoad();
        this.clearRoundSelection();
        this.races = [];
        // Don't leave the previous series' rounds selectable while loading
        this.populateRoundSelect();
        if (this.ui.seriesSelect) this.ui.seriesSelect.value = series;

        this.showLoading(true, i18n.t('loading.schedule'));
        let loaded;
        try {
            loaded = await this.tryLoadSchedule(series, token);
        } finally {
            // A superseded load leaves the overlay to the load still running
            if (this.isCurrentScheduleLoad(token)) this.showLoading(false);
        }
        if (loaded === null) return null;
        this.populateRoundSelect();
        return loaded;
    }

    // Show a small sidebar notice when the schedule came from the OpenF1 fallback,
    // so it's obvious when the primary source (Jolpica) is degraded vs. recovered.
    // Other series come from TheSportsDB, which must be credited.
    updateDataSourceNotice() {
        if (this.ui.dataSourceNotice) {
            this.ui.dataSourceNotice.hidden = this.series !== 'f1' || this.f1Api.scheduleSource !== 'openf1';
        }
        if (this.ui.scheduleCredit) {
            this.ui.scheduleCredit.hidden = this.series === 'f1';
        }
    }

    _createErrorIconSvg(svgNS = "http://www.w3.org/2000/svg") {
        return this.forecastRenderer.createErrorIconSvg(svgNS);
    }

    _createLoadingSpinnerSvg(svgNS = "http://www.w3.org/2000/svg") {
        return this.forecastRenderer.createLoadingSpinnerSvg(svgNS);
    }

    renderError(message) {
        return this.forecastRenderer.renderError(message);
    }

    /**
     * End of a race weekend's running, used to decide which round is "next".
     */
    getRaceEndTime(race) {
        return getRaceEndTime(race);
    }

    /**
     * Finds the overall next session in the entire season across all rounds.
     */
    getGloballyNextSession(now) {
        return findNextSession(this.races, now, this.series);
    }

    /** What auto-advance should show now (the same pick as a fresh page load). */
    getCurrentTarget() {
        const current = findCurrentSession(this.races, new Date(), this.series);
        return current ? { round: current.race.round, sessionId: current.session?.id ?? null } : null;
    }

    /**
     * Auto-advance: moves to another session, switching round (and flying the
     * map to its circuit) when needed. LIVE/Next markers are rebuilt, as they
     * go stale on a page left open.
     */
    async showTarget({ round, sessionId }) {
        this.populateRoundSelect();
        if (this.ui.roundSelect) this.ui.roundSelect.value = round;
        if (this.selectedRace?.round !== round) {
            this.selectRound(round);
        } else {
            this.populateSessionSelect(this.selectedRace.sessions);
        }
        if (sessionId) {
            if (this.ui.sessionSelect) this.ui.sessionSelect.value = sessionId;
            await this.selectSession(sessionId);
        }
    }

    /**
     * Selects what is on now: the live session, else the next one, in the first
     * round that isn't over (see utils/sessionTiming.js).
     */
    autoSelectNextRound() {
        const current = findCurrentSession(this.races, new Date(), this.series);
        if (!current) return;

        if (this.ui.roundSelect) this.ui.roundSelect.value = current.race.round;
        this.selectRound(current.race.round);

        if (current.session) {
            if (this.ui.sessionSelect) this.ui.sessionSelect.value = current.session.id;
            this.selectSession(current.session.id);
        }
    }

    bindResizeHandler() {
        this.mobileQuery.addEventListener('change', () => {
            // Note: Map resizing is handled by ResizeObserver in MapManager
            // Update visibility when crossing the breakpoint
            this.updateMobileVisibility();
            this.updateLayoutOffsets();
        });
    }

    /**
     * Initializes ResizeObservers to handle dynamic layout updates when UI elements change size.
     */
    initResizeObserver() {
        // Bolt Optimization: Debounce layout updates using requestAnimationFrame
        // to prevent thrashing when ResizeObserver or MutationObserver fire frequently
        let rafId = null;
        const update = () => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                this.updateLayoutOffsets();
                rafId = null;
            });
        };
        const observer = new ResizeObserver(update);

        if (this.ui.mobileHeader) observer.observe(this.ui.mobileHeader);
        if (this.ui.mobileRaceInfo) observer.observe(this.ui.mobileRaceInfo);
        if (this.ui.mobileRainBanner) observer.observe(this.ui.mobileRainBanner);
        if (this.ui.mapContainer) observer.observe(this.ui.mapContainer);
        // The radar bar grows when its playback label gains a session line, and the
        // zoom buttons and countdown sit above it, so re-measure when it resizes
        if (this.ui.radarControls) observer.observe(this.ui.radarControls);

        // Observe existing attribution controls
        const bottomControls = ['.mapboxgl-ctrl-bottom-left', '.mapboxgl-ctrl-bottom-right', '.leaflet-control-attribution'];
        bottomControls.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) observer.observe(el);
        });

        // Watch for dynamically added map controls (common with Mapbox)
        const controlSelector = bottomControls.join(', ');
        const mutationObserver = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (let i = 0; i < mutations.length; i++) {
                const addedNodes = mutations[i].addedNodes;
                for (let j = 0; j < addedNodes.length; j++) {
                    const node = addedNodes[j];
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Intentionally unchanged: caching addedNodes.length and adding a firstElementChild pre-check are micro-optimisations on a
                        // tiny, infrequent mutation list (Mapbox control additions). querySelector already short-circuits on empty nodes; no measurable gain.
                        if (node.matches(controlSelector) || node.querySelector(controlSelector) !== null) {
                            observer.observe(node);
                            shouldUpdate = true;
                        }
                    }
                }
            }
            if (shouldUpdate) update();
        });

        if (this.ui.mapContainer) {
            mutationObserver.observe(this.ui.mapContainer, { childList: true, subtree: true });
        }
    }

    updateMobileVisibility() {
        const isMobile = this.mobileQuery.matches;

        // Update mobile race info visibility
        if (this.ui.mobileRaceInfo) {
            this.ui.mobileRaceInfo.style.display = (this.selectedRace && isMobile) ? 'flex' : 'none';
        }

        // Update map countdown visibility
        const mapCountdown = document.getElementById('mapCountdown');
        if (mapCountdown) {
            const now = new Date();
            const isFuture = this.countdown.targetTime && this.countdown.targetTime > now;
            const shouldShow = this.selectedSession && isFuture;
            mapCountdown.style.display = shouldShow ? 'block' : 'none';
        }

        // Note: Map resizing is handled by ResizeObserver in MapManager
    }

    /**
     * Programmatically calculates and updates CSS variables for mobile UI offsets.
     * This prevents collisions between absolute-positioned map overlays (weather, radar, controls)
     * and UI elements like the header, race banner, and map attribution/logo.
     */
    updateLayoutOffsets() {
        if (!this.mobileQuery.matches) return;

        // TOP OFFSETS: Avoid mobile race banner (and the rain banner stacked below it)
        let topOffset = 56; // Default header height
        const rainBannerBox = this.ui.mobileRainBanner?.getBoundingClientRect();
        if (rainBannerBox && rainBannerBox.height > 0) {
            topOffset = rainBannerBox.bottom;
        } else if (this.ui.mobileRaceInfo) {
            const bannerBox = this.ui.mobileRaceInfo.getBoundingClientRect();
            // Bolt Optimization: Replace getComputedStyle with bounds check to avoid reflow thrashing
            if (bannerBox.height > 0) {
                // Offset is the bottom of the banner relative to the top of the map area
                // (Assuming map top is at the bottom of the mobile-header, but CSS calc adds header already)
                // Actually top: var(--mobile-top-offset) in CSS is used to position the widget.
                // If banner is at Y=56 and H=44, widget should be at 56+44=100.
                // Since we use top: calc(var(--mobile-top-offset) + var(--spacing-sm)),
                // we want var(--mobile-top-offset) to represent the bottom edge of the banner.
                topOffset = bannerBox.bottom;
            } else if (this.ui.mobileHeader) {
                topOffset = this.ui.mobileHeader.getBoundingClientRect().bottom;
            }
        } else if (this.ui.mobileHeader) {
            topOffset = this.ui.mobileHeader.getBoundingClientRect().bottom;
        }

        // Subtract mobile-header height because the map container starts *at* the header's bottom in CSS
        // Actually .map { top: 56px } in CSS.
        // If bannerBox.bottom is 100, and map top is 56, we want the widget top to be 100 - 56 = 44px into the map.
        const mapTop = 56;
        const mobileTopVar = Math.max(0, topOffset - mapTop) + 2; // Added 2px safety buffer

        // BOTTOM OFFSETS: Avoid Mapbox Logo / Attribution
        let attributionHeight = 25; // Safe default for attribution/logo
        // Deliberately NOT a single combined selector: the 
        // 
        //  chain gives explicit priority (Mapbox bottom-left, then bottom-right, then Leaflet).
        // A comma-separated selector returns the first match in DOM order, which changes which element is measured. One-off query, no perf benefit.
        const attribution = document.querySelector('.mapboxgl-ctrl-bottom-left') ||
                            document.querySelector('.mapboxgl-ctrl-bottom-right') ||
                            document.querySelector('.leaflet-control-attribution');

        if (attribution) {
            const attrBox = attribution.getBoundingClientRect();
            const mapBox = this.ui.mapContainer ? this.ui.mapContainer.getBoundingClientRect() : { bottom: window.innerHeight };
            attributionHeight = Math.max(25, mapBox.bottom - attrBox.top);
        }

        // Radar bottom offset = attribution height + 8px gap
        const radarBottom = attributionHeight + 8;

        // Interactive controls bottom offset = radar bottom + radar height + 8px gap
        let radarHeight = 0;
        if (this.ui.radarControls) {
            const radarBox = this.ui.radarControls.getBoundingClientRect();
            // Bolt Optimization: Replace getComputedStyle with bounds check
            if (radarBox.height > 0) {
                radarHeight = radarBox.height;
            }
        }
        const controlsBottom = radarBottom + radarHeight + (radarHeight > 0 ? 8 : 0);

        // Apply to CSS variables
        document.documentElement.style.setProperty('--mobile-top-offset', `${mobileTopVar}px`);
        document.documentElement.style.setProperty('--mobile-radar-offset', `${radarBottom}px`);
        document.documentElement.style.setProperty('--mobile-controls-offset', `${controlsBottom}px`);
    }

    async handleThemeChange(theme, { rebuild = false } = {}) {
        await this.mapManager.setTheme(theme, { rebuild });
        if (this.rangeCircles) {
            this.rangeCircles.updateTheme();
            if (this.currentCircuitCenter) {
                this.rangeCircles.draw(this.currentCircuitCenter);
            }
        }
        if (this.trackLayer) {
            this.trackLayer.updateTheme();
        }
        if (this.radar) {
            // Restore radar layers if they were wiped by Mapbox style change
            if (typeof this.radar.updateTheme === 'function') {
                this.radar.updateTheme();
            }
        }
        if (this.windOverlay) {
            this.windOverlay.updateTheme();
        }
        if (this.weatherAlerts) {
            this.weatherAlerts.updateTheme();
        }
    }

    handleLayerSettingChange(key, settings) {
        if (key === 'alerts') {
            if (this.weatherAlerts) this.weatherAlerts.setEnabled(settings.alerts);
        } else if (key === 'satellite') {
            if (this.radar) this.radar.setSatelliteEnabled(settings.satellite);
        } else if (this.radar) {
            this.radar.setTileOptions(this.layerSettings.getTileOptions());
        }
    }

    /**
     * Clears the selected round and session and everything drawn for them.
     */
    clearRoundSelection() {
        // Palette UX: Reset session select when round is cleared
        if (this.ui.sessionSelect) {
            this.ui.sessionSelect.disabled = true;
            this.ui.sessionSelect.setAttribute('aria-disabled', 'true');
            this.ui.sessionSelect.title = i18n.t('controls.selectRoundFirst');

            const option = document.createElement('option');
            option.value = '';
            option.textContent = i18n.t('controls.selectRoundFirst');
            this.ui.sessionSelect.textContent = '';
            this.ui.sessionSelect.appendChild(option);
        }
        this.selectedSession = null;
        this.selectedRace = null;
        if (this.ui.forecastSection) this.ui.forecastSection.style.display = 'none';
        if (this.ui.raceInfoBanner) this.ui.raceInfoBanner.style.display = 'none';
        if (this.ui.sessionEmptyState) this.ui.sessionEmptyState.style.display = 'none';
        this.updateMobileVisibility();
        this.countdown.show(false);
        if (this.radar) this.radar.setSessionTime(null);
        this.trackLayer.clear();
        this.rangeCircles.clear();
        if (this.weatherAlerts) this.weatherAlerts.setLocation(null, null);
        if (this.trackRain) this.trackRain.setLocation(null, null);
        this.setSessionRainVerdict(null);

        // Clear the forecast update since no session is active anymore
        this.stopSessionForecastInterval();
        this.updatePageMetadata();
    }

    bindEvents() {
        if (this.ui.scheduleRetry) {
            this.ui.scheduleRetry.addEventListener('click', () => this.retrySchedule());
        }

        if (this.ui.seriesSelect) {
            this.ui.seriesSelect.addEventListener('change', async (e) => {
                const series = e.target.value;
                // Only a choice made here is remembered, not a series opened from a shared link
                if (this.isSupportedSeries(series)) SafeStorage.setItem(SERIES_STORAGE_KEY, series);
                const loaded = await this.selectSeries(series);
                // Picked another series while this one loaded: that pick wins
                if (loaded === null) return;
                this.router.navigate(series, null, null);
                if (loaded) this.autoSelectNextRound();
                this.autoAdvance?.noteManualSelection();
            });
        }

        if (this.ui.roundSelect) {
            this.ui.roundSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.selectRound(e.target.value);
                } else {
                    this.clearRoundSelection();
                }
                this.autoAdvance?.noteManualSelection();
            });
        }

        if (this.ui.sessionSelect) {
            this.ui.sessionSelect.addEventListener('change', (e) => {
                if (e.target.value && this.selectedRace) {
                    this.selectSession(e.target.value);
                }
                this.autoAdvance?.noteManualSelection();
            });
        }

        // Update layout when radar controls are toggled
        document.addEventListener('radar:toggle', () => this.updateLayoutOffsets());

        // Note: Weather updates are now pinned to circuit, not triggered by map pan
        // This reduces API calls significantly - weather only updates when circuit changes or every 5 minutes
    }

    populateRoundSelect() {
        const select = this.ui.roundSelect;
        if (!select) return;

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = i18n.t('controls.selectRound');
        select.textContent = '';
        select.appendChild(defaultOption);

        // Bolt Optimization: Use DocumentFragment to batch DOM insertions
        // Reduces reflows when populating the race list (~24 items)
        const fragment = document.createDocumentFragment();

        const now = new Date();
        let nextFound = false;

        this.races.forEach(race => {
            const option = document.createElement('option');
            option.value = race.round;
            const date = new Date(race.date);
            const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

            const status = roundStatus(race, this.series, now);
            let isNext = false;

            // Mark the first future round as Next if no round is currently Live?
            // Or just mark the first future round regardless?
            // Usually "Next" is useful when nothing is happening.
            // If something is happening (LIVE), that takes precedence visually.
            // But knowing what's AFTER the live event is also useful.
            // Let's mark the first FUTURE one as Next.
            if (status === 'FUTURE' && !nextFound) {
                isNext = true;
                nextFound = true;
            }

            const label = i18n.t('controls.roundLabel', { round: race.round, name: race.name, date: dateStr });
            option.textContent = formatStatusLabel(label, status, isNext);

            fragment.appendChild(option);
        });

        select.appendChild(fragment);
    }

    _getPageTitleAndDesc() {
        return SeoManager.getPageTitleAndDesc(this.selectedRace, this.selectedSession);
    }

    _updateMetaTags(title, desc) {
        SeoManager.updateMetaTags(title, desc);
    }

    _updateBreadcrumbJsonLd() {
        SeoManager.updateBreadcrumbJsonLd(this.selectedRace, this.selectedSession, this.series);
    }

    _updateEventJsonLd(desc) {
        SeoManager.updateEventJsonLd(this.selectedRace, this.selectedSession, desc);
    }

    updatePageMetadata() {
        SeoManager.updatePageMetadata(this.selectedRace, this.selectedSession, this.series);
    }

    centreOnCircuit(lat, lng) {
        this.currentCircuitCenter = [lat, lng];
        this.mapManager.setView(lat, lng);
        this.rangeCircles.draw([lat, lng]);
        if (this.recentreControl) {
            this.recentreControl.setCircuit([lat, lng]);
        }
        if (this.weatherAlerts) {
            this.weatherAlerts.setLocation(lat, lng);
        }
        if (this.trackRain) {
            this.trackRain.setLocation(lat, lng);
        }
    }

    /**
     * @param {{level: 'possible'|'likely', text: string}|null} verdict - The selected
     *   session's forecast verdict, already limited to sessions close enough to trust
     * @param {number} [now]
     */
    setSessionRainVerdict(verdict, now = Date.now()) {
        this.sessionRainVerdict = verdict;
        this.renderRainBanner(now);
    }

    /**
     * @param {{state: string, minutes?: number}|null} status - Radar nowcast at the track
     */
    renderTrackRain(status) {
        this.trackRainStatus = status;
        this.renderRainBanner();
    }

    /**
     * The one rain message over the map, or none without rain. While the
     * session is on or about to start, rain on the radar at the track says
     * more than the hourly forecast, so it takes the slot; otherwise the
     * session's forecast verdict does.
     */
    renderRainBanner(now = Date.now()) {
        let message = null;
        const status = this.trackRainStatus;
        const session = this.selectedSession;
        const sessionTime = session ? new Date(`${session.date}T${session.time}`) : null;
        if (status && TRACK_RAIN_KEYS[status.state] && session
            && isNowcastRelevant(sessionTime, this.sessionEndMs(session), now)) {
            message = { level: 'likely', text: i18n.t(TRACK_RAIN_KEYS[status.state], { minutes: status.minutes }) };
        } else if (this.sessionRainVerdict) {
            message = this.sessionRainVerdict;
        }

        for (const element of [this.ui.rainBanner, this.ui.mobileRainBanner]) {
            if (!element) continue;
            element.hidden = !message;
            if (!message) continue;
            element.setAttribute('data-level', message.level);
            element.textContent = message.text;
        }
    }

    selectRound(round) {
        const race = this.races.find(r => r.round === round);
        if (!race) return;

        this.selectedRace = race;
        this.selectedSession = null;
        this.updatePageMetadata();
        this.populateSessionSelect(race.sessions);

        this._resolveRoundMapCenter(race);

        // Update race info banner
        this.updateRaceInfo(race);

        this._resetRoundUIState();

        this.updateMobileVisibility();

        // Clear the forecast update since no session is active yet for this round
        this.stopSessionForecastInterval();

        // Start polling again, it will only do work if a session is actively selected
        this.startSessionForecastInterval();

        this.router.navigate(this.series, round, null);
    }

    /**
     * Takes the venue from a refreshed copy of the selected race. A partial schedule
     * can list a round before its venue coordinates are known, so centre on the
     * circuit once they arrive.
     */
    updateSelectedRaceVenue(fresh) {
        const race = this.selectedRace;
        const hasCoords = (loc) => Number.isFinite(parseFloat(loc?.lat)) && Number.isFinite(parseFloat(loc?.long));
        const hadCoords = hasCoords(race.location);
        race.location = fresh.location;
        race.circuit = fresh.circuit;
        if (!hadCoords && hasCoords(fresh.location)) {
            this._resolveRoundMapCenter(race);
            this.updateRaceInfo(race);
        }
    }

    _resolveRoundMapCenter(race) {
        // The map centre is derived from the track GeoJSON bounding box for every
        // data source, so it stays consistent regardless of where the schedule came
        // from. Schedule coordinates (when present) are only a fallback for circuits
        // that have no track overlay.
        const schedLat = race.location ? parseFloat(race.location.lat) : NaN;
        const schedLng = race.location ? parseFloat(race.location.long) : NaN;
        const hasSchedCoords = Number.isFinite(schedLat) && Number.isFinite(schedLng);

        const applyCenter = (trackCenter) => {
            // A newer round may have been selected while the track was loading.
            if (this.selectedRace !== race) return;
            if (trackCenter) {
                this.centreOnCircuit(trackCenter[0], trackCenter[1]);
            } else if (hasSchedCoords) {
                this.centreOnCircuit(schedLat, schedLng);
            }
            // Centre is resolved — refresh weather widgets and the wind field.
            this.scheduleLiveWeatherUpdate();
            this.updateWindField();
        };

        if (race.circuit && race.circuit.circuitId) {
            this.trackLayer.loadTrack(race.circuit.circuitId).then(applyCenter);
        } else {
            applyCenter(null);
        }
    }

    _resetRoundUIState() {
        // Hide countdown until session selected (radar always shows)
        this.countdown.show(false);

        // Clear previous session time on the radar
        if (this.radar) {
            this.radar.setSessionTime(null);
        }

        // Hide forecast section since no session is selected yet
        if (this.ui.forecastSection) {
            this.ui.forecastSection.style.display = 'none';
        }

        // Palette UX: Show empty state to prompt session selection
        if (this.ui.sessionEmptyState) {
            this.ui.sessionEmptyState.style.display = 'flex';
        }
    }

    updateRaceInfo(race) {
        const country = race.location?.country;
        const code = COUNTRY_CODES[country];
        const flagUrl = code ? `https://flagcdn.com/w80/${code}.png` : '';

        // Sidebar banner
        if (this.ui.raceInfoBanner) {
            this.ui.raceInfoBanner.style.display = race ? 'flex' : 'none';
        }
        if (this.ui.countryFlag) {
            // Hide rather than leave the previous round's flag showing when the country is unmapped
            this.ui.countryFlag.style.display = flagUrl ? '' : 'none';
            if (flagUrl) {
                this.ui.countryFlag.src = flagUrl;
                this.ui.countryFlag.alt = i18n.t('common.countryFlag', { country });
            }
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
        if (this.ui.mobileCountryFlag) {
            // Hide rather than leave the previous round's flag showing when the country is unmapped
            this.ui.mobileCountryFlag.style.display = flagUrl ? '' : 'none';
            if (flagUrl) {
                this.ui.mobileCountryFlag.src = flagUrl;
                this.ui.mobileCountryFlag.alt = i18n.t('common.countryFlag', { country });
            }
        }
        if (this.ui.mobileRaceInfoName) this.ui.mobileRaceInfoName.textContent = race.name || '';
        if (this.ui.mobileRaceInfoCircuit) this.ui.mobileRaceInfoCircuit.textContent = race.circuit?.circuitName || '';
    }

    populateSessionSelect(sessions) {
        const select = this.ui.sessionSelect;
        if (!select) return;

        select.disabled = false;
        select.setAttribute('aria-disabled', 'false');
        select.removeAttribute('title');

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = i18n.t('controls.selectSession');
        select.textContent = '';
        select.appendChild(defaultOption);

        // Bolt Optimization: Use DocumentFragment to batch DOM insertions
        const fragment = document.createDocumentFragment();

        const now = new Date();
        const globalNext = this.getGloballyNextSession(now);

        for (const session of sessions) {
            const option = document.createElement('option');
            option.value = session.id;

            let timeStr = '';
            let dt = null;
            if (session.date && session.time) {
                dt = new Date(`${session.date}T${session.time}`);
                timeStr = ` - ${sessionTimeFormatter.format(dt)}`;
            }

            const label = session.name + timeStr;
            const status = sessionStatus(this.selectedRace || { sessions }, session, this.series, now);

            // Only mark as "(Next)" if it is the absolute next session globally
            const isNext = !!(globalNext &&
                         this.selectedRace?.round === globalNext.round &&
                         session.id === globalNext.sessionId);

            option.textContent = formatStatusLabel(label, status, isNext);
            fragment.appendChild(option);
        }

        select.appendChild(fragment);
    }

    async selectSession(sessionId) {
        const session = this.selectedRace?.sessions.find(s => s.id === sessionId);
        if (!session) return;

        this.showLoading(true, i18n.t('loading.session'));
        // Palette UX: Show skeleton immediately to prevent layout shift
        this.renderForecastSkeleton();
        // The previous session's rain banner must not linger while this one loads
        this.setSessionRainVerdict(null);

        // Show forecast section container immediately
        if (this.ui.forecastSection) this.ui.forecastSection.style.display = 'block';
        if (this.ui.sessionEmptyState) this.ui.sessionEmptyState.style.display = 'none';

        try {
            this.selectedSession = session;
            this.updatePageMetadata();

            // Calculate session time
            const sessionTime = new Date(`${session.date}T${session.time}`);

            // Start countdown
            this.countdown.start(sessionTime, `${session.name} · ${this.selectedRace.name}`);

            // Set session time for radar relative display
            this.radar.setSessionTime(sessionTime, session.name);

            // Load radar and session forecast in parallel
            // Note: We don't force a "Live" weather update here, as that's handled by selectRound
            // or by the initial load. However, we could refresh it if needed.
            const [radarResult, forecastResult] = await Promise.allSettled([
                this.radar.load(),
                this.updateSessionForecast(sessionTime, session.id)
            ]);

            if (radarResult.status === 'rejected') {
                console.error('Radar load failed:', radarResult.reason);
                if (this.radar && typeof this.radar.showErrorToast === 'function') {
                    this.radar.showErrorToast(i18n.t('errors.sessionError'), i18n.t('errors.sessionLoadFailed'), 5);
                }
            }

            if (forecastResult.status === 'rejected') {
                console.error('Session forecast update failed:', forecastResult.reason);
                if (this.ui.forecastContent) {
                    this.ui.forecastContent.textContent = '';
                    this.ui.forecastContent.removeAttribute('aria-busy');
                    this.ui.forecastContent.style.display = 'none';
                }
                if (this.ui.forecastUnavailable) {
                    this.ui.forecastUnavailable.style.display = 'block';
                    const p = this.ui.forecastUnavailable.querySelector('p');
                    if (p) p.textContent = i18n.t('forecast.failedTryAgain');
                }
            }

            // Ensure mobile elements are visible
            this.updateMobileVisibility();

            this.router.navigate(this.series, this.selectedRace.round, sessionId);
        } catch (error) {
            console.error('Error selecting session (synchronous):', error);
        } finally {
            this.showLoading(false);
        }
    }

    async updateWindField() {
        if (!this.windOverlay || !this.windOverlay.enabled || !this.map) return;
        if (this.windOverlay._zoomSuppressed) return;
        try {
            const bounds = this.map.getBounds();
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            const field = await this.weatherClient.getWindField(sw.lat, ne.lat, sw.lng, ne.lng);
            this.windOverlay.setField(field);
        } catch (error) {
            console.error('Wind field fetch failed:', error);
        }
    }

    scheduleLiveWeatherUpdate() {
        if (this.liveWeatherDebounceTimer) {
            clearTimeout(this.liveWeatherDebounceTimer);
        }
        this.liveWeatherDebounceTimer = setTimeout(() => {
            this.liveWeatherDebounceTimer = null;
            this.updateLiveWeatherForCircuit();
        }, CONFIG.LIVE_WEATHER_DEBOUNCE_MS);
    }

    async updateLiveWeatherForCircuit() {
        // Only fetch weather if a circuit is selected
        if (!this.currentCircuitCenter) {
            return;
        }

        try {
            const [lat, lng] = this.currentCircuitCenter;
            // Bucket "now" to the refresh window so repeated fetches for the same circuit
            // (re-selection, theme re-renders, switching away and back) reuse the
            // WeatherClient cache instead of hitting Open-Meteo each time (Known
            // Limitation #4 — avoids 429s). A fresh `new Date()` would change the cache
            // key on every call, defeating the cache.
            const bucketMs = CONFIG.WEATHER_REFRESH_INTERVAL_MS;
            const bucketedNow = new Date(Math.floor(Date.now() / bucketMs) * bucketMs);
            const weather = await this.weatherClient.getForecast(lat, lng, bucketedNow);
            this.mapWeatherWidget.update(weather);
        } catch (error) {
            console.error('Failed to update live weather:', error);
        }
    }

    startWeatherRefreshInterval() {
        // Clear any existing interval
        if (this.weatherRefreshInterval) {
            clearInterval(this.weatherRefreshInterval);
        }

        this.weatherRefreshInterval = setInterval(() => {
            this.updateLiveWeatherForCircuit();
        }, CONFIG.WEATHER_REFRESH_INTERVAL_MS);
    }

    startSessionForecastInterval() {
        this.stopSessionForecastInterval();

        this.sessionForecastInterval = setInterval(() => {
            if (this.selectedSession && this.selectedRace) {
                const sessionTime = new Date(`${this.selectedSession.date}T${this.selectedSession.time}`);
                // Background refresh, no loading spinner
                this.updateSessionForecast(sessionTime, this.selectedSession.id);
            }
        }, CONFIG.SESSION_FORECAST_REFRESH_INTERVAL_MS);
    }

    stopSessionForecastInterval() {
        if (this.sessionForecastInterval) {
            clearInterval(this.sessionForecastInterval);
            this.sessionForecastInterval = null;
        }
    }


    async updateSessionForecast(sessionTime, sessionId) {
        if (!this.selectedRace || !this.selectedRace.location) return;

        let { lat, long } = this.selectedRace.location;
        // Some sources have no venue coordinates: use the centre from the track outline
        if (!Number.isFinite(parseFloat(lat)) || !Number.isFinite(parseFloat(long))) {
            if (!this.currentCircuitCenter) return;
            [lat, long] = this.currentCircuitCenter;
        }
        const session = this.selectedRace.sessions?.find(s => s.id === sessionId);
        const endMs = session ? this.sessionEndMs(session) : NaN;
        const weather = await this.weatherClient.getForecast(lat, long, sessionTime,
            Number.isFinite(endMs) ? new Date(endMs) : null);

        this.renderForecast(weather, sessionTime, sessionId);
    }

    /**
     * When a session of the selected round counts as finished: the same
     * assumed lengths that drive the automatic pick and auto-advance, so the
     * forecast and rain banner cover exactly that span.
     */
    sessionEndMs(session) {
        return this.selectedRace ? sessionEnd(this.selectedRace, session, this.series) : NaN;
    }

    renderForecastSkeleton() {
        this.forecastRenderer.renderForecastSkeleton(this.ui.forecastContent, this.ui.forecastUnavailable);
    }

    renderForecast(weather, sessionTime, sessionId, overrideNow = null) {
        // Updates Sidebar Forecast Panel ONLY
        if (!this.selectedSession || (sessionId && this.selectedSession.id !== sessionId)) {
            return;
        }

        const content = this.ui.forecastContent;
        if (content) content.removeAttribute('aria-busy');

        const unavailable = this.ui.forecastUnavailable;

        if (!weather.available) {
            this.setSessionRainVerdict(null);
            this._renderUnavailableForecast(weather, content, unavailable, overrideNow);
            return;
        }

        if (content) content.style.display = 'block';
        if (unavailable) unavailable.style.display = 'none';

        // Re-evaluated on every forecast refresh, so the banner follows the forecast
        const now = overrideNow ? overrideNow.getTime() : Date.now();
        const endMs = this.sessionEndMs(this.selectedSession);
        const verdict = isRainBannerTimely(sessionTime, endMs, now)
            ? this.forecastRenderer.getRainVerdict(weather.hourly, sessionTime, this.selectedSession, endMs, now)
            : null;
        this.setSessionRainVerdict(verdict && verdict.level !== 'dry' ? verdict : null, now);

        const dashboard = this.forecastRenderer.createForecastDashboard(weather, sessionTime, this.weatherClient);

        if (content) {
            content.textContent = '';
            content.appendChild(dashboard);
        }
    }

    _renderUnavailableForecast(weather, content, unavailable, overrideNow) {
        this.forecastRenderer.renderUnavailableForecast(weather, content, unavailable, overrideNow);
    }

    _createForecastDashboard(weather, sessionTime) {
        return this.forecastRenderer.createForecastDashboard(weather, sessionTime, this.weatherClient);
    }

    _createMetricElement(i18nKey, valueId, valueText) {
        return this.forecastRenderer.createMetricElement(i18nKey, valueId, valueText);
    }

    _createWindArrowSvg(rotation) {
        return this.forecastRenderer.createWindArrowSvg(rotation);
    }

    _createWindMetricElement(wind, dir, speedUnit, dirUnit) {
        return this.forecastRenderer.createWindMetricElement(wind, dir, speedUnit, dirUnit);
    }

    _createCurrentWeatherElement(sessionWeather, units, hourlyData) {
        return this.forecastRenderer.createCurrentWeatherElement(sessionWeather, units, hourlyData);
    }

    _createTimelineElement(hourlyWeather, sessionTime, units) {
        return this.forecastRenderer.createTimelineElement(hourlyWeather, sessionTime, units, this.weatherClient);
    }

    _createTimelineItemElement(hour, sessionTime, units) {
        return this.forecastRenderer.createTimelineItemElement(hour, sessionTime, units, this.weatherClient);
    }

    async handleRoute({ series, round, session }) {
        // F1 comes from Jolpica, other series from TheSportsDB (see SeriesAPI). Jolpica
        // (and the OpenF1 fallback) are F1-only: "/ergast/f2/" returns the F1 schedule,
        // so never route other series through F1API.
        if (!this.isSupportedSeries(series)) return;
        if (series !== this.series && !(await this.selectSeries(series))) return;

        if (round) {
            if (this.ui.roundSelect) this.ui.roundSelect.value = round;
            this.selectRound(round);

            if (session) {
                if (this.ui.sessionSelect) this.ui.sessionSelect.value = session;
                this.selectSession(session);
            }
        }
    }

    handleLanguageChange() {
        if (this.scheduleFailure) this.showScheduleError(this.scheduleFailure.series, this.scheduleFailure.error);
        this.populateRoundSelect();
        if (this.selectedRace) {
            if (this.ui.roundSelect) this.ui.roundSelect.value = this.selectedRace.round;
            this.populateSessionSelect(this.selectedRace.sessions);

            if (this.selectedSession) {
                if (this.ui.sessionSelect) this.ui.sessionSelect.value = this.selectedSession.id;
                const sessionTime = new Date(`${this.selectedSession.date}T${this.selectedSession.time}`);
                // Re-render current forecast with new translations
                this.updateSessionForecast(sessionTime, this.selectedSession.id);
            }
        } else {
            if (this.ui.sessionSelect) {
                this.ui.sessionSelect.title = i18n.t('controls.selectRoundFirst');
                const option = document.createElement('option');
                option.value = '';
                option.textContent = i18n.t('controls.selectRoundFirst');
                this.ui.sessionSelect.textContent = '';
                this.ui.sessionSelect.appendChild(option);
            }
        }

        // Update other translated UI elements
        this.renderRainBanner();
        this.updatePageMetadata();
    }

    showLoading(visible, text = i18n.t('common.loading')) {
        if (this.ui.loadingOverlay) {
            this.ui.loadingOverlay.classList.toggle('visible', visible);
            const p = this.ui.loadingOverlay.querySelector('p');
            if (p) p.textContent = text;
        }
    }
}
