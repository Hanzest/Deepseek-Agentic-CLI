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
| **Specialized** | The sub-task requires focused domain knowledge (e.g., SQL tuning, React patterns) |
| **Parallelizable** | Multiple sub-agents can run concurrently on independent sub-tasks |

Do NOT delegate for trivial single-tool actions (e.g., reading a file, searching the web). Just call the tool directly.

---

## 2. The Four Pillars of a Good Delegation

Every call to `delegate_sub_agent` must nail these four required fields:

### 2.1 `sub_agent_name` — Identity

- Kebab-case, short, descriptive.
- Examples: `readme-updater`, `auth-module-builder`, `schema-designer`.
- The name becomes the prompt filename stem. Make it self-documenting.

### 2.2 `goal` — The Verifiable Target

- One sentence. Must be falsifiable — the sub-agent can look at it and know "I am done" or "I am not done."
- Good: "Update README.md to reflect all 10 tools and the new lib/ directory structure."
- Bad: "Improve documentation."

### 2.3 `purpose` — The Why

- Explain the motivation in one paragraph.
- Address: context-isolation benefit, specialization angle, or parallelization strategy.
- Example: "The README is stale and references deleted files. A fresh sub-agent with full context isolation will rewrite it without polluting the manager's conversation window."

### 2.4 `deliverable` — The Unambiguous Output

- What file(s) will be created/modified.
- Format, location, acceptance criteria.
- Example: "Overwrite README.md in project root with accurate tool table (10 tools), correct entry point (main.js), and updated dependencies section."

---

## 3. Optional but Powerful: `skills`

The `skills` array narrows the sub-agent's expertise in its system prompt. Each tag injects a specialization line. Use them to increase accuracy:

- Be specific: `"React 18 Server Components"` not `"React"`.
- Limit to 3–5 tags; too many dilutes focus.
- Match skills to the deliverable, not the domain.

Examples:
- For a database task: `["SQL optimization", "PostgreSQL indexing", "query plan analysis"]`
- For a UI task: `["accessibility auditing", "CSS layout", "design-system consistency"]`

---

## 4. Optional: `context`

Provide background the sub-agent needs but cannot discover on its own:

- File paths relevant to the task.
- Constraints not obvious from the codebase.
- Preferences or conventions to follow.

**Keep it concise — max ~500 words.** The sub-agent has tools to explore the codebase; don't dump the entire codebase into context. Give it *pointers*, not *pages*. Full file contents in context defeat the purpose of context isolation and waste tokens.

---

## 5. Anti-patterns to Avoid

| Anti-pattern | Why it fails |
|---|---|
| **Over-specifying implementation** | The sub-agent should decide *how*. The manager defines *what* and *why*. |
| **Vague deliverables** | "Clean up the code" is not verifiable. The sub-agent will drift. |
| **Delegating a one-liner** | Reading a single file does not need a sub-agent. Use `read_file_chunk` directly. |
| **No acceptance criteria** | The sub-agent can't self-verify. It will guess and may guess wrong. |
| **Dumping all source code as context** | Wastes tokens and defeats context-isolation. Give references, not contents. |

---

## 6. The Manager's Mental Model

```
Manager's job:              Sub-agent's job:
  - Recognize a sub-task      - Read the prompt fully
  - Define goal + purpose     - Plan the approach
  - Specify deliverable       - Execute with tools
  - Add relevant skills       - Self-verify against deliverable
  - Provide key context       - Report completion clearly
  - Stay out of the details   - Own the details
```

The manager needs only **conceptual understanding** of the sub-task — enough to define the goal, purpose, and deliverable clearly. The sub-agent owns the implementation details.

---

## 7. Quick Checklist

Before calling `delegate_sub_agent`, verify:

- [ ] The task is complex enough to justify delegation.
- [ ] `goal` is one sentence and falsifiable.
- [ ] `purpose` explains *why* delegation is the right approach.
- [ ] `deliverable` specifies file(s), format, and acceptance criteria.
- [ ] `skills` (optional) are specific and relevant.
- [ ] `context` (optional) gives pointers, not a data dump.
- [ ] The task is self-contained — the sub-agent can complete it without asking the manager follow-up questions.

---

## 8. Token-Efficient Delegation

### 8.1 Keep Context Lean

The `context` field is for **pointers, not pages**. The sub-agent has its own tools to read files. Provide:

- File paths relevant to the task (not file contents)
- Constraints not obvious from the codebase (not the codebase itself)
- Conventions or preferences to follow

**Max recommended:** 500 words. If you need more, reconsider whether the task is self-contained.

### 8.2 Use `budget_iterations` to Cap Costs

Simple tasks (single file write, targeted search) rarely need 20 iterations. Complex tasks (multi-file refactors) may need more. Set `budget_iterations` per task:

| Task Complexity | Recommended Budget |
|----------------|-------------------|
| Single-file write/search | 3–5 |
| Multi-file coordinated change | 8–12 |
| Full codebase analysis | 15–20 |
| Unknown/exploratory | 10 (default) |

Lower budgets save tokens by forcing early termination of wandering sub-agents.

### 8.3 Use `self_contained` for Write-Only Tasks

When the deliverable is purely a file write with no verification needed, set `self_contained: true`. This instructs the sub-agent to write and respond — no re-reading, no verification loop. Saves 1–2 iterations per task.

### 8.4 Use `priority` to Guide Effort

| Priority | Effect |
|----------|--------|
| `high` | Sub-agent minimizes verification, favors speed over exhaustive checking |
| `normal` | Standard behavior (default) |
| `low` | Sub-agent may use fewer iterations, report partial results |

### 8.5 Sub-Agents Batch Too

Sub-agents inherit the batch-first strategy (see [`docs/skills/using_tools.md`](../using_tools.md)). When writing the `deliverable` and `context`, don't micromanage tool usage — the sub-agent's system prompt already instructs batch-first behavior.

---

*Part of the skills documentation suite. See also [`docs/README.md`](../README.md) for the skills index.*
