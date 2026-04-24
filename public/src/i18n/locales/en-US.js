import { en } from './en.js';

export const enUS = {
    ...en,
    controls: {
        ...en.controls,
        metricLabel: 'Kilometers',
    },
    map: {
        ...en.map,
        recenterOnCircuit: 'Recenter on circuit',
    },
};
