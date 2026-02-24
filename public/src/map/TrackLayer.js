import { CIRCUIT_MAP, CONFIG } from '../config.js';

export class TrackLayer {
    constructor(map) {
        this.map = map;
        this.layer = null;
        this.currentCircuitId = null;
        this.cache = new Map();
        this.bindEvents();
    }

    bindEvents() {
        this.map.on('zoomend', () => this.updateStyle());
    }

    getTrackColor() {
        const style = getComputedStyle(document.documentElement);
        const color = style.getPropertyValue('--color-range-circle').trim();
        if (color) return color;

        // Fallback if CSS variables are not yet loaded (e.g. during early init)
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return isDark ? '#ff6b5b' : '#e10600';
    }

    updateStyle() {
        if (!this.layer) return;

        const zoom = this.map.getZoom();
        let weight = 4;

        if (zoom >= 12) weight = 5;
        else if (zoom >= 10) weight = 4;
        else if (zoom >= 8) weight = 2;
        else weight = 1;

        const trackColor = this.getTrackColor();
        this.layer.setStyle({ weight: weight, color: trackColor });
    }

    async loadTrack(circuitId) {
        this.clear();
        this.currentCircuitId = circuitId;

        const geoJsonId = CIRCUIT_MAP[circuitId];
        if (!geoJsonId) {
            console.log(`No track map found for circuit: ${circuitId}`);
            return;
        }

        try {
            // Check cache first (Bolt Optimization: Cache L.geoJSON layer instead of raw data)
            if (this.cache.has(circuitId)) {
                this.layer = this.cache.get(circuitId);

                // Check if this is still the requested circuit
                if (this.currentCircuitId !== circuitId) return;

                if (!this.map.hasLayer(this.layer)) {
                    this.layer.addTo(this.map);
                }

                this.updateStyle();
                this.layer.bringToBack();
                return;
            }

            let url;
            if (CONFIG.trackApi.startsWith('/')) {
                // Worker proxy (no extension)
                url = `${CONFIG.trackApi}/${geoJsonId}`;
            } else {
                // Direct GitHub (needs extension)
                url = `${CONFIG.trackApi}/${geoJsonId}.geojson`;
            }

            const response = await fetch(url);

            if (!response.ok) throw new Error(`Track fetch failed: ${response.status}`);

            // Check if this is still the requested circuit
            if (this.currentCircuitId !== circuitId) return;

            const data = await response.json();

            // Double check before rendering
            if (this.currentCircuitId !== circuitId) return;

            const trackColor = this.getTrackColor();
            this.layer = L.geoJSON(data, {
                style: {
                    interactive: false,
                    color: trackColor,
                    weight: 4, // Initial, will be updated immediately
                    opacity: 0.8,
                    fillOpacity: 0,
                    lineCap: 'round',
                    lineJoin: 'round',
                    className: 'track-path'
                }
            });

            // Cache the created layer
            this.cache.set(circuitId, this.layer);

            this.layer.addTo(this.map);

            // Apply correct weight for current zoom
            this.updateStyle();

            // Ensure track is below other overlays (like the center dot)
            this.layer.bringToBack();

        } catch (error) {
            console.warn('Failed to load track layout:', error);
        }
    }

    clear() {
        if (this.layer) {
            this.map.removeLayer(this.layer);
            this.layer = null;
        }
        this.currentCircuitId = null;
    }
}
