import { CONFIG } from '../config.js';
import { i18n } from '../i18n/index.js';

export class RadarTimeFormatter {
    /**
     * Calculates effective time in milliseconds including drift from the latest frame.
     * @param {number} timestamp - Unix timestamp in seconds
     * @param {Array} frames - Array of radar frame objects
     * @param {number} pastFrameCount - Number of past frames
     * @returns {number} Effective time in milliseconds
     */
    static calculateEffectiveTime(timestamp, frames = [], pastFrameCount = 0) {
        let drift = 0;
        const latestFrame = frames[pastFrameCount - 1];
        if (latestFrame) {
            drift = Date.now() - (latestFrame.time * 1000);
        }
        return (timestamp * 1000) + drift;
    }

    /**
     * Calculates session-relative time strings if within the valid window.
     * @param {number} effectiveTimeMs - Effective frame time in milliseconds
     * @param {Date|null} sessionTime - Target session time
     * @returns {{ relativeText: string, accessibleText: string } | null}
     */
    static getSessionRelativeTimeInfo(effectiveTimeMs, sessionTime) {
        if (!sessionTime) return null;

        const diff = (effectiveTimeMs - sessionTime.getTime()) / CONFIG.ONE_MINUTE_MS;
        // Only show session-relative if the session is within 7 days (10080 minutes) of the frame's effective time
        if (Math.abs(diff) > 7 * 24 * 60) {
            return null;
        }

        const absDiff = Math.abs(Math.round(diff));
        const durationText = this.formatDuration(absDiff);

        let relativeText = '';
        if (Math.abs(diff) < 1) {
            relativeText = i18n.t('radar.sessionStart');
        } else if (diff < 0) {
            relativeText = i18n.t('radar.beforeSession', { duration: durationText });
        } else {
            relativeText = i18n.t('radar.afterSession', { duration: durationText });
        }

        return { relativeText, accessibleText: relativeText };
    }

    /**
     * Calculates standard real-time relative display strings (forecast / live / ago).
     * @param {number} timestamp - Unix timestamp in seconds
     * @param {number} effectiveTimeMs - Effective frame time in milliseconds
     * @returns {{ relativeText: string, accessibleText: string }}
     */
    static getStandardRelativeTimeInfo(timestamp, effectiveTimeMs) {
        const diffSec = timestamp - (Date.now() / 1000);

        if (diffSec > 60) {
            const forecastText = i18n.t('radar.forecast');
            return { relativeText: forecastText, accessibleText: forecastText };
        }

        const diffMin = Math.round((Date.now() - effectiveTimeMs) / CONFIG.ONE_MINUTE_MS);

        if (diffMin < 1) {
            return {
                relativeText: i18n.t('radar.live'),
                accessibleText: i18n.t('radar.liveAria')
            };
        }

        const relativeText = diffMin === 1
            ? i18n.t('radar.minutesAgo', { count: diffMin })
            : i18n.t('radar.minutesAgoPlural', { count: diffMin });

        return { relativeText, accessibleText: relativeText };
    }

    /**
     * Formats a duration in minutes into a readable string.
     * Always includes minutes to prevent layout jumps during playback.
     * @param {number} totalMinutes
     * @returns {string} e.g. "1 day 2 hours 30 minutes"
     */
    static formatDuration(totalMinutes) {
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

        const minuteLabel = minutes === 1 ? i18n.t('countdown.minute') : i18n.t('countdown.minutePlural');
        parts.push(`${minutes} ${minuteLabel}`);

        return parts.join(' ');
    }
}
