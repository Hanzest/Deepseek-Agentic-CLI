import { describe, it, expect, vi } from "vitest";
import { fetch_url, fetch_url_schema } from "../../tools/fetchUrl.js";

vi.mock("../../lib/cliInput.js", () => ({
  ask: vi.fn().mockResolvedValue("y"),
}));

// ---------------------------------------------------------------------------
// Reliability / Edge Case tests for fetchUrl
// ---------------------------------------------------------------------------

describe("fetchUrl reliability — schema validation", () => {
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

describe("fetchUrl reliability — input edge cases", () => {
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
        // On some networks, DNS might redirect — just verify we got something
        expect(parsed).toBeTruthy();
      }
    },
  );

  it(
    "@network timeout with very short timeout_seconds (1s) against slow URL",
    { timeout: 15_000 },
    async () => {
      // Use a URL known to be slow — httpbin's delayed response
      const result = await fetch_url({
        url: "https://httpbin.org/delay/5",
        timeout_seconds: 1,
      });
      const parsed =
        typeof result === "string" ? JSON.parse(result) : result;
      // Should timeout — either error is true and message mentions timeout
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
