import { CONFIG } from '../config.js';
import { i18n } from '../i18n/index.js';

/**
 * Control to recentre the map on the current circuit.
 */
export class RecentreControl {
    constructor(map) {
        this.map = map;
        this.circuitCenter = null;
        this.circuitZoom = CONFIG.circuitZoom;
        this.button = null;
        this.init();
    }

    init() {
        // Find the zoom control container. For both Leaflet and the custom Mapbox zoom
        // control (MapManager.createMapboxZoomControl), the container has .leaflet-control-zoom.
        const zoomControl = document.querySelector('.leaflet-control-zoom');
        if (!zoomControl) return;

        const recenterLabel = i18n.t('map.recenterOnCircuit');

        // Always use a <button> and the shared recentre CSS class regardless of map renderer.
        // The custom Mapbox zoom control uses the same class names as Leaflet, so styling is unified.
        this.button = document.createElement('button');
        this.button.className = 'leaflet-control-zoom-recentre';
        this.button.setAttribute('type', 'button');

        this.button.title = `${recenterLabel} (C)`;
        this.button.setAttribute('role', 'button');
        this.button.setAttribute('aria-label', recenterLabel);
        this.button.setAttribute('aria-keyshortcuts', 'c');
        this.button.innerHTML = `
            <svg class="recentre-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 20px; height: 20px;">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
            </svg>
        `;
        this.button.style.display = 'none';

        // Insert at the top of the zoom control (before zoom in)
        zoomControl.insertBefore(this.button, zoomControl.firstChild);

        // Prevent map click propagation (if Leaflet is available)
        if (typeof L !== 'undefined' && L.DomEvent) {
            L.DomEvent.disableClickPropagation(this.button);
        }

        const isMapbox = !this.map.hasLayer;

        const triggerRecentre = () => {
            if (this.circuitCenter) {
                if (isMapbox) {
                    this.map.flyTo({
                        center: [this.circuitCenter[1], this.circuitCenter[0]],
                        zoom: this.circuitZoom - 1
                    });
                } else {
                    this.map.setView(this.circuitCenter, this.circuitZoom);
                }
            }
        };

        this.button.addEventListener('click', (e) => {
            e.preventDefault();
            triggerRecentre();
        });

        // Palette A11y: Ensure keyboard users can activate the anchor functioning as a button
        this.button.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                e.stopPropagation(); // Prevent radar playback conflict
                triggerRecentre();
            }
        });

        // Global shortcut: C to recentre
        document.addEventListener('keydown', (e) => {
            if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                // Check if we are focusing an input
                const tag = document.activeElement.tagName.toLowerCase();
                if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

                triggerRecentre();
            }
        });

        // Show/hide based on map movement
        this.map.on('moveend', () => this.updateVisibility());
    }

    setCircuit(center, zoom = CONFIG.circuitZoom) {
        this.circuitCenter = center;
        this.circuitZoom = zoom;
        this.updateVisibility();
    }

    updateVisibility() {
        if (!this.circuitCenter || !this.map || !this.button) {
            if (this.button) this.button.style.display = 'none';
            return;
        }

        const isMapbox = !this.map.hasLayer;
        let dist;

        if (isMapbox) {
            const center = this.map.getCenter();
            // Mapbox center is {lng, lat}
            const R = 6371e3; // metres
            const lat1 = center.lat * Math.PI/180;
            const lat2 = this.circuitCenter[0] * Math.PI/180;
            const deltaLat = (this.circuitCenter[0] - center.lat) * Math.PI/180;
            const deltaLng = (this.circuitCenter[1] - center.lng) * Math.PI/180;

            const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                      Math.cos(lat1) * Math.cos(lat2) *
                      Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            dist = R * c;
        } else {
            const mapCenter = this.map.getCenter();
            dist = this.map.distance(mapCenter, L.latLng(this.circuitCenter));
        }

        // Show button if more than 5km from circuit center
        this.button.style.display = dist > 5000 ? 'flex' : 'none';
    }
}
