# Skill Docs — Single Source of Truth for Agent Skills

**Purpose:** A central index of all skill documents available to agents in this codebase. Each entry explains what the skill covers and where to find the full document.

**Principle:** One skill, one document. No duplication. No scattering of conventions across multiple files.

---

## Skill Index

| Skill | Document | Summary |
|---|---|---|
| **Tool Usage & Conventions** | [`docs/agents.md`](agents.md) | Path conventions, tool consent model, `.env` security policy, PowerShell quick reference, file encoding rules. |
| **Batch Tool-Calling Strategy** | [`docs/skills/using_tools.md`](using_tools.md) | How to minimize API round-trips by co-dispatching independent tools, using native batch modes (`fetch_url` `urls[]`), and following the dependency rule. |
| **System Architecture** | [`docs/this_repo/system-architecture.md`](this_repo/system-architecture.md) | Module responsibilities, data flow diagram, security model, OCP impact analysis, dependency map. |
| **Lib Modules Reference** | [`docs/this_repo/modules-lib.md`](this_repo/modules-lib.md) | Per-module reference for all 8 `lib/` files: roles, exports, line counts, dependencies. |
| **Tools Reference** | [`docs/this_repo/modules-tools.md`](this_repo/modules-tools.md) | Per-file reference for all 12 `tools/` files: schemas, consent, mutation, batching. |
| **Data Flow Diagrams** | [`docs/this_repo/data-flow.md`](this_repo/data-flow.md) | Execution paths: main loop, batch tool execution, sub-agent lifecycle, context sliding. |
| **Agent Onboarding** | [`docs/this_repo/agent-onboarding.md`](this_repo/agent-onboarding.md) | Quick-start navigation guide for agents new to this codebase. |
| **Manager Task Delegation** | [`docs/skills/managing_agents.md`](skills/managing_agents.md) | How to delegate complex sub-tasks efficiently: goal definition, deliverable specification, skill injection, anti-patterns. |
| **Tool Categories by Capability** | [`docs/tool-categories.md`](tool-categories.md) | All 10 tools grouped by capability domain (codebase inspection, web research, file mutation, system execution, user interaction, agent management) with consent/batching info. |

---

## How to Use This Index

### For the Manager Agent

When you need to understand:
- **What tools are available and their consent rules** → read `docs/agents.md`.
- **How to batch tool calls for minimal API round-trips** → read `docs/skills/using_tools.md`.
- **How the codebase is structured** → read `docs/this_repo/system-architecture.md`.
- **What capability categories of tools are available** → read `docs/tool-categories.md`.
- **How to delegate a complex task to a sub-agent** → read `docs/skills/managing_agents.md`.

### For Sub-Agents

Your system prompt already includes the delegation task. However, if you need:
- **Tool usage conventions** (paths, consent, PowerShell) → read `docs/agents.md`.
- **Batch tool-calling strategy** (minimize API round-trips) → read `docs/skills/using_tools.md`.
- **What capability categories of tools are available** → read `docs/tool-categories.md`.
- **Codebase structure** (module responsibilities, dependencies) → read `docs/this_repo/system-architecture.md`.

### For Contributors Adding New Skills

1. Write the skill document following the existing format (clear sections, tables where appropriate, concise language).
2. Place it in `docs/skills/` if it is a specialized capability guide, or in `docs/` if it is a general reference.
3. Add an entry to the **Skill Index** table above.

---

## Design Principle

All documentation follows a layered approach:

```
docs/
  agents.md              ← General: tool conventions, security, shell reference
  tool-categories.md     ← General: tools grouped by capability domain
  using_tools.md         ← General: batch tool-calling strategy, token economics
  README.md              ← This file: central index
  this_repo/             ← Codebase-specific: architecture, modules, tools, data flow, onboarding
    README.md              ← Index of all this_repo/ documents
    system-architecture.md ← Full architecture: module map, data flow, dependencies, security model
    modules-lib.md         ← Per-module reference for lib/ (8 modules)
    modules-tools.md       ← Per-file reference for tools/ (12 files)
    data-flow.md           ← Execution path diagrams (main loop, batch, sub-agent, context sliding)
    agent-onboarding.md    ← Quick-start navigation for agents
  skills/
    managing_agents.md    ← Specialized: delegation patterns and best practices
```

- **General docs** (`agents.md`, `this_repo`) apply to all agents regardless of role.
- **Skill docs** (`skills/*.md`) are role-specific capability guides that assume familiarity with the general docs.

---

*Last updated: 2026. Maintained as the single source of truth for agent skills.*
