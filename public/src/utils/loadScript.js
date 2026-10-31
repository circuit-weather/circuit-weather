/**
 * Adds a classic script to the page and resolves once it has run.
 * Third-party libraries are loaded this way so they never block the first render.
 *
 * @param {string} src
 * @param {Object} [options]
 * @param {string} [options.integrity] - Subresource Integrity hash
 * @param {Object<string, string>} [options.attributes] - Extra attributes (e.g. data-*)
 * @param {Element} [options.parent] - Where to add it (default: document.head)
 * @returns {Promise<HTMLScriptElement>}
 */
export function loadScript(src, options = {}) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        if (options.integrity) {
            script.integrity = options.integrity;
            script.crossOrigin = 'anonymous';
        }
        for (const [name, value] of Object.entries(options.attributes || {})) {
            script.setAttribute(name, value);
        }
        script.addEventListener('load', () => resolve(script), { once: true });
        script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
        (options.parent || document.head).appendChild(script);
    });
}

/**
 * Runs `task` once the page has loaded and the main thread is idle, so
 * non-essential work never competes with the first render.
 * @param {Function} task
 */
export function whenIdleAfterLoad(task) {
    const schedule = () => {
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => task(), { timeout: 3000 });
        } else {
            setTimeout(task, 1);
        }
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
}
