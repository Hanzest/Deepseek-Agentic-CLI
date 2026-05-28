import { describe, it, expect } from "vitest";
import { delegate_sub_agents_schema } from "../../tools/delegateSubAgent.js";

// ---------------------------------------------------------------------------
// Schema validation for delegate_sub_agents (plural)
// Tests the array-item delegation schema.
// ---------------------------------------------------------------------------

describe("delegateSubAgents - Functionality / Schema Validation", () => {
  it("schema has delegations array at root level", () => {
    const props = delegate_sub_agents_schema.function.parameters.properties;
    const names = Object.keys(props);
    expect(names).toContain("delegations");
  });

  it("delegations is an array type", () => {
    const props = delegate_sub_agents_schema.function.parameters.properties;
    expect(props.delegations.type).toBe("array");
  });

  it("delegation items contain all essential parameter definitions", () => {
    const itemProps = delegate_sub_agents_schema.function.parameters.properties.delegations.items.properties;
    const names = Object.keys(itemProps);
    expect(names).toContain("sub_agent_name");
    expect(names).toContain("definition_of_done");
    expect(names).toContain("deliverable");
    expect(names).toContain("role");
    expect(names).toContain("context");
    expect(names).toContain("budget_iterations");
    expect(names).toContain("self_contained");
    expect(names).toContain("output_file");
    expect(names).toContain("max_wall_time_seconds");
  });

  it("delegation items have exactly 9 parameter properties", () => {
    const itemProps = delegate_sub_agents_schema.function.parameters.properties.delegations.items.properties;
    expect(Object.keys(itemProps).length).toBe(9);
  });

  it("delegation items have exactly 4 required fields", () => {
    const req = delegate_sub_agents_schema.function.parameters.properties.delegations.items.required;
    expect(req.length).toBe(4);
    expect(req).toContain("sub_agent_name");
    expect(req).toContain("definition_of_done");
    expect(req).toContain("deliverable");
    expect(req).toContain("role");
  });

  it("is a valid OpenAI function schema", () => {
    expect(delegate_sub_agents_schema.type).toBe("function");
    expect(delegate_sub_agents_schema.function).toHaveProperty("name", "delegate_sub_agents");
    expect(delegate_sub_agents_schema.function).toHaveProperty("description");
    expect(delegate_sub_agents_schema.function).toHaveProperty("parameters");
    expect(delegate_sub_agents_schema.function.parameters).toHaveProperty("type", "object");
    expect(delegate_sub_agents_schema.function.parameters).toHaveProperty("properties");
    expect(delegate_sub_agents_schema.function.parameters).toHaveProperty("required");
  });
});
