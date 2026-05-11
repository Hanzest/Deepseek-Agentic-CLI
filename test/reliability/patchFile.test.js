import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock consent — patchFileCore internally calls ask() for .env targets
vi.mock("../../lib/cliInput.js", () => ({
  ask: vi.fn().mockResolvedValue("y"),
}));

import { patch_file } from "../../tools/patchFile.js";
import {
  createTempDir,
  createTempFile,
  cleanupTempDir,
  tmpPath,
  readFile,
} from "../helpers.js";

const TEST_SUITE = "patchfile-reliability";

describe("patchFile - reliability (edge cases)", () => {
  beforeEach(() => {
    createTempDir(TEST_SUITE);
  });

  afterEach(() => {
    cleanupTempDir(TEST_SUITE);
  });

  // -----------------------------------------------------------------------
  // File not found → error string returned
  // -----------------------------------------------------------------------
  it("should return error when file does not exist", async () => {
    const result = await patch_file({
      file_path: tmpPath(TEST_SUITE, "nonexistent.txt"),
      search_string: "anything",
      replace_string: "replacement",
    });
    expect(result).toContain("File not found");
  });

  // -----------------------------------------------------------------------
  // .env file target → security check triggered (consent mocked → proceeds)
  // -----------------------------------------------------------------------
  it("should handle .env file target with mocked consent", async () => {
    const fp = createTempFile(`${TEST_SUITE}/.env`, "SECRET=value\n");
    const result = await patch_file({
      file_path: fp,
      search_string: "SECRET=value",
      replace_string: "SECRET=replaced",
    });
    // Consent is mocked to "y", so it should proceed with the patch
    expect(result).toContain("Successfully patched");
    const content = readFile(fp);
    expect(content).toContain("SECRET=replaced");
  });

  // -----------------------------------------------------------------------
  // search_string not found in file → error
  // -----------------------------------------------------------------------
  it("should return error when search_string is not found", async () => {
    const fp = createTempFile(
      `${TEST_SUITE}/notfound.txt`,
      "Line one\nLine two\nLine three\n"
    );
    const result = await patch_file({
      file_path: fp,
      search_string: "nonexistent substring",
      replace_string: "replacement",
    });
    expect(result).toContain("not found");
  });

  // -----------------------------------------------------------------------
  // search_string found multiple times → returns line numbers
  // -----------------------------------------------------------------------
  it("should report multiple matches with line numbers", async () => {
    const fp = createTempFile(
      `${TEST_SUITE}/multiple.txt`,
      "repeat\nsomething\nrepeat\nanother\nrepeat\n"
    );
    const result = await patch_file({
      file_path: fp,
      search_string: "repeat",
      replace_string: "changed",
    });
    expect(result).toContain("found");
    expect(result).toContain("times");
    // Should mention line numbers 1, 3, 5
    expect(result).toMatch(/[1,3,5]|lines:?\s*[1,3,5]/);
  });

  // -----------------------------------------------------------------------
  // line_number out of bounds → error
  // -----------------------------------------------------------------------
  it("should error when line_number is out of bounds", async () => {
    const fp = createTempFile(`${TEST_SUITE}/short.txt`, "Only one line\n");
    const result = await patch_file({
      file_path: fp,
      search_string: "Only",
      replace_string: "Changed",
      line_number: 99,
    });
    expect(result).toContain("out of range");
  });
});
