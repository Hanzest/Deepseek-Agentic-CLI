import { describe, it, expect } from "vitest";
import {
  WORKER_TOOLS,
  SUBAGENT_TOOLS,
  ORCHESTRATOR_TOOLS,
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

  it("ORCHESTRATOR_TOOLS has exactly 8 tools (4 read-only + 3-write + 1 sub-agent delegation)", () => {
    expect(Object.keys(ORCHESTRATOR_TOOLS).length).toBe(8);
  });

  // -----------------------------------------------------------------------
  // Tool schemas have descriptions
  // -----------------------------------------------------------------------
  it("every tool schema has a non-empty description", () => {
    for (const [name, entry] of Object.entries(ORCHESTRATOR_TOOLS)) {
      const desc = entry[0].function.description;
      expect(typeof desc).toBe("string");
      expect(desc.length).toBeGreaterThan(5);
    }
  });

  // -----------------------------------------------------------------------
  // Tool schemas have required fields defined
  // -----------------------------------------------------------------------
  it("every tool schema declares required parameters (or uses oneOf)", () => {
    for (const [name, entry] of Object.entries(ORCHESTRATOR_TOOLS)) {
      const params = entry[0].function.parameters;
      const required = params.required;
      const hasOneOf = Array.isArray(params.oneOf);
      // Some schemas like fetch_url use oneOf instead of a top-level required array
      expect(Array.isArray(required) || hasOneOf).toBe(true);
    }
  });
});
