# Skill Docs — Single Source of Truth for Agent Skills

**Purpose:** A central index of all skill documents available to agents in this codebase. Each entry explains what the skill covers and where to find the full document.

**Principle:** One skill, one document. No duplication. No scattering of conventions across multiple files.

---

## Skill Index

| Skill | Document | Summary |
|---|---|---|
| **Tool Usage & Conventions** | [`docs/agents.md`](agents.md) | Path conventions, tool consent model, `.env` security policy, PowerShell quick reference, file encoding rules. |
| **Batch Tool-Calling Strategy** | [`docs/skills/using_tools.md`](using_tools.md) | How to minimize API round-trips by co-dispatching independent tools, using native batch modes (`fetch_url` `urls[]`), and following the dependency rule. |
| **System Architecture** | [`docs/system-architecture.md`](system-architecture.md) | Module responsibilities, data flow diagram, security model, OCP impact analysis, dependency map. |
| **Manager Task Delegation** | [`docs/skills/managing_agents.md`](skills/managing_agents.md) | How to delegate complex sub-tasks efficiently: goal definition, deliverable specification, skill injection, anti-patterns. |

---

## How to Use This Index

### For the Manager Agent

When you need to understand:
- **What tools are available and their consent rules** → read `docs/agents.md`.
- **How to batch tool calls for minimal API round-trips** → read `docs/skills/using_tools.md`.
- **How the codebase is structured** → read `docs/system-architecture.md`.
- **How to delegate a complex task to a sub-agent** → read `docs/skills/managing_agents.md`.

### For Sub-Agents

Your system prompt already includes the delegation task. However, if you need:
- **Tool usage conventions** (paths, consent, PowerShell) → read `docs/agents.md`.
- **Batch tool-calling strategy** (minimize API round-trips) → read `docs/skills/using_tools.md`.
- **Codebase structure** (module responsibilities, dependencies) → read `docs/system-architecture.md`.

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
  using_tools.md         ← General: batch tool-calling strategy, token economics
  system-architecture.md ← General: module map, data flow, dependencies
  skill-docs.md          ← This file: central index
  skills/
    managing_agents.md    ← Specialized: delegation patterns and best practices
```

- **General docs** (`agents.md`, `system-architecture.md`) apply to all agents regardless of role.
- **Skill docs** (`skills/*.md`) are role-specific capability guides that assume familiarity with the general docs.

---

*Last updated: 2026. Maintained as the single source of truth for agent skills.*
