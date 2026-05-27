# Skill Document Writing Guidelines

## Intended Audience

This document has two audiences:

1. **Human authors** writing or maintaining `SKILL.md` files - follow the template and writing rules below.
2. **AI agents** - `SKILL.md` files are your source of domain-specific industry standards. When a user request falls into a covered domain, you **MUST** read the relevant `docs/skills/<domain>/SKILL.md` during resource gathering to inform your plan and implementation decisions.

**Purpose:** Define the authoring rules for every `SKILL.md` file in `docs/skills/`. These documents capture domain-specific industry-standard knowledge - principles, constraints, and decision factors - for agentic consumption.

---

## 1. Document Structure (Mandatory Template)

Every `SKILL.md` **must** contain the following sections **in order**:

| # | Section | Purpose | Required |
|---|---------|---------|----------|
| 1 | **Metadata** | Frontmatter: `name` (short title), `description` (one-paragraph scope summary) | Yes |
| 2 | **When to Use** | Two bullet lists: `**USE WHEN**` and `**DO NOT USE FOR**` - clear boundary conditions for applicability | Yes |
| 3 | **Constraints & Rules** | Non-negotiable boundary conditions, technical guardrails, and forced decisions inherent to the domain | Yes |
| 4 | **Core Principles** | Foundational doctrines that guide decision-making - timeless, framework-agnostic truths | Yes |
| 5 | **Workflow** | Phases or stages of the domain process, described as **factors to consider** at each stage - never step-by-step commands | Yes |
| 6 | **Anti-patterns** | Common misapplications, why they fail, and what factor was overlooked | Yes |

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
- Target: 300–800 words per SKILL.md.

### 2.4 Domain Isolation

- Each `SKILL.md` covers **one domain only**. Do not cross-reference other skill domains.
- If a concept legitimately spans domains (e.g., "security" applies to Docker and CI/CD alike), each document covers the **domain-specific facet** of that concept independently.

---

## 3. Quality Checklist

Before finalizing a `SKILL.md`, verify:

- [ ] All 6 sections present and in correct order
- [ ] No imperative action commands (no `do this`, `run that`, `use this tool`)
- [ ] Every item describes a **condition to evaluate** or a **factor to weigh**
- [ ] `USE WHEN` / `DO NOT USE FOR` boundaries are mutually exclusive and collectively exhaustive for the domain
- [ ] Anti-patterns each explain **why** it fails and what factor was missed
- [ ] No cross-references to other skill documents
- [ ] Under 800 words
