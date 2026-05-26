import { describe, it, expect } from "vitest";
import { get_project_tree } from "../../tools/getProjectTree.js";
import { fixturePath } from "../helpers.js";

describe("getProjectTree - Functionality / Happy Paths", () => {
  // -----------------------------------------------------------------------
  // Default root_path ('.') - returns tree of current project
  // -----------------------------------------------------------------------
  it("should return a project tree with the default root_path ('.')", async () => {
    const result = await get_project_tree({});
    expect(result).toBeTypeOf("string");
    expect(result).toContain("Project tree for:");
    // The root should be the project directory
    expect(result).toContain("Deepseek-Agentic-CLI/");
  });

  // -----------------------------------------------------------------------
  // Specific root_path pointing to fixtures
  // -----------------------------------------------------------------------
  it("should return the tree of the fixtures directory", async () => {
    const result = await get_project_tree({
      root_path: fixturePath(),
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("Project tree for:");
    // Should contain known fixture files
    expect(result).toContain("sample.txt");
    expect(result).toContain("sample.js");
    expect(result).toContain("sample.md");
    expect(result).toContain("searchable/");
  });

  // -----------------------------------------------------------------------
  // max_depth limits the output depth
  // -----------------------------------------------------------------------
  it("should limit output depth when max_depth is specified", async () => {
    const depth1Result = await get_project_tree({
      root_path: fixturePath(),
      max_depth: 1,
    });
    const depthFullResult = await get_project_tree({
      root_path: fixturePath(),
    });
    // Depth 1 should show top-level entries but NOT nested files
    expect(depth1Result).toContain("searchable/");
    expect(depth1Result).not.toContain("a.txt");
    expect(depth1Result).not.toContain("b.txt");
    // Full depth should include nested files
    expect(depthFullResult).toContain("a.txt");
    expect(depthFullResult).toContain("b.txt");
  });

  // -----------------------------------------------------------------------
  // Output includes file/folder hierarchy markers
  // -----------------------------------------------------------------------
  it("should include hierarchy markers (|--) for files and folders", async () => {
    const result = await get_project_tree({
      root_path: fixturePath(),
      max_depth: 2,
    });
    expect(result).toBeTypeOf("string");
    // The root entry has no prefix
    // All children should use |-- prefix
    const lines = result.split("\n");
    const contentLines = lines.filter(
      (l) => l.includes("|--") || l.includes("(empty")
    );
    expect(contentLines.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // .gitignore respected (node_modules not shown)
  // -----------------------------------------------------------------------
  it("should not show node_modules in the project tree", async () => {
    const result = await get_project_tree({
      root_path: ".",
    });
    expect(result).toBeTypeOf("string");
    expect(result).not.toContain("node_modules");
  });

  // -----------------------------------------------------------------------
  // Folder names end with trailing slash
  // -----------------------------------------------------------------------
  it("should append a trailing slash to directory names", async () => {
    const result = await get_project_tree({
      root_path: fixturePath(),
      max_depth: 1,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("searchable/");
  });

  // -----------------------------------------------------------------------
  // Root name is the basename of root_path
  // -----------------------------------------------------------------------
  it("should display the basename of the root_path as the tree root", async () => {
    const result = await get_project_tree({
      root_path: fixturePath(),
    });
    expect(result).toBeTypeOf("string");
    // The root line should just be "fixtures/"
    expect(result).toContain("fixtures/");
  });

  // -----------------------------------------------------------------------
  // Returns the header line with max depth info
  // -----------------------------------------------------------------------
  it("should include a header with root path and max depth info", async () => {
    const result = await get_project_tree({
      root_path: fixturePath(),
      max_depth: 3,
    });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("Project tree for:");
    expect(result).toContain("max depth 3");
  });
});
