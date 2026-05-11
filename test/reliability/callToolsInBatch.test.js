import { describe, it, expect } from "vitest";
import { callToolsInBatch } from "../../tools/callToolsInBatch.js";

// A minimal mock registry for testing
const MOCK_REGISTRY = {
  echo: [
    { type: "function", function: { name: "echo", description: "Echoes input", parameters: { type: "object", properties: { msg: { type: "string" } }, required: ["msg"] } } },
    async (args) => `echo: ${args.msg}`,
    false, // read-only
  ],
  write_or_create_file: [
    { type: "function", function: { name: "write_or_create_file", description: "Writes data", parameters: { type: "object", properties: { data: { type: "string" } }, required: ["data"] } } },
    async (args) => `wrote: ${args.data}`,
    true, // needs consent
  ],
};

function makeToolCall(id, name, args) {
  return {
    id: id,
    function: {
      name: name,
      arguments: JSON.stringify(args),
    },
  };
}

describe("callToolsInBatch — Reliability / Edge Cases", () => {
  // -----------------------------------------------------------------------
  // Empty tool calls
  // -----------------------------------------------------------------------
  it("returns 0 for empty tool_calls array", async () => {
    const messages = [];
    const count = await callToolsInBatch([], MOCK_REGISTRY, messages);
    expect(count).toBe(0);
    expect(messages.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Parse error — invalid JSON arguments
  // -----------------------------------------------------------------------
  it("handles tool calls with invalid JSON arguments (parse error)", async () => {
    const messages = [];
    const badCall = {
      id: "call_1",
      function: {
        name: "echo",
        arguments: "not valid json {{{",
      },
    };
    const count = await callToolsInBatch([badCall], MOCK_REGISTRY, messages);
    expect(count).toBe(1);
    expect(messages.length).toBe(1);
    const parsed = JSON.parse(messages[0].content);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain("parse");
  });

  // -----------------------------------------------------------------------
  // Unknown tool name
  // -----------------------------------------------------------------------
  it("returns error for tool not in registry", async () => {
    const messages = [];
    const call = makeToolCall("call_1", "nonexistent_tool", { x: 1 });
    const count = await callToolsInBatch([call], MOCK_REGISTRY, messages);
    expect(count).toBe(1);
    const parsed = JSON.parse(messages[0].content);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain("does not exist");
  });

  // -----------------------------------------------------------------------
  // Plan mode blocks mutation tools (not artifacts/)
  // -----------------------------------------------------------------------
  it("blocks mutation tools in plan mode", async () => {
    const messages = [];
    const call = makeToolCall("call_1", "write_or_create_file", { data: "test" });
    const count = await callToolsInBatch([call], MOCK_REGISTRY, messages, "plan");
    expect(count).toBe(1);
    const parsed = JSON.parse(messages[0].content);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain("Plan Mode");
  });

  // -----------------------------------------------------------------------
  // Plan mode allows read-only tools
  // -----------------------------------------------------------------------
  it("allows read-only tools in plan mode", async () => {
    const messages = [];
    const call = makeToolCall("call_1", "echo", { msg: "hello" });
    const count = await callToolsInBatch([call], MOCK_REGISTRY, messages, "plan");
    expect(count).toBe(1);
    const msg = messages[0];
    expect(msg.content).toBe("echo: hello");
  });
});
