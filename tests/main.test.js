import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitWeatherApp } from '../public/src/CircuitWeatherApp.js';
import { PrivacyModal } from '../public/src/ui/PrivacyModal.js';
import { LanguageManager } from '../public/src/ui/LanguageManager.js';
import { i18n } from '../public/src/i18n/index.js';

vi.mock('../public/src/CircuitWeatherApp.js', () => {
    return {
        CircuitWeatherApp: vi.fn().mockImplementation(() => ({
            init: vi.fn()
        }))
    };
});

vi.mock('../public/src/ui/PrivacyModal.js', () => {
    return {
        PrivacyModal: vi.fn()
    };
});

vi.mock('../public/src/ui/LanguageManager.js', () => {
    return {
        LanguageManager: vi.fn()
    };
});

vi.mock('../public/src/i18n/index.js', () => {
    return {
        i18n: {
            init: vi.fn(),
            apply: vi.fn()
        }
    };
});

describe('main.js entry point', () => {
    let documentMock;
    let windowMock;
    let navigatorMock;
    let domContentLoadedCallback;
    let consoleErrorSpy;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();

        domContentLoadedCallback = null;

        documentMock = {
            addEventListener: vi.fn((event, callback) => {
                if (event === 'DOMContentLoaded') {
                    domContentLoadedCallback = callback;
                }
            })
        };

        windowMock = {};

        navigatorMock = {
            serviceWorker: {
                register: vi.fn().mockResolvedValue({})
            }
        };

        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        vi.stubGlobal('document', documentMock);
        vi.stubGlobal('window', windowMock);
        vi.stubGlobal('navigator', navigatorMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        consoleErrorSpy.mockRestore();
    });

    it('initializes app components on DOMContentLoaded', async () => {
        // Import main.js dynamically to execute it after setting up globals
        await import('../public/src/main.js');

        // Check that event listener was added
        expect(documentMock.addEventListener).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));

        // Trigger the callback
        expect(domContentLoadedCallback).toBeDefined();
        await domContentLoadedCallback();

        // Verify i18n was initialized and applied
        expect(i18n.init).toHaveBeenCalled();
        expect(i18n.apply).toHaveBeenCalled();

        // Verify CircuitWeatherApp was instantiated and initialized
        expect(CircuitWeatherApp).toHaveBeenCalled();
        const appInstance = vi.mocked(CircuitWeatherApp).mock.results[0].value;
        expect(appInstance.init).toHaveBeenCalled();
        expect(windowMock.app).toBe(appInstance);

        // Verify other components were instantiated
        expect(PrivacyModal).toHaveBeenCalled();
        expect(LanguageManager).toHaveBeenCalled();

        // Verify service worker registration
        expect(navigatorMock.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
    });

    it('handles service worker registration failure', async () => {
        const error = new Error('Registration failed');
        navigatorMock.serviceWorker.register.mockRejectedValueOnce(error);

        await import('../public/src/main.js');
        await domContentLoadedCallback();

        // Wait for microtasks to process the rejection
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(consoleErrorSpy).toHaveBeenCalledWith('Service Worker registration failed:', error);
    });

    it('does not register service worker if not supported', async () => {
        delete navigatorMock.serviceWorker;

        await import('../public/src/main.js');
        await domContentLoadedCallback();

        // Service worker should not be accessed
        // We know it won't crash and we can just check if we got here
        expect(CircuitWeatherApp).toHaveBeenCalled();
    });
});
