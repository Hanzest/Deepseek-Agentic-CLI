import { describe, it, expect } from "vitest";
import {
  WORKER_TOOLS,
  SUBAGENT_TOOLS,
  MANAGER_TOOLS,
} from "../../tools/registry.js";

describe("registry — Functionality / Happy Paths", () => {
  // -----------------------------------------------------------------------
  // Counts
  // -----------------------------------------------------------------------
  it("WORKER_TOOLS has exactly 9 tools", () => {
    expect(Object.keys(WORKER_TOOLS).length).toBe(9);
  });

  it("SUBAGENT_TOOLS has exactly 9 tools", () => {
    expect(Object.keys(SUBAGENT_TOOLS).length).toBe(9);
  });

  it("MANAGER_TOOLS has exactly 10 tools (9 worker + delegate_sub_agent)", () => {
    expect(Object.keys(MANAGER_TOOLS).length).toBe(10);
  });

  // -----------------------------------------------------------------------
  // Tool schemas have descriptions
  // -----------------------------------------------------------------------
  it("every tool schema has a non-empty description", () => {
    for (const [name, entry] of Object.entries(MANAGER_TOOLS)) {
      const desc = entry[0].function.description;
      expect(typeof desc).toBe("string");
      expect(desc.length).toBeGreaterThan(5);
    }
  });

  // -----------------------------------------------------------------------
  // Tool schemas have required fields defined
  // -----------------------------------------------------------------------
  it("every tool schema declares required parameters", () => {
    for (const [name, entry] of Object.entries(MANAGER_TOOLS)) {
      const required = entry[0].function.parameters.required;
      expect(Array.isArray(required)).toBe(true);
    }
  });
});
