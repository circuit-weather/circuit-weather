import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";

/**
 * Worker CORS-on-cache-hit behaviour, consolidated.
 *
 * Every proxied/cached endpoint shares the same delivery-time CORS logic:
 * on a cache HIT it must reflect an allowed Origin (with `Vary: Origin`) and
 * strip any stored `Access-Control-Allow-Origin` for a disallowed Origin.
 * This was previously spread across five near-identical files
 * (worker-api-cors, worker-assets-cache-cors, worker-tracks-cors,
 * worker-tiles-cache-cors, worker-health-cache-cors); it is parameterised
 * here over the handlers so the shared contract is asserted in one place.
 * Endpoint-specific error paths that those files also carried are kept as
 * their own cases below.
 */

// --- Mocks ---

const cacheStore = new Map();
const mockCache = {
  match: vi.fn(async (request) => {
    const key = request.url;
    return cacheStore.get(key) || undefined;
  }),
  put: vi.fn(async (request, response) => {
    const key = request.url;
    cacheStore.set(key, response.clone());
    return Promise.resolve();
  }),
};

vi.stubGlobal("caches", { default: mockCache });

// Some asset MISS paths verify SRI; cache-hit paths return before reaching it,
// but stub crypto defensively to match the original per-handler setups.
Object.defineProperty(global, "crypto", {
  value: { subtle: { digest: vi.fn(async () => new ArrayBuffer(32)) } },
  writable: true,
});

const createRequest = (path, headersInit = {}) => {
  const url = `https://circuit-weather.racing${path}`;
  const headers = new Headers(headersInit);
  if (!headers.has("Sec-Fetch-Site")) {
    headers.set("Sec-Fetch-Site", "same-origin");
  }
  return new Request(url, { method: "GET", headers });
};

let mockFetch;

beforeEach(() => {
  cacheStore.clear();
  vi.clearAllMocks();

  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("env", { ENVIRONMENT: "test" });
  vi.stubGlobal("ctx", { waitUntil: vi.fn() });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Each scenario describes how to arrive at a cache HIT for that handler.
// `directHit` handlers consult cache.match directly, so we stub a cached
// response carrying a stale ACAO (proving it is overwritten/deleted on
// delivery). `primeHit` handlers (tiles/health) have no separate cache-read
// branch, so we warm the cache with a real MISS first.
const scenarios = [
  {
    name: "api proxy (/api/f1/*)",
    path: "/api/f1/current",
    directHit: () =>
      new Response('{"data":"ok"}', {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://stale.example",
        },
      }),
  },
  {
    name: "assets proxy (/api/assets/*)",
    path: "/api/assets/leaflet.js",
    directHit: () =>
      new Response("asset-data", {
        status: 200,
        headers: {
          "Content-Type": "application/javascript",
          "Access-Control-Allow-Origin": "https://stale.example",
        },
      }),
  },
  {
    name: "tracks proxy (/api/track/*)",
    path: "/api/track/silverstone",
    directHit: () =>
      new Response('{"type":"FeatureCollection"}', {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://stale.example",
        },
      }),
  },
  {
    name: "tile proxy (/api/tiles/*)",
    path: "/api/tiles/v2/radar/1.png",
    primeHit: async () => {
      mockFetch.mockResolvedValue(
        new Response("image-data", {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
      );
      await worker.fetch(createRequest("/api/tiles/v2/radar/1.png"), global.env, global.ctx);
    },
  },
  {
    name: "health check (/api/health)",
    path: "/api/health",
    primeHit: async () => {
      mockFetch.mockResolvedValue({ status: 200, ok: true, text: async () => "ok" });
      await worker.fetch(createRequest("/api/health"), global.env, global.ctx);
    },
  },
];

async function arriveAtCacheHit(scenario) {
  if (scenario.primeHit) {
    await scenario.primeHit();
  } else {
    mockCache.match.mockResolvedValueOnce(scenario.directHit());
  }
}

describe.each(scenarios)("CORS on cache hit — $name", (scenario) => {
  it("reflects the request Origin when it is allowed", async () => {
    await arriveAtCacheHit(scenario);

    const res = await worker.fetch(
      createRequest(scenario.path, { Origin: "https://circuit-weather.racing" }),
      global.env,
      global.ctx,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://circuit-weather.racing");
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("strips the Access-Control-Allow-Origin header when the Origin is disallowed", async () => {
    await arriveAtCacheHit(scenario);

    const res = await worker.fetch(
      createRequest(scenario.path, { Origin: "https://evil.com" }),
      global.env,
      global.ctx,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
});

// --- Endpoint-specific paths that the merged files also covered ---

describe("Worker proxy error paths", () => {
  it("returns 502 and logs when the api upstream fetch throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error("Network Error"));

    const res = await worker.fetch(createRequest("/api/f1/current"), global.env, global.ctx);

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error.message).toBe("Failed to fetch from upstream");
    expect(errorSpy).toHaveBeenCalledWith("API Fetch Error:", expect.any(Error));
    errorSpy.mockRestore();
  });

  it("applies strict CORS to a cacheAndReturnError response and caches it", async () => {
    // A 5xx with a non-JSON body trips cacheAndReturnError inside handleApiRequest.
    mockFetch.mockResolvedValueOnce(
      new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const res = await worker.fetch(
      createRequest("/api/f1/current", { Origin: "https://circuit-weather.racing" }),
      global.env,
      global.ctx,
    );

    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://circuit-weather.racing");
    expect(res.headers.get("Vary")).toBe("Origin");
    expect(mockCache.put).toHaveBeenCalled();
  });

  it("returns a safe 404 JSON error when the track upstream is not found", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Not Found", { status: 404, statusText: "Not Found" }),
    );

    const res = await worker.fetch(createRequest("/api/track/silverstone"), global.env, global.ctx);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.message).toBe("Track not found");
    expect(data.error.status).toBe(404);
  });
});
