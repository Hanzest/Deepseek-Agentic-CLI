import { describe, it, expect, afterAll } from "vitest";
import { read_file_chunk } from "../../tools/readFileChunk.js";
import {
  fixturePath,
  cleanupTempDir,
} from "../helpers.js";

// ---------------------------------------------------------------------------
// Temporary file helper for tests that need custom content
// ---------------------------------------------------------------------------
const tempDirName = "readFileChunk-reliability";

afterAll(() => {
  cleanupTempDir(tempDirName);
});

describe("readFileChunk - Reliability / Edge Cases", () => {
  // -----------------------------------------------------------------------
  // Non-existent file path
  // -----------------------------------------------------------------------
  it("should return an error string when the file does not exist", async () => {
    const result = await read_file_chunk({
      file_path: "K:/non/existent/path/file.txt",
      start_line: 1,
      end_line: 5,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("Error");
    expect(result).toContain("not found");
  });

  // -----------------------------------------------------------------------
  // .env file path - security block
  // -----------------------------------------------------------------------
  it("should return a security error when the file is a .env file", async () => {
    const result = await read_file_chunk({
      file_path: fixturePath("..", "..", ".env"),
      start_line: 1,
      end_line: 5,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("Security Error");
    expect(result).toContain(".env");
  });

  // -----------------------------------------------------------------------
  // start_line > total lines
  // -----------------------------------------------------------------------
  it("should return an error when start_line exceeds total lines", async () => {
    const result = await read_file_chunk({
      file_path: fixturePath("sample.txt"),
      start_line: 100,
      end_line: 105,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("Error");
    expect(result).toContain("exceeds total lines");
  });

  // -----------------------------------------------------------------------
  // start_line > end_line
  // -----------------------------------------------------------------------
  it("should return an error when start_line is greater than end_line", async () => {
    const result = await read_file_chunk({
      file_path: fixturePath("sample.txt"),
      start_line: 5,
      end_line: 3,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("Error");
    expect(result).toContain("greater than end_line");
  });

  // -----------------------------------------------------------------------
  // start_line < 1 - clamped to 1
  // -----------------------------------------------------------------------
  it("should clamp start_line to 1 when start_line < 1", async () => {
    const result = await read_file_chunk({
      file_path: fixturePath("sample.txt"),
      start_line: -5,
      end_line: 3,
    });
    expect(result).toBeTypeOf("string");
    // The output header shows the clamped start_line
    expect(result).toContain("read from line 1");
    expect(result).toContain("Line 1:");
    expect(result).toContain("Line 2:");
    expect(result).toContain("Line 3:");
  });
});
