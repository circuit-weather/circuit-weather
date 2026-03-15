import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";

// --- Mocks ---

// Mock Cache API
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

// Mock Global Caches
vi.stubGlobal("caches", {
  default: mockCache,
});

// Mock Crypto (needed for worker imports)
Object.defineProperty(global, "crypto", {
  value: {
    subtle: {
      digest: vi.fn(async () => new ArrayBuffer(32)),
    },
  },
  writable: true,
});

describe("Worker Health Check Caching", () => {
  let mockFetch;

  beforeEach(() => {
    cacheStore.clear();
    vi.clearAllMocks();

    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    vi.stubGlobal("env", { ENVIRONMENT: "test" });
    vi.stubGlobal("ctx", {
      waitUntil: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createRequest = (path) => {
    const url = `https://circuit-weather.racing${path}`;
    const headers = new Headers();
    headers.set("Sec-Fetch-Site", "same-origin");
    return new Request(url, {
      method: "GET",
      headers: headers,
    });
  };

  it("rejects requests from invalid fetch destinations (XSSI)", async () => {
    const req = createRequest("/api/health");
    // Override to an invalid destination
    req.headers.set("Sec-Fetch-Dest", "script");

    const res = await worker.fetch(req, global.env, global.ctx);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe("Invalid fetch destination");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("marks upstream as unreachable on fetch error", async () => {
    // Mock upstream to throw error
    mockFetch.mockRejectedValue(new Error("Network failure"));

    const req = createRequest("/api/health");
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");

    // Check that all 3 upstreams are marked unreachable
    expect(body.upstreams.jolpica).toContain("unreachable");
    expect(body.upstreams.rainviewer).toContain("unreachable");
    expect(body.upstreams.github).toContain("unreachable");

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockCache.put).toHaveBeenCalled();
  });

  it("serves subsequent requests from cache (cache hit)", async () => {
    // Mock upstream responses
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => "ok",
    });

    // First Request (Cache Miss)
    const req1 = createRequest("/api/health");
    const res1 = await worker.fetch(req1, global.env, global.ctx);
    expect(res1.status).toBe(200);
    // Should call 3 upstreams
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Should save to cache
    expect(mockCache.put).toHaveBeenCalled();

    // Verify headers
    expect(res1.headers.get("Cache-Control")).toBe("public, max-age=60");

    // Second Request (Cache Hit)
    const req2 = createRequest("/api/health");
    const res2 = await worker.fetch(req2, global.env, global.ctx);
    expect(res2.status).toBe(200);

    // Should NOT call any more upstreams
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Should return cache hit
    expect(res2.headers.get("X-Cache")).toBe("HIT");
  });
});
