import { CONFIG } from '../config.js';
import { i18n } from '../i18n/index.js';

const SOURCE_ID = 'weather-alerts-source';
const FILL_LAYER_ID = 'weather-alerts-fill';
const LINE_LAYER_ID = 'weather-alerts-line';
// Warning areas often overlap, so keep the fill faint; the outline carries the colour
const ALERT_FILL_OPACITY = 0.02;

// CAP severity → colour (shared by the map polygons and the list badges)
export const SEVERITY_COLOURS = Object.freeze({
    extreme: '#9b1c9b',
    severe: '#d7263d',
    moderate: '#f28c28',
    minor: '#e8c547',
    unknown: '#7d8597',
});

const SEVERITY_ORDER = ['extreme', 'severe', 'moderate', 'minor', 'unknown'];

const SEVERITY_LABEL_KEYS = Object.freeze({
    extreme: 'alerts.severityExtreme',
    severe: 'alerts.severitySevere',
    moderate: 'alerts.severityModerate',
    minor: 'alerts.severityMinor',
    unknown: 'alerts.severityUnknown',
});

/**
 * Official weather warnings (WMO CAP feeds via LibreWXR) around the selected
 * circuit: drawn as polygons on the map and listed in the sidebar.
 *
 * All alert text comes from third-party feeds, so it is only ever written with
 * textContent — never as HTML.
 */
export class WeatherAlerts {
    /**
     * @param {Object} map - Mapbox GL or Leaflet map
     * @param {Object} [options]
     * @param {boolean} [options.enabled=true]
     */
    constructor(map, options = {}) {
        this.map = map;
        this.isMapbox = map ? !map.hasLayer : false;
        this.enabled = options.enabled !== false;
        this.location = null;
        this.alerts = null;
        this.leafletLayer = null;
        this.hasMapboxLayers = false;
        this.refreshTimer = null;
        this.requestId = 0;

        this.ui = {
            section: document.getElementById('alertsSection'),
            list: document.getElementById('alertsList'),
        };

        this.handleMapClick = this.handleMapClick.bind(this);
        this.handleLanguageChange = () => this.renderList();
        document.addEventListener('i18n:change', this.handleLanguageChange);
    }

    setEnabled(enabled) {
        if (this.enabled === enabled) return;
        this.enabled = enabled;
        if (enabled) {
            this.refresh();
        } else {
            this.stopRefresh();
            this.render();
        }
    }

    /**
     * @param {number|null} lat
     * @param {number|null} lon - Pass nulls to clear the alerts
     */
    setLocation(lat, lon) {
        this.location = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
        this.alerts = null;
        this.render();
        this.refresh();
    }

    async refresh() {
        this.stopRefresh();
        if (!this.enabled || !this.location) return;

        const requestId = ++this.requestId;
        const { lat, lon } = this.location;
        const alerts = await WeatherAlerts.fetchAlerts(lat, lon);

        // A newer location or toggle may have superseded this request
        if (requestId !== this.requestId || !this.enabled) return;

        // Keep showing the previous alerts if a refresh fails
        if (alerts) this.alerts = alerts;
        this.render();
        this.refreshTimer = setTimeout(() => this.refresh(), CONFIG.ALERTS_REFRESH_INTERVAL_MS);
    }

    stopRefresh() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    /**
     * @returns {Promise<Array|null>} Alert features sorted by severity, or null on failure
     */
    static async fetchAlerts(lat, lon) {
        try {
            const params = new URLSearchParams({ lat: lat.toFixed(2), lon: lon.toFixed(2) });
            const response = await fetch(`${CONFIG.alertsApi}?${params}`, {
                signal: AbortSignal.timeout(8000)
            });
            if (!response.ok) return null;
            const data = await response.json();
            const features = Array.isArray(data?.features) ? data.features : [];
            return features
                .filter(feature => feature?.geometry && feature.properties?.title)
                .sort((a, b) => WeatherAlerts.severityRank(a) - WeatherAlerts.severityRank(b));
        } catch (error) {
            console.error('Failed to fetch weather alerts:', error);
            return null;
        }
    }

    static severityRank(feature) {
        const rank = SEVERITY_ORDER.indexOf(feature.properties.severity);
        return rank === -1 ? SEVERITY_ORDER.length : rank;
    }

    static severityOf(feature) {
        const severity = feature.properties.severity;
        return SEVERITY_COLOURS[severity] ? severity : 'unknown';
    }

    get visibleAlerts() {
        return this.enabled && this.location && this.alerts ? this.alerts : [];
    }

    render() {
        this.renderMap();
        this.renderList();
    }

    /** Mapbox style changes wipe custom layers, so re-add ours. */
    updateTheme() {
        if (this.isMapbox) this.renderMap();
    }

    destroy() {
        this.stopRefresh();
        this.requestId++;
        document.removeEventListener('i18n:change', this.handleLanguageChange);
        this.removeMapLayers();
    }

    // --- Map -------------------------------------------------------------

    renderMap() {
        this.removeMapLayers();
        const alerts = this.visibleAlerts;
        if (!this.map || alerts.length === 0) return;

        const collection = { type: 'FeatureCollection', features: alerts };
        if (this.isMapbox) {
            this.addMapboxLayers(collection);
        } else {
            this.addLeafletLayer(collection);
        }
    }

    addMapboxLayers(collection) {
        const colour = ['match', ['get', 'severity'],
            ...Object.entries(SEVERITY_COLOURS).flat(),
            SEVERITY_COLOURS.unknown];
        const beforeId = this.map.getLayer('range-circles-line') ? 'range-circles-line' : undefined;

        this.map.addSource(SOURCE_ID, { type: 'geojson', data: collection });
        this.map.addLayer({
            id: FILL_LAYER_ID,
            type: 'fill',
            source: SOURCE_ID,
            paint: { 'fill-color': colour, 'fill-opacity': ALERT_FILL_OPACITY }
        }, beforeId);
        this.map.addLayer({
            id: LINE_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            paint: { 'line-color': colour, 'line-width': 1.5, 'line-opacity': 0.8 }
        }, beforeId);
        this.map.on('click', FILL_LAYER_ID, this.handleMapClick);
        this.hasMapboxLayers = true;
    }

    addLeafletLayer(collection) {
        this.leafletLayer = L.geoJSON(collection, {
            style: (feature) => {
                const colour = SEVERITY_COLOURS[WeatherAlerts.severityOf(feature)];
                return { color: colour, weight: 1.5, opacity: 0.8, fillColor: colour, fillOpacity: ALERT_FILL_OPACITY };
            },
            onEachFeature: (feature, layer) => {
                layer.bindPopup(() => this.createPopupContent(feature));
            }
        });
        this.leafletLayer.addTo(this.map);
        // Keep warnings beneath the track line and range circles
        this.leafletLayer.bringToBack();
    }

    handleMapClick(event) {
        const feature = event.features?.[0];
        if (!feature || typeof mapboxgl === 'undefined') return;
        new mapboxgl.Popup({ maxWidth: '280px' })
            .setLngLat(event.lngLat)
            .setDOMContent(this.createPopupContent(feature))
            .addTo(this.map);
    }

    removeMapLayers() {
        if (!this.map) return;
        if (this.isMapbox) {
            if (!this.hasMapboxLayers) return;
            this.hasMapboxLayers = false;
            this.map.off('click', FILL_LAYER_ID, this.handleMapClick);
            if (this.map.getLayer(FILL_LAYER_ID)) this.map.removeLayer(FILL_LAYER_ID);
            if (this.map.getLayer(LINE_LAYER_ID)) this.map.removeLayer(LINE_LAYER_ID);
            if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
        } else if (this.leafletLayer) {
            this.map.removeLayer(this.leafletLayer);
            this.leafletLayer = null;
        }
    }

    createPopupContent(feature) {
        const container = document.createElement('div');
        container.className = 'alert-popup';
        container.appendChild(this.createAlertSummary(feature, 'strong'));
        return container;
    }

    // --- Sidebar list ----------------------------------------------------

    renderList() {
        const { section, list } = this.ui;
        if (!section || !list) return;

        const alerts = this.visibleAlerts;
        list.textContent = '';
        section.hidden = alerts.length === 0;

        alerts.forEach(feature => {
            const item = document.createElement('li');
            item.className = 'alert-item';
            item.appendChild(this.createAlertSummary(feature, 'h3'));

            const description = feature.properties.description;
            if (description) {
                const details = document.createElement('details');
                const summary = document.createElement('summary');
                summary.textContent = i18n.t('alerts.details');
                const text = document.createElement('p');
                text.className = 'alert-description';
                text.textContent = description;
                details.append(summary, text);
                item.appendChild(details);
            }

            list.appendChild(item);
        });
    }

    /**
     * Severity badge, title, area, validity and source link for one alert.
     * @param {Object} feature
     * @param {string} titleTag - Element used for the title
     */
    createAlertSummary(feature, titleTag) {
        const { title, regions, expires, uri } = feature.properties;
        const severity = WeatherAlerts.severityOf(feature);
        const fragment = document.createDocumentFragment();

        const badge = document.createElement('span');
        badge.className = `alert-severity alert-severity--${severity}`;
        badge.textContent = i18n.t(SEVERITY_LABEL_KEYS[severity]);
        fragment.appendChild(badge);

        const heading = document.createElement(titleTag);
        heading.className = 'alert-title';
        heading.textContent = title;
        fragment.appendChild(heading);

        if (regions) {
            const area = document.createElement('p');
            area.className = 'alert-regions';
            area.textContent = regions;
            fragment.appendChild(area);
        }

        const expiryDate = expires ? new Date(expires) : null;
        if (expiryDate && !Number.isNaN(expiryDate.getTime())) {
            const until = document.createElement('p');
            until.className = 'alert-until';
            const time = document.createElement('time');
            time.setAttribute('datetime', expiryDate.toISOString());
            time.textContent = new Intl.DateTimeFormat(i18n.locale, {
                weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
            }).format(expiryDate);
            until.append(`${i18n.t('alerts.until')} `, time);
            fragment.appendChild(until);
        }

        if (WeatherAlerts.isSafeLink(uri)) {
            const link = document.createElement('a');
            link.className = 'alert-link';
            link.href = uri;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = i18n.t('alerts.source');
            fragment.appendChild(link);
        }

        return fragment;
    }

    // SEC: The worker already restricts links to http(s); re-check before use.
    static isSafeLink(uri) {
        if (typeof uri !== 'string' || !uri) return false;
        try {
            const { protocol } = new URL(uri);
            return protocol === 'https:' || protocol === 'http:';
        } catch {
            return false;
        }
    }
}
