import { describe, it, expect } from "vitest";
import { delegate_sub_agent_schema } from "../../tools/delegateSubAgent.js";

// ---------------------------------------------------------------------------
// Same schema validation as reliability (user chose schema-only for delegateSubAgent)
// Placed in functionality folder for organizational completeness.
// ---------------------------------------------------------------------------

describe("delegateSubAgent — Functionality / Schema Validation", () => {
  it("schema has all essential parameter definitions", () => {
    const props = delegate_sub_agent_schema.function.parameters.properties;
    const names = Object.keys(props);
    expect(names).toContain("sub_agent_name");
    expect(names).toContain("goal");
    expect(names).toContain("purpose");
    expect(names).toContain("deliverable");
    expect(names).toContain("skills");
    expect(names).toContain("context");
    expect(names).toContain("priority");
    expect(names).toContain("budget_iterations");
    expect(names).toContain("self_contained");
    expect(names).toContain("output_file");
  });

  it("has exactly 10 parameter properties", () => {
    const props = delegate_sub_agent_schema.function.parameters.properties;
    expect(Object.keys(props).length).toBe(10);
  });

  it("has exactly 4 required fields", () => {
    const req = delegate_sub_agent_schema.function.parameters.required;
    expect(req.length).toBe(4);
  });

  it("is a valid OpenAI function schema", () => {
    expect(delegate_sub_agent_schema.type).toBe("function");
    expect(delegate_sub_agent_schema.function).toHaveProperty("name");
    expect(delegate_sub_agent_schema.function).toHaveProperty("description");
    expect(delegate_sub_agent_schema.function).toHaveProperty("parameters");
    expect(delegate_sub_agent_schema.function.parameters).toHaveProperty("type", "object");
    expect(delegate_sub_agent_schema.function.parameters).toHaveProperty("properties");
    expect(delegate_sub_agent_schema.function.parameters).toHaveProperty("required");
  });
});
