import { CONFIG } from '../config.js';
import { i18n } from '../i18n/index.js';
import { SafeStorage } from '../utils/storage.js';
import { sampleWindField, windDisplacement, isWithinField } from '../utils/wind.js';

/**
 * Animated wind overlay: draws flowing particles advected by a gridded wind
 * field on a canvas over the map. Works with both Mapbox GL JS and Leaflet by
 * projecting geo coordinates to container pixels each frame.
 *
 * The wind field is always fetched for the current viewport (via onViewChange),
 * so particles fill the screen wherever the user pans or zooms. Below
 * WIND_MIN_ZOOM the overlay suspends itself and shows an info toast; it
 * resumes automatically when the user zooms back in.
 *
 * This module is DOM/canvas/animation heavy and is verified in the browser
 * rather than by unit tests (the pure maths it relies on live in utils/wind.js).
 */
export class WindOverlay {
    constructor(map, options = {}) {
        this.map = map;
        this.onToggle = options.onToggle || (() => {});
        this.onViewChange = options.onViewChange || (() => {});
        this.isMapbox = map ? !map.hasLayer : false;
        this.field = null;
        this.particles = [];
        this.rafId = null;
        this.lastTime = 0;
        this.width = 0;
        this.height = 0;
        this.color = this._resolveColor();
        this.enabled = SafeStorage.getItem('windOverlay') === 'true';
        this._interacting = false;
        this._zoomSuppressed = false;

        this.container = (map && typeof map.getContainer === 'function') ? map.getContainer() : null;
        this.canvas = (typeof document !== 'undefined' && document.createElement)
            ? document.createElement('canvas')
            : null;
        this.ctx = (this.canvas && this.canvas.getContext) ? this.canvas.getContext('2d') : null;

        if (this.canvas) {
            this.canvas.className = 'wind-flow-canvas';
            this.canvas.setAttribute('aria-hidden', 'true');
            this.canvas.style.display = this.enabled ? 'block' : 'none';
        }
        if (this.container && this.canvas && this.container.appendChild) {
            this.container.appendChild(this.canvas);
        }

        this._infoToast = this._createInfoToast();

        this._onResize = () => this._resize();
        // Pause + clear the canvas while the map is animating. Trails are painted
        // in screen space, so leaving them up while the projection changes during a
        // zoom/pan smears them against the map — resume once the view settles.
        this._onInteractStart = () => this._suspend();
        this._onInteractEnd = () => this._resume();
        if (map && typeof map.on === 'function') {
            map.on('resize', this._onResize);
            map.on('movestart', this._onInteractStart);
            map.on('zoomstart', this._onInteractStart);
            map.on('moveend', this._onInteractEnd);
            map.on('zoomend', this._onInteractEnd);
        }

        this._toggle = (typeof document !== 'undefined' && document.getElementById)
            ? document.getElementById('windOverlayToggle')
            : null;
        if (this._toggle && this._toggle.addEventListener) {
            this._toggle.addEventListener('click', () => this.setEnabled(!this.enabled));
            // Palette A11y: Ensure keyboard users can activate the switch
            this._toggle.addEventListener('keydown', (e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    this.setEnabled(!this.enabled);
                }
            });
        }
        this._updateToggleUI();
        this._resize();
        if (this.enabled) {
            this._zoomSuppressed = this._isZoomTooLow();
            if (!this._zoomSuppressed) this._start();
        }
    }

    setField(field) {
        this.field = field;
        if (this.enabled && field && !this._zoomSuppressed) {
            this._resize();
            this._seedParticles();
            this._start();
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        SafeStorage.setItem('windOverlay', enabled ? 'true' : 'false');
        this._updateToggleUI();
        if (this.canvas) this.canvas.style.display = enabled ? 'block' : 'none';

        if (enabled) {
            this._resize();
            this._zoomSuppressed = this._isZoomTooLow();
            if (this._zoomSuppressed) {
                this._showZoomToast();
            } else if (this.field) {
                this._seedParticles();
                this._start();
            }
        } else {
            this._stop();
            this._clear();
            this._hideZoomToast();
        }
        this.onToggle(enabled);
    }

    updateTheme() {
        this.color = this._resolveColor();
    }

    destroy() {
        this._stop();
        if (this._toastHideTimer) clearTimeout(this._toastHideTimer);
        if (this.map && typeof this.map.off === 'function') {
            this.map.off('resize', this._onResize);
            this.map.off('movestart', this._onInteractStart);
            this.map.off('zoomstart', this._onInteractStart);
            this.map.off('moveend', this._onInteractEnd);
            this.map.off('zoomend', this._onInteractEnd);
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        if (this._infoToast && this._infoToast.parentNode) {
            this._infoToast.parentNode.removeChild(this._infoToast);
        }
    }

    _updateToggleUI() {
        if (this._toggle && this._toggle.setAttribute) {
            this._toggle.setAttribute('aria-checked', this.enabled ? 'true' : 'false');
        }
    }

    _resolveColor() {
        try {
            const value = getComputedStyle(document.documentElement)
                .getPropertyValue('--color-wind-flow').trim();
            if (value) return value;
            if (document.documentElement.getAttribute('data-theme') === 'dark') {
                return 'rgba(125, 211, 252, 0.85)';
            }
        } catch (_) {
            // Non-browser / mocked environment — fall through to the default.
        }
        return 'rgba(2, 132, 199, 0.7)';
    }

    _project(lat, lon) {
        if (!this.map) return null;
        try {
            if (this.isMapbox) {
                const p = this.map.project([lon, lat]);
                return p ? { x: p.x, y: p.y } : null;
            }
            const p = this.map.latLngToContainerPoint([lat, lon]);
            return p ? { x: p.x, y: p.y } : null;
        } catch (_) {
            return null;
        }
    }

    _getZoom() {
        if (!this.map) return null;
        try {
            return this.map.getZoom();
        } catch (_) {
            return null;
        }
    }

    _isZoomTooLow() {
        const zoom = this._getZoom();
        return zoom !== null && zoom < CONFIG.WIND_MIN_ZOOM;
    }

    _resize() {
        if (!this.canvas || !this.container || !this.container.getBoundingClientRect) return;
        const rect = this.container.getBoundingClientRect();
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
        this.width = rect.width;
        this.height = rect.height;
        this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
        if (this.ctx && this.ctx.setTransform) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    _seedParticles() {
        if (!this.field) {
            this.particles = [];
            return;
        }
        const count = CONFIG.WIND_FIELD_PARTICLES;
        this.particles = [];
        for (let i = 0; i < count; i++) {
            this.particles.push(this._spawn(true));
        }
    }

    _spawn(randomAge) {
        const f = this.field;
        return {
            lat: f.minLat + Math.random() * (f.maxLat - f.minLat),
            lon: f.minLon + Math.random() * (f.maxLon - f.minLon),
            age: randomAge ? Math.random() * CONFIG.WIND_FIELD_PARTICLE_LIFE : 0,
        };
    }

    _suspend() {
        this._interacting = true;
        this._stop();
        this._clear();
    }

    _resume() {
        this._interacting = false;
        if (!this.enabled) return;

        const nowSuppressed = this._isZoomTooLow();
        const wasSuppressed = this._zoomSuppressed;
        this._zoomSuppressed = nowSuppressed;

        if (nowSuppressed) {
            if (!wasSuppressed) {
                this._showZoomToast();
            }
            return;
        }

        this._resize();
        this._clear();
        // Re-fetch wind data for the new viewport (handles both pan and zoom-in resumption).
        // Also restart immediately with the existing field so particles don't freeze while
        // waiting for the async fetch to complete.
        this.onViewChange();
        if (this.field) this._start();
    }

    _start() {
        if (this.rafId || !this.ctx || !this.enabled || !this.field || this._interacting || this._zoomSuppressed) return;
        if (typeof requestAnimationFrame !== 'function') return;
        this.lastTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const loop = (now) => {
            this._frame(now);
            this.rafId = requestAnimationFrame(loop);
        };
        this.rafId = requestAnimationFrame(loop);
    }

    _stop() {
        if (this.rafId && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.rafId);
        }
        this.rafId = null;
    }

    _clear() {
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    _frame(now) {
        if (!this.ctx || !this.field) return;
        const ctx = this.ctx;
        const dt = Math.min(0.05, ((now - this.lastTime) || 16) / 1000);
        this.lastTime = now;

        // Fade existing trails by reducing their alpha (keeps the map visible).
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = `rgba(0,0,0,${CONFIG.WIND_FIELD_FADE})`;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.globalCompositeOperation = 'source-over';

        ctx.lineWidth = 1.4;
        ctx.strokeStyle = this.color;
        ctx.beginPath();

        const f = this.field;
        const gain = CONFIG.WIND_FIELD_SPEED_GAIN;
        for (const p of this.particles) {
            const { u, v } = sampleWindField(f, p.lat, p.lon);
            const { dLat, dLon } = windDisplacement(p.lat, u, v, dt, gain);

            const from = this._project(p.lat, p.lon);
            p.lat += dLat;
            p.lon += dLon;
            p.age += dt;

            if (p.age > CONFIG.WIND_FIELD_PARTICLE_LIFE || !isWithinField(p.lat, p.lon, f)) {
                Object.assign(p, this._spawn(false));
                continue;
            }

            const to = this._project(p.lat, p.lon);
            if (from && to) {
                ctx.moveTo(from.x, from.y);
                ctx.lineTo(to.x, to.y);
            }
        }
        ctx.stroke();
    }

    // ── Info toast ────────────────────────────────────────────────────────────

    _createInfoToast() {
        if (typeof document === 'undefined' || !this.container) return null;
        const el = document.createElement('div');
        el.className = 'wind-info-toast';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');

        const iconSpan = document.createElement('span');
        iconSpan.className = 'wind-toast-icon';
        iconSpan.setAttribute('aria-hidden', 'true');

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');

        const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path1.setAttribute('d', 'M9.59 4.59A2 2 0 1 1 11 8H2');

        const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path2.setAttribute('d', 'M12.42 19.42A2 2 0 1 0 14 16H2');

        const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path3.setAttribute('d', 'M16.27 7.27A2.5 2.5 0 1 1 18.5 12H2');

        svg.appendChild(path1);
        svg.appendChild(path2);
        svg.appendChild(path3);

        iconSpan.appendChild(svg);

        const msgSpan = document.createElement('span');
        msgSpan.className = 'wind-toast-message';

        el.appendChild(iconSpan);
        el.appendChild(msgSpan);

        this.container.appendChild(el);
        return el;
    }

    _showZoomToast() {
        if (!this._infoToast) return;
        const zoom = this._getZoom();
        const zoomDisplay = zoom !== null ? Math.floor(zoom) : '?';
        this._infoToast.querySelector('.wind-toast-message').textContent =
            i18n.t('controls.windZoomDisabled', { zoom: zoomDisplay });

        if (this._toastHideTimer) clearTimeout(this._toastHideTimer);
        this._infoToast.classList.add('visible');

        this._toastHideTimer = setTimeout(() => {
            this._hideZoomToast();
        }, 4500);
    }

    _hideZoomToast() {
        if (!this._infoToast) return;
        this._infoToast.classList.remove('visible');
        if (this._toastHideTimer) {
            clearTimeout(this._toastHideTimer);
            this._toastHideTimer = null;
        }
    }
}
