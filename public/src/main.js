import { CircuitWeatherApp } from './CircuitWeatherApp.js';
import { PrivacyModal } from './ui/PrivacyModal.js';
import { LanguageManager } from './ui/LanguageManager.js';
import { i18n } from './i18n/index.js';
import { loadBuyMeACoffee } from './ui/BuyMeACoffee.js';

/**
 * Application Entry Point
 */
document.addEventListener('DOMContentLoaded', async () => {
    // English is bundled, so this only waits for other languages' strings
    await i18n.init();
    i18n.apply();

    // Initialize the main application
    const app = new CircuitWeatherApp();
    app.init();
    window.app = app; // Expose for testing

    // Initialize the privacy modal
    new PrivacyModal();

    // Initialize the language manager
    new LanguageManager();

    // Third-party support button, loaded once the page is up so it never delays it
    loadBuyMeACoffee(document.getElementById('bmcContainer'));

    // Register Service Worker for offline support and PWA features
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.error('Service Worker registration failed:', err);
        });
    }
});
