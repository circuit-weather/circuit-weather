import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockEl = { addEventListener: vi.fn(), classList: { contains: () => true, add: vi.fn(), remove: vi.fn() }, style: {}, setAttribute: vi.fn(), textContent: '' };
vi.stubGlobal('document', { getElementById: vi.fn(() => mockEl), addEventListener: vi.fn(), activeElement: { tagName: 'BODY' } });
vi.stubGlobal('navigator', { language: 'en-US' });
vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => { globalThis.lastRafCb = cb; return 1; }));
vi.stubGlobal('cancelAnimationFrame', vi.fn());

const { WeatherRadar } = await import('../public/src/map/WeatherRadar.js');

describe('WeatherRadar Toast Timer', () => {
    let radar;

    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.lastRafCb = null;
        radar = new WeatherRadar({});
        radar.errorToast.ui.errorToast = { classList: { contains: vi.fn().mockReturnValue(true), add: vi.fn(), remove: vi.fn() }, style: {} };
    });

    afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

    it('updateTimer aborts if toast is no longer visible', () => {
        radar.errorToast.showErrorToast('Title', 'Message', 5);
        radar.errorToast.ui.errorToast.classList.contains.mockReturnValue(false);
        globalThis.lastRafCb();
        expect(radar.errorToast.toastAnimationFrame).toBeNull();
    });

    it('updateTimer requests next frame if time remains', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1000000);
        radar.errorToast.showErrorToast('Title', 'Message', 5);

        vi.setSystemTime(1001000);
        globalThis.requestAnimationFrame.mockClear();
        globalThis.lastRafCb();

        expect(radar.errorToast.ui.errorTimer.textContent).toBe('4s');
        expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
    });

    it('updateTimer finishes and hides toast when time is up', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1000000);
        radar.errorToast.showErrorToast('Title', 'Message', 5);

        vi.setSystemTime(1006000);
        radar.errorToast.hideErrorToast = vi.fn();
        radar.errorToast.rateLimitResetTime = 0;

        globalThis.lastRafCb();

        expect(radar.errorToast.ui.errorTimer.textContent).toBe('');
        expect(radar.errorToast.toastAnimationFrame).toBeNull();
        expect(radar.errorToast.hideErrorToast).toHaveBeenCalled();
    });
});
