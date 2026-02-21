import { CONFIG } from '../config.js';

/**
 * Manages the Leaflet map instance, tile layers, and theme switching.
 */
export class MapManager {
    constructor() {
        this.map = null;
        this.tileLayer = null;
        this.currentTheme = 'light';
        this.resizeObserver = null;
    }

    init() {
        this.map = L.map('map', {
            center: CONFIG.defaultCenter,
            zoom: CONFIG.defaultZoom,
            zoomControl: true,
        });

        // Bolt Optimization: Use ResizeObserver to automatically handle map resizing
        // This is more efficient than window.resize listeners and manual timeouts
        const mapContainer = document.getElementById('map');
        if (mapContainer && window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                if (this.map) {
                    this.map.invalidateSize();
                }
            });
            this.resizeObserver.observe(mapContainer);
        }

        this.setTheme(document.documentElement.getAttribute('data-theme') || 'light');
        return this.map;
    }

    setTheme(theme) {
        this.currentTheme = theme;
        const tileUrl = theme === 'dark' ? CONFIG.mapTilesDark : CONFIG.mapTiles;

        if (this.tileLayer) this.map.removeLayer(this.tileLayer);

        this.tileLayer = L.tileLayer(tileUrl, {
            attribution: '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/copyright">OSM</a>',
            maxZoom: 18,
            subdomains: 'abcd',
        });
        this.tileLayer.addTo(this.map);
    }

    setView(lat, lng, zoom = CONFIG.circuitZoom) {
        if (this.map) this.map.setView([lat, lng], zoom);
    }
}
