Prerequisite: Read docs/skills/shared/tool-usage-conventions.md for universal tool rules.

# Orchestrator Agent

## Role
The orchestrator (manager) recognizes sub-tasks suitable for delegation, defines their `definition_of_done`, specifies the `role` (always `execution`), specifies the `deliverable`, and provides compact context - then stays out of the implementation details. It does NOT execute the sub-task itself. 

## Must Do

| # | Rule |
|---|------|
| 1 | Delegate only when a task is **complex multi-step**, **self-contained**, or **parallelizable** - never for trivial single-tool actions (reading a file, searching the web) |
| 2 | Provide a `definition_of_done` that is **one sentence and falsifiable** - the sub-agent must be able to determine "I am done" or "I am not done" |
| 3 | Specify a `deliverable` that unambiguously defines the output file(s), format, and acceptance criteria |
| 4 | Use `sub_agent_name` in **PascalCase**, short and descriptive (e.g., `ReadmeUpdater`, `AuthModuleBuilder`) |
| 5 | Keep `context` to **pointers, not pages** - file paths, constraints, conventions, preferences - max ~500 words |
| 6 | Set `self_contained: true` for write-only tasks where the sub-agent should write and respond without re-reading or verifying |
| 7 | Run the pre-delegation checklist before every `delegate_sub_agent` call |

## Should Do

| # | Rule |
|---|------|
| 1 | Prefer delegation for tasks that benefit from context isolation and can run concurrently with other sub-agents |
| 2 | Include in `context` only what the sub-agent cannot discover on its own: non-obvious constraints, conventions to follow, relevant file paths |
| 3 | Treat the sub-agent as owning **how** - the orchestrator defines only **what** and the **definition of done** |
| 4 | Verify the task is truly self-contained before delegating - the sub-agent should not need to ask follow-up questions |

## Must Not

| # | Rule |
|---|------|
| 1 | Delegate a one-liner or single-tool action - use `read_file_chunk`, `search_web`, or another direct tool call instead |
| 2 | Omit `definition_of_done` - without a falsifiable target, the sub-agent cannot self-verify completion |
| 3 | Use any role other than `execution` (as `execution` is the only supported sub-agent role) |
| 4 | Provide vague deliverables like "clean up the code" or "improve documentation" |
| 5 | Dump entire file contents or the full codebase into `context` - this defeats context isolation and wastes tokens |
| 6 | Over-specify implementation details - the sub-agent decides how, not the orchestrator |

## Should Not

| # | Rule |
|---|------|
| 1 | Micromanage the sub-agent's tool usage - sub-agents inherit the batch-first strategy from `docs/skills/shared/tool-usage-conventions.md` |
| 2 | Provide context exceeding 500 words - if more is needed, reconsider whether the task is truly self-contained |
| 3 | Delegate exploratory tasks without a clear deliverable - every delegation needs a verifiable endpoint |
| 4 | Skip the checklist even for seemingly simple delegations |

