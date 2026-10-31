import { SafeStorage } from '../utils/storage.js';

const STORAGE_KEY = 'autoAdvance';
// Frequent enough that a switch lands within half a minute of the planned time,
// and cheap: each check is arithmetic on the loaded schedule
export const CHECK_INTERVAL_MS = 30000;

const keyOf = (selection) => (selection ? `${selection.round}|${selection.sessionId ?? ''}` : '');

/**
 * Moves the page on to the next session (and round) as each one finishes,
 * so it can be left open as a console. Off by default; the choice is saved.
 *
 * What "finished" means lives in utils/sessionTiming.js: the app passes
 * getTarget(), the selection a fresh page load would make right now.
 *
 * A session or round picked by hand is left alone until the target next
 * changes (a session starting or finishing), then following resumes.
 */
export class AutoAdvance {
    /**
     * @param {Object} options
     * @param {HTMLElement|null} options.toggle - role="switch" button
     * @param {Function} options.getTarget - () => {round, sessionId}|null, what should be shown now
     * @param {Function} options.getSelection - () => {round, sessionId}|null, what is shown
     * @param {Function} options.apply - (target) => Promise, shows the target
     */
    constructor({ toggle, getTarget, getSelection, apply }) {
        this.toggle = toggle;
        this.getTarget = getTarget;
        this.getSelection = getSelection;
        this.apply = apply;
        this.enabled = SafeStorage.getItem(STORAGE_KEY) === 'true';
        this.pausedAt = null;
        this.timer = null;
        this.applying = false;

        this.check = this.check.bind(this);
        this.handleVisibility = () => {
            // Background tabs throttle timers: catch up as soon as the page is seen
            if (document.visibilityState === 'visible') this.check();
        };

        if (this.toggle) {
            this.toggle.addEventListener('click', () => this.setEnabled(!this.enabled));
        }
        document.addEventListener('visibilitychange', this.handleVisibility);
        this.render();
        if (this.enabled) this.start();
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        SafeStorage.setItem(STORAGE_KEY, String(enabled));
        this.render();
        if (enabled) {
            // Turning it on means "show me what's on now"
            this.pausedAt = null;
            this.start();
            this.check();
        } else {
            this.stop();
        }
    }

    /** Call after the user picks a round or session (or opens a link to one). */
    noteManualSelection() {
        if (!this.enabled) return;
        const target = keyOf(this.getTarget());
        this.pausedAt = target === keyOf(this.getSelection()) ? null : target;
    }

    async check() {
        if (!this.enabled || this.applying) return;
        const target = this.getTarget();
        if (!target) return;

        const key = keyOf(target);
        if (this.pausedAt !== null) {
            if (key === this.pausedAt) return;
            this.pausedAt = null;
        }
        if (key === keyOf(this.getSelection())) return;

        this.applying = true;
        try {
            await this.apply(target);
        } catch (error) {
            console.error('Auto-advance failed:', error);
        } finally {
            this.applying = false;
        }
    }

    start() {
        if (!this.timer) this.timer = setInterval(this.check, CHECK_INTERVAL_MS);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    render() {
        if (this.toggle) this.toggle.setAttribute('aria-checked', String(this.enabled));
    }

    destroy() {
        this.stop();
        document.removeEventListener('visibilitychange', this.handleVisibility);
    }
}
