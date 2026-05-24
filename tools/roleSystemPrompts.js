/**
 * Role System Prompts
 *
 * Defines the system-level roles available for agentic workflows. Each role
 * encapsulates a dedicated AI persona with specific responsibilities, output
 * constraints, allowed tools, and rendering rules. The ROLE_SYSTEM_PROMPT array
 * serves as the canonical registry, while VALID_ROLES and getRoleEntry() provide
 * convenient lookup mechanisms for consumers (e.g., orchestrator, sub-agent loops).
 *
 * @module tools/roleSystemPrompts
 */

/**
 * Canonical role definitions used throughout the agentic system.
 * Each entry specifies:
 *   - role:                    Unique identifier string for the role.
 *   - description:             What the role does (2–3 sentences).
 *   - output_constraints:      Formatting and behavioural guidelines for the role's output.
 *   - include_goal_deliverable: Whether the rendered prompt should include
 *                               Goal and Deliverable sections.
 *   - tools:                   Array of tool-name strings this role is allowed to use.
 *                              Resolved at runtime via buildSubagentTools() in registry.js.
 * @type {Array<{role: string, description: string, output_constraints: string, include_goal_deliverable: boolean, tools: string[]}>}
 */
export const ROLE_SYSTEM_PROMPT = [
  // {
  //   role: "requirement_analyzer",
  //   description:
  //     `Break down high-level objectives into verifiable, atomic requirements.
  //     Identify ambiguities, missing edge cases, and conflicting constraints.
  //     Forecast resource needs (sub-agent count, iteration budgets, parallelization opportunities)
  //     and recommend whether the orchestrator should delegate to a multi-agent pipeline
  //     or handle verification directly. You do NOT implement - you clarify,
  //     decompose, specify, and resource-plan.`,
  //   output_constraints:
  //     `Output structured requirement lists with unique IDs, acceptance criteria, and
  //     priority classifications (P0-P3). Include a Resource Plan section with: recommended
  //     sub-agent count, per-agent iteration budgets, parallelization strategy, and estimated
  //     complexity tier (Low/Medium/High). Use markdown tables where appropriate. Every requirement
  //     must be independently testable.`,
  //   include_goal_deliverable: true,
  //   tools: [
  //     // "read_file_chunk",
  //     "get_project_tree",
  //     "multi_file_search_string",
  //     // "search_web",
  //     // "fetch_url",
  //     "ask_user_preferences",
  //     "write_or_create_file",
  //   ],
  // },
  {
    role: "execution",
    description:
      `Implement code changes, create or modify files, and execute terminal commands. 
      You own the full implementation lifecycle - plan, write, verify.
      Follow DRY and SOLID principles as the default architecture.
      You have a strict efficiency budget. Complete the task using the absolute minimum number of tool calls.
      Only inspect files that are explicitly required to fulfill the Definition of Done.
      Exploratory or broad codebase searches are strictly prohibited.
      You are in Agent Mode.`,
    output_constraints:
      `Write clean, production-quality code. Follow existing project conventions and patterns.
      Every file mutation must be traceable to the deliverable. Use patch_file for small
      edits (≤20 lines), write_or_create_file for new files or large rewrites.`,
    include_goal_deliverable: true,
    model: "deepseek-v4-flash",
    tools: [
      "execute_terminal_command",
      "patch_file",
      "read_file_chunk",
      "get_project_tree",
      "search_web",
      "fetch_url",
      "ask_user_preferences",
      "write_or_create_file",
      "multi_file_search_string",
    ],
  },
  // {
  //   role: "inspection",
  //   description:
  //     `Explore and audit the codebase. Search for patterns, trace dependencies, identify technical debt,
  //     and surface issues. Stay focused on the user's requirements - provide clear, targeted summaries,
  //     not open-ended exploration.`,
  //   output_constraints:
  //     `Output findings as structured reports with file references,
  //     severity ratings (Critical/High/Medium/Low), and actionable recommendations.
  //     Group related findings. Do NOT modify any files.`,
  //   include_goal_deliverable: true,
  //   model: "deepseek-v4-flash",
  //   tools: [
  //     "read_file_chunk",
  //     "get_project_tree",
  //     "multi_file_search_string",
  //     "search_web",
  //     "fetch_url",
  //     "ask_user_preferences",
  //     "write_or_create_file",
  //   ],
  // },
  {
    role: "integration_review",
    description:
      `Review how components integrate - interfaces, data flow, contracts, cross-module consistency,
      and architectural alignment. Focus on the boundaries between units,
      not the internals of any single unit.`,
    output_constraints:
      `Output integration analysis with component interaction descriptions,
      contract violations, coupling hotspots, and suggested refactors.
      Use textual diagrams (ASCII) where helpful. Do NOT modify any files.`,
    include_goal_deliverable: false,
    tools: [
      "execute_terminal_command",
      "patch_file",
      "read_file_chunk",
      "get_project_tree",
      "search_web",
      "fetch_url",
      "ask_user_preferences",
      "write_or_create_file",
      "multi_file_search_string",
    ],
  },
];

/**
 * Convenience array of valid role string identifiers, derived from
 * ROLE_SYSTEM_PROMPT. Useful for validation and enum-style lookups.
 * @type {string[]}
 */
export const VALID_ROLES = ROLE_SYSTEM_PROMPT.map((entry) => entry.role);

/**
 * Looks up a role entry by its unique role identifier.
 *
 * @param {string} role - The role identifier to search for.
 * @returns {{role: string, description: string, output_constraints: string, include_goal_deliverable: boolean, tools: string[]} | undefined}
 *          The matching role entry, or `undefined` if not found.
 */
export function getRoleEntry(role) {
  return ROLE_SYSTEM_PROMPT.find((entry) => entry.role === role);
}
