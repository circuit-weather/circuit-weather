export class CountdownTimer {
    constructor() {
        this.timer = null;
        this.targetTime = null;
        this.sessionName = '';

        // Bolt Optimization: Cache DOM elements
        this.ui = {
            timer: document.getElementById('countdownTimer'),
            session: document.getElementById('countdownSession'),
            mobileTimer: document.getElementById('mobileCountdownTimer'),
            mobileSession: document.getElementById('mobileCountdownSession'),
            card: document.getElementById('countdownCard')
        };
    }

    start(targetTime, sessionName) {
        this.stop();
        this.targetTime = targetTime;
        this.sessionName = sessionName;

        this.show(true);
        this.update();
        this.timer = setInterval(() => this.update(), 1000);
    }

    update() {
        const now = new Date();
        const diff = this.targetTime - now;

        if (diff <= 0) {
            if (this.ui.timer) {
                this.ui.timer.textContent = 'NOW';
                this.ui.timer.removeAttribute('aria-label');
            }
            if (this.ui.mobileTimer) {
                this.ui.mobileTimer.textContent = 'NOW';
                this.ui.mobileTimer.removeAttribute('aria-label');
            }
            this.stop();
            return;
        }

        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);

        let timeText;
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            timeText = `${days}d ${hours % 24}h`;
        } else {
            timeText = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        const accessibleText = this.getAccessibleDuration(diff);

        if (this.ui.timer) {
            this.ui.timer.textContent = timeText;
            this.ui.timer.setAttribute('aria-label', accessibleText);
        }
        if (this.ui.mobileTimer) {
            this.ui.mobileTimer.textContent = timeText;
            this.ui.mobileTimer.setAttribute('aria-label', accessibleText);
        }
        if (this.ui.session) this.ui.session.textContent = this.sessionName;
        if (this.ui.mobileSession) this.ui.mobileSession.textContent = this.sessionName;
    }

    getAccessibleDuration(diff) {
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);

        if (hours > 24) {
            const days = Math.floor(hours / 24);
            const remHours = hours % 24;
            return `${days} day${days !== 1 ? 's' : ''}, ${remHours} hour${remHours !== 1 ? 's' : ''}`;
        }

        const parts = [];
        if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
        if (mins > 0) parts.push(`${mins} minute${mins !== 1 ? 's' : ''}`);
        parts.push(`${secs} second${secs !== 1 ? 's' : ''}`);

        return parts.join(', ');
    }

    show(visible) {
        if (this.ui.card) this.ui.card.style.display = visible ? 'block' : 'none';
        // Note: mobileCard visibility is managed by CircuitWeatherApp
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}
