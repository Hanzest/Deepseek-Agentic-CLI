# Skill Docs — Single Source of Truth for Agent Skills

**Purpose:** A central index of all skill documents available to agents in this codebase. Each entry explains what the skill covers and where to find the full document.

**Principle:** One skill, one document. No duplication. No scattering of conventions across multiple files.

---

## Skill Index

| Skill | Document | Summary |
|---|---|---|
| **Tool Usage & Conventions** | [`docs/agents.md`](agents.md) | Path conventions, tool consent model, `.env` security policy, PowerShell quick reference, file encoding rules. |
| **Tool Usage Conventions (Shared)** | [`docs/skills/shared/tool-usage-conventions.md`](skills/shared/tool-usage-conventions.md) | Consolidated universal tool rules for all agents: batch-first strategy, consent model, encoding, PowerShell, mode system. |
| **System Architecture** | [`docs/this_repo/system-architecture.md`](this_repo/system-architecture.md) | Module responsibilities, data flow diagram, security model, OCP impact analysis, dependency map. |
| **Lib Modules Reference** | [`docs/this_repo/modules-lib.md`](this_repo/modules-lib.md) | Per-module reference for all 8 `lib/` files: roles, exports, line counts, dependencies. |
| **Tools Reference** | [`docs/this_repo/modules-tools.md`](this_repo/modules-tools.md) | Per-file reference for all 12 `tools/` files: schemas, consent, mutation, batching. |
| **Data Flow Diagrams** | [`docs/this_repo/data-flow.md`](this_repo/data-flow.md) | Execution paths: main loop, batch tool execution, sub-agent lifecycle, context sliding. |
| **Agent Onboarding** | [`docs/this_repo/agent-onboarding.md`](this_repo/agent-onboarding.md) | Quick-start navigation guide for agents new to this codebase. |
| **Skills Directory Format** | [`docs/skills/AGENTS.md`](skills/AGENTS.md) | Format rules for all documents in `docs/skills/`: shared docs, role AGENTS.md structure, how agents read the directory. |
| **Manager Task Delegation** | [`docs/skills/orchestrator/AGENTS.md`](skills/orchestrator/AGENTS.md) | How to delegate complex sub-tasks efficiently: goal definition, role selection, deliverable specification, anti-patterns. |
| **Tool Categories by Capability** | [`docs/tool-categories.md`](tool-categories.md) | All 10 tools grouped by capability domain (codebase inspection, web research, file mutation, system execution, user interaction, agent management) with consent/batching info. |

---

## How to Use This Index

### For the Manager Agent

When you need to understand:
- **What tools are available and their consent rules** → read `docs/agents.md`.
- **How to use tools efficiently (batch-first, consent, PowerShell)** → read `docs/skills/shared/tool-usage-conventions.md`.
- **How the codebase is structured** → read `docs/this_repo/system-architecture.md`.
- **What capability categories of tools are available** → read `docs/tool-categories.md`.
- **How to delegate a complex task to a sub-agent** → read `docs/skills/orchestrator/AGENTS.md`.
- **What each sub-agent role does** → read `docs/skills/{role}/AGENTS.md` for the target role.

### For Sub-Agents

Your system prompt already includes your role. Read:
- **Universal tool rules** → `docs/skills/shared/tool-usage-conventions.md`.
- **Your role-specific rules** → `docs/skills/{your-role}/AGENTS.md`.
- **What capability categories of tools are available** → read `docs/tool-categories.md`.
- **Codebase structure** (module responsibilities, dependencies) → read `docs/this_repo/system-architecture.md`.

### For Contributors Adding New Skills

1. If the skill is a **universal tool rule**, add it to `docs/skills/shared/tool-usage-conventions.md`.
2. If the skill is **role-specific**, add a section to the role's `docs/skills/{role}/AGENTS.md`.
3. If the skill is a **new role**, create `docs/skills/{role}/AGENTS.md` following the format in `docs/skills/AGENTS.md`.
4. If the skill is a **general reference**, place it in `docs/` and add an entry to the **Skill Index** table above.

---

## Design Principle

All documentation follows a layered approach:

```
docs/
  agents.md              ← General: tool conventions, security, shell reference
  tool-categories.md     ← General: tools grouped by capability domain
  README.md              ← This file: central index
  this_repo/             ← Codebase-specific: architecture, modules, tools, data flow, onboarding
    README.md              ← Index of all this_repo/ documents
    system-architecture.md ← Full architecture: module map, data flow, dependencies, security model
    modules-lib.md         ← Per-module reference for lib/ (8 modules)
    modules-tools.md       ← Per-file reference for tools/ (12 files)
    data-flow.md           ← Execution path diagrams (main loop, batch, sub-agent, context sliding)
    agent-onboarding.md    ← Quick-start navigation for agents
  skills/
    AGENTS.md              ← Format rules & directory index
    shared/
      tool-usage-conventions.md  ← Universal tool rules (all agents)
    orchestrator/
      AGENTS.md            ← Manager: delegation strategy
    requirement_analyzer/
      AGENTS.md            ← Sub-agent role
    execution/
      AGENTS.md            ← Sub-agent role
    inspection/
      AGENTS.md            ← Sub-agent role
    unit_review/
      AGENTS.md            ← Sub-agent role
    integration_review/
      AGENTS.md            ← Sub-agent role
```

- **General docs** (`agents.md`, `this_repo`) apply to all agents regardless of role.
- **Shared skills** (`skills/shared/`) apply to all agents — universal tool rules.
- **Role skills** (`skills/{role}/AGENTS.md`) are role-specific and assume familiarity with shared docs.

---

*Last updated: 2026. Maintained as the single source of truth for agent skills.*
