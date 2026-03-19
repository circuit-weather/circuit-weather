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

describe("Worker API Proxy CORS and Error Cases", () => {
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

  it("applies strict CORS headers for api cache hit when valid Origin is provided", async () => {
    mockCache.match.mockResolvedValueOnce(new Response('{"data":"ok"}', {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    const req = createRequest("/api/f1/current", {
      Origin: "https://circuit-weather.racing"
    });
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://circuit-weather.racing");
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("deletes CORS headers for api cache hit when invalid Origin is provided", async () => {
    mockCache.match.mockResolvedValueOnce(new Response('{"data":"ok"}', {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://old.com" }
    }));

    const req = createRequest("/api/f1/current", {
      Origin: "https://evil.com"
    });
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("handles upstream catch block error correctly in non-production", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error("Network Error"));

    const req = createRequest("/api/f1/current");
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error.message).toBe("Failed to fetch from upstream");
    expect(errorSpy).toHaveBeenCalledWith("API Fetch Error:", expect.any(Error));
    errorSpy.mockRestore();
  });
});
