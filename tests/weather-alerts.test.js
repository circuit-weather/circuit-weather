// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WeatherAlerts, SEVERITY_COLOURS } from '../public/src/map/WeatherAlerts.js';
import { CONFIG } from '../public/src/config.js';

const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
const alert = (props) => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { title: 'Alert', severity: 'moderate', ...props },
});

const ALERTS = [
    alert({ title: 'Minor thing', severity: 'minor', uri: 'https://example.org/minor' }),
    alert({
        title: 'Big storm',
        severity: 'severe',
        regions: 'Northamptonshire',
        expires: '2030-01-01T12:00:00.000Z',
        description: 'Heavy rain <script>alert(1)</script>',
        uri: 'https://example.org/cap.xml',
    }),
    alert({ title: 'Odd', severity: 'weird', uri: 'javascript:alert(1)', expires: 'nonsense' }),
];

const okJson = (data) => ({ ok: true, json: async () => data });

function renderSidebar() {
    document.body.innerHTML = '<section id="alertsSection" hidden><ul id="alertsList"></ul></section>';
}

function createMapboxMap() {
    const layers = new Set();
    const sources = new Set();
    return {
        addSource: vi.fn((id) => sources.add(id)),
        addLayer: vi.fn((layer) => layers.add(layer.id)),
        removeLayer: vi.fn((id) => layers.delete(id)),
        removeSource: vi.fn((id) => sources.delete(id)),
        getLayer: vi.fn((id) => (layers.has(id) || id === 'range-circles-line' ? { id } : undefined)),
        getSource: vi.fn((id) => (sources.has(id) ? { id } : undefined)),
        on: vi.fn(),
        off: vi.fn(),
        _layers: layers,
    };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('WeatherAlerts.fetchAlerts', () => {
    afterEach(() => vi.restoreAllMocks());

    it('requests alerts for the location and sorts them by severity', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({ features: [...ALERTS, { properties: {} }] })));
        const alerts = await WeatherAlerts.fetchAlerts(52.0786, -1.0169);

        expect(fetch).toHaveBeenCalledWith(`${CONFIG.alertsApi}?lat=52.08&lon=-1.02`, expect.any(Object));
        expect(alerts.map(a => a.properties.title)).toEqual(['Big storm', 'Minor thing', 'Odd']);
    });

    it('returns null on HTTP or network errors, and [] for odd payloads', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce({ ok: false })
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce(okJson(null)));

        expect(await WeatherAlerts.fetchAlerts(1, 1)).toBeNull();
        expect(await WeatherAlerts.fetchAlerts(1, 1)).toBeNull();
        expect(console.error).toHaveBeenCalledWith('Failed to fetch weather alerts:', expect.any(Error));
        expect(await WeatherAlerts.fetchAlerts(1, 1)).toEqual([]);
    });
});

describe('WeatherAlerts', () => {
    beforeEach(() => {
        renderSidebar();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({ features: ALERTS })));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('lists alerts in the sidebar using text only', async () => {
        const alerts = new WeatherAlerts(createMapboxMap());
        alerts.setLocation(52, -1);
        await flush();

        const section = document.getElementById('alertsSection');
        expect(section.hidden).toBe(false);

        // Only the most severe two are listed until the rest are asked for
        expect(document.querySelectorAll('.alert-item')).toHaveLength(2);
        const more = section.querySelector('.alerts-more');
        expect(more.textContent).toBe('Show 1 more');
        expect(more.getAttribute('aria-expanded')).toBe('false');
        more.click();
        const items = document.querySelectorAll('.alert-item');
        expect(items).toHaveLength(3);
        expect(section.querySelector('.alerts-more').textContent).toBe('Show fewer');
        expect(document.activeElement).toBe(section.querySelector('.alerts-more'));

        const storm = items[0];
        expect(storm.querySelector('.alert-title').textContent).toBe('Big storm');
        expect(storm.querySelector('.alert-severity').className).toContain('alert-severity--severe');
        expect(storm.querySelector('.alert-regions').textContent).toBe('Northamptonshire');
        expect(storm.querySelector('time').getAttribute('datetime')).toBe('2030-01-01T12:00:00.000Z');
        expect(storm.querySelector('.alert-description').textContent).toContain('<script>');
        expect(storm.querySelector('script')).toBeNull();
        const link = storm.querySelector('a');
        expect(link.href).toBe('https://example.org/cap.xml');
        expect(link.rel).toBe('noopener noreferrer');

        expect(storm.querySelector('.alert-until').textContent).toMatch(/· Source$/);
        expect(items[1].querySelector('.alert-until').textContent).toBe('Source');

        const odd = items[2];
        expect(odd.querySelector('.alert-severity').className).toContain('alert-severity--unknown');
        expect(odd.querySelector('a')).toBeNull();
        expect(odd.querySelector('time')).toBeNull();
        expect(odd.querySelector('.alert-until')).toBeNull();
        expect(odd.querySelector('details')).toBeNull();

        // Re-renders on language change, keeping the expanded list
        document.dispatchEvent(new Event('i18n:change'));
        expect(document.querySelectorAll('.alert-item')).toHaveLength(3);
        expect(section.querySelectorAll('.alerts-more')).toHaveLength(1);

        section.querySelector('.alerts-more').click();
        expect(document.querySelectorAll('.alert-item')).toHaveLength(2);

        // A new circuit starts collapsed
        more.click();
        alerts.setLocation(40, 2);
        await flush();
        expect(document.querySelectorAll('.alert-item')).toHaveLength(2);
    });

    it('lists a warning repeated across forecast zones once, but draws every zone', async () => {
        const zone = { title: 'Wind', severity: 'moderate', expires: '2030-01-01T12:00:00.000Z' };
        fetch.mockResolvedValueOnce(okJson({ features: [alert(zone), alert(zone), alert({ ...zone, regions: 'Coast' })] }));
        const map = createMapboxMap();
        const alerts = new WeatherAlerts(map);
        alerts.setLocation(52, -1);
        await flush();

        expect(document.querySelectorAll('.alert-item')).toHaveLength(2);
        expect(document.querySelector('.alerts-more')).toBeNull();
        const source = map.addSource.mock.calls[0][1];
        expect(source.data.features).toHaveLength(3);
        alerts.destroy();
    });

    it('draws Mapbox polygons coloured by severity with popups', async () => {
        const map = createMapboxMap();
        const popup = { setLngLat: vi.fn().mockReturnThis(), setDOMContent: vi.fn().mockReturnThis(), addTo: vi.fn() };
        vi.stubGlobal('mapboxgl', { Popup: vi.fn(() => popup) });

        const alerts = new WeatherAlerts(map);
        alerts.setLocation(52, -1);
        await flush();

        expect(map.addSource).toHaveBeenCalledWith('weather-alerts-source', expect.objectContaining({ type: 'geojson' }));
        const fill = map.addLayer.mock.calls.find(([layer]) => layer.id === 'weather-alerts-fill');
        expect(fill[1]).toBe('range-circles-line');
        expect(fill[0].paint['fill-color']).toContain(SEVERITY_COLOURS.extreme);

        const [, , onClick] = map.on.mock.calls.find(([event]) => event === 'click');
        onClick({ features: [ALERTS[1]], lngLat: { lng: 0, lat: 0 } });
        const content = popup.setDOMContent.mock.calls[0][0];
        expect(content.querySelector('strong').textContent).toBe('Big storm');
        expect(popup.addTo).toHaveBeenCalledWith(map);

        onClick({ features: [] });
        expect(mapboxgl.Popup).toHaveBeenCalledTimes(1);

        // Style change wipes the layers: updateTheme re-adds them
        map._layers.clear();
        alerts.updateTheme();
        expect(map._layers.has('weather-alerts-fill')).toBe(true);

        alerts.destroy();
        expect(map._layers.size).toBe(0);
        expect(map.off).toHaveBeenCalledWith('click', 'weather-alerts-fill', alerts.handleMapClick);
    });

    it('ignores map clicks when the Mapbox global is missing', async () => {
        const alerts = new WeatherAlerts(createMapboxMap());
        expect(() => alerts.handleMapClick({ features: [ALERTS[0]] })).not.toThrow();
    });

    it('draws Leaflet polygons with popups', async () => {
        const layer = { addTo: vi.fn(), bringToBack: vi.fn() };
        let options;
        vi.stubGlobal('L', {
            geoJSON: vi.fn((data, opts) => { options = opts; return layer; }),
        });
        const map = { hasLayer: vi.fn(), removeLayer: vi.fn() };

        const alerts = new WeatherAlerts(map);
        alerts.setLocation(52, -1);
        await flush();

        expect(layer.addTo).toHaveBeenCalledWith(map);
        expect(layer.bringToBack).toHaveBeenCalled();
        expect(options.style(ALERTS[1])).toMatchObject({ color: SEVERITY_COLOURS.severe });
        expect(options.style(ALERTS[2])).toMatchObject({ color: SEVERITY_COLOURS.unknown });

        const featureLayer = { bindPopup: vi.fn() };
        options.onEachFeature(ALERTS[0], featureLayer);
        const popup = featureLayer.bindPopup.mock.calls[0][0]();
        expect(popup.className).toBe('alert-popup');

        alerts.updateTheme(); // Leaflet layers survive theme changes
        expect(L.geoJSON).toHaveBeenCalledTimes(1);

        alerts.setLocation(null, null);
        expect(map.removeLayer).toHaveBeenCalledWith(layer);
        expect(document.getElementById('alertsSection').hidden).toBe(true);
    });

    it('refreshes on a timer and keeps the last alerts when a refresh fails', async () => {
        vi.useFakeTimers();
        const alerts = new WeatherAlerts(createMapboxMap());
        alerts.setLocation(52, -1);
        await vi.advanceTimersByTimeAsync(0);
        expect(fetch).toHaveBeenCalledTimes(1);

        fetch.mockResolvedValueOnce({ ok: false });
        await vi.advanceTimersByTimeAsync(CONFIG.ALERTS_REFRESH_INTERVAL_MS);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(document.querySelectorAll('.alert-item')).toHaveLength(2);

        alerts.destroy();
        await vi.advanceTimersByTimeAsync(CONFIG.ALERTS_REFRESH_INTERVAL_MS * 2);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('can be disabled and re-enabled', async () => {
        const alerts = new WeatherAlerts(createMapboxMap(), { enabled: false });
        alerts.setLocation(52, -1);
        await flush();
        expect(fetch).not.toHaveBeenCalled();

        alerts.setEnabled(false); // no-op
        alerts.setEnabled(true);
        await flush();
        expect(document.querySelectorAll('.alert-item')).toHaveLength(2);

        alerts.setEnabled(false);
        expect(document.getElementById('alertsSection').hidden).toBe(true);
    });

    it('drops responses superseded by a newer location', async () => {
        let resolveFirst;
        fetch.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
        fetch.mockResolvedValueOnce(okJson({ features: [ALERTS[0]] }));

        const alerts = new WeatherAlerts(createMapboxMap());
        alerts.setLocation(10, 10);
        alerts.setLocation(20, 20);
        await flush();
        resolveFirst(okJson({ features: ALERTS }));
        await flush();

        expect(document.querySelectorAll('.alert-item')).toHaveLength(1);
        alerts.destroy();
    });

    it('works without the sidebar or a map', async () => {
        document.body.innerHTML = '';
        const alerts = new WeatherAlerts(null);
        alerts.setLocation(1, 1);
        await flush();
        expect(alerts.alerts).toHaveLength(3);
        alerts.destroy();
    });

    it('hides alerts once they expire, without waiting for a refresh', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2029-12-31T12:00:00Z'));
        const alerts = new WeatherAlerts(createMapboxMap());
        alerts.setLocation(52, -1);
        await vi.advanceTimersByTimeAsync(0);
        expect(document.querySelectorAll('.alert-item')).toHaveLength(2);

        // 'Big storm' expires at 2030-01-01T12:00Z
        vi.setSystemTime(new Date('2030-01-01T12:01:00Z'));
        alerts.render();
        expect([...document.querySelectorAll('.alert-title')].map(e => e.textContent)).toEqual(['Minor thing', 'Odd']);
        alerts.destroy();
    });

    it('validates links', () => {
        expect(WeatherAlerts.isSafeLink('http://example.org')).toBe(true);
        expect(WeatherAlerts.isSafeLink('ftp://example.org')).toBe(false);
        expect(WeatherAlerts.isSafeLink('not a url')).toBe(false);
        expect(WeatherAlerts.isSafeLink('')).toBe(false);
        expect(WeatherAlerts.isSafeLink(null)).toBe(false);
    });

    it('ranks unknown severities last', () => {
        expect(WeatherAlerts.severityRank(alert({ severity: 'nope' }))).toBe(5);
        expect(WeatherAlerts.severityRank(alert({ severity: 'extreme' }))).toBe(0);
    });
});
