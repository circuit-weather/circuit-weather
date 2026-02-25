import { SafeStorage } from '../utils/storage.js';

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
        if (stored) return stored;
        // Detect from locale (imperial countries: US, Liberia, Myanmar)
        const lang = navigator.language || 'en-US';
        const imperialLocales = ['en-US', 'en-LR', 'my-MM'];
        return imperialLocales.some(l => lang.startsWith(l.split('-')[0]) && lang.includes(l.split('-')[1]))
            ? 'imperial'
            : 'metric';
    }

    bindEvents() {
        const toggle = document.getElementById('unitToggle');
        if (toggle) {
            toggle.addEventListener('click', (e) => {
                const option = e.target.closest('.unit-option');
                if (option) this.setUnit(option.dataset.unit);
            });
        }

        // Adjust visible circles based on zoom
        this.map.on('zoomend', () => this.updateVisibility());
    }

    setUnit(unit) {
        this.unit = unit;
        SafeStorage.setItem('unit', unit);
        this.updateToggleUI();
        if (this.center) this.draw(this.center);
    }

    updateToggleUI() {
        document.querySelectorAll('.unit-option').forEach(opt => {
            const isActive = opt.dataset.unit === this.unit;
            opt.classList.toggle('active', isActive);
            opt.setAttribute('aria-pressed', isActive);
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

        // Bolt Optimization: Reuse existing layers (Object Pooling)
        // prevents DOM thrashing during frequent zoom events.
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
            } else {
                const label = L.divIcon({
                    className: 'range-label',
                    html: html,
                    iconSize: [30, 12],
                    iconAnchor: [0, 6],
                });
                const labelMarker = L.marker(labelLatLng, { icon: label, interactive: false, keyboard: false });
                labelMarker.addTo(this.map);
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

        // Circuit center marker
        if (this.centerMarker) {
            this.centerMarker.setLatLng(center);
            this.centerMarker.setStyle({ color: rangeColor });
            if (!this.map.hasLayer(this.centerMarker)) this.centerMarker.addTo(this.map);
        } else {
            this.centerMarker = L.circleMarker(center, {
                interactive: false,
                keyboard: false,
                radius: 6,
                color: rangeColor,
                fillColor: '#ffffff',
                fillOpacity: 1,
                weight: 2,
            });
            this.centerMarker.addTo(this.map);
        }
        if (this.centerMarker.bringToFront) {
            this.centerMarker.bringToFront();
        }
    }

    calculateSteps(center) {
        // Calculate dynamic steps based on current view bounds
        const bounds = this.map.getBounds();
        const north = bounds.getNorth();
        const centerLat = center[0];

        // Approximate visible radius in meters (center to top edge)
        // This is a rough heuristic to ensure rings fit on screen
        const topLatLng = L.latLng(north, center[1]);
        const visibleRadiusMeters = this.map.distance(center, topLatLng);

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
        this.circles.forEach(c => this.map.removeLayer(c));
        this.labels.forEach(l => this.map.removeLayer(l));
        if (this.centerMarker) this.map.removeLayer(this.centerMarker);

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
