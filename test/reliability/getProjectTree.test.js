import { describe, it, expect, afterAll } from "vitest";
import { get_project_tree } from "../../tools/getProjectTree.js";
import {
  createTempDir,
  createTempFile,
  cleanupTempDir,
  tmpPath,
  fixturePath,
} from "../helpers.js";

// ---------------------------------------------------------------------------
// Temporary directory for tests that need custom directory structures
// ---------------------------------------------------------------------------
const tempDirName = "getProjectTree-reliability";

afterAll(() => {
  cleanupTempDir(tempDirName);
});

describe("getProjectTree - Reliability / Edge Cases", () => {
  // -----------------------------------------------------------------------
  // Non-existent root_path
  // -----------------------------------------------------------------------
  it("should return an error string when root_path does not exist", async () => {
    const result = await get_project_tree({
      root_path: "K:/completely/nonexistent/path/xyz123",
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("Error");
    expect(result).toContain("not found");
  });

  // -----------------------------------------------------------------------
  // max_depth = 1 - only top-level entries
  // -----------------------------------------------------------------------
  it("should return only top-level entries when max_depth is 1", async () => {
    // Use the fixtures dir so we can predict output
    const result = await get_project_tree({
      root_path: fixturePath(),
      max_depth: 1,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("searchable/");
    expect(result).toContain("sample.js");
    expect(result).toContain("sample.md");
    expect(result).toContain("sample.txt");
    // Should NOT contain sub-directory contents
    expect(result).not.toContain("a.txt");
  });

  // -----------------------------------------------------------------------
  // Path to a file instead of a directory
  // -----------------------------------------------------------------------
  it("should return an error when root_path points to a file, not a directory", async () => {
    const result = await get_project_tree({
      root_path: fixturePath("sample.txt"),
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("Error");
    expect(result).toContain("not found");
  });

  // -----------------------------------------------------------------------
  // Empty directory (no readable files)
  // -----------------------------------------------------------------------
  it("should show '(empty directory)' for a directory with no files", async () => {
    const emptyDir = createTempDir(`${tempDirName}/empty-dir`);
    const result = await get_project_tree({
      root_path: emptyDir,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("empty directory");
  });

  // -----------------------------------------------------------------------
  // Directory with only ignored files
  // -----------------------------------------------------------------------
  it("should show '(empty directory)' when only ignored files exist", async () => {
    const dir = createTempDir(`${tempDirName}/only-ignored`);
    // node_modules is always ignored
    createTempFile(`${tempDirName}/only-ignored/node_modules/pkg/index.js`, "x");
    const result = await get_project_tree({
      root_path: dir,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("empty directory");
  });
});
