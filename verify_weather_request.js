const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Mock Environment
const window = {
    location: {
        hostname: 'circuit-weather.racing',
        protocol: 'https:',
        pathname: '/'
    },
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    ResizeObserver: class { observe() {} },
    history: { pushState: () => {} },
    innerWidth: 1024
};

const document = {
    documentElement: { setAttribute: () => {}, getAttribute: () => 'light' },
    getElementById: () => ({ addEventListener: () => {}, style: {} }),
    querySelector: () => ({ addEventListener: () => {}, style: {} }),
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} }, setAttribute: () => {} }),
    createDocumentFragment: () => ({ appendChild: () => {} }),
    addEventListener: () => {},
    body: { style: {} },
    activeElement: { tagName: 'BODY' }
};

const navigator = {
    language: 'en-US'
};

const localStorage = {
    getItem: () => null,
    setItem: () => {}
};

const L = {
    Control: { extend: () => class {} },
    map: () => ({ on: () => {}, addControl: () => {}, setView: () => {}, getBounds: () => ({ getNorth: () => 0 }), distance: () => 0, removeLayer: () => {}, invalidateSize: () => {} }),
    tileLayer: () => ({ addTo: () => {}, on: () => {} }),
    DomUtil: { create: () => ({ querySelector: () => ({}) }) },
    geoJSON: () => ({ addTo: () => {}, bringToBack: () => {}, setStyle: () => {} }),
    circle: () => ({ addTo: () => {} }),
    circleMarker: () => ({ addTo: () => {} }),
    divIcon: () => {},
    marker: () => ({ addTo: () => {} }),
    latLng: () => {},
    DomEvent: { disableClickPropagation: () => {} }
};

let lastFetchUrl = null;
const fetch = async (url) => {
    lastFetchUrl = url;
    return {
        ok: true,
        json: async () => ({
            current: {},
            hourly: { time: [] },
            current_units: {}
        })
    };
};

const Request = class {};

// Sandbox Context
const sandbox = {
    window,
    document,
    navigator,
    localStorage,
    L,
    fetch,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Intl: Intl,
    Date: Date,
    Math: Math,
    Object: Object,
    String: String,
    Number: Number,
    parseFloat: parseFloat,
    parseInt: parseInt,
    performance: performance
};

// Read app.js
let appCode = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');

// Expose WeatherClient
appCode += '\nwindow.WeatherClient = WeatherClient;';

// Run app.js in sandbox
vm.createContext(sandbox);
try {
    vm.runInContext(appCode, sandbox);
} catch (e) {
    console.error("Error running app.js:", e);
    process.exit(1);
}

// Test WeatherClient
async function runTest() {
    try {
        const client = new sandbox.window.WeatherClient();
        const lat = 48.123456;
        const lon = 2.123456;

        console.log(`Calling getForecast with lat=${lat}, lon=${lon}`);
        await client.getForecast(lat, lon, new Date());

        console.log(`Fetch URL: ${lastFetchUrl}`);

        // Expected: Should contain rounded coordinates if optimized
        // Currently expected to FAIL (contain raw coordinates)

        const expectedLat = "48.12";
        const expectedLon = "2.12";

        // Check for rounded values and absence of long decimals
        if (lastFetchUrl.includes(`lat=${expectedLat}`) &&
            lastFetchUrl.includes(`lon=${expectedLon}`) &&
            !lastFetchUrl.includes(lat.toString()) &&
            !lastFetchUrl.includes(lon.toString())) {
            console.log("PASS: URL uses rounded coordinates.");
        } else {
            console.log("FAIL: URL does NOT use rounded coordinates.");
        }

    } catch (e) {
        console.error("Test failed with error:", e);
    }
}

runTest();
