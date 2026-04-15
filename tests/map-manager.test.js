import { describe, it, expect, vi, beforeEach } from "vitest";
import { CONFIG } from "../public/src/config.js";

// Mock Mapbox
const mapboxMapMock = {
  on: vi.fn(),
  once: vi.fn(),
  setStyle: vi.fn(),
  flyTo: vi.fn(),
  resize: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  remove: vi.fn(),
  getStyle: vi.fn(() => ({
    layers: []
  })),
  getLayoutProperty: vi.fn(),
  setLayoutProperty: vi.fn(),
};

// Use a variable we can modify instead of stubbing directly initially to handle
// how mock implementations are scoped per test block
const mapboxglMock = {
  Map: vi.fn(() => mapboxMapMock),
  accessToken: ''
};

vi.stubGlobal("mapboxgl", mapboxglMock);

// Mock Leaflet (L)
const mapMock = {
  setView: vi.fn(),
  removeLayer: vi.fn(),
  invalidateSize: vi.fn(),
  addLayer: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  remove: vi.fn(),
};

const tileLayerMock = {
  addTo: vi.fn(),
  remove: vi.fn(),
};

const leafletMock = {
  map: vi.fn(() => mapMock),
  tileLayer: vi.fn(() => tileLayerMock),
};

vi.stubGlobal("L", leafletMock);

// Mock DOM
const createMockElement = (id) => ({
  id,
  getAttribute: vi.fn(),
  style: {},
});

const documentMock = {
  getElementById: vi.fn((id) => createMockElement(id)),
  documentElement: {
    getAttribute: vi.fn((attr) => (attr === "data-theme" ? "light" : null)),
  },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

vi.stubGlobal("document", documentMock);

// Mock ResizeObserver
let resizeCallback;
const resizeObserverMock = vi.fn((cb) => {
  resizeCallback = cb;
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  };
});

// Important: Mock window to include ResizeObserver as the code checks window.ResizeObserver
vi.stubGlobal("ResizeObserver", resizeObserverMock);
vi.stubGlobal("window", {
  ResizeObserver: resizeObserverMock,
  addEventListener: vi.fn(),
  matchMedia: vi.fn().mockReturnValue({ matches: false }),
});

vi.stubGlobal("requestAnimationFrame", vi.fn((cb) => setTimeout(cb, 0)));

// Import the class under test
const { MapManager } = await import("../public/src/map/MapManager.js");

describe("MapManager", () => {
  let mapManager;
  let consoleWarnSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    mapManager = new MapManager();
    resizeCallback = null; // Reset callback
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it("should initialize the map with default configuration (fallback to Leaflet)", async () => {
    // Mock the fetch call to fail so it falls back to Leaflet
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const map = await mapManager.init();

    expect(leafletMock.map).toHaveBeenCalledWith("map", {
      center: CONFIG.defaultCenter,
      zoom: CONFIG.defaultZoom,
      zoomControl: true,
    });
    expect(map).toBe(mapMock);

    // Verify ResizeObserver was set up
    expect(resizeObserverMock).toHaveBeenCalled();
    const observerInstance = resizeObserverMock.mock.results[0].value;
    expect(observerInstance.observe).toHaveBeenCalled();

    // Verify initial theme setting (defaults to light)
    expect(leafletMock.tileLayer).toHaveBeenCalledWith(
      CONFIG.mapTiles,
      expect.any(Object),
    );
    expect(tileLayerMock.addTo).toHaveBeenCalledWith(mapMock);
  });

  it("should set theme correctly (dark)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await mapManager.init();
    vi.clearAllMocks(); // clear initial calls

    mapManager.setTheme("dark");

    expect(leafletMock.tileLayer).toHaveBeenCalledWith(
      CONFIG.mapTilesDark,
      expect.objectContaining({
        maxZoom: 18,
        subdomains: "abcd",
      }),
    );
    expect(tileLayerMock.addTo).toHaveBeenCalledWith(mapMock);
  });

  it("should remove existing tile layer when setting new theme", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await mapManager.init(); // This sets the initial tile layer
    vi.clearAllMocks(); // Clear mocks to reset counts

    // Mock that we have a tile layer set
    const oldTileLayer = mapManager.tileLayer;

    mapManager.setTheme("dark");

    expect(mapMock.removeLayer).toHaveBeenCalledWith(oldTileLayer);
    expect(leafletMock.tileLayer).toHaveBeenCalledTimes(1); // One new layer created
  });

  it("should update view with setView", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await mapManager.init();
    const lat = 51.505;
    const lng = -0.09;
    const zoom = 13;

    mapManager.setView(lat, lng, zoom);

    expect(mapMock.setView).toHaveBeenCalledWith([lat, lng], zoom);
  });

  it("should use default circuit zoom in setView if not provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await mapManager.init();
    const lat = 51.505;
    const lng = -0.09;

    mapManager.setView(lat, lng);

    expect(mapMock.setView).toHaveBeenCalledWith(
      [lat, lng],
      CONFIG.circuitZoom,
    );
  });

  it("should invalidate map size when ResizeObserver triggers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await mapManager.init();

    // Ensure callback was captured
    expect(resizeCallback).toBeDefined();

    // Trigger the resize callback
    resizeCallback();

    // Advance timers so setTimeout(cb, 0) runs
    vi.advanceTimersByTime(0);

    expect(mapMock.invalidateSize).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("should handle missing map container gracefully during init", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    // Set up mock before init
    resizeObserverMock.mockClear();

    // We need to return null specifically when getElementById('map') is called inside setupResizeObserver
    documentMock.getElementById.mockImplementation((id) => {
        if (id === 'map') return null;
        return createMockElement(id);
    });

    await mapManager.init();

    // Since the container is null, ResizeObserver should not be instantiated
    expect(resizeObserverMock).not.toHaveBeenCalled();
    expect(mapManager.resizeObserver).toBeNull();

    // Reset mock
    documentMock.getElementById.mockImplementation((id) => createMockElement(id));
  });

  it("should disconnect the ResizeObserver and set it to null when destroyed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    resizeObserverMock.mockClear();

    await mapManager.init();

    // Check if observer exists before testing disconnect
    if (resizeObserverMock.mock.results && resizeObserverMock.mock.results.length > 0) {
      const observerInstance = resizeObserverMock.mock.results[0].value;
      expect(mapManager.resizeObserver).toBe(observerInstance);

      mapManager.destroy();

      expect(observerInstance.disconnect).toHaveBeenCalled();
      expect(mapManager.resizeObserver).toBeNull();
    } else {
      mapManager.destroy();
      expect(mapManager.resizeObserver).toBeNull();
    }
  });

  it("should not throw an error if destroyed without a ResizeObserver", () => {
    document.removeEventListener = vi.fn();
    mapManager.destroy();
    expect(mapManager.resizeObserver).toBeNull();
  });

  it("should default to light theme if data-theme attribute is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    // Mock getAttribute to return null
    const originalGetAttribute = documentMock.documentElement.getAttribute;
    documentMock.documentElement.getAttribute = vi.fn().mockReturnValue(null);

    await mapManager.init();

    expect(leafletMock.tileLayer).toHaveBeenCalledWith(
      CONFIG.mapTiles,
      expect.any(Object),
    );

    // Restore mock
    documentMock.documentElement.getAttribute = originalGetAttribute;
  });

  describe("Mapbox functionality", () => {
    let mockFetch;

    beforeEach(() => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ mapboxToken: 'test-token' })
      });
      vi.stubGlobal("fetch", mockFetch);
      // Reset mapboxgl mock properties since we're using the global stub
      mapboxglMock.Map.mockClear();
      mapboxglMock.accessToken = '';

      // Reset mapbox map mock as well to prevent spillover
      Object.values(mapboxMapMock).forEach(mockFn => {
        if (vi.isMockFunction(mockFn)) mockFn.mockClear();
      });
      mapboxMapMock.getStyle.mockReturnValue({ layers: [] });
    });

    it("should initialize Mapbox successfully", async () => {
      const mockZoomIn = createMockElement('zoomIn');
      const mockZoomOut = createMockElement('zoomOut');
      const mockZoomControl = createMockElement('zoomControl');
      mockZoomControl.appendChild = vi.fn();
      mockZoomIn.setAttribute = vi.fn();
      mockZoomOut.setAttribute = vi.fn();
      mockZoomIn.addEventListener = vi.fn();
      mockZoomOut.addEventListener = vi.fn();

      const originalCreateElement = document.createElement;
      document.createElement = vi.fn()
        .mockReturnValueOnce(mockZoomControl)
        .mockReturnValueOnce(mockZoomIn)
        .mockReturnValueOnce(mockZoomOut);

      // Setup mock to immediately resolve 'load' event synchronously to allow init to resolve Mapbox Map
      mapboxMapMock.on.mockImplementation((event, callback) => {
        if (event === 'load') callback();
      });

      // We need to ensure that getElementById('map') returns an object with appendChild
      // because `createMapboxZoomControl` depends on it.
      const mockContainer = createMockElement('map');
      mockContainer.appendChild = vi.fn();
      documentMock.getElementById.mockReturnValue(mockContainer);

      const map = await mapManager.init();

      expect(mockFetch).toHaveBeenCalledWith('/api/config', expect.objectContaining({ signal: expect.any(AbortSignal) }));
      expect(globalThis.mapboxgl.accessToken).toBe('test-token');
      expect(mapboxglMock.Map).toHaveBeenCalledWith({
        container: 'map',
        style: CONFIG.mapboxStyleLight,
        center: [CONFIG.defaultCenter[1], CONFIG.defaultCenter[0]],
        zoom: CONFIG.defaultZoom - 1,
        attributionControl: true
      });

      expect(map).toBe(mapboxMapMock);
      expect(mapManager.isMapbox).toBe(true);
      expect(resizeObserverMock).toHaveBeenCalled();

      document.createElement = originalCreateElement;
    });

    it("should fallback and resolve to leaflet on Mapbox error before load", async () => {
      // Setup mock to immediately invoke error handler before load completes
      mapboxMapMock.on.mockImplementation((event, callback) => {
        if (event === 'error') callback({ error: { message: 'Network error' } });
      });

      // The Mapbox promise should reject, caught by init(), calling initLeaflet()
      const map = await mapManager.init();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Mapbox initialization failed, falling back to Leaflet:',
        'Network error'
      );
      // It falls back to Leaflet if Mapbox init fails
      expect(leafletMock.map).toHaveBeenCalled();
      expect(mapManager.isMapbox).toBe(false);
      expect(map).toBe(mapMock); // Leaflet mock
    });

    it("should fallback to Leaflet if fetch config fails", async () => {
      mapboxglMock.Map.mockClear();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

      await mapManager.init();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Mapbox initialization failed, falling back to Leaflet:',
        'Failed to fetch config' // Match exact error string formatting
      );
      expect(leafletMock.map).toHaveBeenCalled();
    });

    it("should fallback to Leaflet if mapboxToken is missing", async () => {
      mapboxglMock.Map.mockClear();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}) // No mapboxToken
      }));

      await mapManager.init();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Mapbox token is missing. Please ensure MAPBOX_ACCESS_TOKEN is set as a Secret in the Cloudflare dashboard (Workers & Pages → your Worker → Settings → Variables and Secrets).'
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Mapbox initialization failed, falling back to Leaflet:',
        'Mapbox token not available'
      );
      expect(leafletMock.map).toHaveBeenCalled();
    });

    it("should create mapbox zoom control", async () => {
      const mockContainer = createMockElement('map');
      mockContainer.appendChild = vi.fn();
      documentMock.getElementById.mockReturnValue(mockContainer);

      const mockZoomControl = createMockElement('zoomControl');
      mockZoomControl.appendChild = vi.fn();
      const mockZoomIn = createMockElement('zoomIn');
      mockZoomIn.setAttribute = vi.fn();
      mockZoomIn.addEventListener = vi.fn();
      const mockZoomOut = createMockElement('zoomOut');
      mockZoomOut.setAttribute = vi.fn();
      mockZoomOut.addEventListener = vi.fn();

      const originalCreateElement = document.createElement;
      document.createElement = vi.fn()
        .mockReturnValueOnce(mockZoomControl)
        .mockReturnValueOnce(mockZoomIn)
        .mockReturnValueOnce(mockZoomOut);

      // Need load event to resolve initMapbox
      mapboxMapMock.on.mockImplementation((event, callback) => {
        if (event === 'load') callback();
      });
      await mapManager.init();

      expect(mockContainer.appendChild).toHaveBeenCalledWith(mockZoomControl);
      expect(mockZoomControl.appendChild).toHaveBeenCalledWith(mockZoomIn);
      expect(mockZoomControl.appendChild).toHaveBeenCalledWith(mockZoomOut);

      // Trigger zoom clicks
      mockZoomIn.addEventListener.mock.calls.find(call => call[0] === 'click')[1]();
      expect(mapboxMapMock.zoomIn).toHaveBeenCalled();

      mockZoomOut.addEventListener.mock.calls.find(call => call[0] === 'click')[1]();
      expect(mapboxMapMock.zoomOut).toHaveBeenCalled();

      document.createElement = originalCreateElement;
    });

    it("should set Mapbox theme correctly", async () => {
      mapboxMapMock.on.mockImplementation((event, callback) => {
        if (event === 'load') callback();
      });
      mapboxMapMock.once.mockImplementation((event, callback) => {
        if (event === 'style.load') callback();
      });

      await mapManager.init();
      vi.clearAllMocks(); // clear initial calls

      // need isMapbox to be true
      mapManager.isMapbox = true;
      mapManager.map = mapboxMapMock;

      await mapManager.setTheme("dark");

      expect(mapboxMapMock.setStyle).toHaveBeenCalledWith(CONFIG.mapboxStyleDark);
    });

    it("should apply mapbox language and get language code correctly", async () => {
      const mockZoomIn = createMockElement('zoomIn');
      const mockZoomOut = createMockElement('zoomOut');
      const mockZoomControl = createMockElement('zoomControl');
      mockZoomControl.appendChild = vi.fn();
      mockZoomIn.setAttribute = vi.fn();
      mockZoomOut.setAttribute = vi.fn();
      mockZoomIn.addEventListener = vi.fn();
      mockZoomOut.addEventListener = vi.fn();

      const originalCreateElement = document.createElement;
      document.createElement = vi.fn()
        .mockReturnValueOnce(mockZoomControl)
        .mockReturnValueOnce(mockZoomIn)
        .mockReturnValueOnce(mockZoomOut);

      // Mock map style layers
      mapboxMapMock.getStyle.mockReturnValue({
        layers: [
          { id: 'layer1', type: 'symbol' },
          { id: 'layer2', type: 'line' }
        ]
      });
      mapboxMapMock.getLayoutProperty.mockReturnValue(['get', 'name']);

      mapboxMapMock.on.mockImplementation((event, callback) => {
        if (event === 'load') callback();
      });

      await mapManager.init();

      // Test applyMapLanguage
      expect(mapboxMapMock.setLayoutProperty).toHaveBeenCalledWith(
        'layer1',
        'text-field',
        ['coalesce', ['get', 'name_en'], ['get', 'name']]
      );

      // Test getMapboxLanguageCode logic
      expect(mapManager.getMapboxLanguageCode('zh-CN')).toBe('zh-Hans');
      expect(mapManager.getMapboxLanguageCode('fr-CA')).toBe('fr');
      expect(mapManager.getMapboxLanguageCode('xx-YY')).toBe('en'); // fallback

      document.createElement = originalCreateElement;
    });

    it("should update view with setView for Mapbox", async () => {
      mapboxMapMock.on.mockImplementation((event, callback) => {
        if (event === 'load') callback();
      });

      // await mapManager.init();
      mapManager.isMapbox = true;
      mapManager.map = mapboxMapMock;

      const lat = 51.505;
      const lng = -0.09;
      const zoom = 13;

      mapManager.setView(lat, lng, zoom);

      expect(mapboxMapMock.flyTo).toHaveBeenCalledWith({
        center: [lng, lat],
        zoom: zoom - 1
      });
    });

    it("should handle language change event when isMapbox is true", () => {
      mapManager.isMapbox = true;
      vi.spyOn(mapManager, 'applyMapLanguage').mockImplementation(() => {});
      vi.spyOn(mapManager, 'getMapboxLanguageCode').mockReturnValue('en');
      mapManager.handleLanguageChange({ detail: { locale: 'en-US' } });
      expect(mapManager.getMapboxLanguageCode).toHaveBeenCalledWith('en-US');
      expect(mapManager.applyMapLanguage).toHaveBeenCalledWith('en');
    });

    it("should catch setLayoutProperty errors for slot-managed layers", async () => {
      mapboxMapMock.getStyle.mockReturnValue({
        layers: [
          { id: 'layer1', type: 'symbol' },
        ]
      });
      mapboxMapMock.getLayoutProperty.mockReturnValue(['get', 'name']);
      mapboxMapMock.setLayoutProperty.mockImplementation(() => {
        throw new Error('slot-managed');
      });
      mapManager.isMapbox = true;
      mapManager.map = mapboxMapMock;
      expect(() => {
        mapManager.applyMapLanguage('en');
      }).not.toThrow();
    });

    it("should log error if Mapbox runtime error occurs after load", async () => {
      const mockZoomIn = createMockElement('zoomIn');
      const mockZoomOut = createMockElement('zoomOut');
      const mockZoomControl = createMockElement('zoomControl');
      mockZoomControl.appendChild = vi.fn();
      mockZoomIn.setAttribute = vi.fn();
      mockZoomOut.setAttribute = vi.fn();
      mockZoomIn.addEventListener = vi.fn();
      mockZoomOut.addEventListener = vi.fn();

      const originalCreateElement = document.createElement;
      document.createElement = vi.fn()
        .mockReturnValueOnce(mockZoomControl)
        .mockReturnValueOnce(mockZoomIn)
        .mockReturnValueOnce(mockZoomOut);

      let errorCallback;
      mapboxMapMock.on.mockImplementation((event, callback) => {
        if (event === 'load') callback();
        if (event === 'error') errorCallback = callback;
      });

      await mapManager.init();

      // Trigger error after load
      if(errorCallback) {
        errorCallback({ error: { message: 'Runtime error' } });
      } else {
        throw new Error("errorCallback not set");
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Mapbox runtime error:",
        { error: { message: 'Runtime error' } }
      );

      document.createElement = originalCreateElement;
    });
  });
});
