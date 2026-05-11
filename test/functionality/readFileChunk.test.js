import { describe, it, expect, afterAll } from "vitest";
import { read_file_chunk } from "../../tools/readFileChunk.js";
import {
  fixturePath,
  createTempFile,
  cleanupTempDir,
} from "../helpers.js";

// ---------------------------------------------------------------------------
// Temp file for custom content tests
// ---------------------------------------------------------------------------
const tempDirName = "readFileChunk-functionality";

afterAll(() => {
  cleanupTempDir(tempDirName);
});

describe("readFileChunk — Functionality / Happy Paths", () => {
  // -----------------------------------------------------------------------
  // Read lines 1–5 from sample.txt
  // -----------------------------------------------------------------------
  it("should read lines 1 through 5 from sample.txt with line number prefixes", async () => {
    const result = await read_file_chunk({
      file_path: fixturePath("sample.txt"),
      start_line: 1,
      end_line: 5,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("Line 1:");
    expect(result).toContain("Line 2:");
    expect(result).toContain("Line 3:");
    expect(result).toContain("Line 4:");
    expect(result).toContain("Line 5:");
    // Should NOT contain lines beyond 5
    expect(result).not.toContain("Line 6:");
  });

  // -----------------------------------------------------------------------
  // Read a single line (line 3 only)
  // -----------------------------------------------------------------------
  it("should read a single line when start_line equals end_line", async () => {
    const result = await read_file_chunk({
      file_path: fixturePath("sample.txt"),
      start_line: 3,
      end_line: 3,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("Line 3:");
    expect(result).toContain("Vitest is awesome");
    expect(result).not.toContain("Line 2:");
    expect(result).not.toContain("Line 4:");
  });

  // -----------------------------------------------------------------------
  // Read the full file (start at 1, end at a very large number → clamped)
  // -----------------------------------------------------------------------
  it("should return all lines when start_line=1 and end_line exceeds total lines", async () => {
    const result = await read_file_chunk({
      file_path: fixturePath("sample.txt"),
      start_line: 1,
      end_line: 9999,
    });
    expect(result).toBeTypeOf("string");
    // Check header shows clamping
    expect(result).toContain("read from line 1 to line 10");
    // Check a subset of lines
    expect(result).toContain("Line 1:");
    expect(result).toContain("Line 10:");
    expect(result).toContain("End of sample file");
  });

  // -----------------------------------------------------------------------
  // Verify output format: each line starts with a right-aligned line number
  // -----------------------------------------------------------------------
  it("should format each output line with a right-aligned 6-char line number and pipe", async () => {
    const result = await read_file_chunk({
      file_path: fixturePath("sample.txt"),
      start_line: 1,
      end_line: 2,
    });
    expect(result).toBeTypeOf("string");
    // Line numbers are padded to 6 characters: "     1| " and "     2| "
    expect(result).toContain("     1|");
    expect(result).toContain("     2|");
  });

  // -----------------------------------------------------------------------
  // Read from a dynamically created temp file
  // -----------------------------------------------------------------------
  it("should read from a temp file created via createTempFile", async () => {
    const lines = [
      "custom line alpha",
      "custom line beta",
      "custom line gamma",
    ];
    const filePath = createTempFile(
      `${tempDirName}/custom_test.txt`,
      lines.join("\n")
    );
    const result = await read_file_chunk({
      file_path: filePath,
      start_line: 1,
      end_line: 3,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("custom line alpha");
    expect(result).toContain("custom line beta");
    expect(result).toContain("custom line gamma");
  });

  // -----------------------------------------------------------------------
  // Read last line only
  // -----------------------------------------------------------------------
  it("should read the last line of a file correctly", async () => {
    const result = await read_file_chunk({
      file_path: fixturePath("sample.txt"),
      start_line: 10,
      end_line: 10,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("End of sample file");
  });

  // -----------------------------------------------------------------------
  // Read from a .js fixture (non-.txt file)
  // -----------------------------------------------------------------------
  it("should read from a .js file fixture correctly", async () => {
    const result = await read_file_chunk({
      file_path: fixturePath("sample.js"),
      start_line: 1,
      end_line: 3,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("export function add");
    expect(result).toContain("export function multiply");
    expect(result).toContain("fixture-secret");
  });

  // -----------------------------------------------------------------------
  // Header line contains file path and line range
  // -----------------------------------------------------------------------
  it("should include a header with file path, line range, and total lines", async () => {
    const result = await read_file_chunk({
      file_path: fixturePath("sample.txt"),
      start_line: 1,
      end_line: 3,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("---");
    expect(result).toContain("sample.txt");
    expect(result).toContain("read from line 1 to line 3");
    expect(result).toContain("of 10");
  });
});
