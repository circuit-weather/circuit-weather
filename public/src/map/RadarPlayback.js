import { CONFIG } from '../config.js';
import { i18n } from '../i18n/index.js';

/**
 * Drives radar animation playback (play/pause/loop) and the speed control.
 * Extracted from WeatherRadar to keep that class focused.
 *
 * Frame state (the frame list, the current index, and how a frame is shown)
 * is owned by WeatherRadar and accessed through the injected callbacks, so this
 * controller only owns playback state (isPlaying, speed, the rAF handle).
 */
export class RadarPlayback {
    constructor(options = {}) {
        this.getFrameCount = options.getFrameCount || (() => 0);
        this.getCurrentFrame = options.getCurrentFrame || (() => 0);
        this.setCurrentFrame = options.setCurrentFrame || (() => {});
        this.showFrame = options.showFrame || (() => {});
        // Flush any deferred frame update before playback starts.
        this.beforePlay = options.beforePlay || (() => {});

        this.isPlaying = false;
        this.animationFrameId = null;
        this.lastFrameTime = 0;
        this.speedIndex = CONFIG.defaultSpeedIndex;
        this.frameErrorLogged = false;
        this.boundLoop = this.loop.bind(this);

        this.ui = {
            playBtn: document.getElementById('radarPlayBtn'),
            speedBtn: document.getElementById('radarSpeedBtn'),
            speedLabel: document.getElementById('radarSpeedLabel')
        };

        if (this.ui.playBtn) {
            this.ui.playBtn.addEventListener('click', () => this.togglePlay());
            // Palette A11y: Ensure keyboard users can activate the play button
            this.ui.playBtn.addEventListener('keydown', (e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    this.togglePlay();
                }
            });
        }
        if (this.ui.speedBtn) {
            this.ui.speedBtn.addEventListener('click', () => this.cycleSpeed());
            // Palette A11y: Ensure keyboard users can activate the speed button
            this.ui.speedBtn.addEventListener('keydown', (e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    this.cycleSpeed();
                }
            });
        }

        this.updateSpeedLabel();
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

    play() {
        // Clear any existing timer/loop first to prevent double animations
        this.pause();

        // Apply any pending updates before starting
        this.beforePlay();

        this.isPlaying = true;
        if (this.ui.playBtn) {
            this.ui.playBtn.classList.add('playing');
            this.ui.playBtn.setAttribute('aria-pressed', 'true');
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

        // Schedule the next tick first: if showing a frame throws (e.g. Mapbox
        // mid style reload), playback must carry on rather than freeze with the
        // button still showing "pause".
        this.animationFrameId = requestAnimationFrame(this.boundLoop);

        const now = performance.now();
        const elapsed = now - this.lastFrameTime;
        const speed = this.getCurrentSpeed();

        if (elapsed >= speed) {
            // Adjust for drift while preserving the interval grid
            this.lastFrameTime = now - (elapsed % speed);
            this.advance();
        }
    }

    advance() {
        // No frames while a reload swaps them in: wait for the next tick
        const count = this.getFrameCount();
        if (count <= 0) return;

        // Recover from an invalid index (e.g. NaN after a reload emptied the frames)
        const current = this.getCurrentFrame();
        const next = Number.isInteger(current) && current >= 0 ? (current + 1) % count : 0;

        try {
            this.setCurrentFrame(next);
            this.showFrame(next);
            this.frameErrorLogged = false;
        } catch (error) {
            // Log once per run of failures; the loop retries on the next tick
            if (!this.frameErrorLogged) {
                console.error('Radar frame failed to show:', error);
                this.frameErrorLogged = true;
            }
        }
    }

    pause() {
        this.isPlaying = false;
        if (this.ui.playBtn) {
            this.ui.playBtn.classList.remove('playing');
            this.ui.playBtn.setAttribute('aria-pressed', 'false');
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

    destroy() {
        this.pause();
    }
}
