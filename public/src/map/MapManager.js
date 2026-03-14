import { CONFIG } from '../config.js';

/**
 * Manages the Leaflet map instance, tile layers, and theme switching.
 */
export class MapManager {
    constructor() {
        this.map = null;
        this.tileLayer = null;
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
        // TODO: This ResizeObserver implementation requires further investigation and confirmation.
        // The current code creates a ResizeObserver instance and begins observing the map container,
        // but there is no corresponding cleanup mechanism to disconnect the observer when the
        // MapManager is destroyed or when the map is no longer needed. This could lead to a memory
        // leak where the observer continues to hold references to DOM elements even after they have
        // been removed from the document. Additionally, if the MapManager is re-initialized (for
        // example, during a hot reload in development), a new observer would be created while the
        // old one continues running, compounding the memory issue. A destroy() or cleanup() method
        // should be added to the MapManager class that calls this.resizeObserver.disconnect() when
        // the map is being torn down, ensuring proper cleanup of resources.
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
        const tileUrl = theme === 'dark' ? CONFIG.mapTilesDark : CONFIG.mapTiles;

        if (this.tileLayer) this.map.removeLayer(this.tileLayer);

        this.tileLayer = L.tileLayer(tileUrl, {
            attribution: '© <a href="https://carto.com/" target="_blank" rel="noopener noreferrer">CARTO</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OSM</a>',
            maxZoom: 18,
            subdomains: 'abcd',
        });
        this.tileLayer.addTo(this.map);
    }

    setView(lat, lng, zoom = CONFIG.circuitZoom) {
        if (this.map) this.map.setView([lat, lng], zoom);
    }
}
