# Skill Docs — Single Source of Truth for Agent Skills

**Purpose:** A central index of all skill documents available to agents in this codebase. Each entry explains what the skill covers and where to find the full document.

**Principle:** One skill, one document. No duplication. No scattering of conventions across multiple files.

---

## Skill Index

| Skill | Document | Summary |
|---|---|---|
| **Tool Usage & Conventions** | [`docs/agents.md`](agents.md) | Path conventions, tool consent model, `.env` security policy, PowerShell quick reference, file encoding rules. |
| **System Architecture** | [`docs/system-architecture.md`](system-architecture.md) | Module responsibilities, data flow diagram, security model, OCP impact analysis, dependency map. |
| **Manager Task Delegation** | [`docs/skills/manager_agents.md`](skills/manager_agents.md) | How to delegate complex sub-tasks efficiently: goal definition, deliverable specification, skill injection, anti-patterns. |

---

## How to Use This Index

### For the Manager Agent

When you need to understand:
- **What tools are available and their consent rules** → read `docs/agents.md`.
- **How the codebase is structured** → read `docs/system-architecture.md`.
- **How to delegate a complex task to a sub-agent** → read `docs/skills/manager_agents.md`.

### For Sub-Agents

Your system prompt already includes the delegation task. However, if you need:
- **Tool usage conventions** (paths, consent, PowerShell) → read `docs/agents.md`.
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
  system-architecture.md ← General: module map, data flow, dependencies
  skill-docs.md          ← This file: central index
  skills/
    manager_agents.md    ← Specialized: delegation patterns and best practices
```

- **General docs** (`agents.md`, `system-architecture.md`) apply to all agents regardless of role.
- **Skill docs** (`skills/*.md`) are role-specific capability guides that assume familiarity with the general docs.

---

*Last updated: 2026. Maintained as the single source of truth for agent skills.*
