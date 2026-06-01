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

    it('early returns from cycleSpeed/updateSpeedLabel if UI is missing', () => {
        const pb = new RadarPlayback();
        pb.ui.speedLabel = null;
        pb.ui.speedBtn = null;
        expect(() => pb.updateSpeedLabel()).not.toThrow();
        expect(() => pb.cycleSpeed()).not.toThrow();
    });

    it('early returns from cycleSpeed/updateSpeedLabel if ui is not set up', () => {
        const pb = new RadarPlayback();
        pb.ui = {};
        expect(() => pb.updateSpeedLabel()).not.toThrow();
        expect(() => pb.cycleSpeed()).not.toThrow();
    });

    it('updateSpeedLabel handles speedBtn missing ARIA setup safely', () => {
        const pb = new RadarPlayback();
        pb.ui.speedLabel = { textContent: '' };
        pb.ui.speedBtn = { setAttribute: vi.fn() };

        pb.updateSpeedLabel();
        expect(pb.ui.speedBtn.setAttribute).toHaveBeenCalled();
    });

    it('early returns from play if UI missing', () => {
        const pb = new RadarPlayback();
        pb.ui.playBtn = null;
        expect(() => pb.play()).not.toThrow();
    });

    it('play adds attributes correctly to playBtn if present', () => {
        const pb = new RadarPlayback();
        pb.ui.playBtn = { classList: { add: vi.fn(), remove: vi.fn() }, setAttribute: vi.fn() };
        pb.play();
        expect(pb.ui.playBtn.classList.add).toHaveBeenCalledWith('playing');
        expect(pb.ui.playBtn.setAttribute).toHaveBeenCalled();
    });

    it('early returns from pause if UI missing', () => {
        const pb = new RadarPlayback();
        pb.ui.playBtn = null;
        expect(() => pb.pause()).not.toThrow();
    });

    it('pause removes attributes from playBtn if present', () => {
        const pb = new RadarPlayback();
        pb.ui.playBtn = { classList: { remove: vi.fn(), add: vi.fn() }, setAttribute: vi.fn() };
        pb.pause();
        expect(pb.ui.playBtn.classList.remove).toHaveBeenCalledWith('playing');
        expect(pb.ui.playBtn.setAttribute).toHaveBeenCalled();
    });

    it('togglePlay calls correct methods', () => {
        const pb = new RadarPlayback();
        pb.play = vi.fn();
        pb.pause = vi.fn();

        pb.isPlaying = true;
        pb.togglePlay();
        expect(pb.pause).toHaveBeenCalled();

        pb.isPlaying = false;
        pb.togglePlay();
        expect(pb.play).toHaveBeenCalled();
    });

    it('loop early returns if not playing', () => {
        const pb = new RadarPlayback();
        pb.isPlaying = false;
        expect(() => pb.loop()).not.toThrow();
    });

    it('destroy calls pause', () => {
        const pb = new RadarPlayback();
        pb.pause = vi.fn();
        pb.destroy();
        expect(pb.pause).toHaveBeenCalled();
    });

    it('event listeners are bound properly in constructor if elements exist', () => {
        const mockPlay = { addEventListener: vi.fn() };
        const mockSpeed = { addEventListener: vi.fn() };
        vi.spyOn(document, 'getElementById').mockImplementation((id) => {
            if (id === 'radarPlayBtn') return mockPlay;
            if (id === 'radarSpeedBtn') return mockSpeed;
            return null;
        });

        const pb = new RadarPlayback();
        pb.togglePlay = vi.fn();
        pb.cycleSpeed = vi.fn();

        mockPlay.addEventListener.mock.calls.find(c => c[0] === 'click')[1]();
        expect(pb.togglePlay).toHaveBeenCalled();

        mockSpeed.addEventListener.mock.calls.find(c => c[0] === 'click')[1]();
        expect(pb.cycleSpeed).toHaveBeenCalled();
    });
});
