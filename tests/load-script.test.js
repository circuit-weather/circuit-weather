// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadScript, whenIdleAfterLoad } from '../public/src/utils/loadScript.js';

describe('loadScript', () => {
    afterEach(() => {
        document.head.innerHTML = '';
        document.body.innerHTML = '';
    });

    it('adds the script with its integrity hash and attributes, and resolves once it loads', async () => {
        const parent = document.createElement('div');
        const promise = loadScript('/lib.js', { integrity: 'sha384-abc', attributes: { 'data-name': 'x' }, parent });

        const script = parent.querySelector('script');
        expect(script.getAttribute('src')).toBe('/lib.js');
        expect(script.integrity).toBe('sha384-abc');
        expect(script.crossOrigin).toBe('anonymous');
        expect(script.getAttribute('data-name')).toBe('x');

        script.dispatchEvent(new Event('load'));
        await expect(promise).resolves.toBe(script);
    });

    it('defaults to the head, without integrity, and rejects when the script fails', async () => {
        const promise = loadScript('/missing.js');
        const script = document.head.querySelector('script');
        expect(script.hasAttribute('integrity')).toBe(false);
        expect(script.hasAttribute('crossorigin')).toBe(false);

        script.dispatchEvent(new Event('error'));
        await expect(promise).rejects.toThrow('Failed to load /missing.js');
    });
});

describe('whenIdleAfterLoad', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete window.requestIdleCallback;
        vi.useRealTimers();
    });

    it('waits for the load event, then for an idle moment', () => {
        Object.defineProperty(document, 'readyState', { value: 'interactive', configurable: true });
        window.requestIdleCallback = vi.fn((callback) => callback());
        const task = vi.fn();

        whenIdleAfterLoad(task);
        expect(task).not.toHaveBeenCalled();

        window.dispatchEvent(new Event('load'));
        expect(window.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 3000 });
        expect(task).toHaveBeenCalledTimes(1);
    });

    it('runs soon after an already-loaded page, without requestIdleCallback', () => {
        vi.useFakeTimers();
        Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
        const task = vi.fn();

        whenIdleAfterLoad(task);
        expect(task).not.toHaveBeenCalled();
        vi.runAllTimers();
        expect(task).toHaveBeenCalledTimes(1);
    });
});
