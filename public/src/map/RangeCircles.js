import { SafeStorage } from '../utils/storage.js';
import { usesImperialUnits } from '../utils/locale.js';
import { i18n } from '../i18n/index.js';

export class RangeCircles {
    constructor(map) {
        this.map = map;
        this.circles = [];
        this.labels = [];
        this.unit = this.getInitialUnit();
        this.center = null;
        this.currentSteps = null;
        this.centerMarker = null;
        // Bolt Optimization: Cache range color to avoid getComputedStyle thrashing
        this.rangeColor = this.resolveRangeColor();
        this.bindEvents();
        this.updateToggleUI();
    }

    getInitialUnit() {
        const stored = SafeStorage.getItem('unit');
        // SEC: Validate stored unit to prevent application logic bypass or unexpected behavior via poisoned localStorage
        if (stored === 'metric' || stored === 'imperial') return stored;
        return usesImperialUnits() ? 'imperial' : 'metric';
    }

    bindEvents() {
        const toggle = document.getElementById('unitToggle');
        if (toggle) {
            toggle.addEventListener('click', (e) => {
                const option = e.target.closest('.unit-option');
                if (option) this.setUnit(option.dataset.unit);
            });
        }

        // Adjust visible circles based on zoom and map movement
        if (this.map.on) {
            const isMapbox = !this.map.hasLayer;
            if (isMapbox) {
                // Bolt Optimization: Throttled move updates to prevent main thread lag
                let rafId = null;
                this.map.on('move', () => {
                    if (rafId) return;
                    rafId = requestAnimationFrame(() => {
                        this.updateVisibility();
                        rafId = null;
                    });
                });
            } else {
                this.map.on('moveend', () => this.updateVisibility());
            }
        }
    }

    setUnit(unit) {
        this.unit = unit;
        SafeStorage.setItem('unit', unit);
        this.updateToggleUI();
        if (this.center) this.draw(this.center);
    }

    updateToggleUI() {
        const metricLabel = i18n.t('controls.metricLabel');
        const imperialLabel = i18n.t('controls.imperialLabel');

        document.querySelectorAll('.unit-option').forEach(opt => {
            const isActive = opt.dataset.unit === this.unit;
            opt.classList.toggle('active', isActive);
            opt.setAttribute('aria-pressed', isActive);

            if (opt.dataset.unit === 'metric') {
                opt.setAttribute('aria-label', metricLabel);
                opt.setAttribute('title', metricLabel);
            } else if (opt.dataset.unit === 'imperial') {
                opt.setAttribute('aria-label', imperialLabel);
                opt.setAttribute('title', imperialLabel);
            }
        });
    }

    resolveRangeColor() {
        const style = getComputedStyle(document.documentElement);
        const color = style.getPropertyValue('--color-range-circle').trim();
        if (color) return color;

        // Fallback if CSS variables are not yet loaded (e.g. during early init)
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return isDark ? '#ff6b5b' : '#e10600';
    }

    updateTheme() {
        this.rangeColor = this.resolveRangeColor();
    }

    draw(center) {
        // Check if material state has changed
        const centerChanged = !this.center || this.center[0] !== center[0] || this.center[1] !== center[1];
        const unitChanged = this.unit !== this.currentUnit;

        const steps = this.calculateSteps(center);
        const stepsChanged = !this.currentSteps || JSON.stringify(steps) !== JSON.stringify(this.currentSteps);

        const rangeColor = this.rangeColor;
        const colorChanged = this.currentColor !== rangeColor;

        // Optimization: Only redraw if nothing material has changed
        if (!centerChanged && !stepsChanged && !unitChanged && !colorChanged) {
            return;
        }

        this.center = [...center];
        this.currentSteps = steps;
        this.currentUnit = this.unit;
        this.currentColor = rangeColor;

        const isMapbox = !this.map.hasLayer; // Basic check to see if it's Leaflet or Mapbox

        if (isMapbox) {
            this.drawMapbox(center, steps, rangeColor);
        } else {
            this.drawLeaflet(center, steps, rangeColor);
        }
    }

    drawLeaflet(center, steps, rangeColor) {
        const multiplier = this.unit === 'metric' ? 1000 : 1609.34;

        steps.forEach((distance, index) => {
            const radius = distance * multiplier;

            // 1. Rings
            if (this.circles[index]) {
                const circle = this.circles[index];
                circle.setLatLng(center);
                circle.setRadius(radius);
                circle.setStyle({
                    color: rangeColor,
                    weight: index === 0 ? 2 : 1,
                    dashArray: index > 0 ? '4, 4' : null
                });
                if (!this.map.hasLayer(circle)) circle.addTo(this.map);
                circle.bringToFront();
            } else {
                const circle = L.circle(center, {
                    interactive: false,
                    radius: radius,
                    color: rangeColor,
                    fillColor: 'transparent',
                    fillOpacity: 0,
                    weight: index === 0 ? 2 : 1,
                    dashArray: index > 0 ? '4, 4' : null,
                    opacity: 0.7,
                });
                circle.addTo(this.map);
                circle.bringToFront();
                this.circles.push(circle);
            }

            // 2. Labels
            const labelLatLng = this.getPointAtDistance(center, radius, 90);
            const html = `<span aria-hidden="true">${distance}</span>`;

            if (this.labels[index]) {
                const labelMarker = this.labels[index];
                labelMarker.setLatLng(labelLatLng);
                // Update icon content
                const newIcon = L.divIcon({
                    className: 'range-label',
                    html: html,
                    iconSize: [30, 12],
                    iconAnchor: [0, 6],
                });
                labelMarker.setIcon(newIcon);
                if (!this.map.hasLayer(labelMarker)) labelMarker.addTo(this.map);
                labelMarker.setZIndexOffset(1000);
            } else {
                const label = L.divIcon({
                    className: 'range-label',
                    html: html,
                    iconSize: [30, 12],
                    iconAnchor: [0, 6],
                });
                const labelMarker = L.marker(labelLatLng, { icon: label, interactive: false, keyboard: false });
                labelMarker.addTo(this.map);
                labelMarker.setZIndexOffset(1000);
                this.labels.push(labelMarker);
            }
        });

        // Cleanup extras
        while (this.circles.length > steps.length) {
            const c = this.circles.pop();
            this.map.removeLayer(c);
        }
        while (this.labels.length > steps.length) {
            const l = this.labels.pop();
            this.map.removeLayer(l);
        }

    }

    drawMapbox(center, steps, rangeColor) {
        const multiplier = this.unit === 'metric' ? 1000 : 1609.34;
        const features = [];

        // Rings & Labels
        steps.forEach((distance, index) => {
            const radius = distance * multiplier;
            // Generate circle polygon
            const circleCoords = this.generateCirclePolygon(center, radius, 64);

            features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: circleCoords
                },
                properties: {
                    isRing: true,
                    index: index
                }
            });

            // Label position (due East)
            const labelLatLng = this.getPointAtDistance(center, radius, 90);
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [labelLatLng[1], labelLatLng[0]]
                },
                properties: {
                    isLabel: true,
                    text: distance.toString()
                }
            });
        });

        const geojson = {
            type: 'FeatureCollection',
            features: features
        };

        if (this.map.getSource('range-circles')) {
            this.map.getSource('range-circles').setData(geojson);
        } else {
            this.map.addSource('range-circles', {
                type: 'geojson',
                data: geojson
            });

            // Rings
            this.map.addLayer({
                id: 'range-circles-line',
                type: 'line',
                source: 'range-circles',
                filter: ['==', 'isRing', true],
                paint: {
                    'line-color': rangeColor,
                    'line-width': ['match', ['get', 'index'], 0, 2, 1],
                    'line-opacity': 0.7,
                    'line-dasharray': ['match', ['get', 'index'], 0, [1], [4, 4]]
                }
            });

            // Labels
            this.map.addLayer({
                id: 'range-labels',
                type: 'symbol',
                source: 'range-circles',
                filter: ['==', 'isLabel', true],
                layout: {
                    'text-field': ['get', 'text'],
                    'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                    'text-size': 12,
                    'text-anchor': 'left',
                    'text-offset': [0.5, 0]
                },
                paint: {
                    'text-color': '#ffffff',
                    'text-halo-color': 'rgba(0,0,0,0.8)',
                    'text-halo-width': 2
                }
            });
        }

        // Always move to top to ensure visibility over radar
        if (this.map.getLayer('range-circles-line')) this.map.moveLayer('range-circles-line');
        if (this.map.getLayer('range-labels')) this.map.moveLayer('range-labels');
    }

    generateCirclePolygon(center, radius, points) {
        const coords = [];
        for (let i = 0; i <= points; i++) {
            const angle = (i * 360) / points;
            const point = this.getPointAtDistance(center, radius, angle);
            coords.push([point[1], point[0]]);
        }
        return coords;
    }

    calculateSteps(center) {
        const isMapbox = !this.map.hasLayer;
        let visibleRadiusMeters;

        if (isMapbox) {
            const bounds = this.map.getBounds();
            // Mapbox bounds: ne, sw
            const north = bounds.getNorth();
            // Haversine formula roughly equivalent
            const R = 6371e3; // metres
            const deltaLat = Math.abs(north - center[0]) * Math.PI/180;
            visibleRadiusMeters = R * deltaLat;
        } else {
            const bounds = this.map.getBounds();
            const north = bounds.getNorth();
            const topLatLng = L.latLng(north, center[1]);
            visibleRadiusMeters = this.map.distance(center, topLatLng);
        }

        // Convert to current unit
        const multiplier = this.unit === 'metric' ? 1000 : 1609.34;
        const visibleRadius = visibleRadiusMeters / multiplier;

        // Target around 3-4 rings
        const targetStep = visibleRadius / 4;

        // Find closest "nice" number
        // 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000...
        const magnitude = Math.pow(10, Math.floor(Math.log10(targetStep)));
        const normalized = targetStep / magnitude;

        let niceStep;
        if (normalized < 1.5) niceStep = 1 * magnitude;
        else if (normalized < 3.5) niceStep = 2 * magnitude; // or 2.5?
        else if (normalized < 7.5) niceStep = 5 * magnitude;
        else niceStep = 10 * magnitude;

        // Ensure strictly positive
        niceStep = Math.max(niceStep, 1);

        // Generate steps: 1x, 2x, 3x until out of view (or max 5 rings)
        const steps = [];
        for (let i = 1; i <= 5; i++) {
            const step = niceStep * i;
            // Only add if it's somewhat visible (radius < visibleRadius * 1.5 to allow corners)
            if (step > visibleRadius * 1.5) break;
            steps.push(step);
        }

        return steps;
    }

    getPointAtDistance(center, distance, bearing) {
        const R = 6371000; // Earth radius in meters
        const lat1 = center[0] * Math.PI / 180;
        const lng1 = center[1] * Math.PI / 180;
        const brng = bearing * Math.PI / 180;

        const lat2 = Math.asin(
            Math.sin(lat1) * Math.cos(distance / R) +
            Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng)
        );
        const lng2 = lng1 + Math.atan2(
            Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1),
            Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2)
        );

        return [lat2 * 180 / Math.PI, lng2 * 180 / Math.PI];
    }

    clear() {
        const isMapbox = !this.map.hasLayer;

        if (isMapbox) {
            if (this.map.getLayer('range-circles-line')) this.map.removeLayer('range-circles-line');
            if (this.map.getLayer('range-labels')) this.map.removeLayer('range-labels');
            if (this.map.getSource('range-circles')) this.map.removeSource('range-circles');
        } else {
            this.circles.forEach(c => this.map.removeLayer(c));
            this.labels.forEach(l => this.map.removeLayer(l));
        }

        this.circles = [];
        this.labels = [];
        this.centerMarker = null;
    }

    updateVisibility() {
        // Redraw circles with appropriate distances for current zoom
        if (this.center) {
            this.draw(this.center);
        }
    }
}
