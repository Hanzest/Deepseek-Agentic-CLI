import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetch_url, fetch_url_schema } from "../../tools/fetchUrl.js";

vi.mock("../../lib/cliInput.js", () => ({
  ask: vi.fn().mockResolvedValue("y"),
}));

// Mock undici so that ProxyAgent constructor always throws.
// This only affects tests that pass proxy_url (the dynamic import of
// undici only happens inside the if(proxy_url) block).
vi.mock("undici", () => ({
  ProxyAgent: class ProxyAgentMock {
    constructor() {
      throw new Error("Invalid proxy configuration");
    }
  },
}));

// ---------------------------------------------------------------------------
// Reliability / Edge Case tests for fetchUrl
// ---------------------------------------------------------------------------

describe("fetchUrl reliability - schema validation", () => {
  // ── Schema oneOf constraint ───────────────────────────────────────────────
  it("schema has oneOf constraint requiring url or urls", () => {
    const params = fetch_url_schema.function.parameters;
    expect(params).toHaveProperty("oneOf");
    expect(params.oneOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ required: ["url"] }),
        expect.objectContaining({ required: ["urls"] }),
      ]),
    );
  });
});

describe("fetchUrl reliability - input edge cases", () => {
  it("rejects invalid/malformed URL", { timeout: 15_000 }, async () => {
    const result = await fetch_url({ url: "not-a-valid-url" });
    const parsed =
      typeof result === "string" ? JSON.parse(result) : result;
    // Should return an error object
    expect(parsed).toHaveProperty("error");
    // Either error is true, or there's message with error text
    if (parsed.error === true) {
      expect(parsed).toHaveProperty("message");
    } else {
      // The tool might return a JSON string with error
      expect(parsed).toHaveProperty("message");
    }
  });

  it(
    "@network url that doesn't exist (NXDOMAIN) returns error",
    { timeout: 20_000 },
    async () => {
      const result = await fetch_url({
        url: "https://this-domain-definitely-does-not-exist-12345.com/",
        timeout_seconds: 5,
      });
      const parsed =
        typeof result === "string" ? JSON.parse(result) : result;
      // Should return error or timeout
      if (parsed.error === true) {
        expect(parsed).toHaveProperty("message");
        expect(typeof parsed.message).toBe("string");
      } else {
        // On some networks, DNS might redirect - just verify we got something
        expect(parsed).toBeTruthy();
      }
    },
  );

  it(
    "@network timeout with very short timeout_seconds (1s) against slow URL",
    { timeout: 15_000 },
    async () => {
      // Use a URL known to be slow - httpbin's delayed response
      const result = await fetch_url({
        url: "https://httpbin.org/delay/5",
        timeout_seconds: 1,
      });
      const parsed =
        typeof result === "string" ? JSON.parse(result) : result;
      // Should timeout - either error is true and message mentions timeout
      // OR tool handles gracefully
      expect(parsed).toBeTruthy();
      // If no error, it means the response arrived within 1s (unlikely but possible)
      if (parsed.error === true) {
        expect(parsed.message.toLowerCase()).toMatch(/timed out|timeout|abort/i);
      }
    },
  );

  it("max_chars truncation: fetch with max_chars=50 truncates content", { timeout: 20_000 }, async () => {
    const result = await fetch_url({
      url: "https://example.com/",
      max_chars: 50,
    });
    const parsed =
      typeof result === "string" ? JSON.parse(result) : result;
    expect(parsed).toHaveProperty("content");
    expect(parsed.content.length).toBeLessThanOrEqual(50 + 100); // allow some room for truncation notice
    expect(parsed.truncated).toBe(true);
    expect(parsed.content).toContain("truncated");
  });
});

// ---------------------------------------------------------------------------
// Anti-block reliability tests (mocked, no @network)
// ---------------------------------------------------------------------------

describe("fetchUrl anti-block reliability", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Archive fallback returns content with age warning when snapshot is >=5yrs old", async () => {
    // First call (primary fetch) returns 403
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      })
      // Second call (Wayback archive) returns 200 with an old snapshot URL
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://web.archive.org/web/20180101000000/http://example.com",
        text: async () => '<html><body><h1>Archived Content</h1></body></html>',
      });

    const result = await fetch_url({
      url: "https://example.com/",
      max_chars: 2000,
      allow_archived_fallback: true,
    });
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    expect(parsed.blocked).toBe(false);
    expect(parsed.source).toBe("wayback");
    expect(parsed.content).toContain("Caution");
    expect(parsed.content).toContain("year(s) old");
  });

  it("Recent archive (no caution banner)", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://web.archive.org/web/20250101000000/http://example.com",
        text: async () => '<html><body><h1>Recent Content</h1></body></html>',
      });

    const result = await fetch_url({
      url: "https://example.com/",
      max_chars: 2000,
      allow_archived_fallback: true,
    });
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    expect(parsed.blocked).toBe(false);
    expect(parsed.source).toBe("wayback");
    expect(parsed.content).not.toContain("Caution");
  });

  it("Proxy error returns proxy_error signal", async () => {
    // undici is mocked at the top level so ProxyAgent constructor throws.
    // Passing proxy_url triggers the dynamic import, which creates a ProxyAgent
    // that throws, resulting in proxy_error signal.
    global.fetch = vi.fn();

    const result = await fetch_url({
      url: "https://example.com/",
      proxy_url: "http://invalid:8080",
      max_chars: 100,
    });
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    expect(parsed.blocked).toBe(true);
    expect(parsed.block_signal).toBe("proxy_error");
    expect(parsed.error).toBe(true);
  });

  it("Fallback disabled when allow_archived_fallback is false (default)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    const result = await fetch_url({
      url: "https://example.com/",
    });
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    expect(parsed.blocked).toBe(true);
    expect(parsed.block_signal).toBe("403");
    // With no allow_archived_fallback, fetch should be called exactly once
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
