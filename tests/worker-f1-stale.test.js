import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";

// --- Mocks ---

// Mock Cache API
const cacheStore = new Map();
const mockCache = {
  match: vi.fn(async (request) => {
    const key = request.url;
    return cacheStore.get(key)?.clone();
  }),
  put: vi.fn(async (request, response) => {
    const key = request.url;
    cacheStore.set(key, response.clone());
  }),
};

vi.stubGlobal("caches", {
  default: mockCache,
});

const SCHEDULE_URL = "https://api.jolpi.ca/ergast/f1/current.json";
const STALE_URL = `${SCHEDULE_URL}?cw_stale=1`;
const SCHEDULE_BODY = JSON.stringify({ MRData: { RaceTable: { Races: [{ round: "1" }] } } });

describe("Worker F1 API stale fallback", () => {
  let mockFetch;
  let env;
  let ctx;
  let pending;

  beforeEach(() => {
    cacheStore.clear();
    vi.clearAllMocks();

    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    env = { ENVIRONMENT: "test" };
    pending = [];
    ctx = { waitUntil: vi.fn((p) => pending.push(p)) };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createRequest = (path) =>
    new Request(`https://circuit-weather.racing${path}`, {
      headers: { "Sec-Fetch-Site": "same-origin" },
    });

  const jsonResponse = (body, status = 200) =>
    new Response(body, { status, headers: { "Content-Type": "application/json" } });

  const fetchSchedule = async () => {
    const res = await worker.fetch(createRequest("/api/f1/current.json"), env, ctx);
    await Promise.all(pending);
    return res;
  };

  it("stores a long-lived last-known-good copy on success", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(SCHEDULE_BODY));

    const res = await fetchSchedule();

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SCHEDULE_BODY);
    const stale = cacheStore.get(STALE_URL);
    expect(stale).toBeDefined();
    expect(stale.headers.get("Cache-Control")).toBe("public, max-age=2592000");
    expect(await stale.text()).toBe(SCHEDULE_BODY);
  });

  it("serves the stale copy when Jolpica returns 429", async () => {
    cacheStore.set(STALE_URL, jsonResponse(SCHEDULE_BODY));
    mockFetch.mockResolvedValueOnce(jsonResponse("{}", 429));

    const res = await fetchSchedule();

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("STALE");
    expect(res.headers.get("X-Upstream-Status")).toBe("429");
    expect(await res.text()).toBe(SCHEDULE_BODY);

    // Written to the primary key for the 429 backoff window so upstream isn't retried per request
    const primary = cacheStore.get(SCHEDULE_URL);
    expect(primary.status).toBe(200);
    expect(primary.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  it("serves the stale copy when Jolpica returns a non-JSON body", async () => {
    cacheStore.set(STALE_URL, jsonResponse(SCHEDULE_BODY));
    mockFetch.mockResolvedValueOnce(
      new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } })
    );

    const res = await fetchSchedule();

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("STALE");
    expect(res.headers.get("X-Upstream-Status")).toBe("502");
  });

  it("serves the stale copy when the Jolpica fetch throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    cacheStore.set(STALE_URL, jsonResponse(SCHEDULE_BODY));
    mockFetch.mockRejectedValueOnce(new Error("timeout"));

    const res = await fetchSchedule();

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("STALE");
    expect(await res.text()).toBe(SCHEDULE_BODY);
  });

  it("returns the cached error when no stale copy exists", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse("{}", 429));

    const res = await fetchSchedule();

    expect(res.status).toBe(429);
    expect(res.headers.get("X-Cache")).toBe("ERROR-CACHED");
  });

  it("returns 502 when the fetch throws and the stale lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error("timeout"));
    mockCache.match
      .mockResolvedValueOnce(undefined) // primary cache miss
      .mockRejectedValueOnce(new Error("cache unavailable")); // stale lookup

    const res = await fetchSchedule();

    expect(res.status).toBe(502);
  });

  describe("health check", () => {
    const okHead = () => Promise.resolve({ status: 200, ok: true });

    it("reports Jolpica's status from the cached schedule without probing it", async () => {
      cacheStore.set(
        SCHEDULE_URL,
        new Response(SCHEDULE_BODY, { headers: { "X-Upstream-Status": "429" } })
      );
      mockFetch.mockImplementation(okHead);

      const res = await worker.fetch(createRequest("/api/health"), env, ctx);
      const body = await res.json();

      expect(body.upstreams.jolpica).toBe(429);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls.map(([url]) => url)).not.toContain(SCHEDULE_URL);
    });

    it("falls back to the cached response status when no upstream status is recorded", async () => {
      cacheStore.set(SCHEDULE_URL, new Response(SCHEDULE_BODY, { status: 200 }));
      mockFetch.mockImplementation(okHead);

      const res = await worker.fetch(createRequest("/api/health"), env, ctx);
      const body = await res.json();

      expect(body.upstreams.jolpica).toBe(200);
    });

    it("probes Jolpica when no schedule is cached", async () => {
      mockFetch.mockImplementation(okHead);

      const res = await worker.fetch(createRequest("/api/health"), env, ctx);
      const body = await res.json();

      expect(body.upstreams.jolpica).toBe(200);
      expect(mockFetch.mock.calls.map(([url]) => url)).toContain(SCHEDULE_URL);
    });
  });
});
