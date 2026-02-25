import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitWeatherApp } from '../public/src/CircuitWeatherApp.js';

// Mock DOM
const createMockElement = (id) => ({
    id,
    innerHTML: '',
    appendChild: vi.fn(),
    disabled: false,
    value: '',
});

vi.stubGlobal('document', {
    getElementById: vi.fn((id) => createMockElement(id)),
    createDocumentFragment: vi.fn(() => ({
        appendChild: vi.fn(),
    })),
    createElement: vi.fn(() => ({
        value: '',
        textContent: '',
    })),
});

vi.stubGlobal('window', {
    matchMedia: vi.fn(() => ({
        addEventListener: vi.fn(),
        matches: false,
    })),
});

// Mock dependencies that are imported in CircuitWeatherApp.js
vi.mock('../public/src/map/MapManager.js', () => ({ MapManager: vi.fn() }));
vi.mock('../public/src/ui/ThemeManager.js', () => ({ ThemeManager: vi.fn() }));
vi.mock('../public/src/ui/SidebarManager.js', () => ({ SidebarManager: vi.fn() }));
vi.mock('../public/src/api/F1API.js', () => ({ F1API: vi.fn() }));
vi.mock('../public/src/api/WeatherClient.js', () => ({ WeatherClient: vi.fn() }));
vi.mock('../public/src/map/TrackLayer.js', () => ({ TrackLayer: vi.fn() }));
vi.mock('../public/src/map/WeatherRadar.js', () => ({ WeatherRadar: vi.fn() }));
vi.mock('../public/src/map/RangeCircles.js', () => ({ RangeCircles: vi.fn() }));
vi.mock('../public/src/map/MapWeatherWidget.js', () => ({ MapWeatherWidget: vi.fn() }));
vi.mock('../public/src/map/RecentreControl.js', () => ({ RecentreControl: vi.fn() }));
vi.mock('../public/src/ui/CountdownTimer.js', () => ({ CountdownTimer: vi.fn() }));
vi.mock('../public/src/routing/Router.js', () => ({ Router: vi.fn() }));

describe('CircuitWeatherApp Session Labels', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        app = new CircuitWeatherApp();
        app.races = [
            {
                round: '1',
                name: 'Bahrain GP',
                date: '2024-03-02',
                sessions: [
                    { id: 'fp1', name: 'FP1', date: '2024-03-01', time: '10:00:00Z' },
                    { id: 'race', name: 'Race', date: '2024-03-02', time: '15:00:00Z' }
                ]
            },
            {
                round: '2',
                name: 'Saudi Arabian GP',
                date: '2024-03-09',
                sessions: [
                    { id: 'fp1', name: 'FP1', date: '2024-03-08', time: '13:00:00Z' },
                    { id: 'race', name: 'Race', date: '2024-03-09', time: '17:00:00Z' }
                ]
            }
        ];
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should NOT mark any round as (Next)', () => {
        // Mock current time to be before Round 1
        vi.setSystemTime(new Date('2024-02-25T10:00:00Z'));

        const fragment = { appendChild: vi.fn() };
        document.createDocumentFragment.mockReturnValue(fragment);

        const options = [];
        document.createElement.mockImplementation(() => {
            const opt = { value: '', textContent: '' };
            options.push(opt);
            return opt;
        });

        app.populateRoundSelect();

        // Check that none of the options contain "(Next)"
        options.forEach(opt => {
            expect(opt.textContent).not.toContain('(Next)');
        });
    });

    it('should ONLY mark the globally next session as (Next)', () => {
        // Mock current time to be before Round 1
        vi.setSystemTime(new Date('2024-02-25T10:00:00Z'));

        // 1. Test populating Round 1 sessions
        app.selectedRace = app.races[0];
        let options = [];
        document.createElement.mockImplementation(() => {
            const opt = { value: '', textContent: '' };
            options.push(opt);
            return opt;
        });

        app.populateSessionSelect(app.races[0].sessions);

        // R1 FP1 should be (Next)
        expect(options[0].textContent).toContain('(Next)');
        // R1 Race should NOT be (Next)
        expect(options[1].textContent).not.toContain('(Next)');

        // 2. Test populating Round 2 sessions
        options = [];
        app.selectedRace = app.races[1];
        app.populateSessionSelect(app.races[1].sessions);

        // R2 FP1 should NOT be (Next) because R1 FP1 is sooner
        expect(options[0].textContent).not.toContain('(Next)');
        expect(options[1].textContent).not.toContain('(Next)');
    });

    it('should mark correct session as (Next) when a round is LIVE', () => {
        // Mock current time to be during Round 1, after FP1 but before Race
        // FP1: 2024-03-01T10:00:00Z
        // Now: 2024-03-01T15:00:00Z (FP1 is PAST)
        vi.setSystemTime(new Date('2024-03-01T15:00:00Z'));

        app.selectedRace = app.races[0];
        let options = [];
        document.createElement.mockImplementation(() => {
            const opt = { value: '', textContent: '' };
            options.push(opt);
            return opt;
        });

        app.populateSessionSelect(app.races[0].sessions);

        expect(options[0].textContent).not.toContain('(Next)'); // FP1 is PAST
        expect(options[1].textContent).toContain('(Next)'); // Race is FUTURE and globally next

        // Round 2 sessions should still not have (Next)
        options = [];
        app.selectedRace = app.races[1];
        app.populateSessionSelect(app.races[1].sessions);
        expect(options[0].textContent).not.toContain('(Next)');
    });
});
