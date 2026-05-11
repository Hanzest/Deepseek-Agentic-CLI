import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/cliInput.js", () => ({
  ask: vi.fn().mockResolvedValue("y"),
}));

import { fetch_url, fetch_url_schema } from "../../tools/fetchUrl.js";

// ---------------------------------------------------------------------------
// Functionality / Happy Path tests for fetchUrl  (all @network)
// ---------------------------------------------------------------------------

describe("fetchUrl functionality — real network calls", () => {
  it(
    "@network fetch a known stable URL returns markdown content",
    { timeout: 30_000 },
    async () => {
      const result = await fetch_url({
        url: "https://example.com/",
        max_chars: 2000,
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
        max_chars: 2000,
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
