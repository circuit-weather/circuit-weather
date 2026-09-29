import { CONFIG, COUNTRY_CODES } from './config.js';
import { F1API } from './api/F1API.js';
import { WeatherClient } from './api/WeatherClient.js';
import { TrackLayer } from './map/TrackLayer.js';
import { WeatherRadar } from './map/WeatherRadar.js';
import { RangeCircles } from './map/RangeCircles.js';
import { WindOverlay } from './map/WindOverlay.js';
import { MapWeatherWidget } from './map/MapWeatherWidget.js';
import { RecentreControl } from './map/RecentreControl.js';
import { CountdownTimer } from './ui/CountdownTimer.js';
import { Router } from './routing/Router.js';
import { MapManager } from './map/MapManager.js';
import { ThemeManager } from './ui/ThemeManager.js';
import { SidebarManager } from './ui/SidebarManager.js';
import { ForecastRenderer } from './ui/ForecastRenderer.js';
import { LayoutManager } from './ui/LayoutManager.js';
import { MetadataManager } from './seo/MetadataManager.js';
import { getRaceEndTime, findFirstActiveRaceIndex, getGloballyNextSession } from './utils/schedule.js';
import { getSessionStatus, getRoundStatus, formatStatusLabel } from './utils/status.js';
import { i18n } from './i18n/index.js';

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
        this.weatherClient = new WeatherClient();
        this.metadataManager = new MetadataManager();
        this.layoutManager = new LayoutManager();
        this.forecastRenderer = new ForecastRenderer();
        this.radar = null;
        this.trackLayer = null;
        this.rangeCircles = null;
        this.windOverlay = null;
        this.countdown = new CountdownTimer();
        this.recentreControl = null;
        this.currentCircuitCenter = null;
        this.races = [];
        this.selectedRace = null;
        this.selectedSession = null;
        this.router = new Router(params => this.handleRoute(params));
        this.mobileQuery = window.matchMedia('(max-width: 768px)');
        this.liveWeatherDebounceTimer = null;

        this.ui = {};
        this.handleLanguageChange = this.handleLanguageChange.bind(this);
    }

    initUIElements() {
        this.ui = {
            loadingOverlay: document.getElementById('loadingOverlay'),
            roundSelect: document.getElementById('roundSelect'),
            sessionSelect: document.getElementById('sessionSelect'),
            raceInfoBanner: document.getElementById('raceInfoBanner'),
            countryFlag: document.getElementById('countryFlag'),
            raceInfoCountry: document.getElementById('raceInfoCountry'),
            raceInfoName: document.getElementById('raceInfoName'),
            raceInfoCircuit: document.getElementById('raceInfoCircuit'),
            forecastSection: document.getElementById('forecastSection'),
            forecastContent: document.getElementById('forecastContent'),
            forecastUnavailable: document.getElementById('forecastUnavailable'),
            sessionEmptyState: document.getElementById('sessionEmptyState'),
            mobileRaceInfo: document.getElementById('mobileRaceInfo'),
            mobileCountryFlag: document.getElementById('mobileCountryFlag'),
            mobileRaceInfoName: document.getElementById('mobileRaceInfoName'),
            mobileRaceInfoCircuit: document.getElementById('mobileRaceInfoCircuit'),
            mobileHeader: document.querySelector('.mobile-header'),
            radarControls: document.getElementById('radarControls'),
            mapContainer: document.getElementById('map'),
            dataSourceNotice: document.getElementById('dataSourceNotice'),
        };
    }

    async initMapComponents() {
        const map = await this.mapManager.init();
        this.map = map;

        this.sidebarManager = new SidebarManager();

        this.bindResizeHandler();
        this.initResizeObserver();

        this.recentreControl = new RecentreControl(map);

        this.rangeCircles = new RangeCircles(map);
        this.trackLayer = new TrackLayer(map);
        this.radar = new WeatherRadar(map);
        this.windOverlay = new WindOverlay(map, {
            onToggle: (enabled) => { if (enabled) this.updateWindField(); },
            onViewChange: () => { this.updateWindField(); },
        });

        this.themeManager = new ThemeManager(this.handleThemeChange.bind(this));

        this.mapWeatherWidget = new MapWeatherWidget();

        const isMapbox = !map.hasLayer;
        if (isMapbox) {
            map.addControl(this.mapWeatherWidget, 'top-right');
        } else {
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
            await this.initMapComponents();

            this.bindEvents();

            const schedule = await this.f1Api.getSchedule();
            this.races = schedule.map(r => this.f1Api.parseRace(r));

            this.updateDataSourceNotice();
            this.populateRoundSelect();

            document.addEventListener('i18n:change', this.handleLanguageChange);

            const params = this.router.getParams();
            if (params.round) {
                await this.handleRoute(params);
            } else {
                this.autoSelectNextRound();
            }

            this.startWeatherRefreshInterval();
            this.startSessionForecastInterval();

        } catch (error) {
            console.error('Initialization failed:', error);
            const scheduleMatch = error.message?.match(/^F1_SCHEDULE_UNAVAILABLE:([^:]+):/);
            const sourcesTried = scheduleMatch?.[1] ?? '';
            const msgKey = sourcesTried === 'jolpica,openf1' ? 'errors.scheduleAllUnavailable'
                : scheduleMatch ? 'errors.scheduleUnavailable'
                : 'errors.initFailed';
            this.renderError(i18n.t(msgKey));
        } finally {
            this.showLoading(false);
        }
    }

    updateDataSourceNotice() {
        if (!this.ui.dataSourceNotice) return;
        this.ui.dataSourceNotice.hidden = this.f1Api.scheduleSource !== 'openf1';
    }

    // --- Schedule & Navigation Helpers ---

    getRaceEndTime(race) {
        return getRaceEndTime(race);
    }

    _findFirstActiveRaceIndex(now) {
        return findFirstActiveRaceIndex(this.races, now);
    }

    getGloballyNextSession(now) {
        return getGloballyNextSession(this.races, now);
    }

    autoSelectNextRound() {
        const now = new Date();
        const firstActiveIndex = this._findFirstActiveRaceIndex(now);
        const nextRace = firstActiveIndex < this.races.length ? this.races[firstActiveIndex] : undefined;

        if (nextRace) {
            if (this.ui.roundSelect) this.ui.roundSelect.value = nextRace.round;
            this.selectRound(nextRace.round);

            let targetSession = null;
            for (let i = 0; i < nextRace.sessions.length; i++) {
                const session = nextRace.sessions[i];
                const status = getSessionStatus(session, now);
                if (status === 'LIVE') {
                    targetSession = session;
                    break;
                }
                if (!targetSession && status === 'FUTURE') {
                    targetSession = session;
                }
            }

            if (targetSession) {
                if (this.ui.sessionSelect) this.ui.sessionSelect.value = targetSession.id;
                this.selectSession(targetSession.id);
            }
        }
    }

    // --- Layout & Observer Delegation ---

    bindResizeHandler() {
        this.layoutManager.bindResizeHandler(this);
    }

    initResizeObserver() {
        this.layoutManager.initResizeObserver(this);
    }

    updateMobileVisibility() {
        this.layoutManager.updateMobileVisibility(this);
    }

    updateLayoutOffsets() {
        this.layoutManager.updateLayoutOffsets(this);
    }

    // --- Theme & Event Handlers ---

    async handleThemeChange(theme) {
        if (this.mapManager) {
            await this.mapManager.setTheme(theme);
        }
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
            if (typeof this.radar.updateTheme === 'function') {
                this.radar.updateTheme();
            }
        }
        if (this.windOverlay) {
            this.windOverlay.updateTheme();
        }
    }

    bindEvents() {
        if (this.ui.roundSelect) {
            this.ui.roundSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.selectRound(e.target.value);
                } else {
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
                    this.selectedRace = null;
                    this.selectedSession = null;
                    if (this.ui.forecastSection) this.ui.forecastSection.style.display = 'none';
                    if (this.ui.raceInfoBanner) this.ui.raceInfoBanner.style.display = 'none';
                    if (this.ui.sessionEmptyState) this.ui.sessionEmptyState.style.display = 'none';
                    this.countdown.show(false);
                    if (this.trackLayer) this.trackLayer.clear();
                    if (this.rangeCircles) this.rangeCircles.clear();
                    this.stopSessionForecastInterval();
                    this.updatePageMetadata();
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

        document.addEventListener('radar:toggle', () => this.updateLayoutOffsets());
    }

    populateRoundSelect() {
        const select = this.ui.roundSelect;
        if (!select) return;

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = i18n.t('controls.selectRound');
        select.textContent = '';
        select.appendChild(defaultOption);

        const fragment = document.createDocumentFragment();

        const now = new Date();
        let nextFound = false;

        this.races.forEach(race => {
            const option = document.createElement('option');
            option.value = race.round;
            const date = new Date(race.date);
            const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

            const status = getRoundStatus(race, now);
            let isNext = false;

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

    // --- SEO / Metadata Delegation ---

    _getPageTitleAndDesc() {
        return this.metadataManager.getPageTitleAndDesc(this);
    }

    _updateMetaTags(title, desc) {
        this.metadataManager.updateMetaTags(title, desc);
    }

    _updateBreadcrumbJsonLd() {
        this.metadataManager.updateBreadcrumbJsonLd(this);
    }

    _updateEventJsonLd(desc) {
        this.metadataManager.updateEventJsonLd(this, desc);
    }

    updatePageMetadata() {
        this.metadataManager.updatePageMetadata(this);
    }

    centreOnCircuit(lat, lng) {
        this.currentCircuitCenter = [lat, lng];
        this.mapManager.setView(lat, lng);
        if (this.rangeCircles) {
            this.rangeCircles.draw([lat, lng]);
        }
        if (this.recentreControl) {
            this.recentreControl.setCircuit([lat, lng]);
        }
    }

    selectRound(round) {
        const race = this.races.find(r => r.round === round);
        if (!race) return;

        this.selectedRace = race;
        this.selectedSession = null;
        this.updatePageMetadata();
        this.populateSessionSelect(race.sessions);

        const schedLat = race.location ? parseFloat(race.location.lat) : NaN;
        const schedLng = race.location ? parseFloat(race.location.long) : NaN;
        const hasSchedCoords = Number.isFinite(schedLat) && Number.isFinite(schedLng);

        const applyCenter = (trackCenter) => {
            if (this.selectedRace !== race) return;
            if (trackCenter) {
                this.centreOnCircuit(trackCenter[0], trackCenter[1]);
            } else if (hasSchedCoords) {
                this.centreOnCircuit(schedLat, schedLng);
            }
            this.scheduleLiveWeatherUpdate();
            this.updateWindField();
        };

        if (race.circuit && race.circuit.circuitId) {
            this.trackLayer.loadTrack(race.circuit.circuitId).then(applyCenter);
        } else {
            applyCenter(null);
        }

        this.updateRaceInfo(race);
        this.countdown.show(false);

        if (this.radar) {
            this.radar.setSessionTime(null);
        }

        if (this.ui.forecastSection) {
            this.ui.forecastSection.style.display = 'none';
        }

        if (this.ui.sessionEmptyState) {
            this.ui.sessionEmptyState.style.display = 'flex';
        }

        this.updateMobileVisibility();

        this.stopSessionForecastInterval();
        this.startSessionForecastInterval();

        this.router.navigate('f1', round, null);
    }

    updateRaceInfo(race) {
        const country = race.location?.country;
        const code = COUNTRY_CODES[country];
        const flagUrl = code ? `https://flagcdn.com/w80/${code}.png` : '';

        if (this.ui.raceInfoBanner) {
            this.ui.raceInfoBanner.style.display = race ? 'flex' : 'none';
        }
        if (this.ui.countryFlag && flagUrl) {
            this.ui.countryFlag.src = flagUrl;
            this.ui.countryFlag.alt = i18n.t('common.countryFlag', { country });
        }
        if (this.ui.raceInfoCountry) this.ui.raceInfoCountry.textContent = country || '';
        if (this.ui.raceInfoName) this.ui.raceInfoName.textContent = race.name || '';
        if (this.ui.raceInfoCircuit) this.ui.raceInfoCircuit.textContent = race.circuit?.circuitName || '';

        if (this.ui.mobileRaceInfo) {
            const isMobile = this.mobileQuery.matches;
            this.ui.mobileRaceInfo.style.display = (race && isMobile) ? 'flex' : 'none';
        }
        if (this.ui.mobileCountryFlag && flagUrl) {
            this.ui.mobileCountryFlag.src = flagUrl;
            this.ui.mobileCountryFlag.alt = i18n.t('common.countryFlag', { country });
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
            const status = getSessionStatus(session, now, dt);

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
        this.renderForecastSkeleton();

        if (this.ui.forecastSection) this.ui.forecastSection.style.display = 'block';
        if (this.ui.sessionEmptyState) this.ui.sessionEmptyState.style.display = 'none';

        try {
            this.selectedSession = session;
            this.updatePageMetadata();

            const sessionTime = new Date(`${session.date}T${session.time}`);

            this.countdown.start(sessionTime, `${this.selectedRace.name} - ${session.name}`);

            if (this.radar) {
                this.radar.setSessionTime(sessionTime);
            }

            const [radarResult, forecastResult] = await Promise.allSettled([
                this.radar ? this.radar.load() : Promise.resolve(),
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

            this.updateMobileVisibility();

            this.router.navigate('f1', this.selectedRace.round, sessionId);
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
        }, CONFIG.LIVE_WEATHER_DEBOUNCE_MS || 400);
    }

    async updateLiveWeatherForCircuit() {
        if (!this.currentCircuitCenter) {
            return;
        }

        try {
            const [lat, lng] = this.currentCircuitCenter;
            const bucketMs = CONFIG.WEATHER_REFRESH_INTERVAL_MS || 300000;
            const bucketedNow = new Date(Math.floor(Date.now() / bucketMs) * bucketMs);
            const weather = await this.weatherClient.getForecast(lat, lng, bucketedNow);
            if (this.mapWeatherWidget) {
                this.mapWeatherWidget.update(weather);
            }
        } catch (error) {
            console.error('Failed to update live weather:', error);
        }
    }

    startWeatherRefreshInterval() {
        if (this.weatherRefreshInterval) {
            clearInterval(this.weatherRefreshInterval);
        }

        this.weatherRefreshInterval = setInterval(() => {
            this.updateLiveWeatherForCircuit();
        }, CONFIG.WEATHER_REFRESH_INTERVAL_MS || 300000);
    }

    startSessionForecastInterval() {
        this.stopSessionForecastInterval();

        this.sessionForecastInterval = setInterval(() => {
            if (this.selectedSession && this.selectedRace) {
                const sessionTime = new Date(`${this.selectedSession.date}T${this.selectedSession.time}`);
                this.updateSessionForecast(sessionTime, this.selectedSession.id);
            }
        }, CONFIG.SESSION_FORECAST_REFRESH_INTERVAL_MS || 900000);
    }

    stopSessionForecastInterval() {
        if (this.sessionForecastInterval) {
            clearInterval(this.sessionForecastInterval);
            this.sessionForecastInterval = null;
        }
    }

    async updateSessionForecast(sessionTime, sessionId) {
        if (!this.selectedRace || !this.selectedRace.location) return;

        const { lat, long } = this.selectedRace.location;
        const weather = await this.weatherClient.getForecast(lat, long, sessionTime);

        this.renderForecast(weather, sessionTime, sessionId);
    }

    // --- Forecast Rendering Delegation ---

    _createErrorIconSvg(svgNS) {
        return this.forecastRenderer.createErrorIconSvg(svgNS);
    }

    _createLoadingSpinnerSvg(svgNS) {
        return this.forecastRenderer.createLoadingSpinnerSvg(svgNS);
    }

    renderError(message) {
        this.forecastRenderer.renderError(this, message);
    }

    renderForecastSkeleton() {
        this.forecastRenderer.renderForecastSkeleton(this);
    }

    renderForecast(weather, sessionTime, sessionId, overrideNow = null) {
        this.forecastRenderer.renderForecast(this, weather, sessionTime, sessionId, overrideNow);
    }

    _renderUnavailableForecast(weather, content, unavailable, overrideNow = null) {
        this.forecastRenderer.renderUnavailableForecast(this, weather, content, unavailable, overrideNow);
    }

    _createForecastDashboard(weather, sessionTime) {
        return this.forecastRenderer.createForecastDashboard(this, weather, sessionTime);
    }

    _createMetricElement(i18nKey, valueId, valueText) {
        return this.forecastRenderer.createMetricElement(this, i18nKey, valueId, valueText);
    }

    _createWindArrowSvg(rotation) {
        return this.forecastRenderer.createWindArrowSvg(rotation);
    }

    _createCurrentWeatherElement(sessionWeather, units, hourlyData) {
        return this.forecastRenderer.createCurrentWeatherElement(this, sessionWeather, units, hourlyData);
    }

    _createTimelineElement(hourlyWeather, sessionTime, units) {
        return this.forecastRenderer.createTimelineElement(this, hourlyWeather, sessionTime, units);
    }

    _createTimelineItemElement(hour, sessionTime, units) {
        return this.forecastRenderer.createTimelineItemElement(this, hour, sessionTime, units);
    }

    // --- Route & Language Handlers ---

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

    handleLanguageChange() {
        this.populateRoundSelect();
        if (this.selectedRace) {
            if (this.ui.roundSelect) this.ui.roundSelect.value = this.selectedRace.round;
            this.populateSessionSelect(this.selectedRace.sessions);

            if (this.selectedSession) {
                if (this.ui.sessionSelect) this.ui.sessionSelect.value = this.selectedSession.id;
                const sessionTime = new Date(`${this.selectedSession.date}T${this.selectedSession.time}`);
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
