import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Global Mocks ---
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
    tagName: 'DIV' // Default tagName
});

const documentMock = {
    getElementById: vi.fn((id) => createMockElement(id)),
    addEventListener: vi.fn(),
    activeElement: { tagName: 'BODY' },
    createElement: vi.fn(() => createMockElement('created')),
};

const navigatorMock = { language: 'en-US' };

vi.stubGlobal('document', documentMock);
vi.stubGlobal('navigator', navigatorMock);
vi.stubGlobal('window', { addEventListener: vi.fn() });
vi.stubGlobal('fetch', vi.fn());
vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => 1));
vi.stubGlobal('cancelAnimationFrame', vi.fn());
vi.stubGlobal('performance', { now: vi.fn(() => 0) });

// Mock Leaflet
const createMockLayer = () => ({
    addTo: vi.fn(),
    setOpacity: vi.fn(),
    setZIndex: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    redraw: vi.fn(),
});

vi.stubGlobal('L', {
    tileLayer: vi.fn(() => createMockLayer()),
});

// Import the class under test
const { WeatherRadar } = await import('../public/src/map/WeatherRadar.js');
// Import config to check constants
import { CONFIG } from '../public/src/config.js';

describe('WeatherRadar Playback & Speed Control', () => {
    let radar;
    let mockMap;

    beforeEach(() => {
        vi.clearAllMocks();

        mockMap = {
            removeLayer: vi.fn(),
            invalidateSize: vi.fn(),
            hasLayer: vi.fn().mockReturnValue(false),
            addLayer: vi.fn(),
            on: vi.fn(),
            off: vi.fn(),
        };

        radar = new WeatherRadar(mockMap);

        // Mock UI elements involved in speed control
        radar.ui.speedBtn = createMockElement('radarSpeedBtn');
        radar.ui.speedLabel = createMockElement('radarSpeedLabel');
        radar.ui.playBtn = createMockElement('radarPlayBtn');
    });

    // ---------------------------------------------------------------
    // cycleSpeed & getCurrentSpeed
    // ---------------------------------------------------------------
    describe('Speed Control', () => {
        it('should cycle through available speeds', () => {
            // Initial state (default index 1: 1x)
            expect(radar.speedIndex).toBe(CONFIG.defaultSpeedIndex);

            // Cycle 1 -> 2 (2x)
            radar.cycleSpeed();
            expect(radar.speedIndex).toBe(2);
            expect(radar.ui.speedLabel.textContent).toBe('2x');
            expect(radar.getCurrentSpeed()).toBe(500);

            // Cycle 2 -> 0 (0.5x)
            radar.cycleSpeed();
            expect(radar.speedIndex).toBe(0);
            expect(radar.ui.speedLabel.textContent).toBe('0.5x');
            expect(radar.getCurrentSpeed()).toBe(2000);

            // Cycle 0 -> 1 (1x)
            radar.cycleSpeed();
            expect(radar.speedIndex).toBe(1);
            expect(radar.ui.speedLabel.textContent).toBe('1x');
            expect(radar.getCurrentSpeed()).toBe(1000);
        });

        it('should restart playback if currently playing when speed changes', () => {
            radar.isPlaying = true;
            const pauseSpy = vi.spyOn(radar, 'pause');
            const playSpy = vi.spyOn(radar, 'play');

            radar.cycleSpeed();

            expect(pauseSpy).toHaveBeenCalled();
            expect(playSpy).toHaveBeenCalled();
            // speedIndex should have updated
            expect(radar.speedIndex).not.toBe(CONFIG.defaultSpeedIndex);
        });

        it('should NOT restart playback if paused when speed changes', () => {
            radar.isPlaying = false;
            const pauseSpy = vi.spyOn(radar, 'pause');
            const playSpy = vi.spyOn(radar, 'play');

            radar.cycleSpeed();

            expect(pauseSpy).not.toHaveBeenCalled();
            expect(playSpy).not.toHaveBeenCalled();
        });

        it('should update ARIA label on speed button', () => {
            radar.cycleSpeed();
            const label = CONFIG.radarSpeeds[radar.speedIndex].label;
            expect(radar.ui.speedBtn.setAttribute).toHaveBeenCalledWith('aria-label', `Playback speed: ${label}`);
        });
    });

    // ---------------------------------------------------------------
    // Keyboard Shortcuts (Space to Toggle Play/Pause)
    // ---------------------------------------------------------------
    describe('Keyboard Shortcuts', () => {
        let keydownHandler;

        beforeEach(() => {
            // Re-instantiate to capture the event listener bound in constructor
            // We need to capture the handler passed to document.addEventListener
            const addEventSpy = documentMock.addEventListener;

            // Clear prior calls to ensure we get the fresh one
            addEventSpy.mockClear();

            radar = new WeatherRadar(mockMap); // This triggers bindEvents()

            // Find the keydown handler in the calls
            const call = addEventSpy.mock.calls.find(call => call[0] === 'keydown');
            if (call) {
                keydownHandler = call[1];
            }
        });

        it('should toggle play/pause when Space is pressed on body', () => {
            expect(keydownHandler).toBeDefined();

            // Mock active element as body
            documentMock.activeElement = { tagName: 'BODY' };
            const toggleSpy = vi.spyOn(radar, 'togglePlay');
            const preventDefault = vi.fn();

            // Trigger event
            keydownHandler({ code: 'Space', preventDefault });

            expect(toggleSpy).toHaveBeenCalled();
            expect(preventDefault).toHaveBeenCalled();
        });

        it('should NOT toggle when focus is on an input', () => {
            documentMock.activeElement = { tagName: 'INPUT' };
            const toggleSpy = vi.spyOn(radar, 'togglePlay');
            const preventDefault = vi.fn();

            keydownHandler({ code: 'Space', preventDefault });

            expect(toggleSpy).not.toHaveBeenCalled();
            expect(preventDefault).not.toHaveBeenCalled(); // Should not prevent default for inputs
        });

        it('should NOT toggle when focus is on a button', () => {
            documentMock.activeElement = { tagName: 'BUTTON' };
            const toggleSpy = vi.spyOn(radar, 'togglePlay');

            keydownHandler({ code: 'Space', preventDefault: vi.fn() });

            expect(toggleSpy).not.toHaveBeenCalled();
        });

        it('should ignore other keys', () => {
            documentMock.activeElement = { tagName: 'BODY' };
            const toggleSpy = vi.spyOn(radar, 'togglePlay');

            keydownHandler({ code: 'Enter', preventDefault: vi.fn() });

            expect(toggleSpy).not.toHaveBeenCalled();
        });
    });
});
