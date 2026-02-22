import { CONFIG, FEATURE_FLAGS, COUNTRY_CODES } from './config.js';
import { escapeHtml } from './utils/escapeHtml.js';
import { F1API } from './api/F1API.js';
import { WeatherClient } from './api/WeatherClient.js';
import { TrackLayer } from './map/TrackLayer.js';
import { WeatherRadar } from './map/WeatherRadar.js';
import { RangeCircles } from './map/RangeCircles.js';
import { MapWeatherWidget } from './map/MapWeatherWidget.js';
import { RecentreControl } from './map/RecentreControl.js';
import { CountdownTimer } from './ui/CountdownTimer.js';
import { WeatherWidget } from './ui/WeatherWidget.js';
import { Router } from './routing/Router.js';
import { MapManager } from './map/MapManager.js';
import { ThemeManager } from './ui/ThemeManager.js';
import { SidebarManager } from './ui/SidebarManager.js';

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
            sessionEmptyState: document.getElementById('sessionEmptyState'),
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
        };
    }

    async init() {
        this.showLoading(true, 'Loading race schedule...');

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

            // Desktop current weather widget (corner)
            this.weatherWidget = new WeatherWidget();

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

        } catch (error) {
            console.error('Initialization failed:', error);
            this.renderError('Failed to initialize application.');
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

    getRaceEndTime(race) {
        const raceSession = race.sessions.find(s => s.id === 'race');
        if (raceSession && raceSession.date && raceSession.time) {
            const end = new Date(`${raceSession.date}T${raceSession.time}`);
            end.setHours(end.getHours() + 4); // 4 hours duration buffer
            return end;
        }
        // Fallback if no time (shouldn't happen for recent races)
        const end = new Date(race.date);
        end.setHours(end.getHours() + 23); // End of race day
        return end;
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
                    if (this.ui.sessionEmptyState) this.ui.sessionEmptyState.style.display = 'none';
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
        const now = new Date();

        // Identify the current/next race
        const nextRace = this.races.find(r => this.getRaceEndTime(r) > now);

        this.races.forEach(race => {
            const option = document.createElement('option');
            option.value = race.round;
            const date = new Date(race.date);
            const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

            let text = `R${race.round}: ${race.name} (${dateStr})`;

            // Palette UX: Add visual indicator for the active/next race
            if (race === nextRace) {
                // Check if race is currently live (started but not finished)
                const raceSession = race.sessions.find(s => s.id === 'race');
                if (raceSession && raceSession.date && raceSession.time) {
                    const start = new Date(`${raceSession.date}T${raceSession.time}`);
                    // If now is past start time (and since it's "nextRace", we know it's before end time), it's live
                    if (now >= start) {
                        text += ' 🔴 LIVE';
                    } else {
                        text += ' (Next)';
                    }
                } else {
                    text += ' (Next)';
                }
            }

            option.textContent = text;
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

        // Palette UX: Show empty state to prompt session selection
        if (this.ui.sessionEmptyState) {
            this.ui.sessionEmptyState.style.display = 'flex';
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

        this.showLoading(true, 'Loading session data...');
        // Palette UX: Show skeleton immediately to prevent layout shift
        this.renderForecastSkeleton();

        // Show forecast section container immediately
        if (this.ui.forecastSection) this.ui.forecastSection.style.display = 'block';
        if (this.ui.sessionEmptyState) this.ui.sessionEmptyState.style.display = 'none';

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
        this.mapWeatherWidget.update(weather);
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
                        const now = new Date();
                        if (weather.availableFrom > now) {
                            const dateStr = weather.availableFrom.toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                            p.textContent = `Forecast available from ${dateStr}`;
                        } else {
                            p.textContent = 'Forecast available shortly';
                        }
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
                <div class="weather-current">
                    <div class="weather-metric">
                        <span class="weather-label">Temp</span>
                        <span class="weather-value" id="weatherTemp">${escapeHtml(temp)}${escapeHtml(weather.units.temperature_2m)}</span>
                    </div>
                    <div class="weather-metric">
                        <span class="weather-label">Rain</span>
                        <span class="weather-value" id="weatherRain">${escapeHtml(maxPrecip)}%</span>
                    </div>
                    <div class="weather-metric">
                        <span class="weather-label">Wind</span>
                        <span class="weather-value" id="weatherWind">${escapeHtml(wind)} ${escapeHtml(weather.units.wind_speed_10m)}</span>
                        <span class="weather-sub" id="weatherWindDir" title="${dir}°" aria-label="Wind direction: ${windInfo.text} (${dir} degrees)">
                            ${windInfo.text}
                            <svg class="icon-wind-arrow" style="transform: rotate(${rotation}deg); width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <line x1="12" y1="19" x2="12" y2="5"></line>
                                <polyline points="5 12 12 5 19 12"></polyline>
                            </svg>
                        </span>
                    </div>
                </div>
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
                const ariaLabel = `${a11yTime}. ${desc}. Temperature ${temp} degrees. Rain chance ${hour.precipProb}%. Wind ${hour.windSpeed} km/h.`;

                return `
                    <li class="weather-timeline-item" aria-label="${ariaLabel}">
                        <div class="weather-timeline-time" aria-hidden="true">${escapeHtml(relTime)}</div>
                        <div class="weather-timeline-condition" aria-hidden="true">
                            ${escapeHtml(desc)}
                            <div class="weather-timeline-wind">${escapeHtml(hour.windSpeed)} km/h</div>
                        </div>
                        <div class="weather-timeline-temp" aria-hidden="true">
                            <div>${escapeHtml(temp)}°</div>
                            <div class="weather-timeline-precip">${escapeHtml(hour.precipProb)}%</div>
                        </div>
                    </li>
                `;
            }).join('');

            timelineHtml = `
                <div class="weather-timeline" id="weatherTimeline" tabindex="0" role="region" aria-label="Hourly forecast">
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

    showLoading(visible, text = 'Loading...') {
        if (this.ui.loadingOverlay) {
            this.ui.loadingOverlay.classList.toggle('visible', visible);
            const p = this.ui.loadingOverlay.querySelector('p');
            if (p) p.textContent = text;
        }
    }
}
