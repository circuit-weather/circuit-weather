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
        this.boundLoop = this.loop.bind(this);

        this.ui = {
            playBtn: document.getElementById('radarPlayBtn'),
            speedBtn: document.getElementById('radarSpeedBtn'),
            speedLabel: document.getElementById('radarSpeedLabel')
        };

        if (this.ui.playBtn) {
            this.ui.playBtn.addEventListener('click', () => this.togglePlay());
        }
        if (this.ui.speedBtn) {
            this.ui.speedBtn.addEventListener('click', () => this.cycleSpeed());
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

        const now = performance.now();
        const elapsed = now - this.lastFrameTime;
        const speed = this.getCurrentSpeed();

        if (elapsed >= speed) {
            const next = (this.getCurrentFrame() + 1) % this.getFrameCount();
            this.setCurrentFrame(next);
            this.showFrame(next);
            // Adjust for drift while preserving the interval grid
            this.lastFrameTime = now - (elapsed % speed);
        }

        this.animationFrameId = requestAnimationFrame(this.boundLoop);
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
