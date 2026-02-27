import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Global Mocks (same pattern as seo.test.js) ---
const createMockElement = (id) => ({
    id,
    addEventListener: vi.fn(),
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn().mockReturnValue(true),
        toggle: vi.fn(),
    },
    style: {},
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    textContent: '',
    value: '',
    innerHTML: '',
    disabled: false,
    querySelector: vi.fn(() => createMockElement('child')),
    appendChild: vi.fn(),
});

const documentMock = {
    title: 'Circuit Weather — Live F1 Race Weather Radar & Forecasts',
    getElementById: vi.fn((id) => createMockElement(id)),
    addEventListener: vi.fn(),
    querySelector: vi.fn((sel) => createMockElement(sel)),
    createElement: vi.fn((tag) => createMockElement(tag)),
    createDocumentFragment: vi.fn(() => ({ appendChild: vi.fn() })),
    head: { appendChild: vi.fn() },
    body: { appendChild: vi.fn() },
};

vi.stubGlobal('document', documentMock);
vi.stubGlobal('window', {
    matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn()
    })),
    location: { reload: vi.fn() }
});
vi.stubGlobal('navigator', { serviceWorker: { register: vi.fn() } });

// Mock all dependencies
vi.mock('../public/src/api/F1API.js', () => ({
    F1API: vi.fn().mockImplementation(function () {
        return {
            getSchedule: vi.fn().mockResolvedValue([]),
            parseRace: vi.fn(r => r),
        }
    })
}));
vi.mock('../public/src/api/WeatherClient.js', () => ({
    WeatherClient: vi.fn().mockImplementation(function () {
        return {
            getForecast: vi.fn().mockResolvedValue({ available: false }),
            getRelativeTime: vi.fn(),
            getWeatherDescription: vi.fn(),
            getAccessibleRelativeTime: vi.fn(),
            getWindDirection: vi.fn(() => ({ text: 'N', rotation: 0 }))
        }
    })
}));
vi.mock('../public/src/map/TrackLayer.js', () => ({
    TrackLayer: vi.fn().mockImplementation(function () {
        return {
            loadTrack: vi.fn(),
            clear: vi.fn(),
            updateTheme: vi.fn()
        }
    })
}));
vi.mock('../public/src/map/WeatherRadar.js', () => ({
    WeatherRadar: vi.fn().mockImplementation(function () {
        return {
            load: vi.fn().mockResolvedValue(),
            setSessionTime: vi.fn(),
            setSession: vi.fn()
        }
    })
}));
vi.mock('../public/src/map/RangeCircles.js', () => ({
    RangeCircles: vi.fn().mockImplementation(function () {
        return {
            draw: vi.fn(),
            clear: vi.fn(),
            updateTheme: vi.fn()
        }
    })
}));
vi.mock('../public/src/map/MapWeatherWidget.js', () => ({
    MapWeatherWidget: vi.fn().mockImplementation(function () {
        return {
            addTo: vi.fn(),
            update: vi.fn()
        }
    })
}));
vi.mock('../public/src/map/RecentreControl.js', () => ({
    RecentreControl: vi.fn().mockImplementation(function () {
        return {
            setCircuit: vi.fn()
        }
    })
}));
vi.mock('../public/src/ui/CountdownTimer.js', () => ({
    CountdownTimer: vi.fn().mockImplementation(function () {
        return {
            show: vi.fn(),
            start: vi.fn()
        }
    })
}));
vi.mock('../public/src/routing/Router.js', () => ({
    Router: vi.fn().mockImplementation(function () {
        return {
            getParams: vi.fn(() => ({})),
            navigate: vi.fn()
        }
    })
}));
vi.mock('../public/src/map/MapManager.js', () => ({
    MapManager: vi.fn().mockImplementation(function () {
        return {
            init: vi.fn(),
            setView: vi.fn(),
            setTheme: vi.fn()
        }
    })
}));
vi.mock('../public/src/ui/ThemeManager.js', () => ({
    ThemeManager: vi.fn()
}));
vi.mock('../public/src/ui/SidebarManager.js', () => ({
    SidebarManager: vi.fn()
}));

const { CircuitWeatherApp } = await import('../public/src/CircuitWeatherApp.js');
const { RangeCircles } = await import('../public/src/map/RangeCircles.js');
const { TrackLayer } = await import('../public/src/map/TrackLayer.js');
const { WeatherRadar } = await import('../public/src/map/WeatherRadar.js');
const { RecentreControl } = await import('../public/src/map/RecentreControl.js');
const { MapWeatherWidget } = await import('../public/src/map/MapWeatherWidget.js');

describe('CircuitWeatherApp Pure Methods', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();

        app = new CircuitWeatherApp();

        // Initialise components that are usually set in init()
        app.rangeCircles = new RangeCircles();
        app.trackLayer = new TrackLayer();
        app.radar = new WeatherRadar();
        app.recentreControl = new RecentreControl();
        app.mapWeatherWidget = new MapWeatherWidget();
    });

    // ---------------------------------------------------------------
    // getRaceEndTime
    // ---------------------------------------------------------------
    describe('getRaceEndTime', () => {
        it('returns race session start + 4 hours when race session exists', () => {
            const race = {
                date: '2024-03-10',
                sessions: [
                    { id: 'fp1', name: 'FP1', date: '2024-03-08', time: '10:00:00Z' },
                    { id: 'race', name: 'Race', date: '2024-03-10', time: '14:00:00Z' },
                ],
            };

            const result = app.getRaceEndTime(race);
            const expected = new Date('2024-03-10T14:00:00Z');
            expected.setHours(expected.getHours() + 4);

            expect(result.getTime()).toBe(expected.getTime());
        });

        it('returns race date + 23 hours as fallback when no time', () => {
            const race = {
                date: '2024-03-10',
                sessions: [
                    { id: 'race', name: 'Race', date: '2024-03-10' },
                ],
            };

            const result = app.getRaceEndTime(race);
            const expected = new Date('2024-03-10');
            expected.setHours(expected.getHours() + 23);

            expect(result.getTime()).toBe(expected.getTime());
        });

        it('falls back to race.date when there is no race session', () => {
            const race = {
                date: '2024-03-10',
                sessions: [
                    { id: 'fp1', name: 'FP1', date: '2024-03-08', time: '10:00:00Z' },
                ],
            };

            const result = app.getRaceEndTime(race);
            const expected = new Date('2024-03-10');
            expected.setHours(expected.getHours() + 23);

            expect(result.getTime()).toBe(expected.getTime());
        });
    });

    // ---------------------------------------------------------------
    // getGloballyNextSession
    // ---------------------------------------------------------------
    describe('getGloballyNextSession', () => {
        it('returns first future session across all rounds', () => {
            app.races = [
                {
                    round: '1',
                    sessions: [
                        { id: 'fp1', date: '2024-02-01', time: '10:00:00Z' },
                        { id: 'race', date: '2024-02-03', time: '14:00:00Z' },
                    ],
                },
                {
                    round: '2',
                    sessions: [
                        { id: 'fp1', date: '2024-03-08', time: '10:00:00Z' },
                        { id: 'race', date: '2024-03-10', time: '14:00:00Z' },
                    ],
                },
            ];

            // Set "now" to be after round 1 but before round 2
            const now = new Date('2024-02-10T12:00:00Z');

            const result = app.getGloballyNextSession(now);

            expect(result).toEqual({ round: '2', sessionId: 'fp1' });
        });

        it('returns null when all sessions are past', () => {
            app.races = [
                {
                    round: '1',
                    sessions: [
                        { id: 'race', date: '2024-02-03', time: '14:00:00Z' },
                    ],
                },
            ];

            // Well after the race + duration
            const now = new Date('2025-01-01T00:00:00Z');

            const result = app.getGloballyNextSession(now);
            expect(result).toBeNull();
        });

        it('returns the first future session in current round', () => {
            app.races = [
                {
                    round: '1',
                    sessions: [
                        { id: 'fp1', date: '2024-02-01', time: '10:00:00Z' },
                        { id: 'qualifying', date: '2024-02-02', time: '14:00:00Z' },
                        { id: 'race', date: '2024-02-03', time: '14:00:00Z' },
                    ],
                },
            ];

            // After FP1 ends but before qualifying
            const now = new Date('2024-02-02T10:00:00Z');

            const result = app.getGloballyNextSession(now);
            expect(result).toEqual({ round: '1', sessionId: 'qualifying' });
        });

        it('returns null when races array is empty', () => {
            app.races = [];
            const now = new Date();
            expect(app.getGloballyNextSession(now)).toBeNull();
        });
    });

    // ---------------------------------------------------------------
    // selectRound — outcome: race info populated, map moved, session select enabled
    // ---------------------------------------------------------------
    describe('selectRound', () => {
        beforeEach(() => {
            app.races = [
                {
                    round: '1',
                    name: 'Bahrain Grand Prix',
                    date: '2024-03-02',
                    location: { lat: '26.0325', long: '50.5106', country: 'Bahrain' },
                    circuit: { circuitId: 'bahrain', circuitName: 'Bahrain International Circuit' },
                    sessions: [
                        { id: 'fp1', name: 'Practice 1', date: '2024-03-01', time: '10:00:00Z' },
                        { id: 'race', name: 'Race', date: '2024-03-02', time: '14:00:00Z' },
                    ],
                },
            ];
            app.ui.roundSelect = createMockElement('roundSelect');
            app.ui.sessionSelect = createMockElement('sessionSelect');
            app.ui.forecastSection = createMockElement('forecastSection');
            app.ui.sessionEmptyState = createMockElement('sessionEmptyState');
            app.ui.raceInfoBanner = createMockElement('raceInfoBanner');
        });

        it('stores the selected race', () => {
            app.selectRound('1');
            expect(app.selectedRace).toBeTruthy();
            expect(app.selectedRace.name).toBe('Bahrain Grand Prix');
        });

        it('moves the map to the circuit location', () => {
            app.selectRound('1');
            expect(app.mapManager.setView).toHaveBeenCalledWith(26.0325, 50.5106);
        });

        it('draws range circles at circuit location', () => {
            app.selectRound('1');
            expect(app.rangeCircles.draw).toHaveBeenCalledWith([26.0325, 50.5106]);
        });

        it('loads the track layout', () => {
            app.selectRound('1');
            expect(app.trackLayer.loadTrack).toHaveBeenCalledWith('bahrain');
        });

        it('updates the recentre control', () => {
            app.selectRound('1');
            expect(app.recentreControl.setCircuit).toHaveBeenCalledWith([26.0325, 50.5106]);
        });

        it('updates page title to race name', () => {
            app.selectRound('1');
            expect(document.title).toBe('Bahrain Grand Prix Weather - Circuit Weather');
        });

        it('navigates to round URL', () => {
            app.selectRound('1');
            expect(app.router.navigate).toHaveBeenCalledWith('f1', '1', null);
        });

        it('does nothing for non-existent round', () => {
            app.selectRound('99');
            expect(app.selectedRace).toBeNull();
        });

        it('hides forecast section and shows empty state', () => {
            app.selectRound('1');
            expect(app.ui.forecastSection.style.display).toBe('none');
            expect(app.ui.sessionEmptyState.style.display).toBe('flex');
        });
    });

    // ---------------------------------------------------------------
    // selectSession — outcome: session set, radar loaded, countdown started
    // ---------------------------------------------------------------
    describe('selectSession', () => {
        beforeEach(() => {
            app.races = [
                {
                    round: '1',
                    name: 'Bahrain Grand Prix',
                    date: '2024-03-02',
                    location: { lat: '26.0325', long: '50.5106', country: 'Bahrain' },
                    circuit: { circuitId: 'bahrain', circuitName: 'Bahrain International Circuit' },
                    sessions: [
                        { id: 'race', name: 'Race', date: '2024-03-02', time: '14:00:00Z' },
                    ],
                },
            ];
            app.selectedRace = app.races[0];
            app.ui.roundSelect = createMockElement('roundSelect');
            app.ui.sessionSelect = createMockElement('sessionSelect');
            app.ui.forecastSection = createMockElement('forecastSection');
            app.ui.sessionEmptyState = createMockElement('sessionEmptyState');
            app.ui.forecastContent = createMockElement('forecastContent');
            app.ui.forecastUnavailable = createMockElement('forecastUnavailable');
            app.ui.loadingOverlay = createMockElement('loadingOverlay');
        });

        it('sets the selected session', async () => {
            await app.selectSession('race');
            expect(app.selectedSession).toBeTruthy();
            expect(app.selectedSession.name).toBe('Race');
        });

        it('starts the countdown timer', async () => {
            await app.selectSession('race');
            expect(app.countdown.start).toHaveBeenCalledWith(
                expect.any(Date),
                'Bahrain Grand Prix - Race'
            );
        });

        it('sets radar session time', async () => {
            await app.selectSession('race');
            expect(app.radar.setSessionTime).toHaveBeenCalledWith(expect.any(Date));
        });

        it('loads radar data', async () => {
            await app.selectSession('race');
            expect(app.radar.load).toHaveBeenCalled();
        });

        it('updates page title with session name', async () => {
            await app.selectSession('race');
            expect(document.title).toBe('Bahrain Grand Prix Race Weather - Circuit Weather');
        });

        it('navigates to session URL', async () => {
            await app.selectSession('race');
            expect(app.router.navigate).toHaveBeenCalledWith('f1', '1', 'race');
        });

        it('does nothing for non-existent session', async () => {
            await app.selectSession('sprint');
            expect(app.selectedSession).toBeNull();
        });
    });

    // ---------------------------------------------------------------
    // renderForecast — outcome: renders weather data or shows unavailable
    // ---------------------------------------------------------------
    describe('renderForecast', () => {
        beforeEach(() => {
            app.selectedSession = { id: 'race', name: 'Race' };
            app.selectedRace = { name: 'Bahrain GP' };
            app.ui.forecastContent = createMockElement('forecastContent');
            app.ui.forecastUnavailable = createMockElement('forecastUnavailable');
        });

        it('shows unavailable message when forecast is not available', () => {
            const weather = { available: false, reason: 'too_far', availableFrom: new Date('2024-04-01') };
            app.renderForecast(weather, new Date(), 'race');

            expect(app.ui.forecastContent.style.display).toBe('none');
            expect(app.ui.forecastUnavailable.style.display).toBe('block');
        });

        it('shows error message when forecast fails', () => {
            const weather = { available: false, reason: 'error' };
            app.renderForecast(weather, new Date(), 'race');

            expect(app.ui.forecastContent.style.display).toBe('none');
            expect(app.ui.forecastUnavailable.style.display).toBe('block');
        });

        it('renders forecast dashboard when data is available', () => {
            const weather = {
                available: true,
                current: { temperature_2m: 28 },
                hourly: [
                    { time: 1700000000, temp: 28, humidity: 40, precipProb: 5, windSpeed: 12, windDir: 180, code: 0 },
                ],
                units: { temperature_2m: '°C', wind_speed_10m: 'km/h' },
            };
            const sessionTime = new Date(1700000000 * 1000);
            app.renderForecast(weather, sessionTime, 'race');

            expect(app.ui.forecastContent.style.display).toBe('block');
            expect(app.ui.forecastUnavailable.style.display).toBe('none');
            expect(app.ui.forecastContent.innerHTML).toContain('weather-dashboard');
        });

        it('skips rendering if session has changed', () => {
            app.selectedSession = { id: 'qualifying', name: 'Qualifying' };
            const weather = { available: true, hourly: [], units: {} };
            app.renderForecast(weather, new Date(), 'race');

            // forecastContent should not be modified since session IDs don't match
            expect(app.ui.forecastContent.style.display).toBeUndefined();
        });

        // ---------------------------------------------------------------
        // renderForecast Edge Cases for Branch Coverage
        // ---------------------------------------------------------------
        it('handles case where session time is outside hourly forecast range', () => {
            const weather = {
                available: true,
                current: { temperature_2m: 25 },
                hourly: [
                    { time: 1700000000, temp: 20 }, // Far in past/future relative to session
                ],
                units: { temperature_2m: '°C' },
            };
            // Session time way different from hourly time (timestamp 1700000000 is ~2023)
            // Let's use a session time that definitely doesn't match
            const sessionTime = new Date((1700000000 + 100000) * 1000);

            app.renderForecast(weather, sessionTime, 'race');

            // Should still render container but "current" section might be empty or partial
            // The logic finds closest, so it might still find one?
            // "sessionWeather = weather.hourly.reduce..." finds closest.
            // So it always finds *something* unless hourly is empty.
            // If hourly is empty?
        });

        it('handles missing hourly data', () => {
            const weather = {
                available: true,
                current: { temperature_2m: 25 },
                hourly: [], // Empty
                units: { temperature_2m: '°C' },
            };
            const sessionTime = new Date();
            app.renderForecast(weather, sessionTime, 'race');

            expect(app.ui.forecastContent.style.display).toBe('block');
            // Should not render timeline or current weather based on hourly
            const html = app.ui.forecastContent.innerHTML;
            expect(html).not.toContain('weather-timeline-item');
        });

        it('handles "too_far" reason with past availableFrom date', () => {
            const pastDate = new Date();
            pastDate.setHours(pastDate.getHours() - 1);

            const weather = {
                available: false,
                reason: 'too_far',
                availableFrom: pastDate
            };

            // Mock the <p> element inside forecastUnavailable
            const mockP = createMockElement('p');
            app.ui.forecastUnavailable.querySelector.mockReturnValue(mockP);

            app.renderForecast(weather, new Date(), 'race');

            // Check the child element's content
            expect(mockP.textContent).toContain('Forecast available shortly');
        });

        it('covers wind direction rotation logic and timeline rendering', () => {
            // This test targets lines 685-691 (Wind Direction Rotation) and 719 (Timeline Item)
            const weather = {
                available: true,
                current: { temperature_2m: 25 },
                hourly: [
                    {
                        time: 1700000000,
                        temp: 25,
                        humidity: 50,
                        precipProb: 10,
                        windSpeed: 20,
                        windDir: 90, // East wind
                        code: 1
                    },
                    {
                        time: 1700003600,
                        temp: 24,
                        humidity: 55,
                        precipProb: 15,
                        windSpeed: 18,
                        windDir: 180, // South wind
                        code: 2
                    }
                ],
                units: { temperature_2m: '°C', wind_speed_10m: 'km/h' },
            };

            // Set session time to match the first hourly entry
            const sessionTime = new Date(1700000000 * 1000);

            // Mock getWindDirection to return distinct values to verify logic
            const mockWindInfo = { text: 'E', rotation: 90 };
            const getWindDirectionSpy = vi.spyOn(app.weatherClient, 'getWindDirection').mockReturnValue(mockWindInfo);

            app.renderForecast(weather, sessionTime, 'race');

            // Verify wind direction logic was called (covering lines 685-691)
            expect(getWindDirectionSpy).toHaveBeenCalledWith(90);

            // Verify content contains the rotation style
            const html = app.ui.forecastContent.innerHTML;
            expect(html).toContain('transform: rotate(90deg)');
            expect(html).toContain('E'); // Text

            // Verify timeline items are rendered (covering line 719 loop/map)
            // The logic iterates over weather.hourly and creates items
            expect(html).toContain('weather-timeline-item');
            // Should have 2 items based on hourly array
            const timelineMatches = html.match(/weather-timeline-item/g);
            expect(timelineMatches.length).toBeGreaterThanOrEqual(2);
        });
    });

    // ---------------------------------------------------------------
    // handleRoute — outcome: correct round and session selected
    // ---------------------------------------------------------------
    describe('handleRoute', () => {
        beforeEach(() => {
            app.races = [
                {
                    round: '3',
                    name: 'Australian GP',
                    date: '2024-03-24',
                    location: { lat: '-37.8497', long: '144.9681', country: 'Australia' },
                    circuit: { circuitId: 'albert_park', circuitName: 'Albert Park' },
                    sessions: [
                        { id: 'race', name: 'Race', date: '2024-03-24', time: '14:00:00Z' },
                    ],
                },
            ];
            app.ui.roundSelect = createMockElement('roundSelect');
            app.ui.sessionSelect = createMockElement('sessionSelect');
            app.ui.forecastSection = createMockElement('forecastSection');
            app.ui.sessionEmptyState = createMockElement('sessionEmptyState');
            app.ui.raceInfoBanner = createMockElement('raceInfoBanner');
            app.ui.forecastContent = createMockElement('forecastContent');
            app.ui.forecastUnavailable = createMockElement('forecastUnavailable');
            app.ui.loadingOverlay = createMockElement('loadingOverlay');
        });

        it('selects round and session from URL params', async () => {
            await app.handleRoute({ series: 'f1', round: '3', session: 'race' });
            expect(app.selectedRace?.name).toBe('Australian GP');
        });

        it('ignores non-f1 series', async () => {
            await app.handleRoute({ series: 'wec', round: '3' });
            expect(app.selectedRace).toBeNull();
        });
    });

    // ---------------------------------------------------------------
    // showLoading — outcome: overlay visibility
    // ---------------------------------------------------------------
    describe('showLoading', () => {
        it('shows loading overlay with text', () => {
            app.ui.loadingOverlay = createMockElement('loadingOverlay');
            app.showLoading(true, 'Fetching data...');
            expect(app.ui.loadingOverlay.classList.toggle).toHaveBeenCalledWith('visible', true);
        });

        it('hides loading overlay', () => {
            app.ui.loadingOverlay = createMockElement('loadingOverlay');
            app.showLoading(false);
            expect(app.ui.loadingOverlay.classList.toggle).toHaveBeenCalledWith('visible', false);
        });
    });
});
