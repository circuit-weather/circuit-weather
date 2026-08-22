import { CONFIG } from '../config.js';
import { i18n } from '../i18n/index.js';
import { RadarErrorToast } from './RadarErrorToast.js';
import { RadarPlayback } from './RadarPlayback.js';
import { RadarFrames } from './RadarFrames.js';
import { RadarPolling } from './RadarPolling.js';
import { RadarReconcile } from './RadarReconcile.js';

export class WeatherRadar {
    constructor(map) {
        this.map = map;
        this.frames = [];
        this.layers = [];
        this.visibleLayerIndex = -1;
        this.currentFrame = 0;
        this.sessionTime = null;
        this.pastFrameCount = 0;
        this.pendingFrames = null;

        // Smart polling + auto update checker
        this.polling = new RadarPolling({
            getFrames: () => this.frames,
            isPlaying: () => this.playback.isPlaying,
            applyFrameUpdate: (frames) => this.applyFrameUpdate(frames),
            setPendingFrames: (frames) => { this.pendingFrames = frames; },
            onPastCountChange: (count) => { this.pastFrameCount = count; },
            fetchFrames: () => RadarFrames.getFramesFromApi()
        });

        // Shared time formatter (O(1) creation, reuse in loops)
        this.timeFormatter = new Intl.DateTimeFormat(i18n.locale, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        // Tile-error tracking + "connection instability" toast
        this.errorToast = new RadarErrorToast({ onRetry: () => this.redrawLayers() });

        // Animation playback + speed control. Frame state stays here and is
        // accessed via callbacks.
        this.playback = new RadarPlayback({
            getFrameCount: () => this.frames.length,
            getCurrentFrame: () => this.currentFrame,
            setCurrentFrame: (i) => { this.currentFrame = i; },
            showFrame: (i) => this.showFrame(i),
            beforePlay: () => {
                if (this.pendingFrames) {
                    this.applyFrameUpdate(this.pendingFrames);
                    this.pendingFrames = null;
                }
            }
        });

        // Bolt Optimization: Cache UI elements
        this.ui = {
            slider: document.getElementById('radarSlider'),
            time: document.getElementById('radarTime'),
            relative: document.getElementById('radarRelative'),
            timeStart: document.getElementById('radarTimeStart'),
            timeEnd: document.getElementById('radarTimeEnd'),
            controls: document.getElementById('radarControls')
        };

        this.handleSpaceKey = this.handleSpaceKey.bind(this);
        this.handleLanguageChange = this.handleLanguageChange.bind(this);
        this.bindEvents();

        // Palette UX: Start a 1-minute timer to keep the relative time updated
        this.relativeTimeInterval = setInterval(() => {
            if (this.visibleLayerIndex >= 0) {
                this.updateTimeDisplay(this.frames[this.visibleLayerIndex]?.time);
            }
        }, CONFIG.ONE_MINUTE_MS);
    }

    bindEvents() {
        if (this.ui.slider) {
            this.ui.slider.addEventListener('input', (e) => {
                this.currentFrame = parseInt(e.target.value, 10);
                this.showFrame(this.currentFrame);
                this.playback.pause();
            });
        }

        // Global shortcut: Space to toggle play/pause
        document.addEventListener('keydown', this.handleSpaceKey);

        // Listen for language changes
        document.addEventListener('i18n:change', this.handleLanguageChange);
    }

    handleSpaceKey(e) {
        if (e.code === 'Space') {
            const active = document.activeElement;
            const tag = active.tagName.toLowerCase();

            // Prevent conflict with inputs or focused buttons (which use Space to click)
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') {
                return;
            }

            e.preventDefault();
            this.playback.togglePlay();
        }
    }

    destroy() {
        if (this._isCleaningUp) return;
        this._isCleaningUp = true;

        document.removeEventListener('keydown', this.handleSpaceKey);
        document.removeEventListener('i18n:change', this.handleLanguageChange);
        this.errorToast.destroy();
        this.playback.destroy();
        this.polling.stopPolling();
        if (this.relativeTimeInterval) {
            clearInterval(this.relativeTimeInterval);
            this.relativeTimeInterval = null;
        }

        this.clearLayers();
    }

    setSessionTime(sessionTime) {
        this.sessionTime = sessionTime;
    }

    async fetchAndFilter() {
        const result = await RadarFrames.getFramesFromApi();
        this.frames = result.frames;
        this.pastFrameCount = result.pastCount;
        return this.frames;
    }

    async load() {
        this.stopPolling();
        try {
            await this.fetchAndFilter();
            if (this.frames.length === 0) {
                this.showControls(true);
                return;
            }

            this.createLayers();
            this.updateSlider();
            this.showControls(true);

            // Wait for tiles to load before starting animation
            await this.waitForTilesToLoad();

            // Start serial preload of remaining frames
            // This prevents "hammering" by loading one frame at a time in the background
            this.preloadSequence();

            this.playback.play();
        } catch (error) {
            console.error('Radar load failed:', error);
        } finally {
            // Always start polling, even if initial load failed
            this.startPolling();
        }
    }

    // Delegates to RadarPolling
    startPolling() { this.polling.startPolling(); }
    stopPolling() { this.polling.stopPolling(); }
    scheduleNextPoll() { this.polling.scheduleNextPoll(); }
    checkForUpdates() { return this.polling.checkForUpdates(); }


    clearLayers() {
        if (!this.map || !this.layers) return;

        const isMapbox = !this.map.hasLayer;

        this.layers.forEach(layer => {
            if (layer) {
                if (isMapbox) {
                    if (this.map.getLayer(layer.id)) this.map.removeLayer(layer.id);
                    if (this.map.getSource(layer.sourceId)) this.map.removeSource(layer.sourceId);
                } else {
                    this.map.removeLayer(layer);
                }
            }
        });
    }

    createLayers() {
        if (!this.map) return;

        // Reset error tracking on full layer rebuild
        this.errorToast.reset();

        // Clear existing layers if any (full reset)
        this.clearLayers();

        // Bolt Optimization: Lazy initialize layers array with nulls
        // We only create the Leaflet layer when it's needed (or preloaded)
        this.layers = new Array(this.frames.length).fill(null);
        this.visibleLayerIndex = -1;

        this.currentFrame = this.frames.length - 1;

        // Force map to recalculate size
        if (this.map.invalidateSize) {
            this.map.invalidateSize();
        } else if (this.map.resize) {
            this.map.resize();
        }

        // Create the current (latest) frame immediately so it's ready
        if (this.currentFrame >= 0) {
            this.getLayer(this.currentFrame);
        }
    }

    /**
     * Get or create a radar layer for the given frame index.
     * The layer is NOT automatically added to the map - this is intentional.
     * See showFrame() for the rate limiting strategy explanation.
     *
     * @param {number} index - Frame index
     * @returns {L.TileLayer|null} The layer, or null if index is invalid
     */
    getLayer(index) {
        if (index < 0 || index >= this.frames.length) return null;

        if (!this.layers[index]) {
            const isMapbox = !this.map.hasLayer;
            if (isMapbox) {
                this.layers[index] = this.createMapboxLayer(this.frames[index], index);
            } else {
                this.layers[index] = this.createLayer(this.frames[index], index);
            }
        }
        return this.layers[index];
    }

    createMapboxLayer(frame, index) {
        const sourceId = `radar-source-${index}`;
        const layerId = `radar-layer-${index}`;

        // Return a proxy object that mimics Leaflet's API for the rest of the class
        const layerProxy = {
            id: layerId,
            sourceId: sourceId,
            frameTime: frame.time,
            framePath: frame.path,
            isLoaded: false,
            events: {},

            setOpacity: (opacity) => {
                if (this.map.getLayer(layerId)) {
                    this.map.setPaintProperty(layerId, 'raster-opacity', opacity);
                }
            },

            addTo: (map) => {
                if (!map.getSource(sourceId)) {
                    map.addSource(sourceId, {
                        type: 'raster',
                        tiles: [frame.url],
                        tileSize: 512,
                        // RainViewer free tier limit is tile zoom 7 (Jan 2026).
                        // Unlike Leaflet (which uses zoomOffset: -1 to subtract 1 from map zoom),
                        // Mapbox fills {z} directly with no offset. maxzoom: 7 ensures Mapbox
                        // never requests tiles beyond zoom 7, matching the Leaflet behaviour.
                        maxzoom: 7,
                        minzoom: 1
                    });
                }
                if (!map.getLayer(layerId)) {
                    const beforeId = map.getLayer('range-circles-line') ? 'range-circles-line' : null;
                    map.addLayer({
                        id: layerId,
                        type: 'raster',
                        source: sourceId,
                        paint: {
                            'raster-opacity': 0.01,
                            'raster-fade-duration': 0
                        }
                    }, beforeId);

                    // Fire load event when Mapbox finishes rendering this source
                    map.once('idle', () => {
                        this.isLoaded = true;
                        if (layerProxy.events['load']) layerProxy.events['load']();
                    });
                }
            },

            setZIndex: () => {}, // Mapbox layers are ordered by when they are added or using beforeId

            on: (event, callback) => {
                layerProxy.events[event] = callback;
            },

            off: (event) => {
                delete layerProxy.events[event];
            },

            redraw: () => {
                if (this.map.getSource(sourceId)) {
                    // Mapbox doesn't have a simple redraw, we force it by replacing the tiles array
                    const source = this.map.getSource(sourceId);
                    source.setTiles([frame.url]);
                }
            }
        };

        return layerProxy;
    }

    /**
     * Create a new Leaflet TileLayer for a radar frame.
     *
     * IMPORTANT: This does NOT add the layer to the map.
     * Layers are added to map only in showFrame() to control tile requests.
     *
     * Configuration notes:
     * - maxNativeZoom: 7 - RainViewer free tier limit as of Jan 2026
     *   Higher zoom levels will scale the zoom-7 tiles (pseudo-zoom)
     * - tileSize: 256 - Standard tile size
     * - keepBuffer: 2 - Keeps 2 tiles outside viewport for smooth panning
     *
     * @param {Object} frame - Frame data with url, time, path
     * @param {number} index - Frame index for z-index ordering
     * @returns {L.TileLayer} The created layer (not on map yet)
     */
    createLayer(frame, index) {
        const layer = L.tileLayer(frame.url, {
            tileSize: 512,
            zoomOffset: -1,
            opacity: 0.01,
            zIndex: 100 + index,

            // RainViewer free tier limit (Jan 2026) is tile zoom 7.
            // With zoomOffset: -1, map zoom 8 requests tile zoom 7.
            maxNativeZoom: 8,
            minNativeZoom: 1,

            maxZoom: 18,
            updateWhenIdle: true, // Bolt Optimization: Only load tiles when panning stops (reduces requests)
            updateWhenZooming: false,
            keepBuffer: 2, // Restored for smoother animation; Serial Loader handles the initial burst
        });

        // Track tile loading errors for the error indicator UI
        layer.on('tileerror', (e) => {
            this.errorToast.handleTileError(e);
        });

        // Track success/cleanup to decrement error count
        layer.on('tileload', (e) => {
            this.errorToast.registerTileSuccess(e.tile);
        });
        layer.on('tileunload', (e) => {
            this.errorToast.registerTileSuccess(e.tile);
        });

        // Store frame metadata on the layer for easy reconciliation
        layer.frameTime = frame.time;
        layer.framePath = frame.path;

        return layer;
    }

    // Force redraw of all active layers (used by the error toast's retry cooldown)
    redrawLayers() {
        Object.values(this.layers).forEach(layer => {
            if (layer && this.map.hasLayer(layer)) {
                layer.redraw();
            }
        });
    }

    // Bolt Optimization: Reuse Leaflet layers to reduce DOM churn
    reconcileLayers(newFrames) {
        const { newLayers, newVisibleIndex } = RadarReconcile.reconcileLayers(
            this.map, this.layers, newFrames, this.visibleLayerIndex
        );
        this.layers = newLayers;
        this.visibleLayerIndex = newVisibleIndex;
    }

    applyFrameUpdate(newFrames) {
        // Store current timestamp to restore view
        const currentTimestamp = this.frames[this.currentFrame]?.time;

        // Bolt Optimization: Reconcile layers instead of full rebuild
        this.reconcileLayers(newFrames);
        this.frames = newFrames;

        // Restore view position
        if (currentTimestamp) {
            let closestIndex = 0;
            let minDiff = Infinity;

            for (let i = 0; i < this.frames.length; i++) {
                const frame = this.frames[i];
                const diff = Math.abs(frame.time - currentTimestamp);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = i;
                }
            }
            this.currentFrame = closestIndex;
        } else {
            this.currentFrame = 0;
        }

        // Ensure UI is synced
        this.updateSlider();
        this.showFrame(this.currentFrame);
    }

    async waitForTilesToLoad() {
        // Wait for the current frame's tiles to load
        const currentLayer = this.getLayer(this.currentFrame);
        if (!currentLayer) return;

        // Add to map if not already (needed to trigger tile loading)
        const isMapbox = !this.map.hasLayer;
        if (isMapbox) {
            if (!this.map.getLayer(currentLayer.id)) currentLayer.addTo(this.map);
        } else {
            if (!this.map.hasLayer(currentLayer)) currentLayer.addTo(this.map);
        }

        return new Promise((resolve) => {
            let resolved = false;

            const onLoad = () => {
                if (!resolved) {
                    resolved = true;
                    currentLayer.off('load', onLoad);
                    // Set proper opacity after load
                    this.showFrame(this.currentFrame);
                    resolve();
                }
            };

            currentLayer.on('load', onLoad);

            // Timeout fallback
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    currentLayer.off('load', onLoad);
                    this.showFrame(this.currentFrame);
                    resolve();
                }
            }, CONFIG.TILE_LOAD_TIMEOUT_MS);
        });
    }

    /**
     * Concurrent Preloader: Loads frames in a bounded pool to prevent API hammering.
     * Speeds up preloading while preventing the "Wall of Requests" (50+ pending) issue.
     */
    async preloadSequence() {
        // Order: Start from current frame + 1, wrap around.
        const sequence = [];
        for (let i = 0; i < this.frames.length; i++) {
            const index = (this.currentFrame + 1 + i) % this.frames.length;
            if (index !== this.currentFrame) {
                sequence.push(index);
            }
        }

        // Concurrency pool to speed up preloading without hammering the API
        const poolSize = 3;
        let index = 0;

        const workers = new Array(Math.min(poolSize, sequence.length)).fill(0).map(async () => {
            while (index < sequence.length) {
                const currentIndex = sequence[index++];
                await this.preloadFrame(currentIndex);
            }
        });

        await Promise.all(workers);
    }

    preloadFrame(index) {
        return new Promise(resolve => {
            const layer = this.getLayer(index);

            // If layer exists and is on map, it's likely already loaded or loading.
            // But we want to ensure it's loaded before moving to next.
            if (!layer) {
                resolve();
                return;
            }

            const isMapbox = !this.map.hasLayer;
            const isOnMap = isMapbox ? !!this.map.getLayer(layer.id) : this.map.hasLayer(layer);

            if (isOnMap) {
                // Already on map (maybe from showFrame).
                // We assume it's handling itself, but we'll wait a small bit just to space out requests
                setTimeout(resolve, 500);
                return;
            }

            // Add to map hidden to trigger load
            layer.setOpacity(0);
            layer.addTo(this.map);

            const onComplete = () => {
                cleanup();
                resolve();
            };

            const cleanup = () => {
                layer.off('load', onComplete);
                layer.off('tileerror', onComplete);
            };

            layer.on('load', onComplete);
            layer.on('tileerror', onComplete);

            // Timeout to prevent the preload queue from becoming stuck if a tile
            // frame never completes loading. Uses a shared constant to maintain
            // consistency with the fallback in waitForTilesToLoad().
            setTimeout(() => {
                cleanup();
                resolve();
            }, CONFIG.TILE_LOAD_TIMEOUT_MS);
        });
    }

    /**
     * Display a specific animation frame on the map.
     *
     * LAYER STRATEGY:
     * - All layers stay on the map once added (tiles are cached by browser)
     * - Toggle opacity to show/hide frames (prevents flash from re-adding)
     * - Preload next frame at opacity 0 so tiles load before transition
     *
     * RATE LIMITING (RainViewer free tier - as of Jan 2026):
     * - maxNativeZoom: 7 prevents requests at invalid zoom levels
     * - Smart polling syncs with RainViewer's 10-min update cycle
     * - Tiles cache in browser after first load, so zoom/pan after initial
     *   load hits cache rather than making new requests
     *
     * @param {number} index - Frame index to display (0 to frames.length-1)
     */
    showFrame(index) {
        if (index < 0 || index >= this.frames.length) return;

        // Skip if already showing this frame (prevents redundant updates)
        if (this.visibleLayerIndex === index) return;

        const previousIndex = this.visibleLayerIndex;

        const isMapbox = !this.map.hasLayer;

        // Get or create the current layer and add to map if needed
        const layer = this.getLayer(index);
        if (layer) {
            const isOnMap = isMapbox ? !!this.map.getLayer(layer.id) : this.map.hasLayer(layer);
            if (!isOnMap) {
                layer.addTo(this.map);
            }
            // Show this layer
            layer.setOpacity(CONFIG.radarOpacity);
        }

        // Hide the previous layer (keep on map - tiles are cached by browser)
        // We don't remove layers because:
        // 1. Removing/re-adding causes flash even with cached tiles
        // 2. Browser caches tiles, so staying on map doesn't re-fetch
        // 3. Zoom/pan will trigger tile requests either way
        if (previousIndex !== -1 && this.layers[previousIndex]) {
            this.layers[previousIndex].setOpacity(0);
        }

        // Preload next frame to map at opacity 0 (ensures tiles load ahead of time)
        const nextIndex = (index + 1) % this.frames.length;
        const nextLayer = this.getLayer(nextIndex);
        if (nextLayer) {
            const isNextOnMap = isMapbox ? !!this.map.getLayer(nextLayer.id) : this.map.hasLayer(nextLayer);
            if (!isNextOnMap) {
                nextLayer.addTo(this.map);
                nextLayer.setOpacity(0);
            }
        }

        // Update state
        this.visibleLayerIndex = index;
        this.updateTimeDisplay(this.frames[index]?.time);
        if (this.ui.slider) this.ui.slider.value = index;
    }

    updateTimeDisplay(timestamp) {
        if (!this.ui.time || !timestamp) return;

        // Palette UX: Calculate the "drift" between the latest radar data and real-time.
        // We apply this drift to ALL frames in the playback so that the countdown
        // updates every minute and maintains consistent spacing during cycling.
        let drift = 0;
        const latestFrame = this.frames[this.pastFrameCount - 1];
        if (latestFrame) {
            drift = Date.now() - (latestFrame.time * 1000);
        }

        const effectiveTimeMs = (timestamp * 1000) + drift;

        // Bolt Optimization: Use shared formatter and cached elements
        const date = new Date(timestamp * 1000);
        const timeStr = this.timeFormatter.format(date);

        this.ui.time.textContent = timeStr;
        // Scout: Added datetime attribute to <time> element for semantic SEO value and machine-readability
        this.ui.time.setAttribute('datetime', date.toISOString());

        let relativeText = '';
        let accessibleText = ''; // Palette A11y: New variable for screen reader text

        // Show relative to session if available and within a 7-day window of the radar time
        const hasSession = this.sessionTime !== null;
        let showSessionRelative = false;
        let diff = 0;

        if (hasSession) {
            diff = (effectiveTimeMs - this.sessionTime.getTime()) / CONFIG.ONE_MINUTE_MS; // minutes
            // Only show session-relative if the session is within 7 days (10080 minutes) of the frame's effective time
            if (Math.abs(diff) <= 7 * 24 * 60) {
                showSessionRelative = true;
            }
        }

        if (this.ui.relative && showSessionRelative) {
            const absDiff = Math.abs(Math.round(diff));
            const durationText = this.formatDuration(absDiff);

            if (Math.abs(diff) < 1) {
                relativeText = i18n.t('radar.sessionStart');
                accessibleText = i18n.t('radar.sessionStart');
            } else if (diff < 0) {
                relativeText = i18n.t('radar.beforeSession', { duration: durationText });
                accessibleText = i18n.t('radar.beforeSession', { duration: durationText });
            } else {
                relativeText = i18n.t('radar.afterSession', { duration: durationText });
                accessibleText = i18n.t('radar.afterSession', { duration: durationText });
            }
            this.ui.relative.textContent = relativeText;
        } else if (this.ui.relative) {
            const diffSec = timestamp - (Date.now() / 1000);

            if (diffSec > 60) {
                relativeText = i18n.t('radar.forecast');
                accessibleText = i18n.t('radar.forecast');
            } else {
                // Palette UX: For past frames when no session is selected, show "X mins ago"
                const diffMin = Math.round((Date.now() - effectiveTimeMs) / CONFIG.ONE_MINUTE_MS);

                if (diffMin < 1) {
                    relativeText = i18n.t('radar.live');
                    accessibleText = i18n.t('radar.liveAria');
                } else if (diffMin >= 1) {
                    relativeText = diffMin === 1
                        ? i18n.t('radar.minutesAgo', { count: diffMin })
                        : i18n.t('radar.minutesAgoPlural', { count: diffMin });
                    accessibleText = relativeText;
                }
            }
            this.ui.relative.textContent = relativeText;
        }

        if (this.ui.slider) {
            // Palette A11y: Use full descriptive text for screen readers
            const ariaSuffix = accessibleText || relativeText;
            const ariaText = ariaSuffix ? `${timeStr}, ${ariaSuffix}` : timeStr;
            this.ui.slider.setAttribute('aria-valuetext', ariaText);
        }
    }

    updateSlider() {
        if (this.ui.slider) {
            this.ui.slider.max = this.frames.length - 1;
            this.ui.slider.value = this.currentFrame;

            // Create a visual split between past and forecast frames
            if (this.frames.length > 1 && this.pastFrameCount > 0) {
                const forecastStartIndex = this.pastFrameCount;
                const splitPercentage = (forecastStartIndex / (this.frames.length - 1)) * 100;

                // Apply a gradient background to the slider track
                this.ui.slider.style.background = `linear-gradient(to right,
                    var(--color-border) 0%,
                    var(--color-border) ${splitPercentage}%,
                    var(--color-forecast-track) ${splitPercentage}%,
                    var(--color-forecast-track) 100%)`;
            } else {
                // Default style if no forecast frames
                this.ui.slider.style.background = 'var(--color-border)';
            }
        }

        if (this.ui.timeStart && this.ui.timeEnd && this.frames.length > 0) {
            const startDate = new Date(this.frames[0].time * 1000);
            const endDate = new Date(this.frames[this.frames.length - 1].time * 1000);

            this.ui.timeStart.textContent = this.timeFormatter.format(startDate);
            // Scout: Added datetime attribute to <time> element for semantic SEO value and machine-readability
            this.ui.timeStart.setAttribute('datetime', startDate.toISOString());

            this.ui.timeEnd.textContent = this.timeFormatter.format(endDate);
            // Scout: Added datetime attribute to <time> element for semantic SEO value and machine-readability
            this.ui.timeEnd.setAttribute('datetime', endDate.toISOString());
        } else if (this.ui.timeStart && this.ui.timeEnd) {
            this.ui.timeStart.textContent = '--:--';
            this.ui.timeStart.removeAttribute('datetime');
            this.ui.timeEnd.textContent = '--:--';
            this.ui.timeEnd.removeAttribute('datetime');
        }
    }

    showControls(visible) {
        if (this.ui.controls) {
            this.ui.controls.style.display = visible ? 'flex' : 'none';
            // Dispatch event for CircuitWeatherApp to recalculate layout offsets
            this.ui.controls.dispatchEvent(new CustomEvent('radar:toggle', { bubbles: true, detail: { visible } }));
        }
    }

    handleLanguageChange() {
        // Update time formatter with new locale
        this.timeFormatter = new Intl.DateTimeFormat(i18n.locale, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        this.playback.updateSpeedLabel();
        this.updateSlider();

        // Update current frame time display
        if (this.visibleLayerIndex >= 0) {
            this.updateTimeDisplay(this.frames[this.visibleLayerIndex]?.time);
        }
    }

    /**
     * Responds to theme changes. For Mapbox, a style change wipes all layers,
     * so we need to re-add the active and preloaded layers to the map.
     */
    updateTheme() {
        const isMapbox = !this.map.hasLayer;
        if (!isMapbox) return;

        // Reset the proxy layers so they re-create themselves on the new style
        this.layers.forEach((layer, index) => {
            if (layer) {
                // If it was already on the map, we need to re-add it
                const wasOnMap = !!this.map.getLayer(layer.id);
                const wasVisible = this.visibleLayerIndex === index;

                // Important: We must clear the cached proxy layer because Mapbox sources/layers
                // are style-specific. Re-using the same ID on a new style without fresh addSource/addLayer fails.
                this.layers[index] = null;

                if (wasOnMap || wasVisible) {
                    const newLayer = this.getLayer(index);
                    newLayer.addTo(this.map);
                    newLayer.setOpacity(wasVisible ? CONFIG.radarOpacity : 0);
                }
            }
        });
    }

    /**
     * Formats a duration in minutes into a readable string.
     * Always includes minutes to prevent layout jumps during playback.
     * @param {number} totalMinutes
     * @returns {string} e.g. "1 day 2 hours 30 minutes"
     */
    formatDuration(totalMinutes) {
        const days = Math.floor(totalMinutes / (24 * 60));
        const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
        const minutes = totalMinutes % 60;

        const parts = [];
        if (days > 0) {
            const dayLabel = days === 1 ? i18n.t('countdown.day') : i18n.t('countdown.dayPlural');
            parts.push(`${days} ${dayLabel}`);
        }
        if (hours > 0) {
            const hourLabel = hours === 1 ? i18n.t('countdown.hour') : i18n.t('countdown.hourPlural');
            parts.push(`${hours} ${hourLabel}`);
        }

        // Always show minutes to prevent justification jumps in the UI
        const minuteLabel = minutes === 1 ? i18n.t('countdown.minute') : i18n.t('countdown.minutePlural');
        parts.push(`${minutes} ${minuteLabel}`);

        return parts.join(' ');
    }
}
