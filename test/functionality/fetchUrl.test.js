import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/cliInput.js", () => ({
  ask: vi.fn().mockResolvedValue("y"),
}));

import { fetch_url, fetch_url_schema } from "../../tools/fetchUrl.js";

// ---------------------------------------------------------------------------
// Functionality / Happy Path tests for fetchUrl  (all @network)
// ---------------------------------------------------------------------------

describe("fetchUrl functionality - real network calls", () => {
  it(
    "@network fetch a known stable URL returns markdown content",
    { timeout: 30_000 },
    async () => {
      const result = await fetch_url({
        url: "https://example.com/",
        max_chars: 1235,
      });

      const parsed =
        typeof result === "string" ? JSON.parse(result) : result;

      // Should not be an error
      expect(parsed.error).toBeFalsy();
      expect(parsed).toHaveProperty("content");
      expect(typeof parsed.content).toBe("string");
      expect(parsed.content.length).toBeGreaterThan(0);

      // Should contain some of the expected text from example.com
      // The page is minimal; it has "Example Domain" as title
      expect(parsed).toHaveProperty("title", "Example Domain");
    },
  );

  it(
    "@network fetch with urls array (batch) returns array of results",
    { timeout: 30_000 },
    async () => {
      const result = await fetch_url({
        urls: ["https://example.com/", "https://httpbin.org/get"],
        max_chars: 1000,
      });

      const parsed =
        typeof result === "string" ? JSON.parse(result) : result;

      // Batch mode returns { results, total_urls, errors }
      expect(parsed).toHaveProperty("results");
      expect(Array.isArray(parsed.results)).toBe(true);
      expect(parsed.results.length).toBe(2);
      expect(parsed).toHaveProperty("total_urls", 2);

      // Each result should have url, content, and not error
      for (const r of parsed.results) {
        expect(r).toHaveProperty("url");
        expect(r).toHaveProperty("content");
        expect(typeof r.content).toBe("string");
      }
    },
  );

  it(
    "@network result includes metadata: title, content_length, truncation info, fetch_timestamp",
    { timeout: 30_000 },
    async () => {
      const result = await fetch_url({
        url: "https://example.com/",
        max_chars: 500,
      });

      const parsed =
        typeof result === "string" ? JSON.parse(result) : result;

      expect(parsed).toHaveProperty("title");
      expect(typeof parsed.title).toBe("string");
      expect(parsed.title.length).toBeGreaterThan(0);

      expect(parsed).toHaveProperty("content_length_chars");
      expect(typeof parsed.content_length_chars).toBe("number");
      expect(parsed.content_length_chars).toBeGreaterThan(0);

      expect(parsed).toHaveProperty("truncated");
      expect(typeof parsed.truncated).toBe("boolean");

      // The tool returns "fetched_at" (not "fetch_timestamp")
      expect(parsed).toHaveProperty("fetched_at");
      const ts = parsed.fetched_at;
      expect(typeof ts).toBe("string");
      expect(ts.length).toBeGreaterThan(0);

      expect(parsed).toHaveProperty("truncation_ratio");
      expect(typeof parsed.truncation_ratio).toBe("string");
    },
  );

  it(
    "@network HTML is converted to Markdown (not raw HTML)",
    { timeout: 30_000 },
    async () => {
      const result = await fetch_url({
        url: "https://example.com/",
        max_chars: 1235,
      });

      const parsed =
        typeof result === "string" ? JSON.parse(result) : result;

      // The content should NOT contain raw HTML tags like <html>, <body>, <h1>
      // example.com's content is minimal, but it shouldn't have raw HTML
      const content = parsed.content.toLowerCase();

      // If the conversion works, there should be no HTML tags
      // Note: example.com page has "<h1>Example Domain</h1>" which should be
      // converted to markdown "## Example Domain" (atx heading) or plain text
      expect(content).not.toMatch(/<html/);
      expect(content).not.toMatch(/<body/);
      expect(content).not.toMatch(/<h1>/i);
    },
  );

  it(
    "@network max_chars=0 means no truncation",
    { timeout: 30_000 },
    async () => {
      const result = await fetch_url({
        url: "https://example.com/",
        max_chars: 0,
      });

      const parsed =
        typeof result === "string" ? JSON.parse(result) : result;

      expect(parsed.error).toBeFalsy();
      expect(parsed).toHaveProperty("content");
      expect(typeof parsed.content).toBe("string");
      expect(parsed.content.length).toBeGreaterThan(0);

      // With max_chars=0, no truncation should occur
      expect(parsed.truncated).toBe(false);
      // The full content should be returned
      expect(parsed.content_length_chars).toBe(parsed.content.length);
    },
  );
});

// ---------------------------------------------------------------------------
// Anti-block / UA rotation / enhanced headers tests (mocked, no @network)
// ---------------------------------------------------------------------------

describe("fetchUrl anti-block features", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("UA rotation across multiple calls uses at least 2 different UA strings", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      text: async () => '<html><body><h1>Test Content</h1></body></html>',
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    for (let i = 0; i < 5; i++) {
      const result = await fetch_url({ url: "https://example.com/", max_chars: 100 });
      const parsed = typeof result === "string" ? JSON.parse(result) : result;
      expect(parsed.error).toBeFalsy();
    }

    const userAgents = global.fetch.mock.calls.map((call) => call[1].headers["User-Agent"]);
    const uniqueUAs = [...new Set(userAgents)];
    expect(uniqueUAs.length).toBeGreaterThanOrEqual(2);
  });

  it("Enhanced browser headers present in fetch call", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      text: async () => '<html><body><h1>Test Content</h1></body></html>',
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await fetch_url({ url: "https://example.com/", max_chars: 100 });
    const parsed = typeof result === "string" ? JSON.parse(result) : result;
    expect(parsed.error).toBeFalsy();

    const headers = global.fetch.mock.calls[0][1].headers;
    expect(headers).toHaveProperty("Sec-Fetch-Dest");
    expect(headers).toHaveProperty("Accept-Language");
    expect(headers).toHaveProperty("Upgrade-Insecure-Requests");
  });

  it("403 returns blocked metadata", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    const result = await fetch_url({ url: "https://example.com/" });
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    expect(parsed.blocked).toBe(true);
    expect(parsed.block_signal).toBe("403");
    expect(parsed.status_code).toBe(403);
    expect(parsed.error).toBe(true);
  });

  it("Timeout returns blocked metadata", async () => {
    global.fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error("Aborted"), { name: "AbortError" }),
    );

    const result = await fetch_url({
      url: "https://example.com/",
      timeout_seconds: 1,
    });
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    expect(parsed.blocked).toBe(true);
    expect(parsed.block_signal).toBe("timeout");
    expect(parsed.status_code).toBe(0);
    expect(parsed.error).toBe(true);
  });

  it("Success path has blocked: false and source: direct", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      text: async () => '<html><body><h1>Test Content</h1></body></html>',
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await fetch_url({ url: "https://example.com/", max_chars: 100 });
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    expect(parsed.blocked).toBe(false);
    expect(parsed.source).toBe("direct");
  });

  it("Fallback failed returns specific error message", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

    const result = await fetch_url({
      url: "https://example.com/",
      allow_archived_fallback: true,
    });
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    expect(parsed.error).toBe(true);
    expect(parsed.blocked).toBe(true);
    expect(parsed.message).toContain("Wayback Machine fallback failed: no archive snapshot found");
    expect(parsed.content).toContain("403_fallback_failed");
  });
});

