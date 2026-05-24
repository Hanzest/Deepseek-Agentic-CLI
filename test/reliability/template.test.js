import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock consent prompts at module level
vi.mock("../../lib/cliInput.js", () => ({
  ask: vi.fn().mockResolvedValue("y"),
}));

import { createToolHandler, resetAlertCounter } from "../../tools/template.js";
import { ask } from "../../lib/cliInput.js";

// ---------------------------------------------------------------------------
// Core handler that succeeds
// ---------------------------------------------------------------------------
async function successHandler(args) {
  return `success: ${JSON.stringify(args)}`;
}

// ---------------------------------------------------------------------------
// Core handler that throws
// ---------------------------------------------------------------------------
async function throwingHandler(args) {
  throw new Error("intentional test error");
}

describe("template - Reliability / Edge Cases", () => {
  beforeEach(() => {
    resetAlertCounter();
    ask.mockResolvedValue("y");
  });

  // -----------------------------------------------------------------------
  // Consent denied
  // -----------------------------------------------------------------------
  it("should return denial JSON when consent is denied", async () => {
    ask.mockResolvedValueOnce("n");
    const wrapped = createToolHandler("test_tool", successHandler, true);
    const result = await wrapped({ key: "value" });

    const parsed = JSON.parse(result);
    expect(parsed.error).toBe(true);
    expect(parsed.tool).toBe("test_tool");
    expect(parsed.message).toContain("User denied");
  });

  // -----------------------------------------------------------------------
  // No consent needed = direct execution
  // -----------------------------------------------------------------------
  it("should execute handler directly when needsConsent=false", async () => {
    const wrapped = createToolHandler("test_readonly", successHandler, false);
    const result = await wrapped({ input: "data" });
    expect(result).toContain("success");
    expect(result).toContain("data");
  });

  // -----------------------------------------------------------------------
  // Handler throws
  // -----------------------------------------------------------------------
  it("should return formatted error JSON when handler throws", async () => {
    const wrapped = createToolHandler("failing_tool", throwingHandler, false);
    const result = await wrapped({});
    const parsed = JSON.parse(result);
    expect(parsed.error).toBe(true);
    expect(parsed.tool).toBe("failing_tool");
    expect(parsed.message).toContain("intentional test error");
  });

  // -----------------------------------------------------------------------
  // Consent denied = no handler execution
  // -----------------------------------------------------------------------
  it("should not execute handler when consent is denied", async () => {
    ask.mockResolvedValueOnce("n");
    const wrapped = createToolHandler("blocked_tool", () => {
      throw new Error("should not be called");
    }, true);
    const result = await wrapped({});
    const parsed = JSON.parse(result);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain("denied");
  });

  // -----------------------------------------------------------------------
  // resetAlertCounter
  // -----------------------------------------------------------------------
  it("resetAlertCounter is a function", () => {
    expect(typeof resetAlertCounter).toBe("function");
    expect(() => resetAlertCounter()).not.toThrow();
  });
});
