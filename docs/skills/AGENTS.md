# Agent Skills - Directory & Format Guide

**Purpose:** Define the structure and formatting rules for all documents in `docs/skills/`. Every agent (manager and sub-agent) reads from this directory.

---

## 1. Directory Structure

```
docs/skills/
  AGENTS.md                               ← This file: format rules & index
  shared/
    tool-usage-conventions.md             ← Universal tool rules (all agents)
  orchestrator/
    AGENTS.md                             ← Manager: delegation strategy
  execution/
    AGENTS.md                             ← Sub-agent role
```

| Layer | Location | Read By | Contains |
|-------|----------|---------|----------|
| **Shared** | `shared/` | All agents (manager + sub-agents) | Universal tool rules, conventions, and constraints - tool-agnostic knowledge needed to operate correctly |
| **Role** | `{role}/AGENTS.md` | Agents spawned with that role | Role-specific must/should/prohibited rules derived from the canonical role definitions in `tools/roleSystemPrompts.js` |
| **Orchestrator** | `orchestrator/AGENTS.md` | The manager agent only | Delegation strategy: when to delegate, how to define goals, role selection, anti-patterns |

---

## 2. Shared Document Format

Shared documents in `shared/` follow this structure:

1. **Title** - concise, descriptive name
2. **Must Do** - hard rules; violation breaks functionality or security
3. **Should Do** - best practices; violation degrades quality but won't break things
4. **Must Not** - prohibited actions
5. **Should Not** - discouraged patterns
6. **Justification** - rationale for each rule group, deferred to the end

Rules within each section use numbered tables (`| # | Rule |`) for scanability. Shared documents contain no role-specific advice - that belongs in the role AGENTS.md files.

---

## 3. Role AGENTS.md Format

Every `{role}/AGENTS.md` follows this structure:

| Section | Content | Required |
|---------|---------|----------|
| **Prerequisite line** | `Prerequisite: Read docs/skills/shared/tool-usage-conventions.md for universal tool rules.` | Yes |
| **# {Role Name} Agent** | Title | Yes |
| **## Role** | 1–2 sentence role description (from `roleSystemPrompts.js`) | Yes |
| **## Must Do** | Numbered table of hard rules | Yes |
| **## Should Do** | Numbered table of best practices | Yes |
| **## Must Not** | Numbered table of prohibited actions | Yes |
| **## Should Not** | Numbered table of discouraged patterns | Yes |
| **## Justification** | Rationale for all above rules, grouped by section | Yes |

### Rules for content:
- **No inline "why".** Every rule is stated factually. All rationale lives in `## Justification`.
- Must Do rules derive from the role's `description` and `output_constraints` in `roleSystemPrompts.js`.
- Must Not rules derive from role boundaries (e.g., execution agents must not modify files outside the deliverable).
- Should/Should Not rules fill gaps with best-practice guidance.
- Justification groups explanations by section (Must Do, Should Do, Must Not, Should Not).

---

## 4. How Agents Read These Files

### Manager (Orchestrator)
1. Read `shared/tool-usage-conventions.md` first - it applies universally.
2. Read `orchestrator/AGENTS.md` for delegation strategy.
3. When selecting a role for `delegate_sub_agent`, briefly review that role's `AGENTS.md` to confirm the match.

### Sub-Agents
1. Read `shared/tool-usage-conventions.md` first.
2. Read your own role's `AGENTS.md` (the role is stated in your system prompt).
3. Do NOT read other roles' AGENTS.md files - they contain irrelevant or conflicting constraints.

---

## 5. Adding a New Role

1. Add the role definition to `tools/roleSystemPrompts.js` in `ROLE_SYSTEM_PROMPT`.
2. Create `docs/skills/{role}/AGENTS.md` following the format in Section 3.
3. Update the directory tree in Section 1 of this file.
4. Update `orchestrator/AGENTS.md` if the role changes delegation guidance.

---

## Justification

**Shared-first architecture:** All agents share the same tools and runtime constraints. A single shared document prevents duplication and ensures consistent tool usage across roles.

**Role isolation:** Each role's AGENTS.md is self-contained. A sub-agent reads only its own file. This prevents role confusion and keeps sub-agent context lean.

**Must/Should/Must Not/Should Not split:** Four tiers of rules mirror how agent systems process instructions. Hard prohibitions (Must Not) prevent catastrophic failures. Soft discouragement (Should Not) allows flexibility when context demands it.

**Deferred justification:** Separating rationale from rules keeps the rule sections scannable and actionable. Agents need to know *what* to do immediately; the *why* is reference material.

**Prerequisite line:** Every role file explicitly references the shared document so sub-agents never miss universal tool conventions - even if their system prompt is trimmed.
