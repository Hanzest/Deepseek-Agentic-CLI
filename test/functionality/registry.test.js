import { describe, it, expect } from "vitest";
import {
  ALL_TOOLS,
  ORCHESTRATOR_TOOLS,
  buildSubagentTools,
} from "../../tools/registry.js";

describe("registry — Functionality / Happy Paths", () => {
  // -----------------------------------------------------------------------
  // Counts
  // -----------------------------------------------------------------------
  it("ALL_TOOLS has exactly 9 tools", () => {
    expect(Object.keys(ALL_TOOLS).length).toBe(9);
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
      expect(Array.isArray(required) || hasOneOf).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // buildSubagentTools — role-based tool resolution
  // -----------------------------------------------------------------------
  it("buildSubagentTools('execution') returns all 9 tools", () => {
    const tools = buildSubagentTools("execution");
    expect(Object.keys(tools).length).toBe(9);
  });

  it("buildSubagentTools('inspection') returns 7 tools (read + ask_user + write)", () => {
    const tools = buildSubagentTools("inspection");
    expect(Object.keys(tools).length).toBe(7);
  });

  it("buildSubagentTools('requirement_analyzer') returns 7 tools", () => {
    const tools = buildSubagentTools("requirement_analyzer");
    expect(Object.keys(tools).length).toBe(7);
  });

  it("buildSubagentTools('unit_review') returns 7 tools", () => {
    const tools = buildSubagentTools("unit_review");
    expect(Object.keys(tools).length).toBe(7);
  });

  it("buildSubagentTools('integration_review') returns all 9 tools", () => {
    const tools = buildSubagentTools("integration_review");
    expect(Object.keys(tools).length).toBe(9);
  });

  it("buildSubagentTools throws for an unknown role", () => {
    expect(() => buildSubagentTools("nonexistent")).toThrow(/Unknown role/);
  });

  it("buildSubagentTools result entries are [schema, handler, false]", () => {
    const tools = buildSubagentTools("execution");
    for (const [name, entry] of Object.entries(tools)) {
      expect(Array.isArray(entry)).toBe(true);
      expect(entry.length).toBe(3);
      expect(typeof entry[0]).toBe("object");   // schema
      expect(typeof entry[1]).toBe("function"); // handler
      expect(entry[2]).toBe(false);             // needsConsent
    }
  });
});
