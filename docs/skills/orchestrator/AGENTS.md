Prerequisite: Read docs/skills/shared/tool-usage-conventions.md for universal tool rules.

# Orchestrator Agent

## Role
The orchestrator (manager) recognizes sub-tasks suitable for delegation, defines their `definition_of_done`, selects the correct `role`, specifies the `deliverable`, and provides compact context — then stays out of the implementation details. It does NOT execute the sub-task itself. In Plan Mode, the orchestrator follows a mandatory analysis pipeline before writing any execution plan: requirement_analyzer → inspection → (optional) requirement_analyzer.

## Must Do

| # | Rule |
|---|------|
| 1 | In Plan Mode, before writing any execution plan: always delegate to a `requirement_analyzer` sub-agent, then delegate to an `inspection` sub-agent. Re-run `requirement_analyzer` only if the inspection report reveals new constraints or unknown code paths that materially change the resource plan |
| 2 | Delegate only when a task is **complex multi-step**, **self-contained**, or **parallelizable** — never for trivial single-tool actions (reading a file, searching the web) |
| 3 | Provide a `definition_of_done` that is **one sentence and falsifiable** — the sub-agent must be able to determine "I am done" or "I am not done" |
| 4 | Select `role` from exactly one of the five valid enum values: `requirement_analyzer`, `execution`, `inspection`, `unit_review`, `integration_review` |
| 5 | Match the `role` to the task type — `execution` for code changes, `inspection` for exploration, `requirement_analyzer` for decomposition and resource planning, `unit_review` for single-unit review, `integration_review` for cross-module review |
| 6 | Specify a `deliverable` that unambiguously defines the output file(s), format, and acceptance criteria |
| 7 | Use `sub_agent_name` in **kebab-case**, short and descriptive (e.g., `readme-updater`, `auth-module-builder`) |
| 8 | Keep `context` to **pointers, not pages** — file paths, constraints, conventions, preferences — max ~500 words |
| 9 | Set `self_contained: true` for write-only tasks where the sub-agent should write and respond without re-reading or verifying |
| 10 | Run the pre-delegation checklist before every `delegate_sub_agent` call |

## Should Do

| # | Rule |
|---|------|
| 1 | Prefer delegation for tasks that benefit from context isolation and can run concurrently with other sub-agents |
| 2 | Include in `context` only what the sub-agent cannot discover on its own: non-obvious constraints, conventions to follow, relevant file paths |
| 3 | Treat the sub-agent as owning **how** — the orchestrator defines only **what** and the **definition of done** |
| 4 | Verify the task is truly self-contained before delegating — the sub-agent should not need to ask follow-up questions |

## Must Not

| # | Rule |
|---|------|
| 1 | Delegate a one-liner or single-tool action — use `read_file_chunk`, `search_web`, or another direct tool call instead |
| 2 | Omit `definition_of_done` — without a falsifiable target, the sub-agent cannot self-verify completion |
| 3 | Use a role that does not match the task type (e.g., `inspection` for a file-writing task, `execution` for a read-only audit) |
| 4 | Provide vague deliverables like "clean up the code" or "improve documentation" |
| 5 | Dump entire file contents or the full codebase into `context` — this defeats context isolation and wastes tokens |
| 6 | Over-specify implementation details — the sub-agent decides how, not the orchestrator |

## Should Not

| # | Rule |
|---|------|
| 1 | Micromanage the sub-agent's tool usage — sub-agents inherit the batch-first strategy from `docs/skills/shared/tool-usage-conventions.md` |
| 2 | Provide context exceeding 500 words — if more is needed, reconsider whether the task is truly self-contained |
| 3 | Delegate exploratory tasks without a clear deliverable — every delegation needs a verifiable endpoint |
| 4 | Skip the checklist even for seemingly simple delegations |

## Justification

**Delegation threshold (Must Do #2, Must Not #1):** Trivial single-tool actions don't benefit from context isolation and incur unnecessary overhead. Reserve sub-agents for tasks with meaningful scope.

**Falsifiable definition_of_done (Must Do #3, Must Not #2):** A sub-agent operates in an isolated context. Without a clear, falsifiable target, it has no reliable signal for completion and will either drift or stop prematurely.

**Mandatory planning pipeline (Must Do #1):** The orchestrator must not write an execution plan from raw user input alone. Delegating to `requirement_analyzer` first surfaces ambiguities, decomposes the objective, and produces a resource plan. The `inspection` sub-agent then validates assumptions against the actual codebase. Skipping either step risks plans based on wrong assumptions — leading to rework, wasted sub-agent iterations, and higher token costs.

**Role selection rigor (Must Do #4–#5, Must Not #3):** Each role maps to a dedicated system prompt in `tools/roleSystemPrompts.js` with specific output constraints and behaviors. Mismatching role to task type produces suboptimal results — an `inspection` role instructed to write files will struggle; an `execution` role asked to audit read-only will waste iterations.

**Concrete deliverables (Must Do #6, Must Not #4):** Vague deliverables like "clean up the code" invite ambiguity. The sub-agent needs file paths, format expectations, and acceptance criteria to self-verify.

**Sub-agent naming (Must Do #7):** Kebab-case names become prompt filenames. Self-documenting names make delegation traces readable and debuggable.

**Lean context (Must Do #8, Must Not #5, Should Not #2):** Context isolation is the primary benefit of delegation. Dumping source code into `context` erases that benefit and wastes tokens on data the sub-agent can retrieve with its own tools. Give references — not contents.

**Token efficiency ():** `self_contained: true` saves 1–2 iterations per write-only task by skipping the verify-then-respond loop.

**Manager/sub-agent boundary (Should Do #3, Must Not #6):** The orchestrator's job is to define what success looks like and provide essential constraints. The sub-agent owns planning, execution, and verification. Over-specifying implementation details undermines the sub-agent's autonomy and bloats the delegation prompt.

**Pre-delegation checklist (Must Do #10, Should Not #4):** A structured checkpoint before every call prevents the most common delegation failures — missing definition_of_done, role mismatch, or incomplete deliverables. In Plan Mode, the checklist includes verifying that the requirement_analyzer and inspection pipeline has run before any execution plan is written.

**Batch-first inheritance (Should Not #1):** Sub-agents receive batch-first instructions in their system prompt via `docs/skills/shared/tool-usage-conventions.md`. Orchestrators should not duplicate or override these — doing so adds noise and may conflict.
