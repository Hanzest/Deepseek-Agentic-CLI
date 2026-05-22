# Manager Agent Skill — Efficient Task Delegation

**Target:** The main orchestrator agent (the "manager") that uses `delegate_sub_agent`.
**Principle:** Conceptual understanding, not deep-dive. The manager delegates, the sub-agent executes.

---

## 1. When to Delegate

Delegate when a task is:

| Signal | Why delegation helps |
|---|---|
| **Complex multi-step** | Context isolation prevents the manager's conversation from ballooning |
| **Self-contained** | The sub-task has clear inputs and a single output deliverable |
| **Parallelizable** | Multiple sub-agents can run concurrently on independent sub-tasks |
| **Simple task** | if it does not require deep reasoning or knowledge |

Do NOT delegate for trivial single-tool actions (e.g., reading a file, searching the web). Just call the tool directly.

---

## 2. The Four Pillars of a Good Delegation

Every call to `delegate_sub_agent` must nail these four required fields:

### 2.1 `sub_agent_name` — Identity

- Kebab-case, short, descriptive.
- Examples: `readme-updater`, `auth-module-builder`, `schema-designer`.
- The name becomes the prompt filename stem. Make it self-documenting.

### 2.2 `definition_of_done` — The Verifiable Target

- One sentence. Must be falsifiable — the sub-agent can look at it and know "I am done" or "I am not done."
- Good: "Update README.md to reflect all 10 tools and the new lib/ directory structure."
- Bad: "Improve documentation."

### 2.3 `role` — The Sub-Agent's Persona

- **Required.** Must be one of five pre-defined roles. Each role maps to a dedicated system prompt in `tools/roleSystemPrompts.js` via `ROLE_SYSTEM_PROMPT`, providing a curated description and output constraints tailored to the task type.
- Choose the role that best matches what the sub-agent will do:

| Role | Best for |
|---|---|
| `requirement_analyzer` | Breaking down objectives into verifiable, atomic requirements. Identifies ambiguities and edge cases. Does NOT implement. |
| `execution` | Implementing code changes, creating/modifying files, running terminal commands. Owns the full implementation lifecycle. |
| `inspection` | Exploring and auditing the codebase — searching for patterns, tracing dependencies, identifying technical debt. Read-only. |
| `unit_review` | Reviewing individual functions, classes, modules, or files for correctness, style, performance, and bug risks. |
| `integration_review` | Reviewing how components integrate — interfaces, data flow, contracts, cross-module consistency. Focuses on boundaries between units. |

- Each role also specifies whether `definition_of_done` and `deliverable` sections are included in the rendered prompt (`include_goal_deliverable` flag).
- The role drives the sub-agent's entire system prompt — choose carefully. A mismatch between role and task will produce suboptimal results (e.g., using `inspection` for a file-writing task).

### 2.4 `deliverable` — The Unambiguous Output

- What file(s) will be created/modified.
- Format, location, acceptance criteria.
- Example: "Overwrite README.md in project root with accurate tool table (10 tools), correct entry point (main.js), and updated dependencies section."

---

## 3. Optional: `context`

Provide background the sub-agent needs but cannot discover on its own:

- File paths relevant to the task.
- Constraints not obvious from the codebase.
- Preferences or conventions to follow.

**Keep it concise — max ~500 words.** The sub-agent has tools to explore the codebase; don't dump the entire codebase into context. Give it *pointers*, not *pages*. Full file contents in context defeat the purpose of context isolation and waste tokens.

---

## 4. Anti-patterns to Avoid

| Anti-pattern | Why it fails |
|---|---|
| **Over-specifying implementation** | The sub-agent should decide *how*. The manager defines *what* and the *definition of done*. |
| **Vague deliverables** | "Clean up the code" is not verifiable. The sub-agent will drift. |
| **Delegating a one-liner** | Reading a single file does not need a sub-agent. Use `read_file_chunk` directly. |
| **No acceptance criteria** | The sub-agent can't self-verify. It will guess and may guess wrong. |
| **Dumping all source code as context** | Wastes tokens and defeats context-isolation. Give references, not contents. |
| **Mismatched role** | Selecting `inspection` for a code-writing task (or vice-versa) will produce poor results. Match the role to the task type. |
| **Skipping `definition_of_done`** | Without a falsifiable target, the sub-agent cannot self-verify completion. It must know when to stop. |

---

## 5. The Manager's Mental Model

```
Manager's job:              Sub-agent's job:
  - Recognize a sub-task      - Read the prompt fully
  - Define definition_of_done - Plan the approach
  - Select the appropriate    - Execute with tools
    role                      - Self-verify against deliverable
  - Specify deliverable       - Report completion clearly
  - Provide key context       - Own the details
  - Stay out of the details
```

The manager needs only **conceptual understanding** of the sub-task — enough to define the `definition_of_done`, select the right `role`, and specify the `deliverable` clearly. The sub-agent owns the implementation details.

---

## 6. Quick Checklist

Before calling `delegate_sub_agent`, verify:

- [ ] The task is complex enough to justify delegation.
- [ ] `definition_of_done` is one sentence and falsifiable.
- [ ] `role` matches one of the 5 valid enum values (`requirement_analyzer`, `execution`, `inspection`, `unit_review`, `integration_review`) and fits the task type.
- [ ] `deliverable` specifies file(s), format, and acceptance criteria.
- [ ] `context` (optional) gives pointers, not a data dump.
- [ ] The task is self-contained — the sub-agent can complete it without asking the manager follow-up questions.

---

## 7. Token-Efficient Delegation

### 7.1 Keep Context Lean

The `context` field is for **pointers, not pages**. The sub-agent has its own tools to read files. Provide:

- File paths relevant to the task (not file contents)
- Constraints not obvious from the codebase (not the codebase itself)
- Conventions or preferences to follow

**Max recommended:** 500 words. If you need more, reconsider whether the task is self-contained.

### 7.2 Use `budget_iterations` to Cap Costs

Simple tasks (single file write, targeted search) rarely need 20 iterations. Complex tasks (multi-file refactors) may need more. Set `budget_iterations` per task:

| Task Complexity | Recommended Budget |
|----------------|-------------------|
| Single-file write/search | 3–5 |
| Multi-file coordinated change | 8–12 |
| Full codebase analysis | 15–20 |
| Unknown/exploratory | 10 (default) |

Lower budgets save tokens by forcing early termination of wandering sub-agents.

### 7.3 Use `self_contained` for Write-Only Tasks

When the deliverable is purely a file write with no verification needed, set `self_contained: true`. This instructs the sub-agent to write and respond — no re-reading, no verification loop. Saves 1–2 iterations per task.

### 7.4 Sub-Agents Batch Too

Sub-agents inherit the batch-first strategy (see [`docs/skills/using_tools.md`](../using_tools.md)). When writing the `deliverable` and `context`, don't micromanage tool usage — the sub-agent's system prompt already instructs batch-first behavior.

---

*Part of the skills documentation suite. See also [`docs/README.md`](../README.md) for the skills index.*
