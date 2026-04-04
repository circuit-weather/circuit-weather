import { describe, it, expect, vi, beforeEach } from "vitest";
import { CONFIG } from "../public/src/config.js";

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

  beforeEach(() => {
    vi.clearAllMocks();
    mapManager = new MapManager();
    resizeCallback = null; // Reset callback
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
});
