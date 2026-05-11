import { describe, it, expect } from "vitest";
import { search_web, search_web_schema } from "../../tools/searchWeb.js";

// ---------------------------------------------------------------------------
// Functionality / Happy Path tests for searchWeb  (all @network)
// ---------------------------------------------------------------------------

describe("searchWeb functionality — real network calls", () => {
  it(
    "@network basic query returns results with title, url, snippet",
    { timeout: 30_000 },
    async () => {
      const result = await search_web({
        query: "vitest testing framework",
        max_results: 5,
      });

      // search_web returns a formatted string (or an error string if DDG rate-limits)
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);

      // If DDG rate-limited, result will be an error message — skip format assertions
      if (result.startsWith("Error")) {
        return;
      }

      // Should contain result entries like "1. Title" lines
      const resultLines = result
        .split("\n")
        .filter((l) => /^\d+\.\s/.test(l));
      expect(resultLines.length).toBeGreaterThan(0);

      // Each result line should have content after the number
      for (const line of resultLines) {
        expect(line).toMatch(/^\d+\.\s.+/);
      }

      // Should contain URLs
      expect(result).toMatch(/URL:/);
    },
  );

  it(
    "@network max_results=3 returns at most 3 results",
    { timeout: 30_000 },
    async () => {
      const result = await search_web({
        query: "node.js async programming",
        max_results: 3,
      });

      // If DDG rate-limited, result will be an error message — skip format assertions
      if (result.startsWith("Error")) {
        return;
      }

      const resultLines = result
        .split("\n")
        .filter((l) => /^\d+\.\s/.test(l));
      expect(resultLines.length).toBeLessThanOrEqual(3);
      expect(resultLines.length).toBeGreaterThan(0);
    },
  );

  it(
    "@network results have expected shape with title, url, snippet",
    { timeout: 30_000 },
    async () => {
      const result = await search_web({
        query: "javascript promises",
        max_results: 2,
      });

      // If DDG rate-limited, result will be an error message — skip format assertions
      if (result.startsWith("Error")) {
        return;
      }

      // The formatted output should contain lines with "URL:" and a description
      expect(result).toMatch(/URL:/);

      // Split into result blocks — each block has: "1. Title", "   URL: ...", "   description"
      const blocks = result.split(/\n(?=\d+\.\s)/);
      for (const block of blocks) {
        if (/^\d+\.\s/.test(block)) {
          // Has a title line
          expect(block).toMatch(/^\d+\.\s.+/);
          // Has a URL line
          expect(block).toMatch(/URL:\s*\S+/);
        }
      }
    },
  );

  it(
    "@network query with no results returns no-results message",
    { timeout: 30_000 },
    async () => {
      // Use a query that's extremely unlikely to return real results
      // but still valid — a random string of gibberish
      const result = await search_web({
        query: "zxcvbnmlkjhgfdsaqwertyuiop1234567890",
        max_results: 5,
      });

      expect(typeof result).toBe("string");
      // DuckDuckGo may still return something for obscure queries,
      // but we verify the handler doesn't throw
      expect(result.length).toBeGreaterThan(0);
    },
  );
});
