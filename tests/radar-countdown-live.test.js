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
});

const documentMock = {
    getElementById: vi.fn((id) => createMockElement(id)),
    addEventListener: vi.fn(),
    activeElement: { tagName: 'BODY' },
    createElement: vi.fn(() => createMockElement('created')),
};

const navigatorMock = { language: 'en-NZ' }; // NZ English as per AGENTS.md

vi.stubGlobal('document', documentMock);
vi.stubGlobal('navigator', navigatorMock);
vi.stubGlobal('window', { addEventListener: vi.fn() });
vi.stubGlobal('fetch', vi.fn());
vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => 1));
vi.stubGlobal('cancelAnimationFrame', vi.fn());
vi.stubGlobal('performance', { now: vi.fn(() => 0) });
vi.stubGlobal('L', {
    tileLayer: vi.fn(() => ({
        addTo: vi.fn(),
        setOpacity: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
    })),
});

const { WeatherRadar } = await import('../public/src/map/WeatherRadar.js');

describe('WeatherRadar Live Countdown', () => {
    let radar;
    let mockMap;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        mockMap = {
            removeLayer: vi.fn(),
            invalidateSize: vi.fn(),
            hasLayer: vi.fn().mockReturnValue(false),
            addLayer: vi.fn(),
            on: vi.fn(),
            off: vi.fn(),
        };

        radar = new WeatherRadar(mockMap);

        // Mock UI
        radar.ui.time = createMockElement('radarTime');
        radar.ui.relative = createMockElement('radarRelative');
        radar.ui.slider = createMockElement('radarSlider');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('uses Date.now() for latest frame session offset', () => {
        // Session starts at T=1000
        const sessionTime = new Date(1000 * 60000);
        radar.setSessionTime(sessionTime);

        // Latest past frame is at T=990 (10 mins before session)
        const frameTime = 990 * 60; // seconds
        radar.frames = [{ time: frameTime }];
        radar.pastFrameCount = 1;
        radar.visibleLayerIndex = 0;

        // System time is actually T=995 (5 mins before session)
        vi.setSystemTime(new Date(995 * 60000));

        radar.updateTimeDisplay(frameTime);

        // Should show 5 minutes before (from current time)
        expect(radar.ui.relative.textContent).toBe('5 minutes before session');
    });

    it('applies real-time drift to historical frames session offset', () => {
        // Session starts at T=1000
        const sessionTime = new Date(1000 * 60000);
        radar.setSessionTime(sessionTime);

        // Frames: historical at T=980, latest at T=990
        radar.frames = [{ time: 980 * 60 }, { time: 990 * 60 }];
        radar.pastFrameCount = 2;
        radar.visibleLayerIndex = 0; // Viewing historical

        // System time is T=995 (5 mins drift since latest frame at T=990)
        vi.setSystemTime(new Date(995 * 60000));

        radar.updateTimeDisplay(980 * 60);

        // T=980 + 5m drift = T=985.
        // Session start at T=1000. 1000 - 985 = 15 minutes before.
        expect(radar.ui.relative.textContent).toBe('15 minutes before session');
    });

    it('shows "Live" for latest frame when no session is active', () => {
        radar.sessionTime = null;

        const frameTime = 990 * 60;
        radar.frames = [{ time: frameTime }];
        radar.pastFrameCount = 1;
        radar.visibleLayerIndex = 0;

        // System time is T=995 (5 mins later)
        vi.setSystemTime(new Date(995 * 60000));

        radar.updateTimeDisplay(frameTime);

        // Drift (5m) makes T=990 become T=995. Current time is T=995.
        // Diff = 0m -> "Live"
        expect(radar.ui.relative.textContent).toBe('Live');
    });

    it('shows "X mins ago" for past frames when no session is active', () => {
        radar.sessionTime = null;

        // Latest at T=990. Historical at T=980.
        const frameTime = 980 * 60;
        radar.frames = [{ time: frameTime }, { time: 990 * 60 }];
        radar.pastFrameCount = 2;
        radar.visibleLayerIndex = 0;

        // System time is T=995 (5 mins drift since latest frame at T=990)
        vi.setSystemTime(new Date(995 * 60000));

        radar.updateTimeDisplay(frameTime);

        // T=980 + 5m drift = T=985.
        // Current time is T=995. 995 - 985 = 10 mins ago.
        expect(radar.ui.relative.textContent).toBe('10 mins ago');
    });

    it('shows "Session start" when time is exactly at session start', () => {
        const sessionTime = new Date(1000 * 60000);
        radar.setSessionTime(sessionTime);

        const frameTime = 1000 * 60;
        radar.frames = [{ time: frameTime }];
        radar.pastFrameCount = 1;
        radar.visibleLayerIndex = 0;

        vi.setSystemTime(new Date(1000 * 60000));

        radar.updateTimeDisplay(frameTime);

        expect(radar.ui.relative.textContent).toBe('Session start');
    });

    it('shows "after session" when time is after session start', () => {
        const sessionTime = new Date(1000 * 60000);
        radar.setSessionTime(sessionTime);

        const frameTime = 1010 * 60; // 10 mins into session
        radar.frames = [{ time: frameTime }];
        radar.pastFrameCount = 1;
        radar.visibleLayerIndex = 0;

        vi.setSystemTime(new Date(1010 * 60000));

        radar.updateTimeDisplay(frameTime);

        expect(radar.ui.relative.textContent).toBe('10 minutes after session');
    });

    it('formats long durations correctly (days, hours, minutes)', () => {
        const sessionTime = new Date(1000 * 60000);
        radar.setSessionTime(sessionTime);

        // 1 day, 2 hours, 3 minutes before session
        // 1440 + 120 + 3 = 1563 minutes
        const diffMins = 1563;
        const frameTime = (1000 - diffMins) * 60;
        radar.frames = [{ time: frameTime }];
        radar.pastFrameCount = 1;
        radar.visibleLayerIndex = 0;

        vi.setSystemTime(new Date((1000 - diffMins) * 60000));

        radar.updateTimeDisplay(frameTime);

        expect(radar.ui.relative.textContent).toBe('1 day 2 hours 3 minutes before session');
    });

    it('shows "Forecast" for future frames when no session is active', () => {
        radar.sessionTime = null;

        // Future frame (e.g., 5 mins ahead)
        const now = 1000 * 60;
        const frameTime = (1000 + 5) * 60;
        radar.frames = [{ time: frameTime }];
        radar.pastFrameCount = 0;
        radar.visibleLayerIndex = 0;

        vi.setSystemTime(new Date(now * 1000));

        radar.updateTimeDisplay(frameTime);

        expect(radar.ui.relative.textContent).toBe('Forecast');
    });

    it('handles negative or invalid visibleLayerIndex gracefully', () => {
        radar.sessionTime = null;
        radar.visibleLayerIndex = -1;
        radar.frames = [];
        radar.pastFrameCount = 0;
        const frameTime = 1000 * 60;

        vi.setSystemTime(new Date(0));

        expect(() => radar.updateTimeDisplay(frameTime)).not.toThrow();

        // Still produces a formatted absolute time and a machine-readable
        // datetime attribute rather than crashing or emitting an empty string.
        expect(radar.ui.time.textContent).not.toBe('');
        expect(radar.ui.time.setAttribute).toHaveBeenCalledWith(
            'datetime',
            new Date(frameTime * 1000).toISOString(),
        );
    });

    it('preloads frames correctly', async () => {
        radar.frames = [{ time: 1000, url: 'url1' }, { time: 2000, url: 'url2' }];
        radar.currentFrame = 0;

        const mockLayer = {
            setOpacity: vi.fn(),
            addTo: vi.fn(),
            on: vi.fn((event, cb) => {
                if (event === 'load') cb();
            }),
            off: vi.fn(),
        };
        vi.spyOn(radar, 'getLayer').mockReturnValue(mockLayer);

        await radar.preloadFrame(1);

        expect(mockLayer.addTo).toHaveBeenCalledWith(mockMap);
        expect(mockLayer.setOpacity).toHaveBeenCalledWith(0);
    });

    it('animates frames in a loop', () => {
        radar.frames = [{ time: 1000 }, { time: 2000 }];
        radar.currentFrame = 0;
        radar.playback.isPlaying = true;
        vi.spyOn(radar.playback, 'getCurrentSpeed').mockReturnValue(100);
        vi.spyOn(radar, 'showFrame');

        radar.playback.lastFrameTime = 0;
        vi.spyOn(performance, 'now').mockReturnValue(100);

        radar.playback.loop();

        expect(radar.showFrame).toHaveBeenCalledWith(1);
    });

    it('shows "1 min ago" and "2 mins ago" correctly for singular/plural', () => {
        radar.sessionTime = null;

        // System time is T=1000
        vi.setSystemTime(new Date(1000 * 1000));

        // Latest at T=1000
        radar.frames = [{ time: 1000 }];
        radar.pastFrameCount = 1;
        radar.visibleLayerIndex = 0;

        // Check 1 min ago
        radar.updateTimeDisplay(1000 - 60);
        expect(radar.ui.relative.textContent).toBe('1 min ago');

        // Check 2 mins ago
        radar.updateTimeDisplay(1000 - 120);
        expect(radar.ui.relative.textContent).toBe('2 mins ago');
    });
});
