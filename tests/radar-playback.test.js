import { describe, it, expect, vi, beforeEach } from 'vitest';

// RadarPlayback is normally driven by WeatherRadar (covered by the weather-radar
// suites). These tests exercise it in isolation, including its default no-op
// callbacks, which WeatherRadar always overrides.
vi.stubGlobal('document', { getElementById: vi.fn(() => null), addEventListener: vi.fn() });
vi.stubGlobal('navigator', { language: 'en-US' });
let nowVal = 0;
vi.stubGlobal('performance', { now: () => nowVal });
vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42));
vi.stubGlobal('cancelAnimationFrame', vi.fn());

const { RadarPlayback } = await import('../public/src/map/RadarPlayback.js');

describe('RadarPlayback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        nowVal = 0;
    });

    it('uses safe default callbacks when none are provided', () => {
        const pb = new RadarPlayback();
        expect(pb.isPlaying).toBe(false);

        pb.play();
        expect(pb.isPlaying).toBe(true);

        // Force the frame-advance branch; the default callbacks must not throw
        pb.lastFrameTime = 0;
        nowVal = 100000;
        expect(() => pb.loop()).not.toThrow();
        expect(requestAnimationFrame).toHaveBeenCalled();

        pb.pause();
        expect(pb.isPlaying).toBe(false);
        expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    });

    it('advances the current frame through the injected callbacks', () => {
        const showFrame = vi.fn();
        let current = 0;
        const pb = new RadarPlayback({
            getFrameCount: () => 5,
            getCurrentFrame: () => current,
            setCurrentFrame: (i) => { current = i; },
            showFrame,
        });

        pb.play();
        pb.lastFrameTime = 0;
        nowVal = 100000; // elapsed >> speed, so a frame advances
        pb.loop();

        expect(current).toBe(1);
        expect(showFrame).toHaveBeenCalledWith(1);
    });

    it('flushes pending work via beforePlay when starting', () => {
        const beforePlay = vi.fn();
        const pb = new RadarPlayback({ beforePlay });
        pb.play();
        expect(beforePlay).toHaveBeenCalledOnce();
    });

    it('cycles speed and restarts playback when already playing', () => {
        const pb = new RadarPlayback();
        const startIndex = pb.speedIndex;
        pb.play();
        pb.cycleSpeed();
        expect(pb.speedIndex).not.toBe(startIndex);
        expect(pb.isPlaying).toBe(true);
    });
});
