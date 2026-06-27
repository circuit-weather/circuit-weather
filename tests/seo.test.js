import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DOM
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

const _elements = {};
const documentMock = {
    title: 'Circuit Weather — Live F1 Race Weather Radar & Forecasts',
    getElementById: vi.fn((id) => _elements[id] || null),
    addEventListener: vi.fn(),
    querySelector: vi.fn((sel) => createMockElement(sel)),
    createElement: vi.fn((tag) => {
        const el = createMockElement(tag);
        // Special case for id assignment on creation
        let _id = '';
        Object.defineProperty(el, 'id', {
            get: () => _id,
            set: (val) => {
                _id = val;
                _elements[val] = el;
            }
        });
        return el;
    }),
    createDocumentFragment: vi.fn(() => ({ appendChild: vi.fn() })),
    head: { appendChild: vi.fn() },
    body: { appendChild: vi.fn() },
};

// Stub globals before import
vi.stubGlobal('document', documentMock);
vi.stubGlobal('window', {
    matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn()
    })),
    location: { reload: vi.fn() }
});
vi.stubGlobal('navigator', { serviceWorker: { register: vi.fn() } });

// Mock dependencies
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

// Import Class and mocked dependencies
const { CircuitWeatherApp } = await import('../public/src/CircuitWeatherApp.js');
const { RangeCircles } = await import('../public/src/map/RangeCircles.js');
const { TrackLayer } = await import('../public/src/map/TrackLayer.js');
const { WeatherRadar } = await import('../public/src/map/WeatherRadar.js');
const { RecentreControl } = await import('../public/src/map/RecentreControl.js');
const { MapWeatherWidget } = await import('../public/src/map/MapWeatherWidget.js');

describe('SEO Title Updates', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        for (const key in _elements) delete _elements[key]; // Clear mocked DOM
        document.title = 'Circuit Weather — Live F1 Race Weather Radar & Forecasts'; // Reset title

        app = new CircuitWeatherApp();

        // Mock internal properties
        app.races = [
            {
                round: '1',
                name: 'Bahrain Grand Prix',
                sessions: [
                    { id: 'fp1', name: 'Practice 1', date: '2024-03-01', time: '10:00:00Z' },
                    { id: 'qualifying', name: 'Qualifying', date: '2024-03-01', time: '14:00:00Z' }
                ],
                location: { lat: 0, long: 0, country: 'Bahrain' }
            }
        ];

        // Mock UI elements
        app.ui.roundSelect = document.createElement('select');
        app.ui.roundSelect.id = 'roundSelect';
        app.ui.sessionSelect = document.createElement('select');
        app.ui.sessionSelect.id = 'sessionSelect';

        // Initialize components that are usually set in init()
        app.rangeCircles = new RangeCircles();
        app.trackLayer = new TrackLayer();
        app.radar = new WeatherRadar();
        app.recentreControl = new RecentreControl();
        app.mapWeatherWidget = new MapWeatherWidget();
    });

    it('should update title when a round is selected', () => {
        app.selectRound('1');
        expect(document.title).toBe('Bahrain Grand Prix Weather - Circuit Weather');
    });

    it('should update title when a session is selected', async () => {
        app.selectRound('1');
        await app.selectSession('qualifying');
        expect(document.title).toBe('Bahrain Grand Prix Qualifying Weather - Circuit Weather');
    });

    it('should reset title when selection is cleared', () => {
        app.selectRound('1');
        app.selectedSession = null;
        app.selectedRace = null;
        app.updatePageMetadata();
        expect(document.title).toBe('Circuit Weather — Live F1 Race Weather Radar & Forecasts');
    });

    it('should inject JSON-LD schema when session is selected', async () => {
        app.selectRound('1');
        await app.selectSession('qualifying');

        const script = document.getElementById('dynamic-json-ld');
        expect(script).toBeDefined();
        expect(script.type).toBe('application/ld+json');

        const schema = JSON.parse(script.textContent);
        expect(schema['@type']).toBe('SportsEvent');
        expect(schema.name).toBe('Bahrain Grand Prix - Qualifying');
        expect(schema.startDate).toBe('2024-03-01T14:00:00.000Z');
        expect(schema.location.address.addressCountry).toBe('Bahrain');
        expect(schema.organizer.name).toBe('Formula 1');
    });

    it('should update existing JSON-LD schema when switching sessions', async () => {
        app.selectRound('1');
        await app.selectSession('fp1');

        const script = document.getElementById('dynamic-json-ld');
        let schema = JSON.parse(script.textContent);
        expect(schema.name).toBe('Bahrain Grand Prix - Practice 1');

        // Ensure appendChild is spied to check it doesn't add multiple scripts
        const appendSpy = vi.spyOn(document.head, 'appendChild');

        await app.selectSession('qualifying');

        schema = JSON.parse(script.textContent);
        expect(schema.name).toBe('Bahrain Grand Prix - Qualifying');
        expect(appendSpy).not.toHaveBeenCalled(); // Script already exists, shouldn't append again
    });

    it('should remove JSON-LD schema when selection is cleared', async () => {
        app.selectRound('1');
        await app.selectSession('qualifying');

        const script = document.getElementById('dynamic-json-ld');
        expect(script).toBeDefined();

        // Mock removeChild to verify it's called
        const removeSpy = vi.fn();
        script.parentNode = { removeChild: removeSpy };

        app.selectedSession = null;
        app.selectedRace = null;
        app.updatePageMetadata();

        expect(removeSpy).toHaveBeenCalledWith(script);
    });

    it('should safely handle missing location object in JSON-LD generation', async () => {
        app.races.push({
            round: '2',
            name: 'Saudi Arabian Grand Prix',
            sessions: [
                { id: 'qualifying', name: 'Qualifying', date: '2024-03-08', time: '17:00:00Z' }
            ],
            // Deliberately missing location object
        });

        app.selectRound('2');
        await app.selectSession('qualifying');

        const script = document.getElementById('dynamic-json-ld');
        expect(script).toBeDefined();

        const schema = JSON.parse(script.textContent);
        expect(schema.location.address.addressCountry).toBe('');
        expect(schema.location.geo.latitude).toBe('');
        expect(schema.location.geo.longitude).toBe('');
    });
});
