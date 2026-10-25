import { describe, it, expect } from 'vitest';
import {
  normaliseLibreWxrMetadata,
  normaliseRainViewerMetadata,
  buildOverlayQuery,
  resolveTileUpstream,
  buildAlertsUpstreamUrl,
  sanitiseAlerts,
  TILE_TTL_PAST,
  TILE_TTL_NOWCAST,
  TILE_TTL_SATELLITE,
} from '../src/radar-providers.js';

const NOW_MS = 2_000_000 * 1000;

describe('normaliseLibreWxrMetadata', () => {
  it('keeps only validated frames, satellite frames and colour schemes', () => {
    const result = normaliseLibreWxrMetadata({
      host: 'https://evil.example',
      radar: {
        past: [
          { time: 100, path: '/v2/radar/100' },
          { time: 'x', path: '/v2/radar/101' },
          { time: 102, path: '/v2/radar/../../etc' },
          { time: -1, path: '/v2/radar/1' },
          null,
        ],
        nowcast: [{ time: 200, path: '/v2/radar/200' }, { time: 201, path: 5 }],
        colorSchemes: [
          { id: 2, name: '  Universal Blue  ' },
          { id: 99, name: 'Bad id' },
          { id: 3, name: 7 },
          { id: 4, name: '   ' },
          null,
        ],
      },
      satellite: { infrared: [{ time: 50, path: '/v2/satellite/50' }, { time: 51, path: '/v2/radar/x' }] },
    });

    expect(result).toEqual({
      version: '2.0',
      provider: 'librewxr',
      maxZoom: 12,
      radar: {
        past: [{ time: 100, path: '/v2/radar/100' }],
        nowcast: [{ time: 200, path: '/v2/radar/200' }],
      },
      satellite: { infrared: [{ time: 50, path: '/v2/satellite/50' }] },
      colorSchemes: [{ id: 2, name: 'Universal Blue' }],
    });
  });

  it('caps the number of frames and colour schemes', () => {
    const past = Array.from({ length: 60 }, (_, i) => ({ time: i + 1, path: `/v2/radar/${i + 1}` }));
    const colorSchemes = Array.from({ length: 40 }, () => ({ id: 1, name: 'A' }));
    const result = normaliseLibreWxrMetadata({ radar: { past, colorSchemes } });
    expect(result.radar.past).toHaveLength(48);
    expect(result.colorSchemes).toHaveLength(32);
    expect(result.radar.nowcast).toEqual([]);
    expect(result.satellite.infrared).toEqual([]);
  });

  it('returns null without usable past frames', () => {
    expect(normaliseLibreWxrMetadata({})).toBeNull();
    expect(normaliseLibreWxrMetadata(null)).toBeNull();
    expect(normaliseLibreWxrMetadata({ radar: { past: [{ time: 1, path: '/nope' }] } })).toBeNull();
  });
});

describe('normaliseRainViewerMetadata', () => {
  it('prefixes paths so tiles route to RainViewer', () => {
    const result = normaliseRainViewerMetadata({
      radar: {
        past: [{ time: 100, path: '/v2/radar/abc123' }, { time: 101, path: '/v2/radar/a-b' }],
        nowcast: [{ time: 200, path: '/v2/radar/def456' }],
      },
    });
    expect(result).toEqual({
      version: '2.0',
      provider: 'rainviewer',
      maxZoom: 7,
      radar: {
        past: [{ time: 100, path: '/rainviewer/v2/radar/abc123' }],
        nowcast: [{ time: 200, path: '/rainviewer/v2/radar/def456' }],
      },
      satellite: { infrared: [] },
      colorSchemes: [],
    });
  });

  it('returns null without usable past frames', () => {
    expect(normaliseRainViewerMetadata({ radar: { past: [] } })).toBeNull();
  });
});

describe('buildOverlayQuery', () => {
  it('keeps allowed overlays in a fixed order', () => {
    const params = new URLSearchParams('lightning=bolts&cells=dark&arrows=light&nowcast=1');
    expect(buildOverlayQuery(params)).toBe('?arrows=light&cells=dark&lightning=bolts');
  });

  it('drops unknown values', () => {
    const params = new URLSearchParams('arrows=<script>&cells=&lightning=1');
    expect(buildOverlayQuery(params)).toBe('');
  });
});

describe('resolveTileUpstream', () => {
  const none = new URLSearchParams();

  it('routes past LibreWXR radar tiles with the long TTL', () => {
    const result = resolveTileUpstream('/v2/radar/1000/512/12/3/4/2/1_1.png', none, NOW_MS);
    expect(result).toEqual({
      upstreamUrl: 'https://api.librewxr.net/v2/radar/1000/512/12/3/4/2/1_1.png',
      cacheKeyUrl: 'https://api.librewxr.net/v2/radar/1000/512/12/3/4/2/1_1.png',
      ttl: TILE_TTL_PAST,
    });
  });

  it('caches nowcast tiles briefly under a separate key', () => {
    const result = resolveTileUpstream('/v2/radar/3000000/512/5/3/4/2/1_1.png', none, NOW_MS);
    expect(result.ttl).toBe(TILE_TTL_NOWCAST);
    expect(result.upstreamUrl).toBe('https://api.librewxr.net/v2/radar/3000000/512/5/3/4/2/1_1.png');
    expect(result.cacheKeyUrl).toBe(`${result.upstreamUrl}?cw-nowcast=1`);
  });

  it('appends overlay params, joining the nowcast marker with &', () => {
    const params = new URLSearchParams('arrows=dark');
    const result = resolveTileUpstream('/v2/radar/3000000/512/5/3/4/2/1_1.png', params, NOW_MS);
    expect(result.upstreamUrl).toBe('https://api.librewxr.net/v2/radar/3000000/512/5/3/4/2/1_1.png?arrows=dark');
    expect(result.cacheKeyUrl).toBe(`${result.upstreamUrl}&cw-nowcast=1`);
  });

  it('rejects radar tiles beyond the zoom limit or with an unknown colour', () => {
    expect(resolveTileUpstream('/v2/radar/1000/512/13/3/4/2/1_1.png', none, NOW_MS)).toBeNull();
    expect(resolveTileUpstream('/v2/radar/1000/512/5/3/4/99/1_1.png', none, NOW_MS)).toBeNull();
    expect(resolveTileUpstream('/v2/radar/1000/512/5/3/4/255/0_0.png', none, NOW_MS)).not.toBeNull();
  });

  it('routes satellite tiles without overlays', () => {
    const params = new URLSearchParams('arrows=dark');
    expect(resolveTileUpstream('/v2/satellite/900/512/6/3/4/0/0_0.png', params, NOW_MS)).toEqual({
      upstreamUrl: 'https://api.librewxr.net/v2/satellite/900/512/6/3/4/0/0_0.png',
      cacheKeyUrl: 'https://api.librewxr.net/v2/satellite/900/512/6/3/4/0/0_0.png',
      ttl: TILE_TTL_SATELLITE,
    });
    expect(resolveTileUpstream('/v2/satellite/900/512/13/3/4/0/0_0.png', none, NOW_MS)).toBeNull();
  });

  it('routes prefixed RainViewer tiles and enforces their zoom limit', () => {
    expect(resolveTileUpstream('/rainviewer/v2/radar/abc/512/7/3/4/2/1_1.png', none, NOW_MS)).toEqual({
      upstreamUrl: 'https://tilecache.rainviewer.com/v2/radar/abc/512/7/3/4/2/1_1.png',
      cacheKeyUrl: 'https://tilecache.rainviewer.com/v2/radar/abc/512/7/3/4/2/1_1.png',
      ttl: TILE_TTL_PAST,
    });
    expect(resolveTileUpstream('/rainviewer/v2/radar/abc/512/8/3/4/2/1_1.png', none, NOW_MS)).toBeNull();
  });

  it('rejects anything else', () => {
    expect(resolveTileUpstream('/v2/radar/abc/512/5/3/4/2/1_1.png', none, NOW_MS)).toBeNull();
    expect(resolveTileUpstream('/v2/coverage/0/512/5/3/4/0/0_0.png', none, NOW_MS)).toBeNull();
    expect(resolveTileUpstream('/test.png', none, NOW_MS)).toBeNull();
  });
});

describe('buildAlertsUpstreamUrl', () => {
  it('builds a rounded bbox around the location', () => {
    const url = buildAlertsUpstreamUrl(new URLSearchParams('lat=52.07&lon=-1.02'));
    expect(url).toBe('https://api.librewxr.net/v2/alerts?bbox=-3,50.1,1,54.1&simplify=1000');
  });

  it('clamps the bbox at the map edges', () => {
    const url = buildAlertsUpstreamUrl(new URLSearchParams('lat=89&lon=179.5'));
    expect(url).toBe('https://api.librewxr.net/v2/alerts?bbox=177.5,85,180,85&simplify=1000');
  });

  it.each([
    [''],
    ['lat=1'],
    ['lat=&lon=2'],
    ['lat=abc&lon=2'],
    ['lat=91&lon=2'],
    ['lat=1&lon=-181'],
    ['lat=Infinity&lon=2'],
  ])('rejects invalid coordinates: %s', (query) => {
    expect(buildAlertsUpstreamUrl(new URLSearchParams(query))).toBeNull();
  });
});

describe('sanitiseAlerts', () => {
  const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
  const polygon = { type: 'Polygon', coordinates: [ring] };
  const feature = (properties, geometry = polygon) => ({ type: 'Feature', geometry, properties });

  it('rebuilds features with validated geometry and plain-text properties', () => {
    const result = sanitiseAlerts({
      features: [feature({
        title: '  Thunderstorms  ',
        severity: 'Severe',
        time: '1999000',
        expires: '2001000',
        description: 'Heavy rain',
        regions: '["North", 5, "South"]',
        uri: 'https://example.org/cap.xml',
        extra: '<script>',
      })],
    }, NOW_MS);

    expect(result).toEqual({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
          id: 'alert-0',
          title: 'Thunderstorms',
          severity: 'severe',
          time: new Date(1999000 * 1000).toISOString(),
          expires: new Date(2001000 * 1000).toISOString(),
          description: 'Heavy rain',
          regions: 'North; South',
          uri: 'https://example.org/cap.xml',
        },
      }],
    });
  });

  it('accepts MultiPolygons, ISO times and semicolon-joined regions', () => {
    const result = sanitiseAlerts({
      features: [feature(
        { title: 'Wind', severity: 'bogus', expires: '2099-01-01T00:00:00Z', regions: 'A; B', uri: 'javascript:alert(1)' },
        { type: 'MultiPolygon', coordinates: [[ring], [ring]] }
      )],
    }, NOW_MS);
    const props = result.features[0].properties;
    expect(result.features[0].geometry.type).toBe('MultiPolygon');
    expect(props.severity).toBe('unknown');
    expect(props.expires).toBe('2099-01-01T00:00:00.000Z');
    expect(props.regions).toBe('A; B');
    expect(props.uri).toBe('');
    expect(props.time).toBeNull();
    expect(props.description).toBe('');
  });

  it('drops expired, untitled and malformed alerts', () => {
    const result = sanitiseAlerts({
      features: [
        feature({ title: 'Expired', expires: '1000' }),
        feature({ title: '' }),
        feature({ title: 'No geometry' }, null),
        feature({ title: 'Point' }, { type: 'Point', coordinates: [0, 0] }),
        feature({ title: 'Short ring' }, { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }),
        feature({ title: 'Empty polygon' }, { type: 'Polygon', coordinates: [] }),
        feature({ title: 'Bad position' }, { type: 'Polygon', coordinates: [[[0, 0], [1, 0], ['x', 1], [0, 0]]] }),
        feature({ title: 'Out of range' }, { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [200, 1], [0, 0]]] }),
        feature({ title: 'Bad multi' }, { type: 'MultiPolygon', coordinates: [[ring], 'x'] }),
        feature({ title: 'Empty multi' }, { type: 'MultiPolygon', coordinates: [] }),
        { geometry: polygon },
      ],
    }, NOW_MS);
    expect(result.features).toEqual([]);
  });

  it('handles odd property values', () => {
    const result = sanitiseAlerts({
      features: [
        feature({ title: 'A', regions: '[broken', uri: 'not a url', expires: 'never', time: {} }),
        feature({ title: 'B', regions: '{"a":1}', uri: `https://x.org/${'a'.repeat(600)}`, severity: 5 }),
        feature({ title: 'C', regions: '["x"]', uri: 42 }),
        feature({ title: 'D', regions: '[]' }),
      ],
    }, NOW_MS);
    const [a, b, c, d] = result.features.map(f => f.properties);
    expect(a.regions).toBe('');
    expect(a.uri).toBe('');
    expect(a.expires).toBeNull();
    expect(a.time).toBeNull();
    expect(b.regions).toBe('{"a":1}');
    expect(b.uri).toBe('');
    expect(b.severity).toBe('unknown');
    expect(c.regions).toBe('x');
    expect(c.uri).toBe('');
    expect(d.regions).toBe('');
  });

  it('caps the number of alerts and polygon points', () => {
    const many = Array.from({ length: 60 }, (_, i) => feature({ title: `Alert ${i}` }));
    expect(sanitiseAlerts({ features: many }, NOW_MS).features).toHaveLength(50);

    const bigRing = Array.from({ length: 20001 }, (_, i) => [0, (i % 80)]);
    const big = feature({ title: 'Huge' }, { type: 'Polygon', coordinates: [bigRing] });
    expect(sanitiseAlerts({ features: [big] }, NOW_MS).features).toEqual([]);
  });

  it('returns an empty collection for non-collections', () => {
    expect(sanitiseAlerts(null, NOW_MS)).toEqual({ type: 'FeatureCollection', features: [] });
  });
});
