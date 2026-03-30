import { CircuitWeatherApp } from './CircuitWeatherApp.js';
import { PrivacyModal } from './ui/PrivacyModal.js';
import { i18n } from './i18n/index.js';

/**
 * Application Entry Point
 */
document.addEventListener('DOMContentLoaded', () => {
    i18n.init();
    i18n.apply();

    // Initialize the main application
    const app = new CircuitWeatherApp();
    app.init();

    // Initialize the privacy modal
    new PrivacyModal();

    // Register Service Worker for offline support and PWA features
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.error('Service Worker registration failed:', err);
        });
    }
});
