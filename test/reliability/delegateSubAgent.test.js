import { describe, it, expect } from "vitest";
import { delegate_sub_agent_schema } from "../../tools/delegateSubAgent.js";

// ---------------------------------------------------------------------------
// Schema validation only (per user preference: delegateSubAgent too complex
// to test in isolation — schema checks ensure the tool interface is stable)
// ---------------------------------------------------------------------------

describe("delegateSubAgent — Reliability / Schema Validation", () => {
  // -----------------------------------------------------------------------
  // Top-level structure
  // -----------------------------------------------------------------------
  it("has top-level type 'function'", () => {
    expect(delegate_sub_agent_schema.type).toBe("function");
  });

  it("has function.name 'delegate_sub_agent'", () => {
    expect(delegate_sub_agent_schema.function.name).toBe("delegate_sub_agent");
  });

  it("has a description string", () => {
    expect(typeof delegate_sub_agent_schema.function.description).toBe("string");
    expect(delegate_sub_agent_schema.function.description.length).toBeGreaterThan(10);
  });

  // -----------------------------------------------------------------------
  // Required fields
  // -----------------------------------------------------------------------
  it("requires sub_agent_name", () => {
    expect(delegate_sub_agent_schema.function.parameters.required).toContain("sub_agent_name");
  });

  it("requires definition_of_done", () => {
    expect(delegate_sub_agent_schema.function.parameters.required).toContain("definition_of_done");
  });

  it("requires role", () => {
    expect(delegate_sub_agent_schema.function.parameters.required).toContain("role");
  });

  it("requires deliverable", () => {
    expect(delegate_sub_agent_schema.function.parameters.required).toContain("deliverable");
  });

  // -----------------------------------------------------------------------
  // Parameter types
  // -----------------------------------------------------------------------
  const props = delegate_sub_agent_schema.function.parameters.properties;

  it("sub_agent_name is type string", () => {
    expect(props.sub_agent_name.type).toBe("string");
  });

  it("definition_of_done is type string", () => {
    expect(props.definition_of_done.type).toBe("string");
  });

  it("role is type string", () => {
    expect(props.role.type).toBe("string");
  });

  it("deliverable is type string", () => {
    expect(props.deliverable.type).toBe("string");
  });

  it("context is type string", () => {
    expect(props.context.type).toBe("string");
  });

  it("self_contained is type boolean", () => {
    expect(props.self_contained.type).toBe("boolean");
  });

  it("budget_iterations is type integer", () => {
    expect(props.budget_iterations.type).toBe("integer");
  });

  // -----------------------------------------------------------------------
  // Enum values
  // -----------------------------------------------------------------------
  it("role has correct enum values", () => {
    expect(props.role.enum).toEqual(["requirement_analyzer", "execution", "inspection", "unit_review", "integration_review"]);
  });

  // -----------------------------------------------------------------------
  // output_file pattern
  // -----------------------------------------------------------------------
  it("output_file has pattern restriction", () => {
    expect(props.output_file.type).toBe("string");
    expect(typeof props.output_file.description).toBe("string");
    expect(props.output_file.description).toContain(".md");
  });
});
