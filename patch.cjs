const fs = require('fs');
const filepath = 'tests/recentre-control.test.js';
let content = fs.readFileSync(filepath, 'utf-8');

content = content.replace(
    "expect(control.button.className).toBe('mapboxgl-ctrl-icon recentre-control-mapbox');",
    "expect(control.button.className).toBe('mapboxgl-ctrl-icon recentre-control-mapbox');" // just to test logic
);

fs.writeFileSync(filepath, content);
