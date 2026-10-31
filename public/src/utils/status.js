/**
 * Formats a label with status indicators.
 * @param {string} label - The original label.
 * @param {string} status - The status ('LIVE', 'FUTURE', 'PAST', 'CURRENT').
 * @param {boolean} isNext - Whether this item is the next upcoming one.
 * @returns {string} - The formatted label.
 */
export function formatStatusLabel(label, status, isNext) {
    if (status === 'LIVE') {
        return `🔴 ${i18n.t('status.live')} ${label}`;
    }
    if (status === 'CURRENT') {
        return `(${i18n.t('status.current')}) ${label}`;
    }
    if (isNext) {
        return `(${i18n.t('status.next')}) ${label}`;
    }
    return label;
}
import { i18n } from '../i18n/index.js';
