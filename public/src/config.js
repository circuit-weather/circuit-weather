/**
 * Circuit Weather - Configuration & Constants
 */

export const CONFIG = {
    f1ApiBase: '/api/f1',
    rainViewerApi: '/api/radar',
    trackApi: '/api/track',
    weatherApi: 'https://api.open-meteo.com/v1/forecast',
    // Use Carto basemaps (reliable, free, no key)
    mapTiles: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    mapTilesDark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    defaultCenter: [48.8566, 2.3522],
    defaultZoom: 3,
    circuitZoom: 10,
    radarOpacity: 0.65,
    // Speed options: slower = higher ms, faster = lower ms
    radarSpeeds: [
        { label: '0.5x', speed: 2000 },
        { label: '1x', speed: 1000 },
        { label: '2x', speed: 500 }
    ],
    defaultSpeedIndex: 1, // Start at 1x

    // Time Constants
    ONE_MINUTE_MS: 60000,
    RACE_DURATION_BUFFER_HOURS: 4, // Assume race + podium + post-race takes ~4 hours
    RACE_DAY_END_HOUR: 23, // Fallback to end of day if session time is missing
    WEATHER_REFRESH_INTERVAL_MS: 300000, // 5 minutes
    SESSION_FORECAST_REFRESH_INTERVAL_MS: 900000, // 15 minutes
    TILE_LOAD_TIMEOUT_MS: 3000, // 3 seconds
    MIN_POLL_DELAY_MS: 30000, // 30 seconds
};
// SEC: Prevent runtime tampering with configuration
Object.freeze(CONFIG);

// Country code mappings for flags (ISO 3166-1 alpha-2)
export const COUNTRY_CODES = {
    'Australia': 'au', 'Austria': 'at', 'Azerbaijan': 'az', 'Bahrain': 'bh',
    'Belgium': 'be', 'Brazil': 'br', 'Canada': 'ca', 'China': 'cn',
    'Hungary': 'hu', 'Italy': 'it', 'Japan': 'jp', 'Mexico': 'mx',
    'Monaco': 'mc', 'Netherlands': 'nl', 'Qatar': 'qa', 'Saudi Arabia': 'sa',
    'Singapore': 'sg', 'Spain': 'es', 'UAE': 'ae', 'UK': 'gb',
    'USA': 'us', 'United States': 'us',
};
// SEC: Prevent runtime tampering with country codes
Object.freeze(COUNTRY_CODES);

// Circuit ID Mapping (Ergast -> bacinger/f1-circuits)
// Keys must match Ergast Circuit IDs
export const CIRCUIT_MAP = {
    'albert_park': 'au-1953',
    'americas': 'us-2012',
    'bahrain': 'bh-2002',
    'baku': 'az-2016',
    'catalunya': 'es-1991',
    'hungaroring': 'hu-1986',
    'imola': 'it-1953',
    'interlagos': 'br-1940',
    'jeddah': 'sa-2021',
    'las_vegas': 'us-2023',
    'losail': 'qa-2004',
    'marina_bay': 'sg-2008',
    'miami': 'us-2022',
    'monaco': 'mc-1929',
    'monza': 'it-1922',
    'nurburgring': 'de-1927', // Historic
    'red_bull_ring': 'at-1969',
    'ricard': 'fr-1969', // Historic
    'rodriguez': 'mx-1962',
    'sepang': 'my-1999', // Historic
    'shanghai': 'cn-2004',
    'silverstone': 'gb-1948',
    'sochi': 'ru-2014', // Historic
    'spa': 'be-1925',
    'suzuka': 'jp-1962',
    'villeneuve': 'ca-1978',
    'yas_marina': 'ae-2009',
    'zandvoort': 'nl-1948'
};
// SEC: Prevent runtime tampering with circuit mappings
Object.freeze(CIRCUIT_MAP);
