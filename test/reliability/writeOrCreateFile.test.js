import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { existsSync, rmSync, readFileSync } from "fs";

// Mock consent — writeOrCreateFileCore internally calls ask() for .env targets
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

const SUITE = "writeOrCreateFile-reliability";

describe("writeOrCreateFile — Reliability / Edge Cases", () => {
  beforeEach(() => { createTempDir(SUITE); });
  afterEach(() => { cleanupTempDir(SUITE); });

  // -----------------------------------------------------------------------
  // .env file security — proceeds with mocked consent
  // -----------------------------------------------------------------------
  it("should handle .env file target with mocked consent", async () => {
    const fp = tmpPath(SUITE, ".env");
    const result = await write_or_create_file({
      file_path: fp,
      content: "SECRET=key",
    });
    // Consent is mocked to "y", so it should proceed with the write
    expect(readFile(fp)).toBe("SECRET=key");
  });

  // -----------------------------------------------------------------------
  // line range errors
  // -----------------------------------------------------------------------
  it("should error when start_line > end_line", async () => {
    const fp = createTempFile(`${SUITE}/lines.txt`, "a\nb\nc\nd\ne\n");
    const result = await write_or_create_file({
      file_path: fp,
      content: "X",
      start_line: 5,
      end_line: 2,
    });
    expect(result).toContain("Error");
  });

  it("should error when line range is out of bounds", async () => {
    const fp = createTempFile(`${SUITE}/short.txt`, "one\ntwo\n");
    const result = await write_or_create_file({
      file_path: fp,
      content: "X",
      start_line: 10,
      end_line: 15,
    });
    expect(result).toContain("Error");
  });

  // -----------------------------------------------------------------------
  // create_parents: false when parent missing
  // -----------------------------------------------------------------------
  it("should error when create_parents=false and parent is missing", async () => {
    const result = await write_or_create_file({
      file_path: tmpPath(SUITE, "nope", "file.txt"),
      content: "data",
      create_parents: false,
    });
    expect(result).toContain("Error");
  });

  // -----------------------------------------------------------------------
  // empty content
  // -----------------------------------------------------------------------
  it("should create an empty file when content is empty string", async () => {
    const fp = tmpPath(SUITE, "empty.txt");
    const result = await write_or_create_file({
      file_path: fp,
      content: "",
    });
    expect(readFile(fp)).toBe("");
  });

  // -----------------------------------------------------------------------
  // Write outside project directory — system temp
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
