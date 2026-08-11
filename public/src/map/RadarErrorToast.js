import { CONFIG } from '../config.js';
import { i18n } from '../i18n/index.js';

/**
 * Owns the radar's tile-error tracking and the "connection instability /
 * rate limit" toast. Extracted from WeatherRadar to keep that class focused.
 *
 * The only outward dependency is redrawing the radar's layers after a retry
 * cooldown, which is injected via the `onRetry` callback so this class does
 * not need to know about layers or the map.
 */
export class RadarErrorToast {
    constructor(options = {}) {
        this.onRetry = options.onRetry || (() => {});

        this.failedTiles = new Set();
        this.lastTileErrorTime = 0;
        this.isCheckingStatus = false;
        this.rateLimitResetTime = 0;
        this.retryTimer = null;
        this.activeErrorTitle = null;
        this.toastAnimationFrame = null;
        this.hideErrorTimer = null;

        this.ui = {
            errorToast: document.getElementById('errorToast'),
            errorTitle: document.getElementById('errorTitle'),
            errorMessage: document.getElementById('errorMessage'),
            errorTimer: document.getElementById('errorTimer')
        };
    }

    /** Reset error tracking (called on a full layer rebuild). */
    reset() {
        if (this.failedTiles) this.failedTiles.clear();
        this.updateErrorUI();
    }

    /** A previously-failed tile loaded or unloaded; clear it from the error set. */
    registerTileSuccess(tile) {
        if (this.failedTiles.has(tile)) {
            this.failedTiles.delete(tile);
            this.updateErrorUI();
        }
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

        fetch(checkUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
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

            // Timer sync is maintained by using the actual remaining time if a retry cooldown is active
            let duration = 0;
            if (this.retryTimer && this.rateLimitResetTime > Date.now()) {
                duration = Math.ceil((this.rateLimitResetTime - Date.now()) / 1000);
                duration = Math.max(1, duration); // Ensure at least 1s
            }

            this.showErrorToast(
                this.activeErrorTitle || i18n.t('radar.connectionInstability'),
                message,
                duration,
                this.retryTimer && this.rateLimitResetTime > Date.now() ? this.rateLimitResetTime : null
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
        this.showErrorToast(title, message, Math.ceil(waitTimeMs / 1000), this.rateLimitResetTime);

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

        // Force redraw of all active layers (owned by WeatherRadar)
        this.onRetry();
    }

    showErrorToast(title, message, durationSec = 5, targetEndTimeMs = null) {
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
        const endTime = targetEndTimeMs || (Date.now() + (durationSec * 1000));

        const updateTimer = () => {
            if (!this.ui.errorToast.classList.contains('visible')) {
                this.toastAnimationFrame = null;
                return;
            }

            const remaining = Math.ceil((endTime - Date.now()) / 1000);
            if (remaining > 0) {
                this.ui.errorTimer.textContent = `${remaining}${i18n.t('countdown.secondShort')}`;
                this.toastAnimationFrame = requestAnimationFrame(updateTimer);
            } else {
                this.ui.errorTimer.textContent = '';
                this.toastAnimationFrame = null;
                if (durationSec > 0 && durationSec < 10 && this.rateLimitResetTime < Date.now()) {
                    this.hideErrorToast();
                }
            }
        };
        // Start the loop
        this.toastAnimationFrame = requestAnimationFrame(updateTimer);
    }

    retryingTilesMessage(count) {
        return i18n.t(count > 1 ? 'radar.retryingFailedTilesPlural' : 'radar.retryingFailedTiles', {
            count,
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

    destroy() {
        if (this.toastAnimationFrame) cancelAnimationFrame(this.toastAnimationFrame);
        if (this.retryTimer) clearTimeout(this.retryTimer);
        if (this.hideErrorTimer) clearTimeout(this.hideErrorTimer);
    }
}
