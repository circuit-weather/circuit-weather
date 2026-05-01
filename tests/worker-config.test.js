import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";

describe("Worker Config Route (/api/config)", () => {
  beforeEach(() => {
    vi.stubGlobal("env", { MAPBOX_ACCESS_TOKEN: "test-token" });
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

  it("handles valid config request correctly", async () => {
    const req = createRequest("/api/config");
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mapboxToken).toBe("test-token");
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
  });

  it("rejects invalid fetch destination", async () => {
    const req = createRequest("/api/config", {
      "Sec-Fetch-Dest": "script"
    });
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error.message).toBe("Invalid fetch destination");
  });

  it("applies strict CORS headers when valid Origin is provided", async () => {
    const req = createRequest("/api/config", {
      Origin: "https://circuit-weather.racing"
    });
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://circuit-weather.racing");
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("does not apply CORS headers when invalid Origin is provided", async () => {
    const req = createRequest("/api/config", {
      Origin: "https://evil.com"
    });
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(200);
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("uses empty string for MAPBOX_ACCESS_TOKEN if not set in env", async () => {
    vi.stubGlobal("env", {}); // No MAPBOX_ACCESS_TOKEN
    const req = createRequest("/api/config");
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mapboxToken).toBe("");
  });
});
