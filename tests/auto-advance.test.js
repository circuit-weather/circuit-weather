// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoAdvance, CHECK_INTERVAL_MS } from '../public/src/ui/AutoAdvance.js';

describe('AutoAdvance', () => {
    let toggle;
    let target;
    let selection;
    let apply;
    let controller;

    const create = () => {
        controller = new AutoAdvance({
            toggle,
            getTarget: () => target,
            getSelection: () => selection,
            apply,
        });
        return controller;
    };

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        document.body.innerHTML = '<button id="t" role="switch" aria-checked="false"></button>';
        toggle = document.getElementById('t');
        target = { round: '19', sessionId: 'qualifying-2' };
        selection = { round: '19', sessionId: 'qualifying-1' };
        apply = vi.fn(async (next) => { selection = { ...next }; });
    });

    afterEach(() => {
        controller?.destroy();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('is off by default and does nothing', async () => {
        create();
        expect(toggle.getAttribute('aria-checked')).toBe('false');
        await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 3);
        expect(apply).not.toHaveBeenCalled();
    });

    it('turning it on saves the choice and jumps to what is on now', async () => {
        create();
        toggle.click();
        await vi.waitFor(() => expect(apply).toHaveBeenCalledWith(target));
        expect(toggle.getAttribute('aria-checked')).toBe('true');
        expect(localStorage.getItem('autoAdvance')).toBe('true');

        toggle.click();
        expect(localStorage.getItem('autoAdvance')).toBe('false');
        target = { round: '19', sessionId: 'sprint-race' };
        await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
        expect(apply).toHaveBeenCalledTimes(1);
    });

    it('follows the schedule on its timer once saved on', async () => {
        localStorage.setItem('autoAdvance', 'true');
        selection = { ...target };
        create();
        expect(toggle.getAttribute('aria-checked')).toBe('true');

        await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
        expect(apply).not.toHaveBeenCalled(); // already showing it

        target = { round: '19', sessionId: 'sprint-race' };
        await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
        expect(apply).toHaveBeenCalledWith({ round: '19', sessionId: 'sprint-race' });

        // Next round, with no session times listed
        target = { round: '20', sessionId: null };
        await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
        expect(apply).toHaveBeenLastCalledWith({ round: '20', sessionId: null });

        // End of season
        target = null;
        await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
        expect(apply).toHaveBeenCalledTimes(2);
    });

    it('catches up as soon as a background tab is seen again', async () => {
        localStorage.setItem('autoAdvance', 'true');
        create();
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        expect(apply).not.toHaveBeenCalled();

        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.waitFor(() => expect(apply).toHaveBeenCalledWith(target));
    });

    it('leaves a hand-picked session alone until the schedule next changes', async () => {
        localStorage.setItem('autoAdvance', 'true');
        create();
        selection = { round: '18', sessionId: 'gp' }; // peeking at last round
        controller.noteManualSelection();

        await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 3);
        expect(apply).not.toHaveBeenCalled();

        // Q2 finishes: following resumes
        target = { round: '19', sessionId: 'sprint-race' };
        await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
        expect(apply).toHaveBeenCalledWith({ round: '19', sessionId: 'sprint-race' });
    });

    it('doesn\'t pause when the pick is what is on anyway, or when it is off', async () => {
        create();
        controller.noteManualSelection(); // off: ignored
        expect(controller.pausedAt).toBeNull();

        localStorage.setItem('autoAdvance', 'true');
        controller.destroy();
        create();
        selection = { ...target };
        controller.noteManualSelection();
        expect(controller.pausedAt).toBeNull();
    });

    it('turning it on again clears a pause', async () => {
        localStorage.setItem('autoAdvance', 'true');
        create();
        controller.noteManualSelection();
        controller.setEnabled(false);
        controller.setEnabled(true);
        await vi.waitFor(() => expect(apply).toHaveBeenCalledWith(target));
    });

    it('runs one switch at a time and survives a failed one', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        localStorage.setItem('autoAdvance', 'true');
        let finish;
        apply = vi.fn(() => new Promise((resolve, reject) => { finish = { resolve, reject }; }));
        create();

        controller.check();
        controller.check();
        expect(apply).toHaveBeenCalledTimes(1);

        finish.reject(new Error('offline'));
        await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith('Auto-advance failed:', expect.any(Error)));
        controller.check();
        expect(apply).toHaveBeenCalledTimes(2);
    });

    it('works without a toggle element', () => {
        toggle = null;
        expect(() => create().setEnabled(true)).not.toThrow();
    });
});
