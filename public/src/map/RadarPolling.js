import { CONFIG } from '../config.js';
import { RadarFrames } from './RadarFrames.js';

export class RadarPolling {
    constructor(options = {}) {
        this.getFrames = options.getFrames || (() => []);
        this.isPlaying = options.isPlaying || (() => false);
        this.applyFrameUpdate = options.applyFrameUpdate || (() => {});
        this.setPendingFrames = options.setPendingFrames || (() => {});
        this.onPastCountChange = options.onPastCountChange || (() => {});

        this.pollingTimeout = null;
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

    async checkForUpdates() {
        try {
            const { frames: newFrames, pastCount } = await RadarFrames.getFramesFromApi();
            if (!newFrames || newFrames.length === 0) return;

            // Inform the parent about the pastCount which might have changed
            this.onPastCountChange(pastCount);

            // Bolt Optimization: Check if frames have changed
            const currentFrames = this.getFrames();
            if (RadarPolling.areFramesEqual(currentFrames, newFrames)) {
                return;
            }

            // Always attempt update - rebuild logic is cheap and robust
            if (this.isPlaying()) {
                this.applyFrameUpdate(newFrames);
            } else {
                // Defer update until played
                this.setPendingFrames(newFrames);
            }
        } catch (error) {
            console.error('Failed to check for radar updates:', error);
        }
    }

    static areFramesEqual(a, b) {
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
}
