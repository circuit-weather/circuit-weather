import { CircuitWeatherApp } from './CircuitWeatherApp.js';
import { PrivacyModal } from './ui/PrivacyModal.js';

/**
 * Initialize SEO Structured Data (JSON-LD)
 * Injected via JS to comply with strict CSP without 'unsafe-inline'
 * TODO: This structured data implementation requires further investigation and confirmation.
 * There are currently two sources of WebApplication JSON-LD structured data being injected
 * into the page: one static block defined directly in index.html inside a
 * <script type="application/ld+json"> tag, and this dynamically injected one created here
 * in initStructuredData(). Both describe the same WebApplication schema but with slightly
 * different field values — for example, the static version includes a "featureList" field
 * and uses "SportsApplication" as the category, while the dynamic version uses both
 * "WeatherApplication" and "SportsApplication" and includes a "softwareVersion" field.
 * Having two JSON-LD blocks for the same schema type on a single page can confuse search
 * engine crawlers and may lead to unpredictable behaviour in how the page is indexed.
 * The comment here says this is needed to comply with strict CSP without 'unsafe-inline',
 * but the static block in index.html is a <script type="application/ld+json"> tag which
 * is explicitly allowed under the current CSP policy — meaning both approaches should
 * work. One of these two structured data sources should be removed and a single
 * authoritative definition should be maintained to avoid duplication and inconsistency.
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
        "softwareVersion": "1.1.1",
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
