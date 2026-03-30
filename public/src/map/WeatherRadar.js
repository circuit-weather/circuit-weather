import { CONFIG } from '../config.js';
import { i18n } from '../i18n/index.js';

export class WeatherRadar {
    constructor(map) {
        this.map = map;
        this.frames = [];
        this.layers = [];
        this.visibleLayerIndex = -1;
        this.currentFrame = 0;
        this.isPlaying = false;
        this.animationFrameId = null;
        this.lastFrameTime = 0;
        this.pollingTimeout = null;
        this.sessionTime = null;
        this.pastFrameCount = 0;
        this.pendingFrames = null;
        this.speedIndex = CONFIG.defaultSpeedIndex;

        // Shared time formatter (O(1) creation, reuse in loops)
        this.timeFormatter = new Intl.DateTimeFormat(navigator.language, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        // Error Indicator tracking
        this.failedTiles = new Set();
        this.lastTileErrorTime = 0;
        this.isCheckingStatus = false;
        this.rateLimitResetTime = 0;
        this.retryTimer = null;
        this.activeErrorTitle = null;
        this.toastAnimationFrame = null;

        // Bolt Optimization: Cache UI elements
        this.ui = {
            slider: document.getElementById('radarSlider'),
            playBtn: document.getElementById('radarPlayBtn'),
            time: document.getElementById('radarTime'),
            relative: document.getElementById('radarRelative'),
            timeStart: document.getElementById('radarTimeStart'),
            timeEnd: document.getElementById('radarTimeEnd'),
            controls: document.getElementById('radarControls'),
            speedBtn: document.getElementById('radarSpeedBtn'),
            speedLabel: document.getElementById('radarSpeedLabel'),

            // Error Toast Elements
            errorToast: document.getElementById('errorToast'),
            errorTitle: document.getElementById('errorTitle'),
            errorMessage: document.getElementById('errorMessage'),
            errorTimer: document.getElementById('errorTimer')
        };

        this.boundLoop = this.loop.bind(this);
        this.handleSpaceKey = this.handleSpaceKey.bind(this);
        this.bindEvents();
        this.updateSpeedLabel();

        // Palette UX: Start a 1-minute timer to keep the relative time updated
        this.relativeTimeInterval = setInterval(() => {
            if (this.visibleLayerIndex >= 0) {
                this.updateTimeDisplay(this.frames[this.visibleLayerIndex]?.time);
            }
        }, CONFIG.ONE_MINUTE_MS);
    }

    bindEvents() {
        if (this.ui.playBtn) {
            this.ui.playBtn.addEventListener('click', () => this.togglePlay());
        }
        if (this.ui.slider) {
            this.ui.slider.addEventListener('input', (e) => {
                this.currentFrame = parseInt(e.target.value, 10);
                this.showFrame(this.currentFrame);
                this.pause();
            });
        }
        if (this.ui.speedBtn) {
            this.ui.speedBtn.addEventListener('click', () => this.cycleSpeed());
        }

        // Global shortcut: Space to toggle play/pause
        document.addEventListener('keydown', this.handleSpaceKey);
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
            this.togglePlay();
        }
    }

    destroy() {
        document.removeEventListener('keydown', this.handleSpaceKey);
    }

    cycleSpeed() {
        // Cycle to the next speed
        this.speedIndex = (this.speedIndex + 1) % CONFIG.radarSpeeds.length;
        this.updateSpeedLabel();

        // If playing, restart with the new speed
        if (this.isPlaying) {
            this.pause();
            this.play();
        }
    }

    updateSpeedLabel() {
        if (this.ui.speedLabel) {
            const label = CONFIG.radarSpeeds[this.speedIndex].label;
            this.ui.speedLabel.textContent = label;

            // Palette Accessibility: Update ARIA label with current state
            if (this.ui.speedBtn) {
                const speedLabel = i18n.t('radar.playbackSpeed', { speed: label });
                this.ui.speedBtn.setAttribute('aria-label', speedLabel);
                this.ui.speedBtn.setAttribute('title', speedLabel);
            }
        }
    }

    getCurrentSpeed() {
        return CONFIG.radarSpeeds[this.speedIndex].speed;
    }

    setSessionTime(sessionTime) {
        this.sessionTime = sessionTime;
    }

    async fetchAndFilter() {
        this.frames = await this.getFramesFromApi();
        return this.frames;
    }

    async getFramesFromApi() {
        try {
            const response = await fetch(CONFIG.rainViewerApi);
            if (!response.ok) {
                console.error(`RainViewer API error: ${response.status}`);
                return [];
            }
            const data = await response.json();

            const past = data.radar?.past || [];
            const nowcast = data.radar?.nowcast || [];

            // Store the count of past frames to identify the forecast start
            this.pastFrameCount = past.length;

            return [...past, ...nowcast].map(frame => ({
                time: frame.time,
                path: frame.path,
                url: `/api/tiles${frame.path}/512/{z}/{x}/{y}/2/1_1.png`,
            }));
        } catch (error) {
            console.error('Failed to fetch radar frames:', error);
            return [];
        }
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

            this.play();
        } catch (error) {
            console.error('Radar load failed:', error);
        } finally {
            // Always start polling, even if initial load failed
            this.startPolling();
        }
    }

    /**
     * Start the smart polling cycle for radar updates.
     * Uses sync polling instead of fixed intervals - see scheduleNextPoll().
     */
    startPolling() {
        this.stopPolling();
        this.scheduleNextPoll();
    }

    /**
     * Schedule the next poll to sync with RainViewer's update cycle.
     *
     * RATE LIMITING STRATEGY:
     * Instead of polling every 30 seconds (120 API calls/hour), we sync with
     * RainViewer's 10-minute update cycle. We poll 1 minute after each :X0 mark
     * (e.g., :01, :11, :21) when new data is available.
     *
     * This reduces API calls from ~120/hour to ~6/hour while still getting
     * fresh data within 1 minute of it becoming available.
     */
    scheduleNextPoll() {
        const now = Date.now();
        const updateIntervalMs = 10 * CONFIG.ONE_MINUTE_MS; // RainViewer updates every 10 minutes
        const offsetMs = 1 * CONFIG.ONE_MINUTE_MS; // Poll 1 minute after update to ensure data is ready

        // Calculate ms since last :X0 mark (e.g., :00, :10, :20, etc.)
        const msSinceLastUpdate = now % updateIntervalMs;

        // Calculate delay until next update + offset
        let delay = updateIntervalMs - msSinceLastUpdate + offsetMs;

        // If we're already past the offset window, wait for next cycle
        if (delay > updateIntervalMs) {
            delay -= updateIntervalMs;
        }

        // Minimum delay of 30 seconds to avoid tight loops on clock edge cases
        delay = Math.max(delay, CONFIG.MIN_POLL_DELAY_MS);

        this.pollingTimeout = setTimeout(() => {
            this.checkForUpdates();
            this.scheduleNextPoll(); // Schedule next poll recursively
        }, delay);
    }

    stopPolling() {
        if (this.pollingTimeout) {
            clearTimeout(this.pollingTimeout);
            this.pollingTimeout = null;
        }
    }

    /**
     * Stop the periodic relative time display refresh.
     */
    stopRelativeTimeUpdate() {
        if (this.relativeTimeInterval) {
            clearInterval(this.relativeTimeInterval);
            this.relativeTimeInterval = null;
        }
    }

    async checkForUpdates() {
        try {
            const newFrames = await this.getFramesFromApi();
            if (!newFrames || newFrames.length === 0) return;

            // Bolt Optimization: Check if frames have changed
            if (this.areFramesEqual(this.frames, newFrames)) {
                return;
            }

            // Always attempt update - rebuild logic is cheap and robust
            if (this.isPlaying) {
                this.applyFrameUpdate(newFrames);
            } else {
                // Defer update until played
                this.pendingFrames = newFrames;
            }
        } catch (error) {
            console.error('Failed to check for radar updates:', error);
        }
    }

    areFramesEqual(a, b) {
        if (!a || !b) return false;
        if (a.length !== b.length) return false;

        // Check timestamps and paths
        for (let i = 0; i < a.length; i++) {
            if (a[i].time !== b[i].time || a[i].path !== b[i].path) {
                return false;
            }
        }
        return true;
    }

    createLayers() {
        if (!this.map) return;

        // Reset error tracking on full layer rebuild
        if (this.failedTiles) this.failedTiles.clear();
        this.updateErrorUI();

        // Clear existing layers if any (full reset)
        this.layers.forEach(layer => {
            if (layer) this.map.removeLayer(layer);
        });
        // Bolt Optimization: Lazy initialize layers array with nulls
        // We only create the Leaflet layer when it's needed (or preloaded)
        this.layers = new Array(this.frames.length).fill(null);
        this.visibleLayerIndex = -1;

        this.currentFrame = this.frames.length - 1;

        // Force map to recalculate size
        this.map.invalidateSize();

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
            this.layers[index] = this.createLayer(this.frames[index], index);
        }
        return this.layers[index];
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
            this.handleTileError(e);
        });

        // Track success/cleanup to decrement error count
        layer.on('tileload', (e) => {
            if (this.failedTiles.has(e.tile)) {
                this.failedTiles.delete(e.tile);
                this.updateErrorUI();
            }
        });
        layer.on('tileunload', (e) => {
            if (this.failedTiles.has(e.tile)) {
                this.failedTiles.delete(e.tile);
                this.updateErrorUI();
            }
        });

        // Store frame metadata on the layer for easy reconciliation
        layer.frameTime = frame.time;
        layer.framePath = frame.path;

        return layer;
    }

    handleTileError(e) {
        // Bolt Optimization: Track unique failed tiles to prevent double-counting
        // during animation frames or rapid panning
        this.failedTiles.add(e.tile);

        // We cannot check the tile URL directly due to CORS blocks on the tile cache.
        // Instead, we check the main RainViewer API. If IT is rate limited, we are definitely limited.
        // If it is OK (200), then the tile error is likely a benign 404 (empty/ocean).

        // Avoid spamming checks
        if (this.isCheckingStatus) return;
        this.isCheckingStatus = true;

        // Use proxied API URL to avoid privacy leak (direct connection exposes IP)
        // Worker now passes through 429 status for this check
        const checkUrl = CONFIG.rainViewerApi;

        fetch(checkUrl, { method: 'HEAD' })
            .then(response => {
                this.isCheckingStatus = false;

                if (response.status === 429) {
                    // Critical: Rate Limit Hit (API is blocked, so tiles likely are too)
                    this.triggerRateLimitCooldown();
                } else if (response.ok) {
                    // Ambiguous Case: API is fine (200), but tile failed.
                    // We treat this as a transient failure that needs retry.
                    // Count is already updated at top of method.
                    this.triggerRateLimitCooldown(15000, i18n.t('radar.connectionInstability'), this.retryingTilesMessage(this.failedTiles.size));
                } else {
                    // Service Error
                    const now = Date.now();
                    if (now - this.lastTileErrorTime > 2000) {
                        this.lastTileErrorTime = now;
                        this.showErrorToast(i18n.t('radar.serviceError'), i18n.t('radar.radarStatus', { status: response.status }), 5);
                    }
                }
            })
            .catch(error => {
                this.isCheckingStatus = false;
                console.error('Network error during API status check:', error);

                // Network error (likely offline)
                // Count already updated at top.
                this.updateErrorUI();
            });
    }

    updateErrorUI() {
        const count = this.failedTiles.size;
        if (count > 0) {
            // Cancel any pending hide timer since we have errors
            if (this.hideErrorTimer) {
                clearTimeout(this.hideErrorTimer);
                this.hideErrorTimer = null;
            }

            // Persistent toast while errors exist
            const message = this.retryingTilesMessage(count);

            // Fix Timer Sync: Use actual remaining time if a retry cooldown is active
            let duration = 60;
            if (this.rateLimitResetTime > Date.now()) {
                duration = Math.ceil((this.rateLimitResetTime - Date.now()) / 1000);
                duration = Math.max(1, duration); // Ensure at least 1s
            }

            this.showErrorToast(
                this.activeErrorTitle || i18n.t('radar.connectionInstability'),
                message,
                duration
            );
        } else {
            // DEBOUNCE HIDE: Wait 1s before hiding to prevent "popping" during redraws
            // If errors reappear within 1s (e.g. strict redraw), the toast stays visible.
            if (!this.hideErrorTimer) {
                this.hideErrorTimer = setTimeout(() => {
                    this.hideErrorToast();
                    this.hideErrorTimer = null;
                }, 1000);
            }
        }
    }

    triggerRateLimitCooldown(waitTimeMs = 61000, title = i18n.t('radar.highTraffic'), message = i18n.t('radar.rateLimitExceeded')) {
        if (this.rateLimitResetTime > Date.now()) return; // Already triggered

        // Playback continues (removed pause) so valid tiles can load

        this.rateLimitResetTime = Date.now() + waitTimeMs;
        this.activeErrorTitle = title; // Track title for consistency

        // Show persistent toast
        this.showErrorToast(title, message, Math.ceil(waitTimeMs / 1000));

        // Schedule Retry
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
            this.retryTiles();
        }, waitTimeMs);
    }

    retryTiles() {
        this.rateLimitResetTime = 0;
        this.activeErrorTitle = null;

        // Manual Clean: Explicitly clear errors to prevent accumulation drift
        // We rely on new errors specifically from the new redraw
        this.failedTiles.clear();

        // Update UI (will trigger the debounce hide, but new errors will cancel it fast)
        this.updateErrorUI();

        // Force redraw of all active layers
        Object.values(this.layers).forEach(layer => {
            if (layer && this.map.hasLayer(layer)) {
                layer.redraw();
            }
        });
    }

    showErrorToast(title, message, durationSec = 5) {
        if (!this.ui.errorToast) return;

        // Cancel any existing timer loop to prevent overlap
        if (this.toastAnimationFrame) {
            cancelAnimationFrame(this.toastAnimationFrame);
            this.toastAnimationFrame = null;
        }

        this.ui.errorTitle.textContent = title;
        this.ui.errorMessage.textContent = message;
        this.ui.errorToast.classList.add('visible');
        this.ui.errorToast.style.opacity = '1';

        // Handle Countdown UI
        const endTime = Date.now() + (durationSec * 1000);

        const updateTimer = () => {
            if (!this.ui.errorToast.classList.contains('visible')) {
                this.toastAnimationFrame = null;
                return;
            }

            const remaining = Math.ceil((endTime - Date.now()) / 1000);
            if (remaining > 0) {
                this.ui.errorTimer.textContent = `${remaining}s`;
                this.toastAnimationFrame = requestAnimationFrame(updateTimer);
            } else {
                this.ui.errorTimer.textContent = '';
                this.toastAnimationFrame = null;
                if (durationSec < 10 && this.rateLimitResetTime < Date.now()) {
                    this.hideErrorToast();
                }
            }
        };
        // Start the loop
        this.toastAnimationFrame = requestAnimationFrame(updateTimer);
    }

    retryingTilesMessage(count) {
        return i18n.t('radar.retryingFailedTiles', {
            count,
            suffix: count > 1 ? 's' : '',
        });
    }

    hideErrorToast() {
        if (!this.ui.errorToast) return;

        if (this.toastAnimationFrame) {
            cancelAnimationFrame(this.toastAnimationFrame);
            this.toastAnimationFrame = null;
        }

        this.ui.errorToast.classList.remove('visible');
        this.ui.errorToast.style.opacity = '0';
    }

    // Bolt Optimization: Reuse Leaflet layers to reduce DOM churn
    reconcileLayers(newFrames) {
        // Map (time + path) -> Layer
        const existingLayerMap = new Map();

        // Populate map with existing valid layers
        this.layers.forEach(layer => {
            if (layer) {
                const key = `${layer.frameTime}-${layer.framePath}`;
                existingLayerMap.set(key, layer);
            }
        });

        const newLayers = new Array(newFrames.length).fill(null);
        let newVisibleIndex = -1;

        // Current visible layer (reference)
        const visibleLayer = this.visibleLayerIndex >= 0 ? this.layers[this.visibleLayerIndex] : null;

        newFrames.forEach((frame, index) => {
            const key = `${frame.time}-${frame.path}`;
            if (existingLayerMap.has(key)) {
                // Reuse existing layer
                const layer = existingLayerMap.get(key);
                layer.setZIndex(100 + index);
                newLayers[index] = layer;

                // If this was the visible layer, track its new index
                if (layer === visibleLayer) {
                    newVisibleIndex = index;
                }

                // Remove from map so we know what's left is unused
                existingLayerMap.delete(key);
            } else {
                // Lazy Load: Leave as null.
                // Layer will be created by getLayer() when needed (e.g. by showFrame or preloading).
                newLayers[index] = null;
            }
        });

        // Remove unused layers
        existingLayerMap.forEach(layer => {
            this.map.removeLayer(layer);
        });

        // Update state
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

            this.frames.forEach((frame, i) => {
                const diff = Math.abs(frame.time - currentTimestamp);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = i;
                }
            });
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
        if (!this.map.hasLayer(currentLayer)) {
            currentLayer.addTo(this.map);
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
     * Serial Preloader: Loads frames one-by-one to prevent API hammering.
     * Prevents the "Wall of Requests" (50+ pending) issue.
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

        for (const index of sequence) {
            await this.preloadFrame(index);
        }
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

            if (this.map.hasLayer(layer)) {
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

            // Timeout to prevent stuck queue
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

        // Get or create the current layer and add to map if needed
        const layer = this.getLayer(index);
        if (layer) {
            if (!this.map.hasLayer(layer)) {
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
        if (nextLayer && !this.map.hasLayer(nextLayer)) {
            nextLayer.addTo(this.map);
            nextLayer.setOpacity(0);
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

        let relativeText = '';
        let accessibleText = ''; // Palette A11y: New variable for screen reader text

        // Show relative to session if available
        if (this.ui.relative && this.sessionTime) {
            const diff = (effectiveTimeMs - this.sessionTime.getTime()) / CONFIG.ONE_MINUTE_MS; // minutes
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
            this.ui.timeStart.textContent = this.timeFormatter.format(new Date(this.frames[0].time * 1000));
            this.ui.timeEnd.textContent = this.timeFormatter.format(new Date(this.frames[this.frames.length - 1].time * 1000));
        } else if (this.ui.timeStart && this.ui.timeEnd) {
            this.ui.timeStart.textContent = '--:--';
            this.ui.timeEnd.textContent = '--:--';
        }
    }

    play() {
        // Clear any existing timer/loop first to prevent double animations
        this.pause();

        // Apply any pending updates before starting
        if (this.pendingFrames) {
            this.applyFrameUpdate(this.pendingFrames);
            this.pendingFrames = null;
        }

        this.isPlaying = true;
        if (this.ui.playBtn) {
            this.ui.playBtn.classList.add('playing');
            this.ui.playBtn.setAttribute('aria-label', i18n.t('radar.pause'));
            this.ui.playBtn.setAttribute('title', i18n.t('radar.pauseTitle'));
        }

        // Bolt Optimization: Use requestAnimationFrame instead of setInterval
        // Prevents drift and saves battery in background tabs
        this.lastFrameTime = performance.now();
        this.loop();
    }

    loop() {
        if (!this.isPlaying) return;

        const now = performance.now();
        const elapsed = now - this.lastFrameTime;
        const speed = this.getCurrentSpeed();

        if (elapsed >= speed) {
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
            this.showFrame(this.currentFrame);
            // Adjust for drift while preserving the interval grid
            this.lastFrameTime = now - (elapsed % speed);
        }

        this.animationFrameId = requestAnimationFrame(this.boundLoop);
    }

    pause() {
        this.isPlaying = false;
        if (this.ui.playBtn) {
            this.ui.playBtn.classList.remove('playing');
            this.ui.playBtn.setAttribute('aria-label', i18n.t('radar.play'));
            this.ui.playBtn.setAttribute('title', i18n.t('radar.playTitle'));
        }

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    togglePlay() {
        if (this.isPlaying) this.pause();
        else this.play();
    }

    showControls(visible) {
        if (this.ui.controls) this.ui.controls.style.display = visible ? 'flex' : 'none';
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
