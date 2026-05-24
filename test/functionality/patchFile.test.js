import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { patch_file } from "../../tools/patchFile.js";
import {
  createTempDir,
  createTempFile,
  cleanupTempDir,
  tmpPath,
  readFile,
} from "../helpers.js";

const TEST_SUITE = "patchfile-functionality";

describe("patchFile - functionality (happy paths)", () => {
  beforeEach(() => {
    createTempDir(TEST_SUITE);
  });

  afterEach(() => {
    cleanupTempDir(TEST_SUITE);
  });

  // -----------------------------------------------------------------------
  // Single match: replace string in temp file, verify replacement was written
  // -----------------------------------------------------------------------
  it("should replace a single occurrence of search_string", async () => {
    const fp = createTempFile(
      `${TEST_SUITE}/single.txt`,
      "Hello World\nThis is a test.\nGoodbye World\n"
    );
    const result = await patch_file({
      file_path: fp,
      search_string: "Hello World",
      replace_string: "Hi Universe",
    });
    expect(result).toContain("Successfully patched");

    const content = readFile(fp);
    expect(content).toContain("Hi Universe");
    expect(content).not.toContain("Hello World");
  });

  // -----------------------------------------------------------------------
  // Line number mode: replace specific line, verify
  // -----------------------------------------------------------------------
  it("should replace a specific line when line_number is provided", async () => {
    const fp = createTempFile(
      `${TEST_SUITE}/linenum.txt`,
      "Line One\nLine Two\nLine Three\n"
    );
    const result = await patch_file({
      file_path: fp,
      search_string: "Line Two",
      replace_string: "Line TWO (replaced)",
      line_number: 2,
    });
    expect(result).toContain("Successfully patched");
    expect(result).toContain("line 2");

    const content = readFile(fp);
    expect(content).toContain("Line TWO (replaced)");
    expect(content).toContain("Line One");
    expect(content).toContain("Line Three");
  });

  // -----------------------------------------------------------------------
  // Replacement creates correct output
  // -----------------------------------------------------------------------
  it("should produce correct content after replacement", async () => {
    const originalContent = "The quick brown fox jumps over the lazy dog.";
    const fp = createTempFile(`${TEST_SUITE}/correctness.txt`, originalContent);

    await patch_file({
      file_path: fp,
      search_string: "fox",
      replace_string: "cat",
    });

    const content = readFile(fp);
    expect(content).toBe("The quick brown cat jumps over the lazy dog.");
  });

  // -----------------------------------------------------------------------
  // File content integrity preserved (only targeted line changed)
  // -----------------------------------------------------------------------
  it("should preserve content integrity - only the targeted line changes", async () => {
    const fp = createTempFile(
      `${TEST_SUITE}/integrity.txt`,
      "First line\nSecond line\nThird line\nFourth line\nFifth line\n"
    );

    await patch_file({
      file_path: fp,
      search_string: "Third line",
      replace_string: "THIRD LINE (patched)",
    });

    const content = readFile(fp);
    const lines = content.split("\n");
    expect(lines[0]).toBe("First line");
    expect(lines[1]).toBe("Second line");
    expect(lines[2]).toBe("THIRD LINE (patched)");
    expect(lines[3]).toBe("Fourth line");
    expect(lines[4]).toBe("Fifth line");
    // Ensure no extra/missing lines
    expect(lines.length).toBe(6); // 5 lines + trailing newline split
  });

  // -----------------------------------------------------------------------
  // Line number mode preserves all other lines
  // -----------------------------------------------------------------------
  it("should preserve all other lines when using line_number mode", async () => {
    const fp = createTempFile(
      `${TEST_SUITE}/lineintegrity.txt`,
      "A\nB\nC\nD\nE\n"
    );

    await patch_file({
      file_path: fp,
      search_string: "C",
      replace_string: "CC",
      line_number: 3,
    });

    const content = readFile(fp);
    expect(content).toBe("A\nB\nCC\nD\nE\n");
  });
});
