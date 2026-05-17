import { CONFIG } from '../config.js';
import { i18n } from '../i18n/index.js';

export class CountdownTimer {
    constructor() {
        this.timer = null;
        this.targetTime = null;
        this.sessionName = '';

        // Bolt Optimization: Cache DOM elements
        this.ui = {
            timer: document.getElementById('mapCountdownTimer'),
            session: document.getElementById('mapCountdownSession'),
            card: document.getElementById('mapCountdown')
        };
    }

    start(targetTime, sessionName) {
        this.stop();
        this.targetTime = targetTime;
        this.sessionName = sessionName;

        const now = new Date();
        const diff = this.targetTime - now;

        if (diff > 0) {
            this.show(true);
            this.update();
            this.timer = setInterval(() => this.update(), 1000);
        } else {
            this.show(false);
        }
    }

    update() {
        const now = new Date();
        const diff = this.targetTime - now;

        if (diff <= 0) {
            this.show(false);
            this.stop();
            return;
        }

        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / CONFIG.ONE_MINUTE_MS);
        const secs = Math.floor((diff % CONFIG.ONE_MINUTE_MS) / 1000);

        let timeText;
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            timeText = `${days}${i18n.t('countdown.dayShort')} ${hours % 24}${i18n.t('countdown.hourShort')}`;
        } else {
            timeText = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        const accessibleText = this.getAccessibleDuration(diff);

        // Scout: Generate ISO 8601 duration format for the datetime attribute
        let isoDuration = 'PT';
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            const remHours = hours % 24;
            isoDuration = `P${days}DT${remHours}H`;
        } else {
            isoDuration += `${hours}H${mins}M${secs}S`;
        }

        if (this.ui.timer) {
            this.ui.timer.textContent = timeText;
            this.ui.timer.setAttribute('aria-label', accessibleText);
            this.ui.timer.setAttribute('datetime', isoDuration);
        }
        if (this.ui.session) this.ui.session.textContent = this.sessionName;
    }

    getAccessibleDuration(diff) {
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / CONFIG.ONE_MINUTE_MS);
        const secs = Math.floor((diff % CONFIG.ONE_MINUTE_MS) / 1000);

        if (hours > 24) {
            const days = Math.floor(hours / 24);
            const remHours = hours % 24;
            const dayLabel = days === 1 ? i18n.t('countdown.day') : i18n.t('countdown.dayPlural');
            const hourLabel = remHours === 1 ? i18n.t('countdown.hour') : i18n.t('countdown.hourPlural');
            return `${days} ${dayLabel}, ${remHours} ${hourLabel}`;
        }

        const parts = [];
        if (hours > 0) {
            const hourLabel = hours === 1 ? i18n.t('countdown.hour') : i18n.t('countdown.hourPlural');
            parts.push(`${hours} ${hourLabel}`);
        }
        if (mins > 0) {
            const minuteLabel = mins === 1 ? i18n.t('countdown.minute') : i18n.t('countdown.minutePlural');
            parts.push(`${mins} ${minuteLabel}`);
        }
        const secondLabel = secs === 1 ? i18n.t('countdown.second') : i18n.t('countdown.secondPlural');
        parts.push(`${secs} ${secondLabel}`);

        return parts.join(', ');
    }

    show(visible) {
        if (this.ui.card) this.ui.card.style.display = visible ? 'block' : 'none';
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}
