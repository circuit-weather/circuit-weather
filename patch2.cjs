const fs = require('fs');
const filepath = 'tests/recentre-control.test.js';
let content = fs.readFileSync(filepath, 'utf-8');

// We need to also verify that `mapboxMock` has `hasLayer: undefined` correctly set.
// It seems `!this.map.hasLayer` logic in `RecentreControl.js` is fine but we should review `mapboxMock` just in case.

console.log(content.includes("expect(control.button.className).toBe('mapboxgl-ctrl-icon recentre-control-mapbox');"));
