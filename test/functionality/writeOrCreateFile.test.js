import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { existsSync, rmSync, readFileSync } from "fs";

vi.mock("../../lib/cliInput.js", () => ({
  ask: vi.fn().mockResolvedValue("y"),
}));

import { write_or_create_file } from "../../tools/writeOrCreateFile.js";
import {
  createTempDir,
  createTempFile,
  cleanupTempDir,
  tmpPath,
  readFile,
} from "../helpers.js";

const SUITE = "writeOrCreateFile-functionality";

describe("writeOrCreateFile - Functionality / Happy Paths", () => {
  beforeEach(() => { createTempDir(SUITE); });
  afterEach(() => { cleanupTempDir(SUITE); });

  // -----------------------------------------------------------------------
  // Create new file
  // -----------------------------------------------------------------------
  it("should create a new file with the given content", async () => {
    const fp = tmpPath(SUITE, "new.txt");
    const result = await write_or_create_file({
      file_path: fp,
      content: "Hello, World!",
    });
    expect(readFile(fp)).toBe("Hello, World!");
  });

  // -----------------------------------------------------------------------
  // Overwrite existing file
  // -----------------------------------------------------------------------
  it("should overwrite an existing file when mode=write (default)", async () => {
    const fp = createTempFile(`${SUITE}/overwrite.txt`, "original");
    await write_or_create_file({ file_path: fp, content: "replaced" });
    expect(readFile(fp)).toBe("replaced");
  });

  // -----------------------------------------------------------------------
  // Append mode
  // -----------------------------------------------------------------------
  it("should append content when mode=append", async () => {
    const fp = createTempFile(`${SUITE}/append.txt`, "line1\n");
    await write_or_create_file({
      file_path: fp,
      content: "line2\n",
      mode: "append",
    });
    expect(readFile(fp)).toBe("line1\nline2\n");
  });

  // -----------------------------------------------------------------------
  // Line-range overwrite
  // -----------------------------------------------------------------------
  it("should replace a specific line range", async () => {
    const fp = createTempFile(`${SUITE}/range.txt`, "A\nB\nC\nD\nE\n");
    await write_or_create_file({
      file_path: fp,
      content: "X\nY\n",
      start_line: 2,
      end_line: 4,
    });
    // Lines: 1:A, 2-4 replaced by X,Y, 5:E
    // Note: original "D\n" at line 4 → trailing newline in replacement produces "Y\n\n"
    expect(readFile(fp)).toBe("A\nX\nY\n\nE\n");
  });

  // -----------------------------------------------------------------------
  // create_parents: true
  // -----------------------------------------------------------------------
  it("should create parent directories when create_parents=true", async () => {
    const fp = tmpPath(SUITE, "deep", "nested", "file.txt");
    await write_or_create_file({
      file_path: fp,
      content: "nested content",
      create_parents: true,
    });
    expect(readFile(fp)).toBe("nested content");
  });

  // -----------------------------------------------------------------------
  // Write outside project directory
  // -----------------------------------------------------------------------
  it("should write a file outside the project directory (system temp)", async () => {
    const fp = join(tmpdir(), "writeOrCreateFile-ext-test.txt");
    try {
      const result = await write_or_create_file({
        file_path: fp,
        content: "external write test",
      });
      expect(readFileSync(fp, "utf-8")).toBe("external write test");
    } finally {
      if (existsSync(fp)) rmSync(fp);
    }
  });
});
