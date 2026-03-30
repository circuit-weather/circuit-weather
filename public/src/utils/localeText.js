import { getEnglishVariant } from './locale.js';

const TEXT = {
    unitMetricLabel: {
        us: 'Kilometers',
        intl: 'Kilometres',
    },
    recenterOnCircuit: {
        us: 'Recenter on circuit',
        intl: 'Recentre on circuit',
    },
};

export function t(key) {
    const variant = getEnglishVariant();
    const entry = TEXT[key];
    if (!entry) return '';
    return entry[variant] || entry.intl;
}
