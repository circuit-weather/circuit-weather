import { CIRCUIT_MAP, CONFIG } from '../config.js';

export class TrackLayer {
    constructor(map) {
        this.map = map;
        this.layer = null;
        this.currentCircuitId = null;
        this.cache = new Map();
        // Bolt Optimization: Cache track color to avoid getComputedStyle thrashing
        this.trackColor = this.resolveTrackColor();
        this.bindEvents();
    }

    bindEvents() {
        if (this.map.on) {
            this.map.on(this.map.getContainer ? 'zoomend' : 'zoomend', () => this.updateStyle());
        }
    }

    resolveTrackColor() {
        const style = getComputedStyle(document.documentElement);
        const color = style.getPropertyValue('--color-range-circle').trim();
        if (color) return color;

        // Fallback if CSS variables are not yet loaded (e.g. during early init)
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return isDark ? '#ff6b5b' : '#e10600';
    }

    updateTheme() {
        this.trackColor = this.resolveTrackColor();
        this.updateStyle();
    }

    updateStyle() {
        if (!this.layer && !this.currentCircuitId) return;

        const isMapbox = !this.map.hasLayer;
        const zoom = this.map.getZoom();
        let weight = 4;

        if (zoom >= 12) weight = 5;
        else if (zoom >= 10) weight = 4;
        else if (zoom >= 8) weight = 2;
        else weight = 1;

        // Use cached color
        if (isMapbox && this.currentCircuitId) {
            const layerId = `track-layer-${this.currentCircuitId}`;
            if (this.map.getLayer(layerId)) {
                this.map.setPaintProperty(layerId, 'line-width', weight);
                this.map.setPaintProperty(layerId, 'line-color', this.trackColor);
            }
        } else if (this.layer) {
            this.layer.setStyle({ weight: weight, color: this.trackColor });
        }
    }

    async loadTrack(circuitId) {
        this.clear();
        this.currentCircuitId = circuitId;

        const geoJsonId = CIRCUIT_MAP[circuitId];
        if (!geoJsonId) {
            return;
        }

        try {
            const isMapbox = !this.map.hasLayer;

            // Check cache first
            if (this.cache.has(circuitId)) {
                // Check if this is still the requested circuit
                if (this.currentCircuitId !== circuitId) return;

                if (isMapbox) {
                    const sourceId = `track-source-${circuitId}`;
                    const layerId = `track-layer-${circuitId}`;

                    if (!this.map.getSource(sourceId)) {
                        this.map.addSource(sourceId, {
                            type: 'geojson',
                            data: this.cache.get(circuitId)
                        });
                    }

                    if (!this.map.getLayer(layerId)) {
                        this.map.addLayer({
                            id: layerId,
                            type: 'line',
                            source: sourceId,
                            layout: {
                                'line-join': 'round',
                                'line-cap': 'round'
                            },
                            paint: {
                                'line-color': this.trackColor,
                                'line-width': 4,
                                'line-opacity': 0.8
                            }
                        });
                    }
                } else {
                    this.layer = this.cache.get(circuitId);
                    if (!this.map.hasLayer(this.layer)) {
                        this.layer.addTo(this.map);
                    }
                    this.layer.bringToBack();
                }

                this.updateStyle();
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

            const trackColor = this.trackColor;

            if (isMapbox) {
                // Cache raw GeoJSON for Mapbox
                this.cache.set(circuitId, data);

                const sourceId = `track-source-${circuitId}`;
                const layerId = `track-layer-${circuitId}`;

                if (!this.map.getSource(sourceId)) {
                    this.map.addSource(sourceId, {
                        type: 'geojson',
                        data: data
                    });
                }

                if (!this.map.getLayer(layerId)) {
                    this.map.addLayer({
                        id: layerId,
                        type: 'line',
                        source: sourceId,
                        layout: {
                            'line-join': 'round',
                            'line-cap': 'round'
                        },
                        paint: {
                            'line-color': trackColor,
                            'line-width': 4,
                            'line-opacity': 0.8
                        }
                    });
                }
            } else {
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

                // Cache the created Leaflet layer
                this.cache.set(circuitId, this.layer);

                this.layer.addTo(this.map);
                this.layer.bringToBack();
            }

            // Apply correct weight for current zoom
            this.updateStyle();

        } catch (error) {
            console.warn('Failed to load track layout:', error);
        }
    }

    clear() {
        const isMapbox = !this.map.hasLayer;

        if (isMapbox) {
            if (this.currentCircuitId) {
                const layerId = `track-layer-${this.currentCircuitId}`;
                if (this.map.getLayer(layerId)) {
                    this.map.removeLayer(layerId);
                }
                // We keep the source attached or cached for performance, but the layer is hidden
            }
        } else {
            if (this.layer) {
                this.map.removeLayer(this.layer);
                this.layer = null;
            }
        }

        this.currentCircuitId = null;
    }
}
