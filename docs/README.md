# Skill Document Writing Guidelines

## Intended Audience

This document has two audiences:

1. **Human authors** writing or maintaining `SKILL.md` files — follow the template and writing rules below.
2. **AI agents** — `SKILL.md` files are your source of domain-specific industry standards. When a user request falls into a covered domain, you **MUST** read the relevant `docs/skills/<domain>/SKILL.md` during resource gathering to inform your plan and implementation decisions.

**Purpose:** Define the authoring rules for every `SKILL.md` file in `docs/skills/`. These documents capture domain-specific industry-standard knowledge — principles, constraints, and decision factors — for agentic consumption.

---

## 1. Document Structure (Mandatory Template)

Every `SKILL.md` **must** contain the following sections **in order**:

| # | Section | Purpose | Required |
|---|---------|---------|----------|
| 1 | **Metadata** | Frontmatter: `name` (short title), `description` (one-paragraph scope summary), `tags` (5–10 keywords for agent routing), `version` (semver for tracking updates) | Yes |
| 2 | **When to Use** | Two bullet lists: `**USE WHEN**` and `**DO NOT USE FOR**` — clear boundary conditions for applicability | Yes |
| 3 | **Constraints & Rules** | Non-negotiable boundary conditions, technical guardrails, and forced decisions inherent to the domain | Yes |
| 4 | **Core Principles** | Foundational doctrines that guide decision-making — timeless, framework-agnostic truths | Yes |
| 5 | **Workflow** | Phases or stages of the domain process, described as **factors to consider** at each stage — never step-by-step commands | Yes |
| 6 | **Anti-patterns** | Common misapplications, why they fail, and what factor was overlooked | Yes |
| 7 | **Decision Framework** (optional) | Priority ladder for resolving conflicts when principles within this domain contradict each other. Higher priority overrides lower. Only use when the domain has inherent, recurring trade-offs. | No |
| 8 | **Self-Check Checklist** (optional) | Verifiable checkboxes an agent can run after generating output for this domain. Each checkbox must be testable programmatically or by inspection. | No |

---

## 2. Writing Rules

### 2.1 Condition-Based, Not Action-Based

| ✅ Correct (Condition / Factor) | ❌ Incorrect (Action / Command) |
|---------------------------------|--------------------------------|
| "Consider bundling strategy when page load latency exceeds user tolerance thresholds." | "Run `webpack --mode production` to bundle your assets." |
| "Evaluate state management complexity against component tree depth and data mutation frequency." | "Use Redux for all global state." |
| "Factor in image layer cache invalidation frequency when ordering Dockerfile instructions." | "Place `RUN apt-get install` before `COPY` in your Dockerfile." |

**Why:** Action-based instructions become outdated as tools evolve. Condition-based guidance remains valid across framework shifts, version upgrades, and tool replacements.

### 2.2 Technical Accuracy

- Every claim must be verifiably true in the industry (cite standards, RFCs, or well-established practices where possible).
- Avoid opinion masquerading as fact. If a practice is contested, frame it as a trade-off: *"When X is true, consider Y; when Z is true, consider W."*

### 2.3 Conciseness

- No filler introductions, no motivational language, no "in today's fast-paced world."
- Use bullet points, tables, and concise prose. One idea per bullet.
- **Target:** 300–800 words per SKILL.md. Domains requiring Decision Frameworks, pattern-matching tables, or Self-Check Checklists may exceed this limit, but each additional section must justify its length with agent-actionable value.

### 2.4 Domain Isolation with Adjacent Awareness

- Each `SKILL.md` covers **one primary domain**. Do not let the document become a catch-all.
- When a concept legitimately spans domains (e.g., security applies to Docker and CI/CD alike), each document covers the **domain-specific facet** of that concept independently.
- **Optional:** A `## Related Skills` section (last position, non-blocking) may reference adjacent domains. Example: *"See also: Security & Threat Modeling for container runtime hardening."* This prevents blind spots without creating dependency chains.

---

## 3. Quality Checklist

Before finalizing a `SKILL.md`, verify:

- [ ] All 6 mandatory sections present and in correct order
- [ ] Metadata includes `name`, `description`, `tags`, and `version`
- [ ] No imperative action commands (no `do this`, `run that`, `use this tool`)
- [ ] Every item describes a **condition to evaluate** or a **factor to weigh**
- [ ] `USE WHEN` / `DO NOT USE FOR` boundaries are mutually exclusive and collectively exhaustive for the domain
- [ ] Anti-patterns each explain **why** it fails and what factor was missed
- [ ] Cross-references to other skills (if any) are in a single `## Related Skills` section at the end
- [ ] Optional sections (Decision Framework, Self-Check Checklist) add verifiable value beyond the mandatory template
