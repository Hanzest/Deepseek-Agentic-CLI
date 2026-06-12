# SKILL.md

## Metadata

- **Name:** Documentation Architecture & Information Design
- **Description:** Documentation system design covering audience-based structuring (Diátaxis framework: tutorials, how-to guides, reference, explanation), README conventions, API documentation patterns, changelog standards, architecture decision records (ADRs), and docs-as-code workflows.
- **Tags:** documentation, information-design, Diátaxis, README, ADR, changelog, technical-writing, docs-as-code, API-docs
- **Version:** 1.0.0

---

## When to Use

- **USE WHEN:** Writing or restructuring project documentation, deciding what type of document to create for a given need (tutorial vs. how-to vs. reference vs. explanation), writing API reference docs, establishing documentation conventions for a project, or creating/maintaining architecture decision records.
- **DO NOT USE FOR:** Writing code comments or inline documentation (which follow language-specific conventions), generating UI/UX copy (see UI/UX skill), or documenting project management processes that are not architecturally relevant.

---

## Constraints & Rules

- **Every document must identify its audience and purpose before it is written:** Documentation without a defined audience serves no one well. The four documentation types (tutorial, how-to guide, reference, explanation) each address distinct user needs — a single document should not mix them. A document that tries to be everything is nothing.
- **README is the project's front door — it must answer four questions immediately:** (1) What is this? (one-paragraph description), (2) Why would I use it? (problem it solves), (3) How do I get started? (minimal setup + first command), (4) Where do I go next? (links to deeper docs). Everything else is secondary.
- **Architecture Decision Records (ADRs) capture why, not what:** An ADR documents the context of a decision, the options considered, and the rationale for the chosen option — not just the decision itself. Without context, future readers cannot evaluate whether the decision still applies. ADRs should follow a template: Title, Status, Context, Decision, Consequences.
- **API documentation must be generated from the source of truth (the contract), not hand-written:** Hand-written API docs drift from the implementation within days. Use OpenAPI, JSDoc, or equivalent tooling to generate reference documentation from the contract definition. Hand-written docs can exist for conceptual explanations, but reference material must be contract-derived.
- **Changelogs are for users, not maintainers:** A changelog entry should describe what changed from the user's perspective ("Added support for pagination", "Fixed crash when uploading files >10MB"), not the internal commit message ("Refactored PaginationService to use new iterator pattern"). Keep a Changelog format (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`) is the standard.

---

## Core Principles

- **Separate learning from lookup (Diátaxis):** Tutorials are for learning (step-by-step, novice, safe environment). Reference is for lookup (complete, accurate, no hand-holding). How-to guides are for task completion (goal-oriented, practical steps). Explanation is for understanding (background, context, conceptual). Mixing them produces documents that are neither good tutorials nor good reference.
- **Document for the reader's context, not the writer's:** The writer knows the codebase intimately; the reader does not. Evaluate every document from the perspective of someone encountering the project for the first time. What assumptions are being made? What jargon is un-explained? What prerequisite knowledge is assumed?
- **Good documentation is maintained, not written once:** Documentation that is not tested (broken links, outdated commands, stale screenshots) is worse than no documentation — it wastes the reader's time. A docs-as-code workflow (linting, link checking, build-time validation) is the minimum viable maintenance strategy.
- **The best documentation is findable:** A correct answer that cannot be found is equivalent to no answer. Evaluate information architecture (navigation, search, cross-links) as an integral part of the documentation, not an afterthought. Each document should be discoverable from at least two paths (search and navigation).
- **Prefer examples over explanations where possible:** A well-chosen example communicates more quickly and accurately than paragraphs of prose. Code examples must be tested (extracted from test suites or validated by the build). Untested examples drift and become misleading.

---

## Workflow

- **Documentation planning phase — factors to consider:**
  - Who is the target audience? (new developer, experienced user, contributor, operator — each needs different depth, terminology, and starting point)
  - What type of document is needed? (tutorial for learning, how-to for task completion, reference for lookup, explanation for understanding — choose one primary type per document)
  - What is the critical path a new user follows? (that path needs the most polished documentation — the rest can be iterated)

- **Writing phase — factors to consider:**
  - Does the README answer the four entry questions? (what, why, how to start, where to go next — if any is missing, it's the first priority)
  - Are code examples tested? (extracted from test code or validated by the build — if they aren't tested, they will break silently)
  - Are ADRs written when significant architectural decisions are made? (if a decision has long-term consequences, it needs an ADR)

- **Maintenance phase — factors to consider:**
  - Are there broken links? (link checking should be automated in CI — broken links are a trust signal)
  - Is there drift between the documentation and the implementation? (outdated screenshots, wrong CLI flags, deprecated API examples — each erodes reader trust)
  - Are there reader signals of confusion? (metrics: bounce rate, time-on-page, support questions about documented features — each signals a documentation gap)

---

## Anti-patterns

- **The "everything-and-the-kitchen-sink" README:** A README that starts with installation instructions, then API reference, then contribution guide, then architecture overview, then FAQ. The overlooked factor: readers have different goals — a README that tries to be everything is too long for a quick start and too shallow for deep reference. Split it into separate documents with the README as the entry point.
- **Writing reference as a tutorial:** Listing every API method in a tutorial format ("Step 1: call init(), Step 2: call connect()..."). The overlooked factor: tutorials are for learning a concept; reference is for looking up specifics. A tutorial that lists every option teaches nothing; a reference that forces sequential reading frustrates lookup.
- **Changelog filled with commit messages:** "Refactored QueryBuilder internals, Fixed ESLint errors, Updated lodash to 4.17.21". The overlooked factor: users don't care about internal refactoring — they care about what affects them. Changelogs should filter internal changes and surface user-facing ones only.
- **Documentation that assumes perfect knowledge:** Starting with "simply configure the service" without defining what "configure" means or where the config file lives. The overlooked factor: what is "simple" to the writer is opaque to the reader — assume nothing, define everything, link to prerequisites.
- **No cross-referencing between documents:** Each document as an island that doesn't link to related concepts, prerequisites, or deeper explanations. The overlooked factor: readers don't read documentation linearly — they arrive at different entry points and need to navigate to related content. Every document should link to at least two other relevant documents.

---

## Decision Framework (Conflict Resolution)

| Priority | Principle | Rule | Example |
|----------|-----------|------|---------|
| **1** | **Audience first** | The document's type and depth must match its target reader — never mix types. | Don't put API reference in a tutorial. Create separate documents. |
| **2** | **Findability** | A correct answer that cannot be found is worthless. Prioritize navigation and search. | Cross-link related documents. Use consistent headings for search indexing. |
| **3** | **Accuracy** | Outdated docs are worse than missing docs. Automate correctness checks. | Test code examples in CI; check links in CI; flag screenshots as high-maintenance. |
| **4** | **Conciseness** | Every sentence must justify its existence. Remove filler, introductions, and motivational language. | "First, let's understand..." → remove and start with the instruction. |
| **5** | **Consistency** | Same terms, same patterns, same structure across all docs. | Use the same heading hierarchy in every document. Standardize terminology. |

---

## Self-Check Checklist

- [ ] Each document has a clearly identified primary type (tutorial / how-to / reference / explanation) — no mixing
- [ ] README answers: What is this? Why use it? How to start? Where to go next?
- [ ] All code examples are tested (extracted from tests or validated by build — not hand-typed)
- [ ] No broken links (link checking automated in CI)
- [ ] Changelog uses Keep a Changelog format with user-facing entries only (no commit messages)
- [ ] ADRs exist for architecturally significant decisions — each with Context, Decision, and Consequences
- [ ] API documentation is generated from the contract definition (OpenAPI/JSDoc), not hand-written
- [ ] Every document has at least 2 cross-links to related documents
