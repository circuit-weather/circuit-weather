import { CONFIG } from '../config.js';

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
        // Find the zoom control container
        const zoomControl = document.querySelector('.leaflet-control-zoom');
        if (!zoomControl) return;

        // Create the recentre button as an anchor like zoom buttons
        this.button = document.createElement('a');
        this.button.className = 'leaflet-control-zoom-recentre';
        this.button.href = '#';
        this.button.title = 'Recentre on circuit (C)';
        this.button.setAttribute('role', 'button');
        this.button.setAttribute('aria-label', 'Recentre on circuit');
        this.button.setAttribute('aria-keyshortcuts', 'c');
        this.button.innerHTML = `
            <svg class="recentre-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
            </svg>
        `;
        this.button.style.display = 'none';

        // Insert at the top of the zoom control (before zoom in)
        zoomControl.insertBefore(this.button, zoomControl.firstChild);

        // Prevent map click propagation
        L.DomEvent.disableClickPropagation(this.button);

        this.button.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.circuitCenter) {
                this.map.setView(this.circuitCenter, this.circuitZoom);
            }
        });

        // Palette A11y: Ensure keyboard users can activate the anchor functioning as a button
        this.button.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                e.stopPropagation(); // Prevent radar playback conflict
                if (this.circuitCenter) {
                    this.map.setView(this.circuitCenter, this.circuitZoom);
                }
            }
        });

        // Global shortcut: C to recentre
        document.addEventListener('keydown', (e) => {
            if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                // Check if we are focusing an input
                const tag = document.activeElement.tagName.toLowerCase();
                if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

                if (this.circuitCenter) {
                    this.map.setView(this.circuitCenter, this.circuitZoom);
                }
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
        const mapCenter = this.map.getCenter();
        const dist = this.map.distance(mapCenter, L.latLng(this.circuitCenter));
        // Show button if more than 5km from circuit center
        this.button.style.display = dist > 5000 ? 'flex' : 'none';
    }
}
