import { i18n } from '../i18n/index.js';

const KEY_MAP = {
    unitMetricLabel: 'controls.metricLabel',
    recenterOnCircuit: 'map.recenterOnCircuit',
};

export function t(key, params = {}) {
    const mappedKey = KEY_MAP[key] || key;
    return i18n.t(mappedKey, params);
}
