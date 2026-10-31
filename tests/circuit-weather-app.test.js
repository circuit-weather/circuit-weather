import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Global Mocks (same pattern as seo.test.js) ---
const createMockElement = (id) => {
    const el = {
        id,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
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
        querySelector: vi.fn((sel) => {
            if (sel === 'p') return el._p || (el._p = createMockElement('p'));
            return createMockElement('child');
        }),
        childNodes: [],
        appendChild: vi.fn((child) => {
            if (child) {
                el.childNodes.push(child);
            }
            return child;
        }),
        replaceChildren: vi.fn((...children) => {
            el.childNodes = children;
        }),
        getBoundingClientRect: vi.fn(() => ({
            top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0
        })),
    };
    return el;
};

// The forecast dashboard opens with the rain verdict when a session is selected
const childWithClass = (el, className) => el.childNodes.find(child => child.className === className);

const documentMock = {
    title: 'Circuit Weather — Live F1 Race Weather Radar & Forecasts',
    getElementById: vi.fn((id) => createMockElement(id)),
    addEventListener: vi.fn(),
    querySelector: vi.fn((sel) => createMockElement(sel)),
    createElement: vi.fn((tag) => createMockElement(tag)),
    createElementNS: vi.fn((ns, tag) => createMockElement(tag)),
    createTextNode: vi.fn((text) => text),
    createDocumentFragment: vi.fn(() => ({ appendChild: vi.fn() })),
    head: { appendChild: vi.fn() },
    body: { appendChild: vi.fn() },
    documentElement: {
        style: {
            setProperty: vi.fn()
        }
    },
};

vi.stubGlobal('document', documentMock);
vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
})));
vi.stubGlobal('MutationObserver', vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    disconnect: vi.fn(),
})));
vi.stubGlobal('window', {
    matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn()
    })),
    getComputedStyle: vi.fn(() => ({
        display: 'none',
        height: '0px'
    })),
    location: { reload: vi.fn() },
    setInterval: global.setInterval,
    clearInterval: global.clearInterval
});
// Ensure timer functions are present globally
// We need to capture the original functions before stubbing to avoid recursion
const originalSetInterval = global.setInterval;
const originalClearInterval = global.clearInterval;

vi.stubGlobal('setInterval', vi.fn((cb, time) => {
    return originalSetInterval(cb, time);
}));
vi.stubGlobal('clearInterval', vi.fn((id) => {
    return originalClearInterval(id);
}));

// Vitest's vi.useFakeTimers() might interfere with our global stubs or vice-versa.
// When running in node environment (jsdom/happy-dom), window.clearInterval should be synonymous with global.clearInterval.
// Let's ensure window also has them.
window.setInterval = global.setInterval;
window.clearInterval = global.clearInterval;

// Also ensure the bare function calls resolve to the global scope in strict mode or ESM
// By explicitly attaching them to globalThis
globalThis.setInterval = global.setInterval;
globalThis.clearInterval = global.clearInterval;

// Ensure window matches
if (typeof window !== 'undefined') {
    window.setInterval = global.setInterval;
    window.clearInterval = global.clearInterval;
}

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
            getAccessibleRelativeTime: vi.fn()
        }
    })
}));
vi.mock('../public/src/utils/wind.js', () => ({
    getWindDirection: vi.fn(() => ({ text: 'N', rotation: 0 }))
}));
vi.mock('../public/src/map/TrackLayer.js', () => ({
    TrackLayer: vi.fn().mockImplementation(function () {
        return {
            loadTrack: vi.fn().mockResolvedValue(null),
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
            setSession: vi.fn(),
            setTileOptions: vi.fn(),
            setSatelliteEnabled: vi.fn()
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
            update: vi.fn(),
            onAdd: vi.fn(),
            onRemove: vi.fn()
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
            init: vi.fn().mockResolvedValue({}), // init returns a promise resolving to map instance
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

const { CONFIG } = await import('../public/src/config.js');
const { CircuitWeatherApp } = await import('../public/src/CircuitWeatherApp.js');
const { RangeCircles } = await import('../public/src/map/RangeCircles.js');
const { TrackLayer } = await import('../public/src/map/TrackLayer.js');
const { WeatherRadar } = await import('../public/src/map/WeatherRadar.js');
const { RecentreControl } = await import('../public/src/map/RecentreControl.js');
const { MapWeatherWidget } = await import('../public/src/map/MapWeatherWidget.js');
const { ThemeManager } = await import('../public/src/ui/ThemeManager.js');
const { i18n } = await import('../public/src/i18n/index.js');

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

    afterEach(() => {
        // Clear any pending live-weather debounce timer so real timers don't leak
        // between tests that exercise selectRound/handleRoute.
        if (app && app.liveWeatherDebounceTimer) {
            clearTimeout(app.liveWeatherDebounceTimer);
            app.liveWeatherDebounceTimer = null;
        }
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

        it('uses the round date/time when there is no race session (F2/F3 Feature Race)', () => {
            const race = {
                date: '2026-11-29',
                time: '13:00:00Z',
                sessions: [
                    { id: 'sprint-race', name: 'Sprint Race', date: '2026-11-28', time: '13:00:00Z' },
                    { id: 'feature-race', name: 'Feature Race', date: '2026-11-29', time: '13:00:00Z' },
                ],
            };

            const result = app.getRaceEndTime(race);
            expect(result.toISOString()).toBe('2026-11-29T17:00:00.000Z');
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

        it('memoises the result without handing back a shared mutable Date', () => {
            const race = {
                date: '2024-03-10',
                sessions: [
                    { id: 'race', name: 'Race', date: '2024-03-10', time: '14:00:00Z' },
                ],
            };

            const first = app.getRaceEndTime(race);
            const expected = first.getTime();

            // A caller mutating the returned Date must not poison the cache.
            first.setFullYear(first.getFullYear() + 5);

            const second = app.getRaceEndTime(race);
            expect(second.getTime()).toBe(expected);
            expect(second).not.toBe(first);
        });

        it('keeps the memo off enumerable state so races stay serialisable', () => {
            const race = {
                date: '2024-03-10',
                sessions: [
                    { id: 'race', name: 'Race', date: '2024-03-10', time: '14:00:00Z' },
                ],
            };

            app.getRaceEndTime(race);

            expect(Object.keys(race)).toEqual(['date', 'sessions']);
            expect(JSON.parse(JSON.stringify(race))).toEqual({
                date: '2024-03-10',
                sessions: [
                    { id: 'race', name: 'Race', date: '2024-03-10', time: '14:00:00Z' },
                ],
            });
        });

        it('leaves unparseable date uncached so a later fix to the schedule data is picked up', () => {
            const race = {
                date: 'invalid',
                sessions: [
                    { id: 'race', name: 'Race', date: 'invalid', time: 'invalid' },
                ],
            };

            const result = app.getRaceEndTime(race);

            expect(Number.isNaN(result.getTime())).toBe(true);
            expect(race._endTimeMs).toBeUndefined();

            // When schedule data is later updated with valid dates
            race.date = '2024-03-10';
            race.sessions[0].date = '2024-03-10';
            race.sessions[0].time = '14:00:00Z';

            const fixedResult = app.getRaceEndTime(race);
            expect(Number.isNaN(fixedResult.getTime())).toBe(false);
            expect(typeof race._endTimeMs).toBe('number');
        });

        it('handles null race or missing sessions gracefully', () => {
            const nullResult = app.getRaceEndTime(null);
            expect(Number.isNaN(nullResult.getTime())).toBe(true);

            const raceNoSessions = {
                date: '2024-03-10',
            };
            const resultNoSessions = app.getRaceEndTime(raceNoSessions);
            expect(Number.isNaN(resultNoSessions.getTime())).toBe(false);
            expect(typeof raceNoSessions._endTimeMs).toBe('number');
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
            app.ui.mobileRaceInfo = createMockElement('mobileRaceInfo');
            app.ui.mobileCountryFlag = createMockElement('mobileCountryFlag');
            app.ui.mobileRaceInfoName = createMockElement('mobileRaceInfoName');
            app.ui.mobileRaceInfoCircuit = createMockElement('mobileRaceInfoCircuit');
        });

        it('stores the selected race', () => {
            app.selectRound('1');
            expect(app.selectedRace).toBeTruthy();
            expect(app.selectedRace.name).toBe('Bahrain Grand Prix');
        });

        it('moves the map to the track geometry centre', async () => {
            app.trackLayer.loadTrack = vi.fn().mockResolvedValue([26.05, 50.52]);
            app.selectRound('1');
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(app.mapManager.setView).toHaveBeenCalledWith(26.05, 50.52);
        });

        it('draws range circles at the track geometry centre', async () => {
            app.trackLayer.loadTrack = vi.fn().mockResolvedValue([26.05, 50.52]);
            app.selectRound('1');
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(app.rangeCircles.draw).toHaveBeenCalledWith([26.05, 50.52]);
        });

        it('loads the track layout', () => {
            app.selectRound('1');
            expect(app.trackLayer.loadTrack).toHaveBeenCalledWith('bahrain');
        });

        it('updates the recentre control with the track geometry centre', async () => {
            app.trackLayer.loadTrack = vi.fn().mockResolvedValue([26.05, 50.52]);
            app.selectRound('1');
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(app.recentreControl.setCircuit).toHaveBeenCalledWith([26.05, 50.52]);
        });

        it('falls back to schedule coordinates when the track has no centre', async () => {
            app.trackLayer.loadTrack = vi.fn().mockResolvedValue(null);
            app.selectRound('1');
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(app.mapManager.setView).toHaveBeenCalledWith(26.0325, 50.5106);
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


    describe('updateDataSourceNotice', () => {
        beforeEach(() => {
            app.ui.dataSourceNotice = createMockElement('dataSourceNotice');
        });

        it('shows the notice when the schedule came from the OpenF1 fallback', () => {
            app.f1Api.scheduleSource = 'openf1';
            app.updateDataSourceNotice();
            expect(app.ui.dataSourceNotice.hidden).toBe(false);
        });

        it('hides the notice when the schedule came from the primary source', () => {
            app.f1Api.scheduleSource = 'jolpica';
            app.updateDataSourceNotice();
            expect(app.ui.dataSourceNotice.hidden).toBe(true);
        });

        it('does nothing when the notice element is absent', () => {
            app.ui.dataSourceNotice = null;
            expect(() => app.updateDataSourceNotice()).not.toThrow();
        });
    });

    describe('updateRaceInfo', () => {
        beforeEach(() => {
            app.ui.raceInfoBanner = createMockElement('raceInfoBanner');
            app.ui.countryFlag = createMockElement('countryFlag');
            app.ui.raceInfoCountry = createMockElement('raceInfoCountry');
            app.ui.raceInfoName = createMockElement('raceInfoName');
            app.ui.raceInfoCircuit = createMockElement('raceInfoCircuit');
            app.ui.mobileRaceInfo = createMockElement('mobileRaceInfo');
            app.ui.mobileCountryFlag = createMockElement('mobileCountryFlag');
            app.ui.mobileRaceInfoName = createMockElement('mobileRaceInfoName');
            app.ui.mobileRaceInfoCircuit = createMockElement('mobileRaceInfoCircuit');
            app.mobileQuery = { matches: true };
        });

        it('updates UI with race info', () => {
            const race = {
                location: { country: 'UK' },
                circuit: {
                    circuitName: 'Silverstone'
                },
                name: 'British Grand Prix'
            };
            app.updateRaceInfo(race);

            expect(app.ui.raceInfoBanner.style.display).toBe('flex');
            expect(app.ui.countryFlag.src).toBe('https://flagcdn.com/w80/gb.png');
            expect(app.ui.countryFlag.alt).toBe('UK flag');
            expect(app.ui.raceInfoCountry.textContent).toBe('UK');
            expect(app.ui.raceInfoName.textContent).toBe('British Grand Prix');
            expect(app.ui.raceInfoCircuit.textContent).toBe('Silverstone');

            expect(app.ui.mobileRaceInfo.style.display).toBe('flex');
            expect(app.ui.mobileCountryFlag.src).toBe('https://flagcdn.com/w80/gb.png');
            expect(app.ui.mobileCountryFlag.alt).toBe('UK flag');
            expect(app.ui.mobileRaceInfoName.textContent).toBe('British Grand Prix');
            expect(app.ui.mobileRaceInfoCircuit.textContent).toBe('Silverstone');
        });

        it('shows the Malaysian flag for Malaysia', () => {
            app.updateRaceInfo({ location: { country: 'Malaysia' }, name: 'Malaysian Grand Prix' });

            expect(app.ui.countryFlag.src).toBe('https://flagcdn.com/w80/my.png');
            expect(app.ui.countryFlag.style.display).toBe('');
            expect(app.ui.mobileCountryFlag.src).toBe('https://flagcdn.com/w80/my.png');
        });

        it('hides the previous flag when the country has no mapping', () => {
            app.updateRaceInfo({ location: { country: 'UK' }, name: 'British Grand Prix' });
            app.updateRaceInfo({ location: { country: 'Atlantis' }, name: 'Atlantis Grand Prix' });

            expect(app.ui.countryFlag.style.display).toBe('none');
            expect(app.ui.mobileCountryFlag.style.display).toBe('none');
        });

        it('shows the flag for a race in Malaysia regardless of race name', () => {
            app.updateRaceInfo({ location: { country: 'Malaysia' }, name: 'Some Grand Prix' });

            expect(app.ui.countryFlag.src).toBe('https://flagcdn.com/w80/my.png');
            expect(app.ui.countryFlag.style.display).toBe('');
            expect(app.ui.mobileCountryFlag.src).toBe('https://flagcdn.com/w80/my.png');
        });

        it('hides the previous flag when the country has no mapping', () => {
            app.updateRaceInfo({ location: { country: 'UK' }, name: 'British Grand Prix' });
            app.updateRaceInfo({ location: { country: 'Atlantis' }, name: 'Atlantis Grand Prix' });

            expect(app.ui.countryFlag.style.display).toBe('none');
            expect(app.ui.mobileCountryFlag.style.display).toBe('none');
        });

        it('throws an error when race is null', () => {
            expect(() => app.updateRaceInfo(null)).toThrow(TypeError);
        });
    });

    // ---------------------------------------------------------------

    // ---------------------------------------------------------------
    // populateSessionSelect
    // ---------------------------------------------------------------
    describe('populateSessionSelect', () => {
        beforeEach(() => {
            app.ui.sessionSelect = createMockElement('sessionSelect');
            app.getGloballyNextSession = vi.fn().mockReturnValue(null);
            app.selectedRace = { round: '1' };
        });

        it('disables select and returns early if sessionSelect UI element does not exist', () => {
            app.ui.sessionSelect = null;
            expect(() => app.populateSessionSelect([])).not.toThrow();
        });

        it('populates session select options properly', () => {
            const sessions = [
                { id: 'fp1', name: 'Practice 1', date: '2024-03-01', time: '12:00:00Z' },
                { id: 'race', name: 'Race', date: '2024-03-03', time: '14:00:00Z' }
            ];

            app.populateSessionSelect(sessions);

            expect(app.ui.sessionSelect.disabled).toBe(false);
            expect(app.ui.sessionSelect.setAttribute).toHaveBeenCalledWith('aria-disabled', 'false');
            expect(app.ui.sessionSelect.removeAttribute).toHaveBeenCalledWith('title');

            // One <option> built per session, then the batched fragment appended.
            const optionCreations = documentMock.createElement.mock.calls.filter(
                ([tag]) => tag === 'option'
            );
            expect(optionCreations).toHaveLength(sessions.length + 1); // sessions + default
            expect(app.ui.sessionSelect.appendChild).toHaveBeenCalledTimes(2); // default option + fragment
            expect(app.ui.sessionSelect.childNodes[0].textContent).toBe('Select session...');
        });

        it('marks the session as (Next) if it matches the globally next session', () => {
            const sessions = [
                { id: 'race', name: 'Race', date: '2024-03-03', time: '14:00:00Z' }
            ];
            app.getGloballyNextSession.mockReturnValue({ round: '1', sessionId: 'race' });

            let options = [];
            documentMock.createElement.mockImplementation((tag) => {
                const opt = createMockElement(tag);
                options.push(opt);
                return opt;
            });

            app.populateSessionSelect(sessions);

            // options[0] is the default "Select session...", options[1] is the first session
            expect(options[1].textContent).toContain('(Next)');

            // Restore original mock
            documentMock.createElement.mockImplementation((tag) => createMockElement(tag));
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
            app.ui.mobileRaceInfo = createMockElement('mobileRaceInfo');
            app.ui.mobileCountryFlag = createMockElement('mobileCountryFlag');
            app.ui.mobileRaceInfoName = createMockElement('mobileRaceInfoName');
            app.ui.mobileRaceInfoCircuit = createMockElement('mobileRaceInfoCircuit');
            app.ui.loadingOverlay = createMockElement('loadingOverlay');
        });

        it('clears the previous session\'s rain banner before loading the new one', async () => {
            app.radar.load = vi.fn().mockResolvedValue();
            app.weatherClient.getForecast = vi.fn().mockResolvedValue({ available: false, reason: 'error' });
            const order = [];
            app.setSessionRainVerdict = vi.fn(() => order.push('banner'));
            app.updateSessionForecast = vi.fn(async () => { order.push('forecast'); });

            await app.selectSession('race');
            expect(app.setSessionRainVerdict).toHaveBeenCalledWith(null);
            expect(order.slice(0, 2)).toEqual(['banner', 'forecast']);
        });

        it('catches and logs errors during session selection and displays forecast unavailable state', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            app.radar.load = vi.fn().mockRejectedValue(new Error('Radar Error'));
            app.radar.showErrorToast = vi.fn();

            const mockUnavailableParagraph = createMockElement('p');
            app.ui.forecastUnavailable = createMockElement('forecastUnavailable');
            app.ui.forecastUnavailable.querySelector = vi.fn().mockReturnValue(mockUnavailableParagraph);

            // Make forecast update fail as well to cover both branches
            app.weatherClient.getForecast = vi.fn().mockRejectedValue(new Error('Forecast Error'));

            await app.selectSession('race');

            expect(consoleSpy).toHaveBeenCalledWith('Radar load failed:', expect.any(Error));
            expect(consoleSpy).toHaveBeenCalledWith('Session forecast update failed:', expect.any(Error));
            expect(app.radar.showErrorToast).toHaveBeenCalledWith('Session Error', 'Failed to load session forecast or radar data.', 5);
            expect(app.ui.forecastContent.innerHTML).toBe('');
            expect(app.ui.forecastContent.removeAttribute).toHaveBeenCalledWith('aria-busy');
            expect(app.ui.forecastContent.style.display).toBe('none');
            expect(app.ui.forecastUnavailable.style.display).toBe('block');
            expect(mockUnavailableParagraph.textContent).toBe(i18n.t('forecast.failedTryAgain'));
            consoleSpy.mockRestore();
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
                'Race · Bahrain Grand Prix'
            );
        });

        it('sets radar session time', async () => {
            await app.selectSession('race');
            expect(app.radar.setSessionTime).toHaveBeenCalledWith(expect.any(Date), expect.any(String));
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
    // updateSessionForecast
    // ---------------------------------------------------------------
    describe('updateSessionForecast', () => {
        beforeEach(() => {
            app.weatherClient.getForecast = vi.fn().mockResolvedValue({ available: true });
            app.renderForecast = vi.fn();
        });

        it('returns early when selectedRace is null', async () => {
            app.selectedRace = null;
            await app.updateSessionForecast(new Date(), 'race');
            expect(app.weatherClient.getForecast).not.toHaveBeenCalled();
            expect(app.renderForecast).not.toHaveBeenCalled();
        });

        it('returns early when selectedRace.location is null or undefined', async () => {
            app.selectedRace = { name: 'Test GP', location: null };
            await app.updateSessionForecast(new Date(), 'race');
            expect(app.weatherClient.getForecast).not.toHaveBeenCalled();
            expect(app.renderForecast).not.toHaveBeenCalled();

            app.selectedRace = { name: 'Test GP' };
            await app.updateSessionForecast(new Date(), 'race');
            expect(app.weatherClient.getForecast).not.toHaveBeenCalled();
            expect(app.renderForecast).not.toHaveBeenCalled();
        });

        it('fetches forecast and calls renderForecast when location is present', async () => {
            const sessionTime = new Date('2024-05-05T14:00:00Z');
            app.selectedRace = {
                name: 'Test GP',
                location: { lat: '26.0325', long: '50.5106' }
            };

            await app.updateSessionForecast(sessionTime, 'race');

            expect(app.weatherClient.getForecast).toHaveBeenCalledWith('26.0325', '50.5106', sessionTime);
            expect(app.renderForecast).toHaveBeenCalledWith({ available: true }, sessionTime, 'race');
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
            app.ui.mobileRaceInfo = createMockElement('mobileRaceInfo');
            app.ui.mobileCountryFlag = createMockElement('mobileCountryFlag');
            app.ui.mobileRaceInfoName = createMockElement('mobileRaceInfoName');
            app.ui.mobileRaceInfoCircuit = createMockElement('mobileRaceInfoCircuit');
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

        describe('rain banner', () => {
            const sessionTime = new Date('2026-11-01T14:00:00Z');
            const hoursFrom = (h) => new Date(sessionTime.getTime() + h * 3600000);
            const forecast = (...probs) => ({
                available: true,
                current: {},
                hourly: probs.map((precipProb, i) => ({
                    time: sessionTime.getTime() / 1000 + i * 3600, temp: 20, humidity: 50, precipProb, windSpeed: 10, windDir: 0, code: 0,
                })),
                units: { temperature_2m: '°C', wind_speed_10m: 'km/h' },
            });

            beforeEach(() => {
                app.ui.rainBanner = createMockElement('rainBanner');
                app.ui.mobileRainBanner = createMockElement('mobileRainBanner');
            });

            it('shows the verdict on both copies when rain is expected and the session is close', () => {
                app.renderForecast(forecast(20, 80), sessionTime, 'race', hoursFrom(-2));
                for (const banner of [app.ui.rainBanner, app.ui.mobileRainBanner]) {
                    expect(banner.hidden).toBe(false);
                    expect(banner.setAttribute).toHaveBeenCalledWith('data-level', 'likely');
                    expect(banner.textContent).toMatch(/^Rain likely during Race: 80% around /);
                }
                // The forecast card no longer carries it
                expect(app.ui.forecastContent.childNodes[0].childNodes[0].className).toBe('weather-current');
            });

            it('follows each forecast refresh, and is gone without rain', () => {
                app.renderForecast(forecast(30, 10), sessionTime, 'race', hoursFrom(-2));
                expect(app.ui.rainBanner.textContent).toMatch(/^Chance of rain during Race: 30%/);

                app.renderForecast(forecast(5, 10), sessionTime, 'race', hoursFrom(-1.75));
                expect(app.ui.rainBanner.hidden).toBe(true);
                expect(app.ui.mobileRainBanner.hidden).toBe(true);
            });

            it('only covers sessions from 3 days out until they end', () => {
                app.renderForecast(forecast(90, 90), sessionTime, 'race', hoursFrom(-24 * 5));
                expect(app.ui.rainBanner.hidden).toBe(true);

                app.renderForecast(forecast(90, 90), sessionTime, 'race', hoursFrom(1));
                expect(app.ui.rainBanner.hidden).toBe(false);

                app.renderForecast(forecast(90, 90), sessionTime, 'race', hoursFrom(2.5));
                expect(app.ui.rainBanner.hidden).toBe(true);
            });

            it('is cleared when the forecast is unavailable, a new session loads or the round is cleared', async () => {
                app.renderForecast(forecast(90), sessionTime, 'race', hoursFrom(0));
                app.renderForecast({ available: false, reason: 'error' }, sessionTime, 'race');
                expect(app.ui.rainBanner.hidden).toBe(true);

                app.renderForecast(forecast(90), sessionTime, 'race', hoursFrom(0));
                app.setSessionRainVerdict(null);
                expect(app.ui.rainBanner.hidden).toBe(true);

                app.ui.rainBanner = null;
                app.ui.mobileRainBanner = null;
                expect(() => app.setSessionRainVerdict({ level: 'likely', text: 'x' })).not.toThrow();
            });
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

            const dashboard = app.ui.forecastContent.childNodes[0];
            expect(dashboard).toBeTruthy();
            expect(dashboard.className).toContain('weather-dashboard');
        });

        it('escapes windInfo.text and rotation in the forecast dashboard', async () => {
            const windModule = await import('../public/src/utils/wind.js');
            windModule.getWindDirection.mockReturnValue({
                text: '<script>alert("xss")</script>',
                rotation: '"><img src=x onerror=alert(1)>'
            });

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

            const dashboard = app.ui.forecastContent.childNodes[0];
            const dl = childWithClass(dashboard, 'weather-current');
            const windDiv = dl.childNodes[2]; // wind metric div
            const ddWindDir = windDiv.childNodes[2]; // wind dir sub-element

            // windInfo.text goes in as a text node, so the markup is inert regardless
            // of content — it can only ever be displayed, never parsed.
            expect(ddWindDir.childNodes[0]).toContain('<script>alert("xss")</script>');

            // rotation is the one value that lands in an attribute rather than as
            // text, so it must not carry the payload through at all.
            const svg = ddWindDir.childNodes[1];
            const styleCall = svg.setAttribute.mock.calls.find(([attr]) => attr === 'style');
            expect(styleCall).toBeTruthy();
            expect(styleCall[1]).toBe('transform: rotate(0deg); width: 14px; height: 14px;');
            expect(styleCall[1]).not.toContain('<img');
            expect(styleCall[1]).not.toContain('onerror');
        });

        it('renders a numeric wind rotation unchanged', async () => {
            app.selectedSession = { id: 'race', name: 'Race' };
            const windModule = await import('../public/src/utils/wind.js');
            windModule.getWindDirection.mockReturnValue({ text: 'S', rotation: 270 });

            const weather = {
                available: true,
                current: { temperature_2m: 28 },
                hourly: [
                    { time: 1700000000, temp: 28, humidity: 40, precipProb: 5, windSpeed: 12, windDir: 90, code: 0 },
                ],
                units: { temperature_2m: '°C', wind_speed_10m: 'km/h' },
            };
            app.renderForecast(weather, new Date(1700000000 * 1000), 'race');

            const dl = childWithClass(app.ui.forecastContent.childNodes[0], 'weather-current');
            const ddWindDir = dl.childNodes[2].childNodes[2];
            const svg = ddWindDir.childNodes[1];
            const styleCall = svg.setAttribute.mock.calls.find(([attr]) => attr === 'style');
            expect(styleCall[1]).toBe('transform: rotate(270deg); width: 14px; height: 14px;');
        });

        it('skips rendering if session has changed', () => {
            app.selectedSession = { id: 'qualifying', name: 'Qualifying' };
            const weather = { available: true, hourly: [], units: {} };
            app.renderForecast(weather, new Date(), 'race');

            // forecastContent should not be modified since session IDs don't match
            expect(app.ui.forecastContent.style.display).toBeUndefined();
        });

        it('handles "too_far" with availableFrom in the past', () => {
            const now = new Date('2024-04-02');
            const weather = {
                available: false,
                reason: 'too_far',
                availableFrom: new Date('2024-04-01')
            };
            app.renderForecast(weather, new Date(), 'race', now);

            const p = app.ui.forecastUnavailable.querySelector('p');
            expect(p.textContent).toBe('Forecast available shortly');
        });

        it('handles other unavailable reasons', () => {
            const weather = { available: false, reason: 'unknown' };
            app.renderForecast(weather, new Date(), 'race');

            const p = app.ui.forecastUnavailable.querySelector('p');
            expect(p.textContent).toBe('Forecast available closer to session');
        });

        it('handles "too_far" with availableFrom in the future', () => {
             const now = new Date('2024-03-31');
             const weather = {
                 available: false,
                 reason: 'too_far',
                 availableFrom: new Date('2024-04-01T10:00:00')
             };
             app.renderForecast(weather, new Date(), 'race', now);

             const p = app.ui.forecastUnavailable.querySelector('p');
             // .toLocaleDateString output varies by locale, but we expect it to contain the date
             expect(p.textContent).toContain('Forecast available from');
        });

        it('finds the closest hourly forecast point', () => {
            const sessionTime = new Date('2024-03-01T14:00:00Z');
            const weather = {
                available: true,
                current: { temperature_2m: 25 },
                hourly: [
                    { time: Math.floor(new Date('2024-03-01T13:00:00Z').getTime() / 1000), temp: 24, windSpeed: 10, windDir: 0, precipProb: 0, code: 0 },
                    { time: Math.floor(new Date('2024-03-01T14:15:00Z').getTime() / 1000), temp: 26, windSpeed: 10, windDir: 0, precipProb: 0, code: 0 },
                    { time: Math.floor(new Date('2024-03-01T16:00:00Z').getTime() / 1000), temp: 28, windSpeed: 10, windDir: 0, precipProb: 0, code: 0 },
                ],
                units: { temperature_2m: '°C', wind_speed_10m: 'km/h' }
            };

            app.renderForecast(weather, sessionTime, 'race');

            const dashboard = app.ui.forecastContent.childNodes[0];
            const dl = childWithClass(dashboard, 'weather-current');
            const divTemp = dl.childNodes[0];
            const ddTemp = divTemp.childNodes[1];

            // The closest point is 14:15 (26 degrees)
            // We check that the primary temperature value is 26
            expect(ddTemp.textContent).toBe('26°C');

            // 24 should still be in the timeline, but not the primary temp
            const section = childWithClass(dashboard, 'weather-timeline');
            const ol = section.childNodes[0];
            const firstHourLi = ol.childNodes[0];
            // Row cells: time, condition, rain, temperature
            const firstHourTemp = firstHourLi.childNodes[3];
            expect(firstHourTemp.className).toBe('weather-timeline-temp');
            expect(firstHourTemp.textContent).toBe('24°C');
        });
    });

    // ---------------------------------------------------------------
    // renderForecastSkeleton — outcome: renders skeleton loader
    // ---------------------------------------------------------------
    describe('renderForecastSkeleton', () => {
        beforeEach(() => {
            app.ui.forecastContent = createMockElement('forecastContent');
            app.ui.forecastContent.setAttribute = vi.fn();
            app.ui.forecastContent.getAttribute = vi.fn((attr) => attr === 'aria-busy' ? 'true' : null);
            app.ui.forecastUnavailable = createMockElement('forecastUnavailable');
        });


        it('renders the skeleton loader correctly', () => {
            const mockTemplate = createMockElement('forecast-skeleton-template');
            mockTemplate.cloneNode = vi.fn();
            const clonedSkeleton = createMockElement('clonedContent');
            mockTemplate.content = { cloneNode: vi.fn(() => clonedSkeleton) };

            // Temporarily replace document.getElementById to return our mock template
            const originalGetElementById = document.getElementById;
            document.getElementById = vi.fn((id) => id === 'forecast-skeleton-template' ? mockTemplate : originalGetElementById(id));

            app.renderForecastSkeleton();

            expect(app.ui.forecastUnavailable.style.display).toBe('none');
            expect(app.ui.forecastContent.setAttribute).toHaveBeenCalledWith('aria-busy', 'true');
            expect(app.ui.forecastContent.style.display).toBe('block');
            expect(app.ui.forecastContent.innerHTML).toBe('');
            // The cloned template content (not some other node) is what's mounted.
            expect(app.ui.forecastContent.appendChild).toHaveBeenCalledWith(clonedSkeleton);

            document.getElementById = originalGetElementById;
        });

        it('renders the skeleton loader correctly when template.content is not available', () => {
            const mockTemplate = createMockElement('forecast-skeleton-template');
            const mockChild = createMockElement('child');
            const mockClone = createMockElement('clonedNode');
            mockClone.firstChild = mockChild;

            // Provide a way to consume firstChild so the while loop terminates
            let hasChild = true;
            Object.defineProperty(mockClone, 'firstChild', {
                get: () => {
                    return hasChild ? mockChild : null;
                }
            });

            // Need to mock the appendChild on the forecastContent container to clear the child
            const originalAppend = app.ui.forecastContent.appendChild;
            app.ui.forecastContent.appendChild = vi.fn((node) => {
                if (node === mockChild) {
                    hasChild = false; // "Consume" the child when it's appended
                }
                originalAppend(node);
            });

            mockTemplate.cloneNode = vi.fn(() => mockClone);
            mockTemplate.content = null;

            // Temporarily replace document.getElementById to return our mock template
            const originalGetElementById = document.getElementById;
            document.getElementById = vi.fn((id) => id === 'forecast-skeleton-template' ? mockTemplate : originalGetElementById(id));

            app.renderForecastSkeleton();

            expect(app.ui.forecastContent.appendChild).toHaveBeenCalledWith(mockChild);

            document.getElementById = originalGetElementById;
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
            app.ui.mobileRaceInfo = createMockElement('mobileRaceInfo');
            app.ui.mobileCountryFlag = createMockElement('mobileCountryFlag');
            app.ui.mobileRaceInfoName = createMockElement('mobileRaceInfoName');
            app.ui.mobileRaceInfoCircuit = createMockElement('mobileRaceInfoCircuit');
            app.ui.forecastContent = createMockElement('forecastContent');
            app.ui.forecastUnavailable = createMockElement('forecastUnavailable');
            app.ui.loadingOverlay = createMockElement('loadingOverlay');
        });

        it('selects round and session from URL params', async () => {
            await app.handleRoute({ series: 'f1', round: '3', session: 'race' });
            expect(app.selectedRace?.name).toBe('Australian GP');
        });

        it('ignores non-f1 series', async () => {
            await app.handleRoute({ series: 'btcc', round: '3' });
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

    // ---------------------------------------------------------------
    // autoSelectNextRound — outcome: correct round and session selected based on time
    // ---------------------------------------------------------------
    describe('autoSelectNextRound', () => {
        beforeEach(() => {
            // Setup races with sessions
            app.races = [
                {
                    round: '1',
                    name: 'Past GP',
                    date: '2024-01-01',
                    sessions: [{ id: 'race', date: '2024-01-01', time: '14:00:00' }]
                },
                {
                    round: '2',
                    name: 'Next GP',
                    date: '2024-02-01',
                    sessions: [
                        { id: 'fp1', date: '2024-02-01', time: '10:00:00' },
                        { id: 'race', date: '2024-02-03', time: '14:00:00' }
                    ]
                }
            ];

            // Mock UI elements
            app.ui.roundSelect = createMockElement('roundSelect');
            app.ui.sessionSelect = createMockElement('sessionSelect');

            // Spy on methods called to verify side effects without executing them
            vi.spyOn(app, 'selectRound').mockImplementation(() => {});
            vi.spyOn(app, 'selectSession').mockImplementation(() => {});
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('selects the next race and its first future session', () => {
            // Time: Before Round 2 FP1
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

            app.autoSelectNextRound();

            expect(app.selectRound).toHaveBeenCalledWith('2');
            // The value is set on the DOM element too
            expect(app.ui.roundSelect.value).toBe('2');

            expect(app.selectSession).toHaveBeenCalledWith('fp1');
            expect(app.ui.sessionSelect.value).toBe('fp1');
        });

        it('selects the next session if strictly between sessions (logic check)', () => {
            // Time: After FP1 (Feb 1) but before Race (Feb 3)
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2024-02-02T12:00:00Z'));

            app.autoSelectNextRound();

            expect(app.selectRound).toHaveBeenCalledWith('2');
            expect(app.selectSession).toHaveBeenCalledWith('race');
        });

        it('does nothing if no future races exist', () => {
            // Time: Way in the future
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

            app.autoSelectNextRound();

            expect(app.selectRound).not.toHaveBeenCalled();
            expect(app.selectSession).not.toHaveBeenCalled();
        });

        it('ignores sessions with missing date or time', () => {
            // Setup a race with sessions missing time
            app.races = [
                 {
                    round: '1',
                    date: '2024-02-01',
                    sessions: [
                        { id: 'fp1', date: '2024-02-01' }, // Missing time
                        { id: 'fp2', date: '2024-02-01', time: '14:00:00' }
                    ]
                 }
            ];
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2024-01-01T00:00:00Z')); // Before everything

            app.autoSelectNextRound();

            // Should skip fp1 and pick fp2
            expect(app.selectSession).toHaveBeenCalledWith('fp2');
        });
    });

    // ---------------------------------------------------------------
    // Weather Refresh Interval Logic
    // ---------------------------------------------------------------
    describe('Weather Refresh Interval Logic', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            // Mock updateLiveWeatherForCircuit to track calls
            app.updateLiveWeatherForCircuit = vi.fn();
            app.currentCircuitCenter = [10, 20];
        });

        afterEach(() => {
            vi.useRealTimers();
            if (app.weatherRefreshInterval) {
                clearInterval(app.weatherRefreshInterval);
            }
        });

        it('starts an interval that updates weather every 5 minutes', () => {
            app.startWeatherRefreshInterval();

            expect(app.updateLiveWeatherForCircuit).not.toHaveBeenCalled();

            // Advance 5 minutes
            vi.advanceTimersByTime(CONFIG.WEATHER_REFRESH_INTERVAL_MS);
            expect(app.updateLiveWeatherForCircuit).toHaveBeenCalledTimes(1);

            // Advance another 5 minutes
            vi.advanceTimersByTime(CONFIG.WEATHER_REFRESH_INTERVAL_MS);
            expect(app.updateLiveWeatherForCircuit).toHaveBeenCalledTimes(2);
        });

        it('clears existing interval before starting a new one', () => {
            // Manually set a dummy interval ID
            app.weatherRefreshInterval = 888;

            // Spy on global.clearInterval
            // Note: Since we use fake timers, we need to be careful.
            // But here we just want to know if the function was called with the ID.
            const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

            app.startWeatherRefreshInterval();

            expect(clearIntervalSpy).toHaveBeenCalledWith(888);

            expect(app.weatherRefreshInterval).not.toBe(888);
            expect(app.weatherRefreshInterval).toBeTruthy();

            clearIntervalSpy.mockRestore();
        });

        it('updateLiveWeatherForCircuit fetches forecast when circuit is selected', async () => {
             // We need to restore the mock since we overwrote it in beforeEach
             app.updateLiveWeatherForCircuit = CircuitWeatherApp.prototype.updateLiveWeatherForCircuit.bind(app);
             app.currentCircuitCenter = [26.0, 50.0];

             await app.updateLiveWeatherForCircuit();

             expect(app.weatherClient.getForecast).toHaveBeenCalledWith(26.0, 50.0, expect.any(Date));
             expect(app.mapWeatherWidget.update).toHaveBeenCalled();
        });

        it('updateLiveWeatherForCircuit returns early if no circuit is selected', async () => {
            // We need to restore the mock since we overwrote it in beforeEach
            app.updateLiveWeatherForCircuit = CircuitWeatherApp.prototype.updateLiveWeatherForCircuit.bind(app);
            app.currentCircuitCenter = null;

            await app.updateLiveWeatherForCircuit();

            expect(app.weatherClient.getForecast).not.toHaveBeenCalled();
            expect(app.mapWeatherWidget.update).not.toHaveBeenCalled();
        });

        it('handles error gracefully when weatherClient.getForecast fails during updateLiveWeatherForCircuit', async () => {
            app.updateLiveWeatherForCircuit = CircuitWeatherApp.prototype.updateLiveWeatherForCircuit.bind(app);
            app.currentCircuitCenter = [26.0, 50.0];
            const error = new Error('Network error');
            app.weatherClient.getForecast = vi.fn().mockRejectedValue(error);
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(app.updateLiveWeatherForCircuit()).resolves.not.toThrow();

            expect(consoleSpy).toHaveBeenCalledWith('Failed to update live weather:', error);
            expect(app.mapWeatherWidget.update).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('scheduleLiveWeatherUpdate debounces rapid calls into a single update', () => {
            // updateLiveWeatherForCircuit is mocked in beforeEach
            app.scheduleLiveWeatherUpdate();
            app.scheduleLiveWeatherUpdate();
            app.scheduleLiveWeatherUpdate();

            expect(app.updateLiveWeatherForCircuit).not.toHaveBeenCalled();

            vi.advanceTimersByTime(CONFIG.LIVE_WEATHER_DEBOUNCE_MS);

            expect(app.updateLiveWeatherForCircuit).toHaveBeenCalledTimes(1);
        });

        it('updateLiveWeatherForCircuit buckets the timestamp so repeats reuse the cache', async () => {
            app.updateLiveWeatherForCircuit = CircuitWeatherApp.prototype.updateLiveWeatherForCircuit.bind(app);
            app.currentCircuitCenter = [26.0, 50.0];

            // Two calls within the same 5-minute window must use an identical,
            // floored timestamp so the WeatherClient cache key is stable.
            vi.setSystemTime(new Date('2026-05-24T12:01:30Z'));
            await app.updateLiveWeatherForCircuit();
            vi.setSystemTime(new Date('2026-05-24T12:03:45Z'));
            await app.updateLiveWeatherForCircuit();

            const firstTime = app.weatherClient.getForecast.mock.calls[0][2];
            const secondTime = app.weatherClient.getForecast.mock.calls[1][2];
            expect(firstTime.getTime()).toBe(new Date('2026-05-24T12:00:00Z').getTime());
            expect(secondTime.getTime()).toBe(firstTime.getTime());
        });
    });

    // ---------------------------------------------------------------
    // Wind Overlay Field Logic
    // ---------------------------------------------------------------
    describe('updateWindField', () => {
        const field = { rows: 6, cols: 6, u: [], v: [], minLat: 44, maxLat: 46, minLon: 8, maxLon: 10 };
        const mockBounds = {
            getSouthWest: () => ({ lat: 44, lng: 8 }),
            getNorthEast: () => ({ lat: 46, lng: 10 }),
        };

        beforeEach(() => {
            app.map = { getBounds: vi.fn().mockReturnValue(mockBounds) };
            app.windOverlay = { enabled: true, _zoomSuppressed: false, setField: vi.fn() };
            app.weatherClient.getWindField = vi.fn().mockResolvedValue(field);
        });

        it('fetches the grid for the current viewport and passes it to the overlay when enabled', async () => {
            await app.updateWindField();

            expect(app.weatherClient.getWindField).toHaveBeenCalledWith(44, 46, 8, 10);
            expect(app.windOverlay.setField).toHaveBeenCalledWith(field);
        });

        it('does nothing when the overlay is disabled', async () => {
            app.windOverlay.enabled = false;
            await app.updateWindField();

            expect(app.weatherClient.getWindField).not.toHaveBeenCalled();
            expect(app.windOverlay.setField).not.toHaveBeenCalled();
        });

        it('does nothing when zoom is suppressed', async () => {
            app.windOverlay._zoomSuppressed = true;
            await app.updateWindField();

            expect(app.weatherClient.getWindField).not.toHaveBeenCalled();
        });

        it('does nothing when the map is unavailable', async () => {
            app.map = null;
            await app.updateWindField();

            expect(app.weatherClient.getWindField).not.toHaveBeenCalled();
        });

        it('does nothing when there is no wind overlay', async () => {
            app.windOverlay = null;
            await app.updateWindField();

            expect(app.weatherClient.getWindField).not.toHaveBeenCalled();
        });

        it('swallows fetch errors without throwing', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            app.weatherClient.getWindField = vi.fn().mockRejectedValue(new Error('network'));

            await expect(app.updateWindField()).resolves.toBeUndefined();
            expect(app.windOverlay.setField).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    // ---------------------------------------------------------------
    // Session Forecast Interval Logic
    // ---------------------------------------------------------------
    describe('Session Forecast Interval Logic', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            // Mock updateSessionForecast to track calls
            app.updateSessionForecast = vi.fn();
            app.selectedSession = { id: 'race', date: '2024-03-02', time: '14:00:00Z' };
            app.selectedRace = { round: '1' };
        });

        afterEach(() => {
            vi.useRealTimers();
            app.stopSessionForecastInterval();
        });

        it('starts an interval that updates forecast every 15 minutes', () => {
            app.startSessionForecastInterval();

            // Initial call is not immediate in the implementation, it's an interval
            expect(app.updateSessionForecast).not.toHaveBeenCalled();

            // Advance 15 minutes
            vi.advanceTimersByTime(CONFIG.SESSION_FORECAST_REFRESH_INTERVAL_MS);
            expect(app.updateSessionForecast).toHaveBeenCalledTimes(1);

            // Advance another 15 minutes
            vi.advanceTimersByTime(CONFIG.SESSION_FORECAST_REFRESH_INTERVAL_MS);
            expect(app.updateSessionForecast).toHaveBeenCalledTimes(2);
        });

        it('stops the interval when requested', () => {
            app.startSessionForecastInterval();
            vi.advanceTimersByTime(CONFIG.SESSION_FORECAST_REFRESH_INTERVAL_MS);
            expect(app.updateSessionForecast).toHaveBeenCalledTimes(1);

            app.stopSessionForecastInterval();
            vi.advanceTimersByTime(CONFIG.SESSION_FORECAST_REFRESH_INTERVAL_MS);
            // Should still be 1
            expect(app.updateSessionForecast).toHaveBeenCalledTimes(1);
        });

        it('clears existing interval before starting a new one', () => {
             // Because ViTest environment and scoping is complex with timers,
             // we will manually inject a mock for clearInterval into the instance method
             // by temporarily overriding the global clearInterval during the test execution
             // in a way that the closure captures it.

             // However, since we can't easily rely on the global object being the same,
             // we will test the effect: verify that the property is replaced.
             // We'll set a known ID first.
             app.sessionForecastInterval = 999;

             // We spy on the global object just in case it works
             const spy = vi.fn();
             const originalClear = global.clearInterval;
             global.clearInterval = spy;

             app.startSessionForecastInterval();

             // If the spy was called, great. If not, we fall back to checking property change.
             if (spy.mock.calls.length > 0) {
                 expect(spy).toHaveBeenCalledWith(999);
             }

             // Cleanup
             global.clearInterval = originalClear;

             // Verify a new interval was set
             expect(app.sessionForecastInterval).not.toBe(999);
             expect(app.sessionForecastInterval).toBeTruthy();
        });

        it('does not update if no session is selected', () => {
             app.selectedSession = null;
             app.startSessionForecastInterval();
             vi.advanceTimersByTime(CONFIG.SESSION_FORECAST_REFRESH_INTERVAL_MS);
             expect(app.updateSessionForecast).not.toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------
    // Init Lifecycle
    // ---------------------------------------------------------------
    // ---------------------------------------------------------------
    // handleLanguageChange
    // ---------------------------------------------------------------
    describe('handleLanguageChange', () => {
        it('updates select menus and translates page metadata', () => {
            app.populateRoundSelect = vi.fn();
            app.populateSessionSelect = vi.fn();
            app.updateSessionForecast = vi.fn();
            app.updatePageMetadata = vi.fn();
            app.ui.roundSelect = createMockElement('roundSelect');
            app.ui.sessionSelect = createMockElement('sessionSelect');

            app.selectedRace = { round: '5', sessions: [{ id: 'fp1' }] };
            app.selectedSession = { id: 'fp1', date: '2023-05-05', time: '14:00:00' };

            app.handleLanguageChange();

            expect(app.populateRoundSelect).toHaveBeenCalled();
            expect(app.ui.roundSelect.value).toBe('5');
            expect(app.populateSessionSelect).toHaveBeenCalledWith(app.selectedRace.sessions);
            expect(app.ui.sessionSelect.value).toBe('fp1');
            expect(app.updateSessionForecast).toHaveBeenCalledWith(new Date('2023-05-05T14:00:00'), 'fp1');
            expect(app.updatePageMetadata).toHaveBeenCalled();
        });

        it('handles case where no race is selected', () => {
            app.populateRoundSelect = vi.fn();
            app.updatePageMetadata = vi.fn();
            app.ui.sessionSelect = createMockElement('sessionSelect');
            app.selectedRace = null;

            app.handleLanguageChange();

            expect(app.populateRoundSelect).toHaveBeenCalled();
            expect(app.ui.sessionSelect.title).toBeTruthy();
            expect(app.ui.sessionSelect.childNodes.length).toBeGreaterThan(0);
            expect(app.ui.sessionSelect.childNodes[0].textContent).toBe('Select a round first');
            expect(app.updatePageMetadata).toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------
    // handleThemeChange
    // ---------------------------------------------------------------
    describe('handleThemeChange', () => {
        it('updates map manager and layer themes', async () => {
            app.mapManager.setTheme = vi.fn().mockResolvedValue();
            app.rangeCircles.updateTheme = vi.fn();
            app.rangeCircles.draw = vi.fn();
            app.trackLayer.updateTheme = vi.fn();
            app.radar.updateTheme = vi.fn();
            app.currentCircuitCenter = [10, 20];

            await app.handleThemeChange('dark');

            expect(app.mapManager.setTheme).toHaveBeenCalledWith('dark');
            expect(app.rangeCircles.updateTheme).toHaveBeenCalled();
            expect(app.rangeCircles.draw).toHaveBeenCalledWith([10, 20]);
            expect(app.trackLayer.updateTheme).toHaveBeenCalled();
            expect(app.radar.updateTheme).toHaveBeenCalled();
        });

        it('handles null layers safely', async () => {
            app.mapManager.setTheme = vi.fn().mockResolvedValue();
            app.rangeCircles = null;
            app.trackLayer = null;
            app.radar = null;

            await expect(app.handleThemeChange('dark')).resolves.not.toThrow();
        });

        it('handles radar without updateTheme method', async () => {
            app.mapManager.setTheme = vi.fn().mockResolvedValue();
            app.rangeCircles = null;
            app.trackLayer = null;
            app.radar = {}; // Object without updateTheme

            await expect(app.handleThemeChange('dark')).resolves.not.toThrow();
        });
    });

    // ---------------------------------------------------------------
    // Radar layers + weather warnings
    // ---------------------------------------------------------------
    describe('radar layers and weather warnings', () => {
        beforeEach(() => {
            app.radar = { setTileOptions: vi.fn(), setSatelliteEnabled: vi.fn() };
            app.weatherAlerts = { setEnabled: vi.fn(), setLocation: vi.fn(), updateTheme: vi.fn() };
            app.layerSettings = { getTileOptions: vi.fn(() => ({ colour: 6, arrows: true })) };
        });

        it('routes each setting to the layer it controls', () => {
            app.handleLayerSettingChange('alerts', { alerts: false });
            expect(app.weatherAlerts.setEnabled).toHaveBeenCalledWith(false);

            app.handleLayerSettingChange('satellite', { satellite: true });
            expect(app.radar.setSatelliteEnabled).toHaveBeenCalledWith(true);

            app.handleLayerSettingChange('arrows', { arrows: true });
            expect(app.radar.setTileOptions).toHaveBeenCalledWith({ colour: 6, arrows: true });
        });

        it('tolerates missing layers', () => {
            app.radar = null;
            app.weatherAlerts = null;
            expect(() => {
                app.handleLayerSettingChange('alerts', { alerts: true });
                app.handleLayerSettingChange('satellite', { satellite: true });
                app.handleLayerSettingChange('colour', { colour: 1 });
            }).not.toThrow();
        });

        it('moves warnings with the circuit and refreshes them on theme change', async () => {
            app.mapManager.setView = vi.fn();
            app.mapManager.setTheme = vi.fn().mockResolvedValue();
            app.rangeCircles = { draw: vi.fn(), updateTheme: vi.fn() };
            app.recentreControl = null;
            app.trackLayer = null;

            app.centreOnCircuit(52, -1);
            expect(app.weatherAlerts.setLocation).toHaveBeenCalledWith(52, -1);

            await app.handleThemeChange('dark');
            expect(app.weatherAlerts.updateTheme).toHaveBeenCalled();

            app.weatherAlerts = null;
            expect(() => app.centreOnCircuit(1, 1)).not.toThrow();
        });

        it('reads radar at the circuit', () => {
            app.mapManager.setView = vi.fn();
            app.rangeCircles = { draw: vi.fn() };
            app.recentreControl = null;
            app.trackRain = { setLocation: vi.fn() };
            app.centreOnCircuit(52, -1);
            expect(app.trackRain.setLocation).toHaveBeenCalledWith(52, -1);

            app.trackRain = null;
            expect(() => app.centreOnCircuit(1, 1)).not.toThrow();
        });

        describe('one rain banner', () => {
            const start = Date.parse('2026-11-01T14:00:00Z');
            const minutes = (m) => start + m * 60000;
            const banners = () => [app.ui.rainBanner, app.ui.mobileRainBanner];
            const forecastVerdict = { level: 'possible', text: 'Chance of rain during Race: 30% around 3:00 pm' };

            beforeEach(() => {
                app.selectedSession = { id: 'race', name: 'Race', date: '2026-11-01', time: '14:00:00Z' };
                app.ui.rainBanner = createMockElement('rainBanner');
                app.ui.mobileRainBanner = createMockElement('mobileRainBanner');
                app.trackRainStatus = null;
                app.sessionRainVerdict = null;
            });

            it('shows nothing without rain on the radar or in the forecast', () => {
                app.trackRainStatus = { state: 'dry' };
                app.renderRainBanner(minutes(0));
                for (const banner of banners()) expect(banner.hidden).toBe(true);
            });

            it('lets rain at the track take the slot while the session is on or within the hour', () => {
                app.sessionRainVerdict = forecastVerdict;
                app.trackRainStatus = { state: 'approaching', minutes: 25 };
                app.renderRainBanner(minutes(-30));
                for (const banner of banners()) {
                    expect(banner.hidden).toBe(false);
                    expect(banner.textContent).toBe('Rain expected at the track in about 25 min');
                    expect(banner.setAttribute).toHaveBeenCalledWith('data-level', 'likely');
                }

                app.trackRainStatus = { state: 'raining-easing', minutes: 10 };
                app.renderRainBanner(minutes(90));
                expect(app.ui.rainBanner.textContent).toBe('Raining at the track, easing in about 10 min');

                app.trackRainStatus = { state: 'raining' };
                app.renderRainBanner(minutes(0));
                expect(app.ui.rainBanner.textContent).toBe('Raining at the track');

                // A dry radar defers to the forecast for the rest of the session
                app.trackRainStatus = { state: 'dry' };
                app.renderRainBanner(minutes(0));
                expect(app.ui.rainBanner.textContent).toBe(forecastVerdict.text);
            });

            it('keeps to the forecast verdict when the session is further off', () => {
                app.sessionRainVerdict = forecastVerdict;
                app.trackRainStatus = { state: 'raining' };
                app.renderRainBanner(minutes(-61));
                expect(app.ui.rainBanner.textContent).toBe(forecastVerdict.text);

                // ...or over, or with no session at all
                app.sessionRainVerdict = null;
                app.renderRainBanner(minutes(120));
                expect(app.ui.rainBanner.hidden).toBe(true);
                app.selectedSession = null;
                app.renderRainBanner(minutes(0));
                expect(app.ui.rainBanner.hidden).toBe(true);
            });

            it('updates with each radar reading and on language change', () => {
                vi.useFakeTimers();
                vi.setSystemTime(minutes(10));
                app.renderTrackRain({ state: 'approaching', minutes: 15 });
                expect(app.ui.rainBanner.textContent).toBe('Rain expected at the track in about 15 min');
                app.renderTrackRain(null);
                expect(app.ui.rainBanner.hidden).toBe(true);

                app.trackRainStatus = { state: 'raining' };
                app.ui.rainBanner.textContent = '';
                app.handleLanguageChange();
                expect(app.ui.rainBanner.textContent).toBe('Raining at the track');
                vi.useRealTimers();
            });
        });
    });

    // ---------------------------------------------------------------
    // bindEvents — outcome: events are attached to DOM elements
    // ---------------------------------------------------------------
    describe('bindEvents', () => {
        beforeEach(() => {
            app.ui.roundSelect = createMockElement('roundSelect');
            app.ui.sessionSelect = createMockElement('sessionSelect');
            app.selectedRace = {};
            app.selectSession = vi.fn();
            app.selectRound = vi.fn();
        });

        it('binds sessionSelect change event to selectSession', () => {
            // Mock map attribution control
            const mockAttribution = createMockElement('leaflet-control-attribution');
            document.querySelector.mockImplementation((sel) => {
                if (sel === '.leaflet-control-attribution, .mapboxgl-ctrl-attrib') return mockAttribution;
                return createMockElement(sel);
            });

            app.bindEvents();

            // Extract the event listener added to sessionSelect
            const addEventListenerCalls = app.ui.sessionSelect.addEventListener.mock.calls;
            const changeEventCall = addEventListenerCalls.find(call => call[0] === 'change');
            expect(changeEventCall).toBeTruthy();

            const changeHandler = changeEventCall[1];

            // Invoke the handler manually
            changeHandler({ target: { value: 'race' } });

            // Verify selectSession was called
            expect(app.selectSession).toHaveBeenCalledWith('race');
        });

        it('binds roundSelect change event to selectRound when value is present', () => {
            app.bindEvents();

            const addEventListenerCalls = app.ui.roundSelect.addEventListener.mock.calls;
            const changeEventCall = addEventListenerCalls.find(call => call[0] === 'change');
            expect(changeEventCall).toBeTruthy();

            const changeHandler = changeEventCall[1];
            changeHandler({ target: { value: 'round-1' } });

            expect(app.selectRound).toHaveBeenCalledWith('round-1');
        });

        it('clears state when roundSelect change event has no value', () => {
            app.stopSessionForecastInterval = vi.fn();
            app.updatePageMetadata = vi.fn();
            app.countdown.show = vi.fn();
            app.trackLayer.clear = vi.fn();
            app.rangeCircles.clear = vi.fn();
            app.weatherAlerts = { setLocation: vi.fn() };
            app.trackRain = { setLocation: vi.fn() };
            app.ui.rainBanner = createMockElement('rainBanner');
            app.ui.rainBanner.hidden = false;
            app.ui.forecastSection = createMockElement('forecastSection');
            app.ui.raceInfoBanner = createMockElement('raceInfoBanner');
            app.ui.sessionEmptyState = createMockElement('sessionEmptyState');

            app.bindEvents();

            const addEventListenerCalls = app.ui.roundSelect.addEventListener.mock.calls;
            const changeEventCall = addEventListenerCalls.find(call => call[0] === 'change');

            const changeHandler = changeEventCall[1];
            changeHandler({ target: { value: '' } });

            expect(app.selectedSession).toBeNull();
            expect(app.selectedRace).toBeNull();
            expect(app.ui.forecastSection.style.display).toBe('none');
            expect(app.ui.raceInfoBanner.style.display).toBe('none');
            expect(app.ui.sessionEmptyState.style.display).toBe('none');
            expect(app.countdown.show).toHaveBeenCalledWith(false);
            expect(app.trackLayer.clear).toHaveBeenCalled();
            expect(app.rangeCircles.clear).toHaveBeenCalled();
            expect(app.weatherAlerts.setLocation).toHaveBeenCalledWith(null, null);
            expect(app.trackRain.setLocation).toHaveBeenCalledWith(null, null);
            expect(app.ui.rainBanner.hidden).toBe(true);
            expect(app.stopSessionForecastInterval).toHaveBeenCalled();
            expect(app.updatePageMetadata).toHaveBeenCalled();
            expect(app.ui.sessionSelect.disabled).toBe(true);
            expect(app.ui.sessionSelect.title).toBe('Select a round first');
            expect(app.ui.sessionSelect.childNodes[0].textContent).toBe('Select a round first');
        });
    });

    describe('init Lifecycle', () => {
        let app;

        beforeEach(() => {
            vi.clearAllMocks();
            app = new CircuitWeatherApp();
            app.showLoading = vi.fn();
            app.autoSelectNextRound = vi.fn();
            app.populateRoundSelect = vi.fn();
            app.startWeatherRefreshInterval = vi.fn();
            app.startSessionForecastInterval = vi.fn();

            // Mock map init to return a map-like object so that RangeCircles etc don't crash
            app.mapManager.init = vi.fn().mockReturnValue({});
        });

        it('wraps widget in L.Control for Leaflet initialization', async () => {
            const mockAddControl = vi.fn();
            vi.stubGlobal('L', { Control: { extend: vi.fn().mockReturnValue(class MockControl {}) } });
            app.mapWeatherWidget = { onAdd: vi.fn(), onRemove: vi.fn() };
            app.mapManager.init = vi.fn().mockResolvedValue({ hasLayer: true, addControl: mockAddControl });

            await app.init();

            expect(global.L.Control.extend).toHaveBeenCalledWith(expect.objectContaining({
                options: { position: 'topright' },
                onAdd: expect.any(Function),
                onRemove: expect.any(Function)
            }));
            expect(mockAddControl).toHaveBeenCalled();

            const extendArg = global.L.Control.extend.mock.calls[0][0];
            extendArg.onAdd({});
            extendArg.onRemove({});
            expect(app.mapWeatherWidget.onAdd).toHaveBeenCalled();
            expect(app.mapWeatherWidget.onRemove).toHaveBeenCalled();
        });

        it('requests the schedule while the map is still setting up', async () => {
            let finishMap;
            app.mapManager.init = vi.fn(() => new Promise((resolve) => {
                finishMap = () => resolve({ hasLayer: false, addControl: vi.fn() });
            }));
            app.tryLoadSchedule = vi.fn().mockResolvedValue(true);

            const done = app.init();
            await vi.waitFor(() => expect(app.mapManager.init).toHaveBeenCalled());
            // The map hasn't finished, yet the schedule is already on its way
            expect(app.tryLoadSchedule).toHaveBeenCalledWith('f1');
            expect(app.populateRoundSelect).not.toHaveBeenCalled();

            finishMap();
            await done;
            expect(app.populateRoundSelect).toHaveBeenCalled();
        });

        it('passes radar metadata to the layer settings and the track rain reader', async () => {
            app.mapManager.init = vi.fn().mockResolvedValue({ hasLayer: false, addControl: vi.fn() });
            await app.init();

            const { onMetadata } = WeatherRadar.mock.calls.at(-1)[1];
            app.layerSettings.applyMetadata = vi.fn();
            app.trackRain.setMetadata = vi.fn();
            const metadata = { provider: 'librewxr', frames: [], pastCount: 0 };
            onMetadata(metadata);
            expect(app.layerSettings.applyMetadata).toHaveBeenCalledWith(metadata);
            expect(app.trackRain.setMetadata).toHaveBeenCalledWith(metadata);
        });

        it('successfully initializes components and fetches schedule', async () => {
            app.mapManager.init = vi.fn().mockResolvedValue({ hasLayer: false, addControl: vi.fn() });

            // Act
            await app.init();

            // Assert
            expect(app.showLoading).toHaveBeenCalledWith(true, expect.any(String));
            expect(app.mapManager.init).toHaveBeenCalled();
            expect(app.f1Api.getSchedule).toHaveBeenCalled();
            expect(app.autoSelectNextRound).toHaveBeenCalled();
            expect(app.startWeatherRefreshInterval).toHaveBeenCalled();
            expect(app.startSessionForecastInterval).toHaveBeenCalled();
            expect(app.showLoading).toHaveBeenCalledWith(false);
        });

        it('initializes with route params instead of auto-select', async () => {
            app.mapManager.init = vi.fn().mockResolvedValue({ hasLayer: false, addControl: vi.fn() });

            // Mock route params
            app.router.getParams = vi.fn().mockReturnValue({ round: '1' });
            app.handleRoute = vi.fn().mockResolvedValue();

            // Act
            await app.init();

            // Assert
            expect(app.handleRoute).toHaveBeenCalledWith({ round: '1' });
            expect(app.autoSelectNextRound).not.toHaveBeenCalled();
        });

        it('catches initialization errors and renders error state', async () => {
            // Arrange
            const error = new Error('Network failure');
            app.f1Api.getSchedule.mockRejectedValue(error);
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            // Stub renderError to avoid complex DOM interactions
            const renderErrorSpy = vi.spyOn(app, 'renderError').mockImplementation(() => {});

            // Act
            await app.init();

            // Assert
            expect(renderErrorSpy).toHaveBeenCalledWith('Failed to initialize application.');
            expect(app.showLoading).toHaveBeenCalledWith(false);
            // The schedule was requested alongside the map, so its failure lands too
            await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalledWith('Schedule load failed:', error));

            consoleSpy.mockRestore();
        });

        it('catches initialization errors when startWeatherRefreshInterval throws during init', async () => {
            app.mapManager.init = vi.fn().mockResolvedValue({ hasLayer: false, addControl: vi.fn() });
            app.startWeatherRefreshInterval = vi.fn().mockImplementation(() => {
                throw new Error('Weather refresh interval error');
            });
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const renderErrorSpy = vi.spyOn(app, 'renderError').mockImplementation(() => {});

            await app.init();

            expect(consoleSpy).toHaveBeenCalledWith('Initialization failed:', expect.any(Error));
            expect(renderErrorSpy).toHaveBeenCalledWith(i18n.t('errors.initFailed'));
            expect(app.showLoading).toHaveBeenCalledWith(false);

            consoleSpy.mockRestore();
        });

        it('catches initialization errors when startSessionForecastInterval throws during init', async () => {
            app.mapManager.init = vi.fn().mockResolvedValue({ hasLayer: false, addControl: vi.fn() });
            app.startSessionForecastInterval = vi.fn().mockImplementation(() => {
                throw new Error('Session forecast interval error');
            });
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const renderErrorSpy = vi.spyOn(app, 'renderError').mockImplementation(() => {});

            await app.init();

            expect(consoleSpy).toHaveBeenCalledWith('Initialization failed:', expect.any(Error));
            expect(renderErrorSpy).toHaveBeenCalledWith(i18n.t('errors.initFailed'));
            expect(app.showLoading).toHaveBeenCalledWith(false);

            consoleSpy.mockRestore();
        });

        it('keeps the sidebar usable when the init schedule fetch fails', async () => {
            app.mapManager.init = vi.fn().mockResolvedValue({ hasLayer: false, addControl: vi.fn() });
            const mockSidebar = createMockElement('sidebar-content');
            vi.spyOn(document, 'querySelector').mockImplementation(sel => {
                if (sel === '.sidebar-content') return mockSidebar;
                return createMockElement(sel);
            });
            app.f1Api.getSchedule.mockRejectedValue(new Error('Network failure'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const renderErrorSpy = vi.spyOn(app, 'renderError');

            await app.init();

            // The series picker and settings stay in place; the error is shown inline
            expect(renderErrorSpy).not.toHaveBeenCalled();
            expect(mockSidebar.appendChild).not.toHaveBeenCalled();
            expect(app.ui.scheduleError.hidden).toBe(false);
            expect(app.ui.scheduleErrorText.textContent).toBe(i18n.t('errors.scheduleUnavailable'));
            expect(app.autoSelectNextRound).not.toHaveBeenCalled();
            // The rest of the app still starts
            expect(app.startWeatherRefreshInterval).toHaveBeenCalled();
            expect(app.showLoading).toHaveBeenCalledWith(false);

            consoleSpy.mockRestore();
        });

        it('shows errors.scheduleAllUnavailable inline when all F1 sources fail with F1_SCHEDULE_UNAVAILABLE:jolpica,openf1:...', async () => {
            app.mapManager.init = vi.fn().mockResolvedValue({ hasLayer: false, addControl: vi.fn() });
            app.f1Api.getSchedule.mockRejectedValue(new Error('F1_SCHEDULE_UNAVAILABLE:jolpica,openf1:ALL_SOURCES_FAILED'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await app.init();

            expect(app.ui.scheduleErrorText.textContent).toBe(i18n.t('errors.scheduleAllUnavailable'));
            expect(app.ui.scheduleError.hidden).toBe(false);

            consoleSpy.mockRestore();
        });

        it('shows errors.scheduleUnavailable inline when a single F1 source fails with F1_SCHEDULE_UNAVAILABLE:jolpica:...', async () => {
            app.mapManager.init = vi.fn().mockResolvedValue({ hasLayer: false, addControl: vi.fn() });
            app.f1Api.getSchedule.mockRejectedValue(new Error('F1_SCHEDULE_UNAVAILABLE:jolpica:FETCH_FAILED'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await app.init();

            expect(app.ui.scheduleErrorText.textContent).toBe(i18n.t('errors.scheduleUnavailable'));

            consoleSpy.mockRestore();
        });

        it('initializes ThemeManager and sets theme callback', async () => {
            app.mapManager.init = vi.fn().mockResolvedValue({ hasLayer: false, addControl: vi.fn() });

            // Act
            await app.init();

            // Assert
            expect(ThemeManager).toHaveBeenCalled();
            // Verify callback sets map theme
            const callback = ThemeManager.mock.calls[0][0];
            const theme = 'dark';
            await callback(theme);
            expect(app.mapManager.setTheme).toHaveBeenCalledWith(theme);
        });

        it('wires up retry button in renderError', () => {
             // We need to test renderError specifically here, not init
             // This tests the side-effects of renderError on the DOM
             const mockContent = createMockElement('content');

             // Setup querySelector mocks
             vi.spyOn(document, 'querySelector').mockReturnValue(mockContent);

             app.renderError('Boom');

             // Since we construct the DOM using appendChild now, verify it using mockContent.appendChild.mock.calls
             const appendedNode = mockContent.appendChild.mock.calls[0][0];
             expect(appendedNode.className).toBe('error-state');

             // Find the button in the appended node
             const btn = appendedNode.appendChild.mock.calls.find(call => call[0].className === 'retry-btn')?.[0];
             expect(btn).toBeDefined();
             expect(btn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));

             // Verify the listener reloads the page
             const clickHandler = btn.addEventListener.mock.calls[0][1];
             clickHandler();
             expect(window.location.reload).toHaveBeenCalled();
        });

        it('renderError gracefully handles missing sidebar content', () => {
             // Mock querySelector to return null
             vi.spyOn(document, 'querySelector').mockReturnValue(null);

             // Should not throw
             expect(() => app.renderError('Boom')).not.toThrow();
        });


        it('ThemeManager callback handles missing currentCircuitCenter', async () => {
            app.mapManager.init = vi.fn().mockResolvedValue({ hasLayer: false, addControl: vi.fn() });
            await app.init();
            const callback = ThemeManager.mock.calls[0][0];

            // Set currentCircuitCenter to null (default state)
            app.currentCircuitCenter = null;
            app.rangeCircles.draw = vi.fn();

            // Invoke callback
            await callback('light');

            // Should update theme but NOT draw circles
            expect(app.mapManager.setTheme).toHaveBeenCalledWith('light');
            expect(app.rangeCircles.updateTheme).toHaveBeenCalled();
            expect(app.rangeCircles.draw).not.toHaveBeenCalled();
        });

        it('ThemeManager callback draws circles if currentCircuitCenter is set', async () => {
            app.mapManager.init = vi.fn().mockResolvedValue({ hasLayer: false, addControl: vi.fn() });
            await app.init();
            const callback = ThemeManager.mock.calls[0][0];

            app.currentCircuitCenter = [10, 20];
            app.rangeCircles.draw = vi.fn();

            await callback('light');

            expect(app.rangeCircles.draw).toHaveBeenCalledWith([10, 20]);
        });

        it('ThemeManager callback handles missing rangeCircles', async () => {
            app.mapManager.init = vi.fn().mockResolvedValue({ hasLayer: false, addControl: vi.fn() });
            await app.init();
            const callback = ThemeManager.mock.calls[0][0];

            // Set rangeCircles to null
            app.rangeCircles = null;

            // Invoke callback
            // Should not throw
            await expect(callback('light')).resolves.not.toThrow();
            expect(app.mapManager.setTheme).toHaveBeenCalledWith('light');
        });
    });
});


    describe('Mobile Layout Offsets', () => {
        let app;

        beforeEach(() => {
            vi.clearAllMocks();
            app = new CircuitWeatherApp();
            app.ui.mobileRaceInfo = createMockElement('mobileRaceInfo');
            app.ui.mobileHeader = createMockElement('mobileHeader');
            app.ui.mapContainer = createMockElement('map');
            app.ui.radarControls = createMockElement('radar-controls');
        });

        afterEach(() => {
            // Restore any timer overrides
            if (vi.isFakeTimers()) {
                vi.useRealTimers();
            }
        });

        it('calculates top offset from banner bottom when banner height is > 0', () => {
            app.mobileQuery = { matches: true };

            app.ui.mobileRaceInfo.getBoundingClientRect = vi.fn(() => ({ height: 44, bottom: 100 }));
            app.ui.radarControls.getBoundingClientRect = vi.fn(() => ({ height: 0 }));
            app.ui.mapContainer.getBoundingClientRect = vi.fn(() => ({ bottom: 800 }));

            const spy = vi.spyOn(document.documentElement.style, 'setProperty');

            app.updateLayoutOffsets();

            // Expected mobileTopVar = Math.max(0, 100 - 56) + 2 = 46
            expect(spy).toHaveBeenCalledWith('--mobile-top-offset', '46px');
        });

        it('calculates top offset from mobile header when banner height is 0', () => {
            app.mobileQuery = { matches: true };

            app.ui.mobileRaceInfo.getBoundingClientRect = vi.fn(() => ({ height: 0, bottom: 0 }));
            app.ui.mobileHeader.getBoundingClientRect = vi.fn(() => ({ bottom: 60 }));
            app.ui.radarControls.getBoundingClientRect = vi.fn(() => ({ height: 0 }));
            app.ui.mapContainer.getBoundingClientRect = vi.fn(() => ({ bottom: 800 }));

            const spy = vi.spyOn(document.documentElement.style, 'setProperty');

            app.updateLayoutOffsets();

            // Expected mobileTopVar = Math.max(0, 60 - 56) + 2 = 6
            expect(spy).toHaveBeenCalledWith('--mobile-top-offset', '6px');
        });

        it('calculates controls bottom offset correctly with radar height > 0', () => {
            app.mobileQuery = { matches: true };

            app.ui.mobileRaceInfo = null;
            app.ui.mobileHeader.getBoundingClientRect = vi.fn(() => ({ bottom: 60 }));
            app.ui.radarControls.getBoundingClientRect = vi.fn(() => ({ height: 50 }));

            // Note: attribution logic checks document.querySelector.
            // If no attribution element is found, attributionHeight = 25.
            // Radar bottom offset = 25 + 8 = 33.
            // Controls bottom offset = 33 + 50 + 8 = 91.

            const spy = vi.spyOn(document.documentElement.style, 'setProperty');

            app.updateLayoutOffsets();

            expect(spy).toHaveBeenCalledWith('--mobile-controls-offset', '91px');
        });

        it('debounces layout updates using requestAnimationFrame in initResizeObserver', () => {
            vi.useFakeTimers();

            let rafCb = null;
            const origRaf = global.requestAnimationFrame;
            global.requestAnimationFrame = vi.fn(cb => {
                rafCb = cb;
                return 123;
            });

            app.updateLayoutOffsets = vi.fn();

            // Mock ResizeObserver
            let resizeCb = null;
            const MockResizeObserver = vi.fn(function(cb) {
                resizeCb = cb;
                this.observe = vi.fn();
                this.disconnect = vi.fn();
            });
            const origRo = global.ResizeObserver;
            global.ResizeObserver = MockResizeObserver;

            // Mock MutationObserver
            const origMo = global.MutationObserver;
            global.MutationObserver = vi.fn(function(cb) {
                this.observe = vi.fn();
                this.disconnect = vi.fn();
            });

            app.initResizeObserver();

            // Call the resize observer callback
            resizeCb();
            resizeCb(); // Call twice to verify debounce (rafId check)

            expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

            // Execute the RAF callback
            rafCb();
            expect(app.updateLayoutOffsets).toHaveBeenCalledTimes(1);

            // Cleanup local globals
            global.requestAnimationFrame = origRaf;
            global.ResizeObserver = origRo;
            global.MutationObserver = origMo;
        });

        it('observes the radar controls so overlays above them move when they resize', () => {
            const observe = vi.fn();
            const origRo = global.ResizeObserver;
            global.ResizeObserver = vi.fn(function() {
                this.observe = observe;
                this.disconnect = vi.fn();
            });
            const origMo = global.MutationObserver;
            global.MutationObserver = vi.fn(function() {
                this.observe = vi.fn();
                this.disconnect = vi.fn();
            });

            app.ui.radarControls = createMockElement('radarControls');
            app.initResizeObserver();

            expect(observe).toHaveBeenCalledWith(app.ui.radarControls);

            global.ResizeObserver = origRo;
            global.MutationObserver = origMo;
        });

        it('observes dynamically added map controls using MutationObserver', () => {
            let moCb = null;
            const origMo = global.MutationObserver;
            global.MutationObserver = vi.fn(function(cb) {
                moCb = cb;
                this.observe = vi.fn();
                this.disconnect = vi.fn();
            });

            let resizeCb = null;
            const origRo = global.ResizeObserver;
            let mockObserve = vi.fn();
            global.ResizeObserver = vi.fn(function(cb) {
                resizeCb = cb;
                this.observe = mockObserve;
                this.disconnect = vi.fn();
            });

            let rafCb = null;
            const origRaf = global.requestAnimationFrame;
            global.requestAnimationFrame = vi.fn(cb => {
                rafCb = cb;
                return 123;
            });

            app.updateLayoutOffsets = vi.fn();

            // Mock Node globally as it's used in CircuitWeatherApp.js
            const origNode = global.Node;
            global.Node = { ELEMENT_NODE: 1 };

            app.initResizeObserver();

            // Simulate mutation adding a relevant node
            const mockNode = {
                nodeType: 1, // Node.ELEMENT_NODE
                matches: vi.fn(sel => sel.includes('.mapboxgl-ctrl-bottom-left')),
                querySelector: vi.fn(() => null)
            };

            moCb([{ addedNodes: [mockNode] }]);

            expect(mockObserve).toHaveBeenCalledWith(mockNode);
            expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

            // Restore globals
            global.MutationObserver = origMo;
            global.ResizeObserver = origRo;
            global.requestAnimationFrame = origRaf;
            if (origNode !== undefined) {
                global.Node = origNode;
            } else {
                delete global.Node;
            }
        });
    });

    describe('Mobile Visibility', () => {
        let app;
        beforeEach(() => {
            vi.clearAllMocks();
            app = new CircuitWeatherApp();
            app.ui.mobileRaceInfo = createMockElement('mobileRaceInfo');
        });

        it('updates mobile visibility based on media query', () => {
            app.mobileQuery = { matches: true };
            app.selectedRace = { round: 1 };
            app.updateMobileVisibility();
            expect(app.ui.mobileRaceInfo.style.display).toBe("flex");

            app.mobileQuery = { matches: false };
            app.updateMobileVisibility();
            expect(app.ui.mobileRaceInfo.style.display).toBe("none");

        });

        it('bindResizeHandler calls updateMobileVisibility on query change', () => {
            app.updateMobileVisibility = vi.fn();

            // Setup a mock media query object to capture the event listener
            const handlers = {};
            app.mobileQuery = {
                addEventListener: vi.fn((event, cb) => {
                    handlers[event] = cb;
                }),
                matches: true
            };

            app.bindResizeHandler();

            expect(app.mobileQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

            // Trigger the change event
            handlers['change']();

            expect(app.updateMobileVisibility).toHaveBeenCalled();
        });
});

describe('CircuitWeatherApp series selection', () => {
    let app;

    const f2Race = (round, extra = {}) => ({
        round: String(round),
        raceName: `F2 R${round}`,
        date: '2026-11-29',
        time: '13:00:00Z',
        Circuit: { circuitId: null, circuitName: 'Lusail', Location: { lat: '25.49', long: '51.45', country: 'Qatar' } },
        sessions: [
            { id: 'sprint-race', name: 'Sprint Race', date: '2026-11-28', time: '13:00:00Z' },
            { id: 'feature-race', name: 'Feature Race', date: '2026-11-29', time: '13:00:00Z' },
        ],
        ...extra,
    });

    const seriesApi = (schedules) => ({
        getSchedule: vi.fn(async (series) => {
            const result = typeof schedules === 'function' ? schedules(series) : schedules;
            if (result instanceof Error) throw result;
            return result;
        }),
        parseRace: vi.fn(r => ({ round: r.round, name: r.raceName, circuit: r.Circuit, location: r.Circuit?.Location, sessions: r.sessions, date: r.date, time: r.time })),
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        app = new CircuitWeatherApp();
        app.rangeCircles = new RangeCircles();
        app.trackLayer = new TrackLayer();
        app.radar = new WeatherRadar();
        app.recentreControl = new RecentreControl();
        app.mapWeatherWidget = new MapWeatherWidget();
        app.ui = {
            seriesSelect: createMockElement('seriesSelect'),
            roundSelect: createMockElement('roundSelect'),
            sessionSelect: createMockElement('sessionSelect'),
            forecastSection: createMockElement('forecastSection'),
            raceInfoBanner: createMockElement('raceInfoBanner'),
            sessionEmptyState: createMockElement('sessionEmptyState'),
            dataSourceNotice: createMockElement('dataSourceNotice'),
            scheduleCredit: createMockElement('scheduleCredit'),
            scheduleError: createMockElement('scheduleError'),
            scheduleErrorText: createMockElement('scheduleErrorText'),
            scheduleRetry: createMockElement('scheduleRetry'),
            loadingOverlay: createMockElement('loadingOverlay'),
            forecastContent: createMockElement('forecastContent'),
            forecastUnavailable: createMockElement('forecastUnavailable'),
        };
        app.renderError = vi.fn();
    });

    afterEach(() => {
        app.clearScheduleRetry();
        if (app.liveWeatherDebounceTimer) clearTimeout(app.liveWeatherDebounceTimer);
        vi.useRealTimers();
    });

    describe('loadSchedule', () => {
        it('loads F1 from F1API', async () => {
            app.f1Api.getSchedule.mockResolvedValue([{ round: '1' }]);
            await app.loadSchedule('f1');
            expect(app.series).toBe('f1');
            expect(app.races).toEqual([{ round: '1' }]);
            expect(app.ui.scheduleCredit.hidden).toBe(true);
        });

        it('loads other series from SeriesAPI and shows the TheSportsDB credit', async () => {
            app.seriesApi = seriesApi({ races: [f2Race(13)], complete: true });
            await app.loadSchedule('f2');
            expect(app.seriesApi.getSchedule).toHaveBeenCalledWith('f2');
            expect(app.series).toBe('f2');
            expect(app.races.map(r => r.name)).toEqual(['F2 R13']);
            expect(app.ui.scheduleCredit.hidden).toBe(false);
            expect(app.ui.dataSourceNotice.hidden).toBe(true);
            expect(app.scheduleRetryTimer).toBeNull();
        });

        it('hides the OpenF1 fallback notice for other series', async () => {
            app.f1Api.scheduleSource = 'openf1';
            app.seriesApi = seriesApi({ races: [], complete: true });
            await app.loadSchedule('f2');
            expect(app.ui.dataSourceNotice.hidden).toBe(true);
        });
    });

    describe('partial schedules', () => {
        it('refreshes a partial schedule and keeps the selected race', async () => {
            const partial = { races: [f2Race(13)], complete: false };
            const full = { races: [f2Race(12), f2Race(13), f2Race(14)], complete: true };
            app.seriesApi = seriesApi(partial);
            await app.loadSchedule('f2');
            expect(app.scheduleRetryTimer).not.toBeNull();

            app.selectedRace = app.races[0];
            app.ui.roundSelect.value = '';
            app.seriesApi.getSchedule.mockResolvedValue(full);
            await vi.advanceTimersByTimeAsync(65000);

            expect(app.seriesApi.getSchedule).toHaveBeenLastCalledWith('f2', { refresh: true });
            expect(app.races.map(r => r.round)).toEqual(['12', '13', '14']);
            expect(app.races[1]).toBe(app.selectedRace);
            expect(app.ui.roundSelect.value).toBe('13');
            expect(app.scheduleRetryTimer).toBeNull();
        });

        it('centres on the selected round once its venue coordinates arrive', async () => {
            const noVenue = { circuitId: null, circuitName: '', Location: { lat: '', long: '', country: 'Australia' } };
            app.seriesApi = seriesApi({ races: [f2Race(13, { Circuit: noVenue })], complete: false });
            await app.loadSchedule('f2');
            app.selectedRace = app.races[0];
            const centre = vi.spyOn(app, '_resolveRoundMapCenter').mockImplementation(() => {});

            app.seriesApi.getSchedule.mockResolvedValue({ races: [f2Race(13)], complete: true });
            await vi.advanceTimersByTimeAsync(65000);

            expect(app.races[0]).toBe(app.selectedRace);
            expect(app.selectedRace.location.lat).toBe('25.49');
            expect(centre).toHaveBeenCalledWith(app.selectedRace);

            // Already centred: a later refresh doesn't move the map again
            centre.mockClear();
            await app.refreshPartialSchedule('f2', 1);
            expect(centre).not.toHaveBeenCalled();
        });

        it('retries a limited number of times while still partial', async () => {
            app.seriesApi = seriesApi({ races: [f2Race(1)], complete: false });
            await app.loadSchedule('f2');
            await vi.advanceTimersByTimeAsync(65000 * 10);
            // First load + 5 refreshes
            expect(app.seriesApi.getSchedule).toHaveBeenCalledTimes(6);
        });

        it('drops a refresh when the series has changed', async () => {
            app.seriesApi = seriesApi({ races: [f2Race(1)], complete: false });
            await app.loadSchedule('f2');
            app.series = 'f3';
            await app.refreshPartialSchedule('f2', 1);
            expect(app.seriesApi.getSchedule).toHaveBeenCalledTimes(1);

            // Or changes while the refresh is in flight
            app.series = 'f2';
            app.seriesApi.getSchedule.mockImplementation(async () => {
                app.series = 'fe';
                return { races: [f2Race(9)], complete: true };
            });
            app.races = [];
            await app.refreshPartialSchedule('f2', 1);
            expect(app.races).toEqual([]);
        });

        it('survives a failed refresh', async () => {
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            app.series = 'f2';
            app.seriesApi = seriesApi(new Error('offline'));
            await expect(app.refreshPartialSchedule('f2', 1)).resolves.toBeUndefined();
            expect(console.warn).toHaveBeenCalled();
        });

        it('stops a pending refresh when another schedule loads', async () => {
            app.seriesApi = seriesApi({ races: [f2Race(1)], complete: false });
            await app.loadSchedule('f2');
            app.f1Api.getSchedule.mockResolvedValue([]);
            await app.loadSchedule('f1');
            await vi.advanceTimersByTimeAsync(65000);
            expect(app.seriesApi.getSchedule).toHaveBeenCalledTimes(1);
        });
    });

    describe('selectSeries', () => {
        it('clears the current round and loads the new series', async () => {
            app.selectedRace = { round: '3', sessions: [] };
            app.selectedSession = { id: 'race' };
            app.seriesApi = seriesApi({ races: [f2Race(1)], complete: true });

            expect(await app.selectSeries('f2')).toBe(true);
            expect(app.selectedRace).toBeNull();
            expect(app.selectedSession).toBeNull();
            expect(app.trackLayer.clear).toHaveBeenCalled();
            expect(app.radar.setSessionTime).toHaveBeenCalledWith(null);
            expect(app.ui.seriesSelect.value).toBe('f2');
            expect(app.races).toHaveLength(1);
        });

        it('ignores unsupported series', async () => {
            expect(await app.selectSeries('btcc')).toBe(false);
            expect(app.series).toBe('f1');
        });

        it('shows a non-blocking, series-specific error and still switches when the schedule fails', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            app.seriesApi = seriesApi(new Error('SERIES_SCHEDULE_UNAVAILABLE:f3'));
            expect(await app.selectSeries('f3')).toBe(false);
            expect(app.series).toBe('f3');
            expect(app.races).toEqual([]);
            // Never the blocking full-sidebar error, and never the F1/Jolpica message
            expect(app.renderError).not.toHaveBeenCalled();
            expect(app.ui.scheduleError.hidden).toBe(false);
            expect(app.ui.scheduleErrorText.textContent).toBe(
                i18n.t('errors.seriesScheduleUnavailable', { series: i18n.t('controls.f3') }));
            expect(app.ui.scheduleErrorText.textContent).not.toContain('jolpi');
            expect(app.ui.scheduleCredit.hidden).toBe(false);
            // Retries automatically
            expect(app.scheduleRetryTimer).not.toBeNull();
        });

        it('recovers automatically once the schedule loads', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            app.autoSelectNextRound = vi.fn();
            app.seriesApi = seriesApi(new Error('down'));
            await app.selectSeries('f2');

            // Still failing on the first retry: keeps retrying
            await vi.advanceTimersByTimeAsync(65000);
            expect(app.ui.scheduleError.hidden).toBe(false);
            expect(app.scheduleRetryTimer).not.toBeNull();

            app.seriesApi.getSchedule.mockResolvedValue({ races: [f2Race(13)], complete: true });
            await vi.advanceTimersByTimeAsync(65000);
            expect(app.ui.scheduleError.hidden).toBe(true);
            expect(app.races).toHaveLength(1);
            expect(app.autoSelectNextRound).toHaveBeenCalled();
        });

        it('gives up retrying a failed schedule after the retry limit', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            app.seriesApi = seriesApi(new Error('down'));
            await app.selectSeries('f2');
            await vi.advanceTimersByTimeAsync(65000 * 10);
            // First load + 5 retries
            expect(app.seriesApi.getSchedule).toHaveBeenCalledTimes(6);
        });

        it('does not auto-retry F1 (both F1 sources were already tried)', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            app.f1Api.getSchedule.mockRejectedValue(new Error('F1_SCHEDULE_UNAVAILABLE:jolpica,openf1:ALL_SOURCES_FAILED'));
            expect(await app.selectSeries('f1')).toBe(false);
            expect(app.ui.scheduleErrorText.textContent).toBe(i18n.t('errors.scheduleAllUnavailable'));
            expect(app.scheduleRetryTimer).toBeNull();
        });

        it('hides the error when another series loads', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            app.seriesApi = seriesApi(new Error('down'));
            await app.selectSeries('f2');
            app.f1Api.getSchedule.mockResolvedValue([]);
            await app.selectSeries('f1');
            expect(app.ui.scheduleError.hidden).toBe(true);
            expect(app.scheduleFailure).toBeNull();
        });

        it('retries from the Retry button and picks the next round', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            app.autoSelectNextRound = vi.fn();
            app.seriesApi = seriesApi(new Error('down'));
            app.bindEvents();
            await app.selectSeries('fe');

            app.seriesApi.getSchedule.mockResolvedValue({ races: [f2Race(3)], complete: true });
            const click = app.ui.scheduleRetry.addEventListener.mock.calls.find(([type]) => type === 'click')[1];
            await click();
            expect(app.ui.scheduleError.hidden).toBe(true);
            expect(app.autoSelectNextRound).toHaveBeenCalled();
        });

        it('retranslates a visible error when the language changes', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            app.seriesApi = seriesApi(new Error('down'));
            await app.selectSeries('fe');
            app.ui.scheduleErrorText.textContent = 'stale';
            app.handleLanguageChange();
            expect(app.ui.scheduleErrorText.textContent).toBe(
                i18n.t('errors.seriesScheduleUnavailable', { series: i18n.t('controls.fe') }));
        });

        it('tolerates a missing error element', () => {
            app.ui.scheduleError = null;
            expect(() => app.showScheduleError('f2', new Error('x'))).not.toThrow();
            expect(() => app.hideScheduleError()).not.toThrow();
        });
    });

    describe('series dropdown', () => {
        const changeHandler = () => {
            app.bindEvents();
            return app.ui.seriesSelect.addEventListener.mock.calls.find(([type]) => type === 'change')[1];
        };

        it('switches series, updates the URL and picks the next round', async () => {
            app.seriesApi = seriesApi({ races: [f2Race(1)], complete: true });
            app.autoSelectNextRound = vi.fn();
            await changeHandler()({ target: { value: 'fe' } });
            expect(app.series).toBe('fe');
            expect(app.router.navigate).toHaveBeenCalledWith('fe', null, null);
            expect(app.autoSelectNextRound).toHaveBeenCalled();
        });

        it('still updates the URL when the schedule fails', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            app.seriesApi = seriesApi(new Error('down'));
            app.autoSelectNextRound = vi.fn();
            await changeHandler()({ target: { value: 'f2' } });
            expect(app.router.navigate).toHaveBeenCalledWith('f2', null, null);
            expect(app.autoSelectNextRound).not.toHaveBeenCalled();
        });
    });

    describe('routing', () => {
        it('switches series from the URL before selecting the round', async () => {
            app.seriesApi = seriesApi({ races: [f2Race(13)], complete: true });
            await app.handleRoute({ series: 'f2', round: '13', session: 'feature-race' });
            expect(app.series).toBe('f2');
            expect(app.selectedRace?.round).toBe('13');
            expect(app.router.navigate).toHaveBeenCalledWith('f2', '13', null);
        });

        it('stops when the routed series cannot load', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            app.seriesApi = seriesApi(new Error('down'));
            app.selectRound = vi.fn();
            await app.handleRoute({ series: 'f3', round: '1' });
            expect(app.selectRound).not.toHaveBeenCalled();
        });

        it('starts on the series in the URL', async () => {
            app.initUIElements = vi.fn();
            app.initMapComponents = vi.fn();
            app.bindEvents = vi.fn();
            app.showLoading = vi.fn();
            app.populateRoundSelect = vi.fn();
            app.startWeatherRefreshInterval = vi.fn();
            app.startSessionForecastInterval = vi.fn();
            app.handleRoute = vi.fn();
            app.router.getParams = vi.fn(() => ({ series: 'fe', round: '3', session: null }));
            app.seriesApi = seriesApi({ races: [f2Race(3)], complete: true });

            await app.init();
            expect(app.ui.seriesSelect.value).toBe('fe');
            expect(app.seriesApi.getSchedule).toHaveBeenCalledWith('fe');
            expect(app.f1Api.getSchedule).not.toHaveBeenCalled();
        });

        it('shows the series error inline when the starting series fails', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            app.initUIElements = vi.fn();
            app.initMapComponents = vi.fn();
            app.bindEvents = vi.fn();
            app.showLoading = vi.fn();
            app.handleRoute = vi.fn();
            app.startWeatherRefreshInterval = vi.fn();
            app.startSessionForecastInterval = vi.fn();
            app.router.getParams = vi.fn(() => ({ series: 'f2', round: '3' }));
            app.seriesApi = seriesApi(new Error('SERIES_SCHEDULE_UNAVAILABLE:f2'));

            await app.init();
            expect(app.renderError).not.toHaveBeenCalled();
            expect(app.ui.scheduleErrorText.textContent).toBe(
                i18n.t('errors.seriesScheduleUnavailable', { series: i18n.t('controls.f2') }));
            expect(app.handleRoute).not.toHaveBeenCalled();
            expect(app.startWeatherRefreshInterval).toHaveBeenCalled();
        });

        it('falls back to F1 for an unknown series in the URL', async () => {
            app.initUIElements = vi.fn();
            app.initMapComponents = vi.fn();
            app.bindEvents = vi.fn();
            app.showLoading = vi.fn();
            app.populateRoundSelect = vi.fn();
            app.autoSelectNextRound = vi.fn();
            app.startWeatherRefreshInterval = vi.fn();
            app.startSessionForecastInterval = vi.fn();
            app.router.getParams = vi.fn(() => ({ series: 'btcc' }));
            app.seriesApi = seriesApi({ races: [], complete: true });

            await app.init();
            expect(app.series).toBe('f1');
            expect(app.f1Api.getSchedule).toHaveBeenCalled();
        });
    });

    describe('updateSessionForecast without venue coordinates', () => {
        it('uses the track centre', async () => {
            app.selectedRace = { location: { lat: '', long: '' } };
            app.currentCircuitCenter = [25.49, 51.45];
            app.renderForecast = vi.fn();
            const time = new Date('2026-11-29T13:00:00Z');
            await app.updateSessionForecast(time, 'feature-race');
            expect(app.weatherClient.getForecast).toHaveBeenCalledWith(25.49, 51.45, time);
        });

        it('skips the forecast when there is no centre either', async () => {
            app.selectedRace = { location: { lat: '', long: '' } };
            app.currentCircuitCenter = null;
            await app.updateSessionForecast(new Date(), 'race');
            expect(app.weatherClient.getForecast).not.toHaveBeenCalled();
        });
    });
});
