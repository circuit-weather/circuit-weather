import { CIRCUIT_MAP, CONFIG } from '../config.js';

export class TrackLayer {
    constructor(map) {
        this.map = map;
        this.layer = null;
        this.currentCircuitId = null;
        this.cache = new Map();
        // circuitId → [lat, lng] centre derived from the track geometry's bounds.
        // Used to place the map when the schedule has no coordinates (OpenF1 fallback).
        this.centerCache = new Map();
        // Bolt Optimization: Cache track color to avoid getComputedStyle thrashing
        this.trackColor = this.resolveTrackColor();
        this.currentWeight = null;
        this.appliedTrackColor = null;
        this.bindEvents();
    }

    bindEvents() {
        if (this.map.on) {
            const isMapbox = !this.map.hasLayer;
            if (isMapbox) {
                // Bolt Optimization: Throttled move updates to prevent main thread lag
                let rafId = null;
                this.map.on('move', () => {
                    if (rafId) return;
                    rafId = requestAnimationFrame(() => {
                        this.updateStyle();
                        rafId = null;
                    });
                });
            } else {
                this.map.on('moveend', () => this.updateStyle());
            }
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

        // Bolt Optimization: Skip redundant style updates
        if (this.currentWeight === weight && this.appliedTrackColor === this.trackColor) {
            return;
        }

        this.currentWeight = weight;
        this.appliedTrackColor = this.trackColor;

        // Use cached color
        if (isMapbox && this.currentCircuitId) {
            const layerId = `track-layer-${this.currentCircuitId}`;
            if (this.map.getLayer(layerId)) {
                this.map.setPaintProperty(layerId, 'line-width', weight);
                this.map.setPaintProperty(layerId, 'line-color', this.trackColor);
            } else {
                // Layer missing (likely due to Mapbox style change).
                // Re-load from cache to re-add source and layer to the new style.
                this.loadTrack(this.currentCircuitId);
            }
        } else if (this.layer) {
            this.layer.setStyle({ weight: weight, color: this.trackColor });
        }
    }

    /**
     * Compute the centre of a track GeoJSON from its coordinate bounds.
     * Returns [lat, lng] (GeoJSON stores [lng, lat]) or null if it has no coords.
     */
    static computeCenter(geojson) {
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        const visit = (coords) => {
            if (typeof coords[0] === 'number') {
                const [lng, lat] = coords;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
            } else {
                for (const c of coords) visit(c);
            }
        };
        const features = geojson?.type === 'FeatureCollection' ? geojson.features
            : geojson?.type === 'Feature' ? [geojson]
            : [];
        for (const f of features) {
            if (f?.geometry?.coordinates) visit(f.geometry.coordinates);
        }
        if (minLat === Infinity) return null;
        return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
    }

    /**
     * Load a circuit's track overlay.
     * Returns the geometry's [lat, lng] centre (or null) so callers can place the
     * map when the schedule itself carries no coordinates.
     */
    async loadTrack(circuitId) {
        this.clear();
        this.currentCircuitId = circuitId;

        const geoJsonId = CIRCUIT_MAP[circuitId];
        if (!geoJsonId) {
            return null;
        }

        try {
            const isMapbox = !this.map.hasLayer;

            // Check cache first
            if (this.cache.has(circuitId)) {
                // Check if this is still the requested circuit
                if (this.currentCircuitId !== circuitId) return null;

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
                return this.centerCache.get(circuitId) ?? null;
            }

            let url;
            if (CONFIG.trackApi.startsWith('/')) {
                // Worker proxy (no extension)
                url = `${CONFIG.trackApi}/${geoJsonId}`;
            } else {
                // Direct GitHub (needs extension)
                url = `${CONFIG.trackApi}/${geoJsonId}.geojson`;
            }

            const response = await fetch(url, {
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) throw new Error(`Track fetch failed: ${response.status}`);

            // Check if this is still the requested circuit
            if (this.currentCircuitId !== circuitId) return null;

            const data = await response.json();

            // Double check before rendering
            if (this.currentCircuitId !== circuitId) return null;

            const center = TrackLayer.computeCenter(data);
            if (center) this.centerCache.set(circuitId, center);

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

            return center;

        } catch (error) {
            console.warn('Failed to load track layout:', error);
            return null;
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
        this.currentWeight = null;
        this.appliedTrackColor = null;
    }
}
