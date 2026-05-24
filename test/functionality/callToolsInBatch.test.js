import { describe, it, expect } from "vitest";
import { callToolsInBatch } from "../../tools/callToolsInBatch.js";

// A richer mock registry for functionality tests
const MOCK_REGISTRY = {
  read_a: [
    { type: "function", function: { name: "read_a", description: "", parameters: { type: "object", properties: {}, required: [] } } },
    async () => "result_a",
    false,
  ],
  read_b: [
    { type: "function", function: { name: "read_b", description: "", parameters: { type: "object", properties: {}, required: [] } } },
    async () => "result_b",
    false,
  ],
  write_x: [
    { type: "function", function: { name: "write_x", description: "", parameters: { type: "object", properties: {}, required: [] } } },
    async () => JSON.stringify({ success: true }),
    true,
  ],
};

function makeToolCall(id, name, args = {}) {
  return {
    id,
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("callToolsInBatch - Functionality / Happy Paths", () => {
  // -----------------------------------------------------------------------
  // Single read-only tool executes
  // -----------------------------------------------------------------------
  it("executes a single read-only tool and appends result to messages", async () => {
    const messages = [];
    const call = makeToolCall("c1", "read_a");
    const count = await callToolsInBatch([call], MOCK_REGISTRY, messages);
    expect(count).toBe(1);
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe("tool");
    expect(messages[0].tool_call_id).toBe("c1");
    expect(messages[0].name).toBe("read_a");
    expect(messages[0].content).toBe("result_a");
  });

  // -----------------------------------------------------------------------
  // Multiple read-only tools execute
  // -----------------------------------------------------------------------
  it("executes multiple read-only tools concurrently", async () => {
    const messages = [];
    const calls = [
      makeToolCall("c1", "read_a"),
      makeToolCall("c2", "read_b"),
    ];
    const count = await callToolsInBatch(calls, MOCK_REGISTRY, messages);
    expect(count).toBe(2);
    expect(messages.length).toBe(2);
    expect(messages[0].content).toBe("result_a");
    expect(messages[1].content).toBe("result_b");
  });

  // -----------------------------------------------------------------------
  // Mixed consent and read-only tools
  // -----------------------------------------------------------------------
  it("executes mixed consent and read-only tools in correct order", async () => {
    const messages = [];
    const calls = [
      makeToolCall("c1", "read_a"),
      makeToolCall("c2", "write_x"),
      makeToolCall("c3", "read_b"),
    ];
    const count = await callToolsInBatch(calls, MOCK_REGISTRY, messages);
    expect(count).toBe(3);
    expect(messages.length).toBe(3);

    // All results present in original order
    expect(messages[0].tool_call_id).toBe("c1");
    expect(messages[0].content).toBe("result_a");
    expect(messages[1].tool_call_id).toBe("c2");
    expect(messages[1].content).toBe('{"success":true}');
    expect(messages[2].tool_call_id).toBe("c3");
    expect(messages[2].content).toBe("result_b");
  });

  // -----------------------------------------------------------------------
  // Agent mode allows mutation tools
  // -----------------------------------------------------------------------
  it("allows mutation tools in agent mode", async () => {
    const messages = [];
    const call = makeToolCall("c1", "write_x");
    const count = await callToolsInBatch([call], MOCK_REGISTRY, messages, "agent");
    expect(count).toBe(1);
    // Not blocked - content should be valid JSON from the handler
    const parsed = JSON.parse(messages[0].content);
    expect(parsed.success).toBe(true);
    expect(parsed.error).toBeFalsy?.(); // optional check
  });

  // -----------------------------------------------------------------------
  // Return value matches number of tool calls
  // -----------------------------------------------------------------------
  it("returns the count of tool_calls processed", async () => {
    const messages = [];
    const calls = [
      makeToolCall("c1", "read_a"),
      makeToolCall("c2", "read_b"),
      makeToolCall("c3", "read_a"),
    ];
    const count = await callToolsInBatch(calls, MOCK_REGISTRY, messages);
    expect(count).toBe(3);
  });
});
