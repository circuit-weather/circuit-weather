import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";

// --- Mocks ---
const mockCache = {
  match: vi.fn(async () => undefined),
  put: vi.fn(async () => Promise.resolve()),
};

vi.stubGlobal("caches", {
  default: mockCache,
});

describe("Worker Assets Proxy Upstream Error", () => {
  let mockFetch;

  beforeEach(() => {
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

  it("handles upstream non-ok response correctly in non-production", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Valid hash mocking not strictly needed as it errors before checking SRI

    mockFetch.mockResolvedValueOnce(new Response("Not Found on Upstream", {
        status: 404,
        statusText: "Not Found"
    }));

    const req = createRequest("/api/assets/leaflet.js");
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(502);
    expect(res.headers.get("X-Upstream-Status")).toBe("404");
    const data = await res.json();
    expect(data.error.message).toBe("Failed to load Leaflet asset");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Leaflet Fetch Error"));
    errorSpy.mockRestore();
  });
});
