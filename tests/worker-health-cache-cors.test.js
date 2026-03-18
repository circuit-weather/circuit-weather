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

// Mock Crypto
Object.defineProperty(global, "crypto", {
  value: {
    subtle: {
      digest: vi.fn(async () => new ArrayBuffer(32)),
    },
  },
  writable: true,
});

describe("Worker Health Check Caching CORS", () => {
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

  it("applies strict CORS headers for health check cache hit when valid Origin is provided", async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => "ok",
    });

    const req1 = createRequest("/api/health");
    const res1 = await worker.fetch(req1, global.env, global.ctx);
    expect(res1.status).toBe(200);

    const req2 = createRequest("/api/health", {
      Origin: "https://circuit-weather.racing"
    });
    const res2 = await worker.fetch(req2, global.env, global.ctx);
    expect(res2.status).toBe(200);
    expect(res2.headers.get("X-Cache")).toBe("HIT");
    expect(res2.headers.get("Access-Control-Allow-Origin")).toBe("https://circuit-weather.racing");
    expect(res2.headers.get("Vary")).toBe("Origin");
  });

  it("deletes CORS headers for health check cache hit when invalid Origin is provided", async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => "ok",
    });

    const req1 = createRequest("/api/health");
    const res1 = await worker.fetch(req1, global.env, global.ctx);
    expect(res1.status).toBe(200);

    const req2 = createRequest("/api/health", {
      Origin: "https://evil.com"
    });
    const res2 = await worker.fetch(req2, global.env, global.ctx);
    expect(res2.status).toBe(200);
    expect(res2.headers.get("X-Cache")).toBe("HIT");
    expect(res2.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
});
