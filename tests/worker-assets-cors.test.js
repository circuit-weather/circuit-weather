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

describe("Worker Assets Proxy Initial Fetch CORS", () => {
  let mockFetch;

  // Valid hash for leaflet.js from worker.js
  const VALID_HASH_B64 = "20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";

  const setupCryptoMock = (shouldMatch) => {
    const buffer = shouldMatch
      ? Uint8Array.from(atob(VALID_HASH_B64), (c) => c.charCodeAt(0)).buffer
      : new ArrayBuffer(32);

    Object.defineProperty(global, "crypto", {
      value: {
        subtle: {
          digest: vi.fn(async () => buffer),
        },
      },
      writable: true,
    });
  };

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

  const createRequest = (path, headersInit = {}) => {
    const url = `https://circuit-weather.racing${path}`;
    const headers = new Headers(headersInit);
    if (!headers.has("Sec-Fetch-Site")) {
      headers.set("Sec-Fetch-Site", "same-origin");
    }
    return new Request(url, {
      method: "GET",
      headers: headers,
    });
  };

  it("applies strict CORS headers for initial asset fetch when valid Origin is provided", async () => {
    setupCryptoMock(true);

    const mockScript = 'console.log("leaflet")';
    mockFetch.mockResolvedValueOnce(
      new Response(mockScript, {
        status: 200,
        headers: { "Content-Type": "application/javascript" },
      }),
    );

    const req = createRequest("/api/assets/leaflet.js", {
      Origin: "https://circuit-weather.racing"
    });
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://circuit-weather.racing");
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("handles catch block error logging correctly in non-production", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setupCryptoMock(true);

    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const req = createRequest("/api/assets/leaflet.js");
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error.message).toBe("Vendor asset fetch failed");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
