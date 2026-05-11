import { describe, it, expect } from "vitest";
import {
  WORKER_TOOLS,
  SUBAGENT_TOOLS,
  MANAGER_TOOLS,
} from "../../tools/registry.js";

// Expected tool names (excluding delegate_sub_agent which is manager-only)
const WORKER_TOOL_NAMES = [
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
  // WORKER_TOOLS structure
  // -----------------------------------------------------------------------
  it("WORKER_TOOLS contains all expected tool names", () => {
    for (const name of WORKER_TOOL_NAMES) {
      expect(WORKER_TOOLS).toHaveProperty(name);
    }
    expect(WORKER_TOOLS).not.toHaveProperty("delegate_sub_agent");
  });

  it("each WORKER_TOOLS entry is a 3-element array [schema, handler, needsConsent]", () => {
    for (const [name, entry] of Object.entries(WORKER_TOOLS)) {
      expect(Array.isArray(entry)).toBe(true);
      expect(entry.length).toBe(3);
      expect(typeof entry[0]).toBe("object"); // schema
      expect(typeof entry[1]).toBe("function"); // handler
      expect(typeof entry[2]).toBe("boolean"); // needsConsent
    }
  });

  it("WORKER_TOOLS consent flags are correct", () => {
    // Consent-required tools
    expect(WORKER_TOOLS.execute_terminal_command[2]).toBe(true);
    expect(WORKER_TOOLS.patch_file[2]).toBe(true);
    expect(WORKER_TOOLS.fetch_url[2]).toBe(true);
    expect(WORKER_TOOLS.write_or_create_file[2]).toBe(true);

    // Read-only tools
    expect(WORKER_TOOLS.read_file_chunk[2]).toBe(false);
    expect(WORKER_TOOLS.get_project_tree[2]).toBe(false);
    expect(WORKER_TOOLS.search_web[2]).toBe(false);
    expect(WORKER_TOOLS.ask_user_preferences[2]).toBe(false);
    expect(WORKER_TOOLS.multi_file_search_string[2]).toBe(false);
  });

  // -----------------------------------------------------------------------
  // No undefined handlers
  // -----------------------------------------------------------------------
  it("all handlers across all registries are functions", () => {
    const all = { ...WORKER_TOOLS, ...SUBAGENT_TOOLS, ...MANAGER_TOOLS };
    for (const [name, entry] of Object.entries(all)) {
      expect(typeof entry[1]).toBe("function");
    }
  });

  // -----------------------------------------------------------------------
  // Schema validity
  // -----------------------------------------------------------------------
  it("all schemas have type 'function' and function.name", () => {
    for (const [name, entry] of Object.entries(WORKER_TOOLS)) {
      const schema = entry[0];
      expect(schema.type).toBe("function");
      expect(schema.function.name).toBe(name);
      expect(schema.function).toHaveProperty("parameters");
    }
  });
});
