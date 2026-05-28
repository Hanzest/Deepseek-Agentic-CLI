import { describe, it, expect } from "vitest";
import { delegate_sub_agents_schema } from "../../tools/delegateSubAgent.js";

// ---------------------------------------------------------------------------
// Schema validation for delegate_sub_agents (plural)
// Validates the array-item delegation schema structure and types.
// ---------------------------------------------------------------------------

describe("delegateSubAgents - Reliability / Schema Validation", () => {
  // -----------------------------------------------------------------------
  // Top-level structure
  // -----------------------------------------------------------------------
  it("has top-level type 'function'", () => {
    expect(delegate_sub_agents_schema.type).toBe("function");
  });

  it("has function.name 'delegate_sub_agents'", () => {
    expect(delegate_sub_agents_schema.function.name).toBe("delegate_sub_agents");
  });

  it("has a description string", () => {
    expect(typeof delegate_sub_agents_schema.function.description).toBe("string");
    expect(delegate_sub_agents_schema.function.description.length).toBeGreaterThan(10);
  });

  // -----------------------------------------------------------------------
  // Root-level required field
  // -----------------------------------------------------------------------
  it("requires delegations at root level", () => {
    expect(delegate_sub_agents_schema.function.parameters.required).toContain("delegations");
  });

  // -----------------------------------------------------------------------
  // Delegation item fields - required
  // -----------------------------------------------------------------------
  const itemProps = delegate_sub_agents_schema.function.parameters.properties.delegations.items.properties;
  const itemRequired = delegate_sub_agents_schema.function.parameters.properties.delegations.items.required;

  it("requires sub_agent_name in items", () => {
    expect(itemRequired).toContain("sub_agent_name");
  });

  it("requires definition_of_done in items", () => {
    expect(itemRequired).toContain("definition_of_done");
  });

  it("requires role in items", () => {
    expect(itemRequired).toContain("role");
  });

  it("requires deliverable in items", () => {
    expect(itemRequired).toContain("deliverable");
  });

  // -----------------------------------------------------------------------
  // Parameter types
  // -----------------------------------------------------------------------
  it("sub_agent_name is type string", () => {
    expect(itemProps.sub_agent_name.type).toBe("string");
  });

  it("definition_of_done is type string", () => {
    expect(itemProps.definition_of_done.type).toBe("string");
  });

  it("role is type string", () => {
    expect(itemProps.role.type).toBe("string");
  });

  it("deliverable is type string", () => {
    expect(itemProps.deliverable.type).toBe("string");
  });

  it("context is type string", () => {
    expect(itemProps.context.type).toBe("string");
  });

  it("self_contained is type boolean", () => {
    expect(itemProps.self_contained.type).toBe("boolean");
  });

  it("budget_iterations is type integer", () => {
    expect(itemProps.budget_iterations.type).toBe("integer");
  });

  it("max_wall_time_seconds is type integer", () => {
    expect(itemProps.max_wall_time_seconds.type).toBe("integer");
  });

  // -----------------------------------------------------------------------
  // Enum values
  // -----------------------------------------------------------------------
  it("role has correct enum values", () => {
    expect(itemProps.role.enum).toEqual(["execution"]);
  });

  // -----------------------------------------------------------------------
  // output_file description
  // -----------------------------------------------------------------------
  it("output_file has description referencing .md", () => {
    expect(itemProps.output_file.type).toBe("string");
    expect(typeof itemProps.output_file.description).toBe("string");
    expect(itemProps.output_file.description).toContain(".md");
  });
});
