import { CONFIG, COUNTRY_CODES } from './config.js';
import { escapeHtml } from './utils/escapeHtml.js';
import { F1API } from './api/F1API.js';
import { WeatherClient } from './api/WeatherClient.js';
import { TrackLayer } from './map/TrackLayer.js';
import { WeatherRadar } from './map/WeatherRadar.js';
import { RangeCircles } from './map/RangeCircles.js';
import { MapWeatherWidget } from './map/MapWeatherWidget.js';
import { RecentreControl } from './map/RecentreControl.js';
import { CountdownTimer } from './ui/CountdownTimer.js';
import { Router } from './routing/Router.js';
import { MapManager } from './map/MapManager.js';
import { ThemeManager } from './ui/ThemeManager.js';
import { SidebarManager } from './ui/SidebarManager.js';
import { getSessionStatus, getRoundStatus, formatStatusLabel } from './utils/status.js';
import { i18n } from './i18n/index.js';

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
        this.mobileQuery = window.matchMedia('(max-width: 768px)');

        this.ui = {};
    }

    async init() {
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
            sessionEmptyState: document.getElementById('sessionEmptyState'),
            // Mobile Race Info
            mobileRaceInfo: document.getElementById('mobileRaceInfo'),
            mobileCountryFlag: document.getElementById('mobileCountryFlag'),
            mobileRaceInfoName: document.getElementById('mobileRaceInfoName'),
            mobileRaceInfoCircuit: document.getElementById('mobileRaceInfoCircuit'),
        };

        this.showLoading(true, i18n.t('loading.schedule'));

        try {
            const map = this.mapManager.init();

            // Sidebar manager for mobile
            this.sidebarManager = new SidebarManager();

            // Handle resize events for mobile visibility
            this.bindResizeHandler();

            // Recentre control (added to zoom control container)
            this.recentreControl = new RecentreControl(map);

            this.rangeCircles = new RangeCircles(map);
            this.trackLayer = new TrackLayer(map);
            this.radar = new WeatherRadar(map);

            // Theme manager with callback to update map tiles and overlays
            // Bolt Optimization: Initialized after overlays so they can respond to the initial theme apply
            this.themeManager = new ThemeManager(this.handleThemeChange.bind(this));

            // Map weather widget (Leaflet control)
            this.mapWeatherWidget = new MapWeatherWidget({ position: 'topright' });
            this.mapWeatherWidget.addTo(map);

            this.bindEvents();

            // Load schedule
            const schedule = await this.f1Api.getSchedule();
            this.races = schedule.map(r => this.f1Api.parseRace(r));

            this.populateRoundSelect();

            // Check for initial route or auto-select next
            const params = this.router.getParams();
            if (params.round) {
                await this.handleRoute(params);
            } else {
                this.autoSelectNextRound();
            }

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

    renderError(message) {
        const sidebarContent = document.querySelector('.sidebar-content');
        if (sidebarContent) {
            sidebarContent.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                    </div>
                    <h3>${escapeHtml(i18n.t('errors.connectionFailed'))}</h3>
                    <p>${escapeHtml(message)}</p>
                    <button class="retry-btn" type="button" aria-label="${escapeHtml(i18n.t('errors.retryConnection'))}">${escapeHtml(i18n.t('common.retry'))}</button>
                </div>
            `;
            const btn = sidebarContent.querySelector('.retry-btn');
            if (btn) {
                btn.addEventListener('click', () => {
                    btn.disabled = true;
                    // Palette UX: Add loading spinner to async submit button
                    btn.innerHTML = `<svg style="width: 1rem; height: 1rem; margin-right: 0.5rem; animation: spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path></svg>${escapeHtml(i18n.t('common.retrying'))}`;
                    btn.setAttribute('aria-label', i18n.t('errors.retryingConnection'));
                    window.location.reload();
                });
            }
        }
    }

    getRaceEndTime(race) {
        const raceSession = race.sessions.find(s => s.id === 'race');
        if (raceSession && raceSession.date && raceSession.time) {
            const end = new Date(`${raceSession.date}T${raceSession.time}`);
            end.setHours(end.getHours() + CONFIG.RACE_DURATION_BUFFER_HOURS);
            return end;
        }
        // Fallback if no time (shouldn't happen for recent races)
        const end = new Date(race.date);
        end.setHours(end.getHours() + CONFIG.RACE_DAY_END_HOUR);
        return end;
    }

    /**
     * Finds the overall next session in the entire season across all rounds.
     * @param {Date} now - The current date/time.
     * @returns {Object|null} - { round, sessionId } or null.
     */
    getGloballyNextSession(now) {
        for (const race of this.races) {
            const next = race.sessions.find(s => getSessionStatus(s, now) === 'FUTURE');
            if (next) {
                return { round: race.round, sessionId: next.id };
            }
        }
        return null;
    }

    autoSelectNextRound() {
        const now = new Date();
        // Find next race with a session in the future
        const nextRace = this.races.find(race => {
            return this.getRaceEndTime(race) > now;
        });

        if (nextRace) {
            if (this.ui.roundSelect) this.ui.roundSelect.value = nextRace.round;
            this.selectRound(nextRace.round);

            // Find next upcoming session within this round
            // Priority: LIVE > FUTURE
            let targetSession = nextRace.sessions.find(session => getSessionStatus(session, now) === 'LIVE');
            if (!targetSession) {
                targetSession = nextRace.sessions.find(session => getSessionStatus(session, now) === 'FUTURE');
            }

            if (targetSession) {
                if (this.ui.sessionSelect) this.ui.sessionSelect.value = targetSession.id;
                this.selectSession(targetSession.id);
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

    handleThemeChange(theme) {
        this.mapManager.setTheme(theme);
        if (this.rangeCircles) {
            this.rangeCircles.updateTheme();
            if (this.currentCircuitCenter) {
                this.rangeCircles.draw(this.currentCircuitCenter);
            }
        }
        if (this.trackLayer) {
            this.trackLayer.updateTheme();
        }
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
                        this.ui.sessionSelect.title = i18n.t('controls.selectRoundFirst');
                        this.ui.sessionSelect.innerHTML = `<option value="">${escapeHtml(i18n.t('controls.selectRoundFirst'))}</option>`;
                    }
                    this.selectedSession = null;
                    this.selectedRace = null;
                    if (this.ui.forecastSection) this.ui.forecastSection.style.display = 'none';
                    if (this.ui.raceInfoBanner) this.ui.raceInfoBanner.style.display = 'none';
                    if (this.ui.sessionEmptyState) this.ui.sessionEmptyState.style.display = 'none';
                    this.countdown.show(false);
                    this.trackLayer.clear();
                    this.rangeCircles.clear();
                    
                    // Clear the forecast update since no session is active anymore
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

        // Note: Weather updates are now pinned to circuit, not triggered by map pan
        // This reduces API calls significantly - weather only updates when circuit changes or every 5 minutes
    }

    populateRoundSelect() {
        const select = this.ui.roundSelect;
        if (!select) return;

        select.innerHTML = `<option value="">${escapeHtml(i18n.t('controls.selectRound'))}</option>`;

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

            const status = getRoundStatus(race, now);
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

            const label = `R${race.round}: ${race.name} (${dateStr})`;
            option.textContent = formatStatusLabel(label, status, isNext);

            fragment.appendChild(option);
        });

        select.appendChild(fragment);
    }

    /**
     * Updates the document title and metadata for SEO and browser history context.
     * Dynamic titles and meta tags improve SERP visibility and rich social sharing.
     */
    updatePageMetadata() {
        const defaultTitle = i18n.t('meta.defaultTitle');
        const defaultDesc = i18n.t('meta.defaultDesc');

        let title = defaultTitle;
        let desc = defaultDesc;

        if (this.selectedRace && this.selectedSession) {
            // Specific session page: "Bahrain GP Qualifying Weather - Circuit Weather"
            title = i18n.t('meta.sessionTitle', {
                raceName: this.selectedRace.name,
                sessionName: this.selectedSession.name,
            });
            desc = i18n.t('meta.sessionDesc', {
                raceName: this.selectedRace.name,
                sessionName: this.selectedSession.name,
            });
        } else if (this.selectedRace) {
            // Race page: "Bahrain GP Weather - Circuit Weather"
            title = i18n.t('meta.raceTitle', { raceName: this.selectedRace.name });
            desc = i18n.t('meta.raceDesc', { raceName: this.selectedRace.name });
        } else {
            // Default home page title
            title = defaultTitle;
        }

        // Update Title: Crucial for primary SERP display and browser history
        document.title = title;

        // Update Meta Description: Improves click-through rates from search results by providing context
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute('content', desc);

        // Update Canonical URL: Prevents duplicate content issues across different routing states
        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) canonical.setAttribute('href', window.location.href);

        // Update Open Graph (OG) Tags: Enhances rich previews when shared on platforms like Facebook/LinkedIn
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) ogTitle.setAttribute('content', title);

        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.setAttribute('content', desc);

        const ogUrl = document.querySelector('meta[property="og:url"]');
        if (ogUrl) ogUrl.setAttribute('content', window.location.href);

        // Update Twitter Card Tags: Enhances rich previews when shared on Twitter
        const twitterTitle = document.querySelector('meta[name="twitter:title"]');
        if (twitterTitle) twitterTitle.setAttribute('content', title);

        const twitterDesc = document.querySelector('meta[name="twitter:description"]');
        if (twitterDesc) twitterDesc.setAttribute('content', desc);

        // Scout: Update Twitter Card URL to ensure accurate link attribution when shared
        const twitterUrl = document.querySelector('meta[name="twitter:url"]');
        if (twitterUrl) twitterUrl.setAttribute('content', window.location.href);

        // Scout: Inject dynamic JSON-LD structured data for the selected session
        // Value: Improves rich snippets in SERP by providing explicit event details (SportsEvent) to search engines.
        if (this.selectedRace && this.selectedSession && this.selectedSession.date && this.selectedSession.time) {
            let jsonLdScript = document.getElementById('dynamic-json-ld');
            if (!jsonLdScript) {
                jsonLdScript = document.createElement('script');
                jsonLdScript.id = 'dynamic-json-ld';
                jsonLdScript.type = 'application/ld+json';
                document.head.appendChild(jsonLdScript);
            }

            const sessionStart = new Date(`${this.selectedSession.date}T${this.selectedSession.time}`).toISOString();

            const schema = {
                "@context": "https://schema.org",
                "@type": "SportsEvent",
                "name": `${this.selectedRace.name} - ${this.selectedSession.name}`,
                "startDate": sessionStart,
                "location": {
                    "@type": "Place",
                    "name": this.selectedRace.circuit ? this.selectedRace.circuit.circuitName : this.selectedRace.location.country,
                    "address": {
                        "@type": "PostalAddress",
                        "addressCountry": this.selectedRace.location ? this.selectedRace.location.country : ""
                    }
                }
            };
            jsonLdScript.textContent = JSON.stringify(schema);
        } else {
            // Remove the dynamic schema if no specific session is selected
            const existingScript = document.getElementById('dynamic-json-ld');
            if (existingScript && existingScript.parentNode) {
                existingScript.parentNode.removeChild(existingScript);
            }
        }
    }

    selectRound(round) {
        const race = this.races.find(r => r.round === round);
        if (!race) return;

        this.selectedRace = race;
        this.selectedSession = null;
        this.updatePageMetadata();
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

        // Palette UX: Show empty state to prompt session selection
        if (this.ui.sessionEmptyState) {
            this.ui.sessionEmptyState.style.display = 'flex';
        }

        // Fetch current "Live" weather for the widgets
        this.updateLiveWeatherForCircuit();

        this.updateMobileVisibility();

        // Clear the forecast update since no session is active yet for this round
        this.stopSessionForecastInterval();
        
        // Start polling again, it will only do work if a session is actively selected
        this.startSessionForecastInterval();

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
        select.removeAttribute('title');
        select.innerHTML = `<option value="">${escapeHtml(i18n.t('controls.selectSession'))}</option>`;

        // Bolt Optimization: Use DocumentFragment to batch DOM insertions
        const fragment = document.createDocumentFragment();

        const now = new Date();
        const globalNext = this.getGloballyNextSession(now);

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

            const label = session.name + timeStr;
            const status = getSessionStatus(session, now);

            // Only mark as "(Next)" if it is the absolute next session globally
            const isNext = !!(globalNext &&
                         this.selectedRace?.round === globalNext.round &&
                         session.id === globalNext.sessionId);

            option.textContent = formatStatusLabel(label, status, isNext);
            fragment.appendChild(option);
        });

        select.appendChild(fragment);
    }

    async selectSession(sessionId) {
        const session = this.selectedRace?.sessions.find(s => s.id === sessionId);
        if (!session) return;

        this.showLoading(true, i18n.t('loading.session'));
        // Palette UX: Show skeleton immediately to prevent layout shift
        this.renderForecastSkeleton();

        // Show forecast section container immediately
        if (this.ui.forecastSection) this.ui.forecastSection.style.display = 'block';
        if (this.ui.sessionEmptyState) this.ui.sessionEmptyState.style.display = 'none';

        try {
            this.selectedSession = session;
            this.updatePageMetadata();

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

            // Palette UX: Provide visual feedback when session data fails to load
            if (this.radar && typeof this.radar.showErrorToast === 'function') {
                this.radar.showErrorToast(i18n.t('errors.sessionError'), i18n.t('errors.sessionLoadFailed'), 5);
            }

            // Clear skeleton and show error state in the forecast panel
            if (this.ui.forecastContent) {
                this.ui.forecastContent.innerHTML = '';
                this.ui.forecastContent.removeAttribute('aria-busy');
                this.ui.forecastContent.style.display = 'none';
            }
            if (this.ui.forecastUnavailable) {
                this.ui.forecastUnavailable.style.display = 'block';
                const p = this.ui.forecastUnavailable.querySelector('p');
                if (p) p.textContent = i18n.t('forecast.failedTryAgain');
            }
        } finally {
            this.showLoading(false);
        }
    }

    async updateLiveWeatherForCircuit() {
        // Only fetch weather if a circuit is selected
        if (!this.currentCircuitCenter) {
            return;
        }

        const [lat, lng] = this.currentCircuitCenter;
        const weather = await this.weatherClient.getForecast(lat, lng, new Date());
        this.mapWeatherWidget.update(weather);
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
            content.innerHTML = '';
            const template = document.getElementById('forecast-skeleton-template');
            if (template && typeof template.cloneNode === 'function') {
                 if (template.content) {
                     content.appendChild(template.content.cloneNode(true));
                 } else {
                     const clone = template.cloneNode(true);
                     while(clone.firstChild) {
                         content.appendChild(clone.firstChild);
                     }
                 }
            }
        }
    }


    renderForecast(weather, sessionTime, sessionId, overrideNow = null) {
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
                        const now = overrideNow || new Date();
                        if (weather.availableFrom > now) {
                            const dateStr = weather.availableFrom.toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                            p.textContent = i18n.t('forecast.availableFrom', { date: dateStr });
                        } else {
                            p.textContent = i18n.t('forecast.availableSoon');
                        }
                    } else if (weather.reason === 'error') {
                        p.textContent = i18n.t('forecast.unavailable');
                    } else {
                        // Default fallback
                        p.textContent = i18n.t('forecast.availableCloser');
                    }
                }
            }
            return;
        }

        if (content) content.style.display = 'block';
        if (unavailable) unavailable.style.display = 'none';

        // Rebuild Dashboard HTML
        // Note: We rebuild the entire dashboard here because renderForecastSkeleton() destroys
        // the internal structure (including IDs), causing cached references to become detached.
        let currentHtml = '';

        // Find the hourly forecast item closest to the session start time
        let sessionWeather = null;
        if (weather.hourly && weather.hourly.length > 0) {
            const sessionTs = Math.floor(sessionTime.getTime() / 1000);
            sessionWeather = weather.hourly.reduce((prev, curr) =>
                Math.abs(curr.time - sessionTs) < Math.abs(prev.time - sessionTs) ? curr : prev
            );
        }

        if (sessionWeather) {
            const temp = Math.round(sessionWeather.temp);
            const wind = Math.round(sessionWeather.windSpeed);
            const dir = sessionWeather.windDir;
            const maxPrecip = Math.max(...weather.hourly.map(h => h.precipProb));

            // Wind Direction Logic
            const windInfo = this.weatherClient.getWindDirection(dir);
            // Rotation: Input 0 (N) -> Blows South -> Arrow (Up) needs 180 deg rotation
            const rotation = windInfo.rotation;

            currentHtml = `
                <!-- Scout: Upgraded generic div/span wrappers to semantic description list (dl/dt/dd) to explicitly associate weather labels with their values for crawlers and assistive tech. -->
                <dl class="weather-current">
                    <div class="weather-metric">
                        <dt class="weather-label">${escapeHtml(i18n.t('weather.temp'))}</dt>
                        <dd class="weather-value" id="weatherTemp">${escapeHtml(temp)}${escapeHtml(weather.units.temperature_2m)}</dd>
                    </div>
                    <div class="weather-metric">
                        <dt class="weather-label">${escapeHtml(i18n.t('weather.rain'))}</dt>
                        <dd class="weather-value" id="weatherRain">${escapeHtml(maxPrecip)}%</dd>
                    </div>
                    <div class="weather-metric">
                        <dt class="weather-label">${escapeHtml(i18n.t('weather.wind'))}</dt>
                        <dd class="weather-value" id="weatherWind">${escapeHtml(wind)} ${escapeHtml(weather.units.wind_speed_10m)}</dd>
                        <dd class="weather-sub" id="weatherWindDir" title="${escapeHtml(dir)}°" aria-label="${escapeHtml(i18n.t('weather.windDirection', { direction: windInfo.text, degrees: dir }))}">
                            ${escapeHtml(windInfo.text)}
                            <svg class="icon-wind-arrow" style="transform: rotate(${escapeHtml(rotation)}deg); width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <line x1="12" y1="19" x2="12" y2="5"></line>
                                <polyline points="5 12 12 5 19 12"></polyline>
                            </svg>
                        </dd>
                    </div>
                </dl>
            `;
        }

        // Timeline Logic
        let timelineHtml = '';
        if (weather.hourly) {
            const items = weather.hourly.map(hour => {
                const relTime = this.weatherClient.getRelativeTime(hour.time, sessionTime);
                const desc = this.weatherClient.getWeatherDescription(hour.code);
                const a11yTime = this.weatherClient.getAccessibleRelativeTime(hour.time, sessionTime);
                const temp = Math.round(hour.temp);
                const ariaLabel = i18n.t('weather.timelineAria', {
                    time: a11yTime,
                    description: desc,
                    temp,
                    rain: hour.precipProb,
                    wind: hour.windSpeed,
                    windUnit: weather.units.wind_speed_10m,
                });

                // Create a valid ISO string for the datetime attribute
                const isoDateTime = new Date(hour.time * 1000).toISOString();

                // Scout: Upgraded the timeline time element from a generic div to a semantic <time> tag
                // and added a datetime attribute. This helps search engines and crawlers understand
                // that this specific string represents a time duration/point in the forecast.
                return `
                    <li class="weather-timeline-item" aria-label="${escapeHtml(ariaLabel)}">
                        <time datetime="${escapeHtml(isoDateTime)}" class="weather-timeline-time" aria-hidden="true">${escapeHtml(relTime)}</time>
                        <div class="weather-timeline-condition" aria-hidden="true">
                            ${escapeHtml(desc)}
                            <div class="weather-timeline-wind">${escapeHtml(hour.windSpeed)} ${escapeHtml(weather.units.wind_speed_10m)}</div>
                        </div>
                        <div class="weather-timeline-temp" aria-hidden="true">
                            <div>${escapeHtml(temp)}°</div>
                            <div class="weather-timeline-precip">${escapeHtml(hour.precipProb)}%</div>
                        </div>
                    </li>
                `;
            }).join('');

            timelineHtml = `
                <div class="weather-timeline" id="weatherTimeline" tabindex="0" role="region" aria-label="${escapeHtml(i18n.t('forecast.hourlyForecast'))}">
                    <ul class="weather-timeline-list">
                        ${items}
                    </ul>
                </div>
            `;
        }

        // Inject into content
        if (content) {
            content.innerHTML = `
                <div class="weather-dashboard">
                    ${currentHtml}
                    ${timelineHtml}
                </div>
            `;
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

    showLoading(visible, text = i18n.t('common.loading')) {
        if (this.ui.loadingOverlay) {
            this.ui.loadingOverlay.classList.toggle('visible', visible);
            const p = this.ui.loadingOverlay.querySelector('p');
            if (p) p.textContent = text;
        }
    }
}
