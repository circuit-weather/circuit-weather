import { CircuitWeatherApp } from './CircuitWeatherApp.js';
import { PrivacyModal } from './ui/PrivacyModal.js';

/**
 * Initialize SEO Structured Data (JSON-LD)
 * Injected via JS to comply with strict CSP without 'unsafe-inline'
 */
function initStructuredData() {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "Circuit Weather",
        "url": "https://circuit-weather.racing",
        "description": "Real-time weather radar and forecasts for Formula 1 race circuits. Track precipitation and conditions at every F1 track.",
        "applicationCategory": "WeatherApplication, SportsApplication",
        "operatingSystem": "Any",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD"
        }
    });
    document.head.appendChild(script);
}

/**
 * Application Entry Point
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialize SEO
    initStructuredData();

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
