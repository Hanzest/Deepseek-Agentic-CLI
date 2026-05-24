import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/cliInput.js", () => ({
  ask: vi.fn().mockResolvedValue("y"),
}));

import { createToolHandler, resetAlertCounter } from "../../tools/template.js";
import { ask } from "../../lib/cliInput.js";

async function echoHandler(args) {
  return `echo: ${args.message || "no message"}`;
}

describe("template - Functionality / Happy Paths", () => {
  beforeEach(() => {
    resetAlertCounter();
    ask.mockResolvedValue("y");
  });

  it("createToolHandler returns an async function", () => {
    const wrapped = createToolHandler("echo", echoHandler, false);
    expect(typeof wrapped).toBe("function");
  });

  it("wrapped handler returns the core handler result for read-only tools", async () => {
    const wrapped = createToolHandler("echo", echoHandler, false);
    const result = await wrapped({ message: "hello" });
    expect(result).toBe("echo: hello");
  });

  it("wrapped handler returns result when consent is auto-approved", async () => {
    const wrapped = createToolHandler("write_tool", echoHandler, true);
    const result = await wrapped({ message: "world" });
    expect(result).toBe("echo: world");
  });

  it("error output from denied consent is valid parseable JSON", async () => {
    ask.mockResolvedValueOnce("n");
    const wrapped = createToolHandler("denied_tool", echoHandler, true);
    const result = await wrapped({});
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("error", true);
    expect(parsed).toHaveProperty("tool", "denied_tool");
    expect(parsed).toHaveProperty("message");
  });

  it("resetAlertCounter can be called repeatedly without errors", () => {
    resetAlertCounter();
    resetAlertCounter();
    resetAlertCounter();
  });

  it("handler receives the exact args object", async () => {
    const wrapped = createToolHandler("passthrough", async (args) => {
      return JSON.stringify(args);
    }, false);
    const result = await wrapped({ a: 1, b: [2, 3], c: "str" });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ a: 1, b: [2, 3], c: "str" });
  });
});
