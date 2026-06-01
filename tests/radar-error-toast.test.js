import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockEl = { addEventListener: vi.fn(), classList: { contains: () => true, add: vi.fn(), remove: vi.fn() }, style: {}, setAttribute: vi.fn(), textContent: '' };
vi.stubGlobal('document', { getElementById: vi.fn(() => mockEl), addEventListener: vi.fn(), activeElement: { tagName: 'BODY' } });
vi.stubGlobal('navigator', { language: 'en-US' });
vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => { globalThis.lastRafCb = cb; return 1; }));
vi.stubGlobal('cancelAnimationFrame', vi.fn());

const { RadarErrorToast } = await import('../public/src/map/RadarErrorToast.js');

describe('RadarErrorToast edge cases', () => {
    let toast;
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.lastRafCb = null;
        toast = new RadarErrorToast();
    });

    afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

    it('early return in reset when failedTiles is undefined', () => {
        toast.failedTiles = undefined;
        toast.updateErrorUI = vi.fn(); // Prevent error when calling updateErrorUI with undefined failedTiles
        // Does not throw
        expect(() => toast.reset()).not.toThrow();
    });

    it('early return in updateErrorUI debounce hide if hideErrorTimer already set', () => {
        vi.useFakeTimers();
        toast.failedTiles.clear(); // 0 tiles
        toast.hideErrorTimer = setTimeout(() => {}, 100);
        toast.hideErrorToast = vi.fn();

        toast.updateErrorUI();

        vi.advanceTimersByTime(1500);
        expect(toast.hideErrorToast).not.toHaveBeenCalled(); // The mock timeout wasn't overwriten
    });

    it('triggerRateLimitCooldown early returns if rateLimitResetTime is in future', () => {
        toast.rateLimitResetTime = Date.now() + 10000;
        toast.showErrorToast = vi.fn();
        toast.triggerRateLimitCooldown(1000, 'Title', 'Message');
        expect(toast.showErrorToast).not.toHaveBeenCalled();
    });

    it('early returns from showErrorToast when errorToast UI is missing', () => {
        toast.ui.errorToast = null;
        expect(() => toast.showErrorToast('Title', 'Msg', 5)).not.toThrow();
    });

    it('early returns from hideErrorToast when errorToast UI is missing', () => {
        toast.ui.errorToast = null;
        expect(() => toast.hideErrorToast()).not.toThrow();
    });

    it('destroy safely cancels timers if they exist', () => {
        toast.toastAnimationFrame = 123;
        toast.retryTimer = setTimeout(() => {}, 1000);
        toast.hideErrorTimer = setTimeout(() => {}, 1000);

        expect(() => toast.destroy()).not.toThrow();
        expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(123);
    });

    it('destroy safely does nothing if timers dont exist', () => {
        toast.toastAnimationFrame = null;
        toast.retryTimer = null;
        toast.hideErrorTimer = null;

        expect(() => toast.destroy()).not.toThrow();
        expect(globalThis.cancelAnimationFrame).not.toHaveBeenCalled();
    });

    it('handleTileError does not trigger triggerRateLimitCooldown for non-429 failures', async () => {
        toast.failedTiles.add('tile');
        toast.isCheckingStatus = false;

        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 })));

        toast.triggerRateLimitCooldown = vi.fn();
        toast.showErrorToast = vi.fn();

        toast.handleTileError({ tile: 'tile' });

        // Let the promise resolve
        await new Promise(r => setImmediate(r));

        expect(toast.triggerRateLimitCooldown).not.toHaveBeenCalled();
        expect(toast.showErrorToast).toHaveBeenCalled();
    });
});
