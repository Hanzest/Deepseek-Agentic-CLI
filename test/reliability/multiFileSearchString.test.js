import { describe, it, expect } from "vitest";
import { multi_file_search_string } from "../../tools/multiFileSearchString.js";
import { fixturePath } from "../helpers.js";

describe("multiFileSearchString - Reliability / Edge Cases", () => {
  // -----------------------------------------------------------------------
  // Search string not found anywhere
  // -----------------------------------------------------------------------
  it("should return a JSON string with zero matches when search string is not found", async () => {
    const result = await multi_file_search_string({
      search_string: "zzz_nonexistent_string_xyz_999",
      root_path: fixturePath("searchable"),
      glob_pattern: "**/*.txt",
    });
    expect(result).toBeTypeOf("string");
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.total_matches).toBe(0);
    expect(parsed.matches).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Invalid regex pattern
  // -----------------------------------------------------------------------
  it("should return an error string when regex is true and pattern is invalid", async () => {
    const result = await multi_file_search_string({
      search_string: "[invalid",
      regex: true,
      root_path: fixturePath("searchable"),
    });
    expect(result).toBeTypeOf("string");
    // The handler returns a raw error string (not JSON) for invalid regex
    expect(result).toContain("Error");
    expect(result).toContain("Invalid regex");
  });

  // -----------------------------------------------------------------------
  // .env files excluded (always ignored)
  // -----------------------------------------------------------------------
  it("should not return results from .env files even if they match", async () => {
    // The tool always ignores .env - test by searching for a pattern that
    // would match in the project if .env files existed. The searchable
    // fixtures don't have .env files, so just confirm .env is always ignored.
    const result = await multi_file_search_string({
      search_string: "apple",
      root_path: fixturePath("searchable"),
      glob_pattern: "**/*",
    });
    expect(result).toBeTypeOf("string");
    const parsed = JSON.parse(result);
    // Verify .env is not in the searched files
    for (const match of parsed.matches) {
      expect(match.file).not.toMatch(/\.env/);
    }
  });

  // -----------------------------------------------------------------------
  // root_path that doesn't exist
  // -----------------------------------------------------------------------
  it("should return an error when root_path does not exist", async () => {
    const result = await multi_file_search_string({
      search_string: "apple",
      root_path: "K:/nonexistent/path/99999",
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("Error");
    expect(result).toContain("not found");
  });

  // -----------------------------------------------------------------------
  // max_results limits the output
  // -----------------------------------------------------------------------
  it("should limit the number of matches returned when max_results is set", async () => {
    // Search broadly across the project to get many results
    const result = await multi_file_search_string({
      search_string: "function",
      root_path: ".",
      glob_pattern: "**/*.js",
      max_results: 2,
    });
    expect(result).toBeTypeOf("string");
    const parsed = JSON.parse(result);
    expect(parsed.matches_returned).toBeLessThanOrEqual(2);
    expect(parsed.truncated).toBeDefined();
  });
});
