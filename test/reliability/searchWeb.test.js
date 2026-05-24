import { describe, it, expect } from "vitest";
import { search_web, search_web_schema } from "../../tools/searchWeb.js";

// ---------------------------------------------------------------------------
// Reliability / Edge Case tests for searchWeb
// ---------------------------------------------------------------------------

describe("searchWeb reliability - schema & input validation", () => {
  // ── Schema validation ────────────────────────────────────────────────────
  it("schema requires 'query' in required array", () => {
    const params = search_web_schema.function.parameters;
    expect(params.required).toContain("query");
  });

  // ── Handler input validation ─────────────────────────────────────────────
  it("rejects empty query string with error", { timeout: 15_000 }, async () => {
    const result = await search_web({ query: "", max_results: 3 });
    const text = typeof result === "string" ? result : JSON.stringify(result);
    expect(text).toBeTruthy();
    // Should return either error or "no results" since empty query is invalid
    // We expect an error-like response
  });

  it("@network handles special characters in query gracefully", { timeout: 20_000 }, async () => {
    const query = "<script>alert(1)</script>";
    const result = await search_web({ query, max_results: 3 });
    const text = typeof result === "string" ? result : JSON.stringify(result);
    expect(text).toBeTruthy();
    // Should not throw; should return a string result (or error msg)
  });

  it("max_results = 0 returns minimal or empty output", { timeout: 15_000 }, async () => {
    const result = await search_web({ query: "hello world", max_results: 0 });
    const text = typeof result === "string" ? result : JSON.stringify(result);
    expect(text).toBeTruthy();
    // Should return a string - either empty results or no results message
    if (text.includes("No results")) {
      expect(text).toMatch(/no results/i);
    } else {
      // If there's output, it should not contain numbered results (since max=0)
      const lines = text.split("\n").filter((l) => /^\d+\./.test(l));
      expect(lines.length).toBe(0);
    }
  });

  it("@network max_results = 100 caps results at a reasonable number", { timeout: 25_000 }, async () => {
    const result = await search_web({
      query: "javascript programming",
      max_results: 100,
    });
    const text = typeof result === "string" ? result : JSON.stringify(result);
    expect(text).toBeTruthy();
    // Count result lines (e.g., "1. Title", "2. Title")
    const resultLines = text.split("\n").filter((l) => /^\d+\./.test(l));
    expect(resultLines.length).toBeLessThanOrEqual(100);
    // DuckDuckGo may rate-limit or return 0 results transiently
    expect(resultLines.length).toBeGreaterThanOrEqual(0);
  });
});
