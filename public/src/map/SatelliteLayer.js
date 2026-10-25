import { CONFIG } from '../config.js';

const SOURCE_ID = 'satellite-source';
const LAYER_ID = 'satellite-layer';

/**
 * Satellite cloud imagery (NOAA GMGSI via LibreWXR) drawn beneath the radar.
 *
 * Satellite frames are hourly, so the layer shows the latest frame rather than
 * animating with the 10-minute radar timeline. Works with Mapbox GL JS and Leaflet.
 */
export class SatelliteLayer {
    constructor(map) {
        this.map = map;
        this.isMapbox = map ? !map.hasLayer : false;
        this.enabled = false;
        this.frame = null;
        this.leafletLayer = null;
        this.hasMapboxLayer = false;
    }

    /**
     * @param {{ time: number, url: string } | null} frame - Latest satellite frame
     */
    setFrame(frame) {
        if (this.frame?.url === frame?.url) return;
        this.frame = frame;
        this.render();
    }

    setEnabled(enabled) {
        if (this.enabled === enabled) return;
        this.enabled = enabled;
        this.render();
    }

    /** Mapbox style changes wipe custom layers, so re-add ours. */
    updateTheme() {
        if (this.isMapbox) this.render();
    }

    destroy() {
        this.remove();
    }

    render() {
        this.remove();
        if (!this.enabled || !this.frame || !this.map) return;

        if (this.isMapbox) {
            this.addMapboxLayer();
        } else {
            this.leafletLayer = L.tileLayer(this.frame.url, {
                tileSize: 512,
                zoomOffset: -1,
                maxNativeZoom: CONFIG.SATELLITE_MAX_ZOOM + 1,
                minNativeZoom: 1,
                maxZoom: 18,
                opacity: CONFIG.satelliteOpacity,
                // Below the radar frames (zIndex 100+)
                zIndex: 50,
                updateWhenIdle: true,
                attribution: CONFIG.RADAR_ATTRIBUTION.librewxr,
            });
            this.leafletLayer.addTo(this.map);
        }
    }

    addMapboxLayer() {
        this.map.addSource(SOURCE_ID, {
            type: 'raster',
            tiles: [this.frame.url],
            tileSize: 512,
            minzoom: 1,
            maxzoom: CONFIG.SATELLITE_MAX_ZOOM,
            attribution: CONFIG.RADAR_ATTRIBUTION.librewxr,
        });
        this.map.addLayer({
            id: LAYER_ID,
            type: 'raster',
            source: SOURCE_ID,
            paint: {
                'raster-opacity': CONFIG.satelliteOpacity,
                'raster-fade-duration': 0
            }
        }, this.findBeforeId());
        this.hasMapboxLayer = true;
    }

    // Insert below the lowest radar frame so precipitation stays on top.
    findBeforeId() {
        const layers = this.map.getStyle?.()?.layers || [];
        const radar = layers.find(layer => layer.id.startsWith('radar-layer-'));
        if (radar) return radar.id;
        return this.map.getLayer('range-circles-line') ? 'range-circles-line' : undefined;
    }

    remove() {
        if (!this.map) return;
        if (this.isMapbox) {
            if (!this.hasMapboxLayer) return;
            this.hasMapboxLayer = false;
            if (this.map.getLayer(LAYER_ID)) this.map.removeLayer(LAYER_ID);
            if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
        } else if (this.leafletLayer) {
            this.map.removeLayer(this.leafletLayer);
            this.leafletLayer = null;
        }
    }
}
