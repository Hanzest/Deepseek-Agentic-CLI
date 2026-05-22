import { describe, it, expect } from "vitest";
import {
  ALL_TOOLS,
  ORCHESTRATOR_TOOLS,
  buildSubagentTools,
} from "../../tools/registry.js";

// Expected tool names for the master catalog (all 9 worker tools)
const ALL_TOOL_NAMES = [
  "execute_terminal_command",
  "patch_file",
  "read_file_chunk",
  "get_project_tree",
  "search_web",
  "fetch_url",
  "ask_user_preferences",
  "write_or_create_file",
  "multi_file_search_string",
];

describe("registry — Reliability / Edge Cases", () => {
  // -----------------------------------------------------------------------
  // ALL_TOOLS structure
  // -----------------------------------------------------------------------
  it("ALL_TOOLS contains all expected tool names", () => {
    for (const name of ALL_TOOL_NAMES) {
      expect(ALL_TOOLS).toHaveProperty(name);
    }
    expect(ALL_TOOLS).not.toHaveProperty("delegate_sub_agent");
  });

  it("each ALL_TOOLS entry is a 2-element array [schema, handler]", () => {
    for (const [name, entry] of Object.entries(ALL_TOOLS)) {
      expect(Array.isArray(entry)).toBe(true);
      expect(entry.length).toBe(2);
      expect(typeof entry[0]).toBe("object");   // schema
      expect(typeof entry[1]).toBe("function"); // handler
    }
  });

  // -----------------------------------------------------------------------
  // No undefined handlers
  // -----------------------------------------------------------------------
  it("all handlers across ALL_TOOLS and ORCHESTRATOR_TOOLS are functions", () => {
    const all = { ...ALL_TOOLS };
    for (const [name, entry] of Object.entries(all)) {
      expect(typeof entry[1]).toBe("function");
    }
    for (const [name, entry] of Object.entries(ORCHESTRATOR_TOOLS)) {
      expect(typeof entry[1]).toBe("function");
    }
  });

  // -----------------------------------------------------------------------
  // Schema validity
  // -----------------------------------------------------------------------
  it("all ALL_TOOLS schemas have type 'function' and function.name", () => {
    for (const [name, entry] of Object.entries(ALL_TOOLS)) {
      const schema = entry[0];
      expect(schema.type).toBe("function");
      expect(schema.function.name).toBe(name);
      expect(schema.function).toHaveProperty("parameters");
    }
  });

  // -----------------------------------------------------------------------
  // buildSubagentTools — all needsConsent flags are false
  // -----------------------------------------------------------------------
  it("buildSubagentTools always produces needsConsent=false for every role", () => {
    const roles = ["requirement_analyzer", "execution", "inspection", "unit_review", "integration_review"];
    for (const role of roles) {
      const tools = buildSubagentTools(role);
      for (const [name, entry] of Object.entries(tools)) {
        expect(entry[2]).toBe(false);
      }
    }
  });

  // -----------------------------------------------------------------------
  // buildSubagentTools — each role's tools are a subset of ALL_TOOLS
  // -----------------------------------------------------------------------
  it("buildSubagentTools result tools are always subsets of ALL_TOOLS", () => {
    const roles = ["requirement_analyzer", "execution", "inspection", "unit_review", "integration_review"];
    for (const role of roles) {
      const tools = buildSubagentTools(role);
      for (const [name, entry] of Object.entries(tools)) {
        expect(ALL_TOOLS).toHaveProperty(name);
        // Schema identity check — same object reference
        expect(entry[0]).toBe(ALL_TOOLS[name][0]);
        expect(entry[1]).toBe(ALL_TOOLS[name][1]);
      }
    }
  });
});
