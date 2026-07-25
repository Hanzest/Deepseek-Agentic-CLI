# SKILL.md

## Metadata

- **Name:** Academic-Writing-Clarification
- **Description:** Compliance guidelines for the Pre-Writing Clarification Questionnaire — you must follow this before any academic writing or enhancement task. Covers mandatory questions, formatting guardrails, bias/consistency enforcement, and verification checks.
- **Tags:** academic-writing, pre-writing-clarification, writing-compliance, terminology-enforcement, bias-removal, tone-calibration, sectioning, citation-style
- **Version:** 1.0.0

---

## When to Use

- **USE WHEN:** You are asked to write, enhance, or restructure an academic document (assignment, research paper, thesis, conference submission, academic correspondence). You MUST execute the Pre-Writing Clarification Questionnaire before any generation or edit.
- **DO NOT USE FOR:** Creative writing, journalistic writing, business reports, documentation (use documentation skill), informal emails, code comments.

---

## Compliance Rules

### Rule 1 — You MUST execute the Pre-Writing Clarification Questionnaire before any writing or enhancement task.

Ask all 11 questions. Record every answer. Do not skip or assume any answer. If the user provides partial answers, ask for the missing ones before proceeding.

### Rule 2 — You MUST detect and remove all bias and subjective language.

- Flag opinions presented as fact (e.g., "obviously," "clearly," "undoubtedly").
- Flag loaded adjectives with no evidential backing.
- Flag unsupported generalizations (e.g., "All studies show that...").
- Flag gendered language, culturally insensitive terms, and assumptive phrasing.
- Replace or delete every instance. Do not leave any unchecked.

### Rule 3 — You MUST enforce terminology consistency across the entire document.

- One concept = one term. No synonym-swapping for lexical variety.
- If the document uses multiple terms for the same concept (e.g., "methodology" / "approach" / "technique" for the same procedure), normalize to one term.
- Scan every section. If drift is found, pick the most precise term and apply it everywhere.

### Rule 4 — You MUST enforce exactly one citation style throughout the document.

- Confirm the citation style via the questionnaire before any generation.
- Validate every in-text citation against the selected style format.
- Validate the reference list, footnotes, or endnotes against the same style.
- If any citation uses a different style's convention, correct it immediately.
- No mixed styles. No exceptions.

### Rule 5 — You MUST apply the no-yapping filter to all output.

- Delete filler phrases: "It is important to note that...", "In today's academic landscape...", "It is worth mentioning that...", "As previously stated...".
- Remove redundant adverbs: "very unique", "extremely significant", "quite interesting", "absolutely essential".
- Remove self-referential meta-commentary: "This section will discuss...", "As we shall see...". Replace with the content itself.
- Remove any sentence that carries no informational or structural weight.

### Rule 6 — You MUST NOT use em-dashes unless explicitly permitted.

- Default to commas, parentheses, or semicolons for clause boundaries.
- Only preserve em-dashes if the user confirms their target venue or style guide permits them.
- Audit the final output. If any em-dash is present without explicit permission, replace it.

### Rule 7 — You MUST match format constraints to the deliverable endpoint.

- A 500-word undergraduate assignment gets different heading depth and section granularity than a 10,000-word thesis chapter.
- Scale heading levels, paragraph length, and subsection use to the expected length and depth level from the questionnaire.
- Do not apply one-size-fits-all templates.

### Rule 8 — You MUST respect discipline-specific conventions when confirmed.

- If the user specifies a discipline (STEM, Humanities, Social Sciences, Law, Business, Medicine), apply its conventions:
  - Passive vs. active voice preference.
  - First-person allowance.
  - Structural norms (IMRaD for STEM, essay structure for Humanities).
- If no discipline is specified, default to the most conservative formal-academic conventions.

---

## Pre-Writing Clarification Questionnaire (Mandatory — Execute First)

You MUST present this table to the user and get answers to all 11 questions before any writing or enhancement.

| # | Question | Options | Action on Answer |
|---|----------|---------|-----------------|
| 1 | **Task Purpose** | Enhance existing writing (fix consistency, terminology, remove bias/subjectivity) / Write from scratch / Both | If "Enhance" — read the existing document first. If "Write" — build from the questionnaire answers. If "Both" — enhance then write, or vice versa per user preference. |
| 2 | **Deliverable Endpoint** | Assignment submission / Research publication / Academic correspondence / Mixed / Other (user specifies) | Match formatting to the endpoint. Assignments follow rubric constraints. Publications follow venue guidelines. |
| 3 | **Target Audience** | Strict/rigorous lecturer / Lenient/low-profession lecturer / Peer researcher / Reviewer / Mixed / Other (user specifies) | Strict audience = zero jargon without definition, dense citations, formal tone. Lenient audience = more explanatory room. Peer researcher = domain-level depth, no hand-holding. |
| 4 | **Depth Level** | Undergraduate / Graduate (Masters) / PhD (Research) / Variable | Undergraduate = explain concepts, moderate analysis. Graduate = analytical, well-referenced. PhD = rigorous, original, deep literature engagement. |
| 5 | **Expected Length** | Short (≤2,000 words) / Medium (2,000–8,000) / Long (8,000+) / Variable | Short = no heavy subsections. Medium = moderate sectioning. Long = full hierarchical structure. |
| 6 | **Styling & Format** | Heading style: Numbered (1., 1.1) / Alphabetical (A., A.1) / Markdown (##, ###) / Document-native / Citation style: APA / MLA / IEEE / Chicago (Notes-Bibliography) / Chicago (Author-Date) / Harvard / Other (user specifies) / No em-dash / No yapping / Concise imperative tone | Apply all selected format rules to the entire document. Validate at the end. |
| 7 | **Tone Calibration** | Formal-academic / Semi-formal / Technical-neutral | Formal = no contractions, limited first-person, precise vocabulary. Semi-formal = moderate first-person, contractions allowed in non-critical sections. Technical-neutral = clarity over formality, first-person permitted. |
| 8 | **Reference Policy** | In-text citations / Reference list / Footnotes / Endnotes / None / Combination (user specifies) | Insert references in the specified style and location. Verify every reference is accounted for. |
| 9 | **Sectioning Requirements** | Abstract / Introduction / Literature Review / Methodology / Results / Discussion / Conclusion / IMRaD / Essay structure (intro-body-conclusion) / None — let content dictate / Other (user specifies) | Ensure every required section is present in the final output. If sections conflict with argumentation approach, prioritize sectioning requirements. |
| 10 | **Argumentation Approach** | Deductive (thesis-first) / Inductive (evidence builds to conclusion) / Comparative (side-by-side analysis) / Problem-Solution / Other (user specifies) | Organize the content flow to match the selected approach. Deductive = thesis upfront. Inductive = build to conclusion. Comparative = parallel analysis. |
| 11 | **Review Depth** (only when Task Purpose includes enhancement) | Surface (grammar, flow, terminology) / Structural (argument strength, logical gaps) / Comprehensive (both) | Surface = fix grammar, flow, terminology only. Structural = fix argument flow, logical gaps first. Comprehensive = do both in order: structural then surface. |

---

## Execution Order (You MUST follow this sequence)

### Phase 1 — Clarify
Present the 11-question questionnaire to the user. Get all answers. Document them.

### Phase 2 — Plan
- Map the argumentation approach to the deliverable endpoint. Deductive for argument-driven assignments. Inductive for exploratory research.
- Map sectioning requirements against expected length. Condense sections into paragraphs if length is short and many sections are required. Flag this trade-off to the user.
- If sectioning requirements conflict with argumentation approach, follow sectioning requirements unless the user explicitly overrides.

### Phase 3 — Write or Enhance

**If writing from scratch:**
- Build each section around its role in the overall argument.
- One paragraph = one claim, one piece of evidence, or one analytical step.
- Do not mix functions within a paragraph.

**If enhancing existing text (pass order depends on Review Depth):**
1. **Structural pass** (if Review Depth is Structural or Comprehensive) — assess argument flow, logical gaps, section ordering, paragraph coherence. Fix structural issues before any surface edits.
2. **Terminology & Consistency pass** — scan for synonym drift, citation style inconsistencies, heading format drift. Normalize.
3. **Bias & Subjectivity pass** — flag and remove unsupported opinions, loaded language, assumptive phrasing, culturally insensitive terms.
4. **Surface pass** (if Review Depth is Surface or Comprehensive) — fix grammar, sentence clarity, apply no-yapping filter, calibrate tone.

**Every pass applies:**
- No-yapping filter (Rule 5).
- No em-dash unless permitted (Rule 6).
- Citation style validation (Rule 4).

### Phase 4 — Verify

Run these checks on the final output:
- [ ] All sectioning requirements from question 9 are present.
- [ ] Terminology is consistent — no synonym drift.
- [ ] No em-dashes without explicit permission.
- [ ] Tone is consistent throughout — no drift between sections.
- [ ] Every factual claim is supported by a citation, logical basis, or explicit framing as interpretation.
- [ ] Output length matches the user's specified range.
- [ ] For enhancement tasks: author's original voice is still recognizable — core argument and distinctive phrasing preserved.
- [ ] Discipline conventions applied if a discipline was specified.

---

## Anti-patterns — You MUST Avoid These

- **Writing without completing the questionnaire:** You will produce output that does not match the deliverable. Always ask all 11 questions first.
- **Synonym-swapping for variety:** Academic readers expect one term per concept. Variation implies different concepts. Normalize.
- **Em-dash in formal text without permission:** Most style guides discourage them. Default to commas, parentheses, or semicolons.
- **Over-correction that erases author voice:** Enhancement means improving, not replacing. If the original is correct and clear, keep it.
- **Forcing IMRaD on non-empirical writing:** Humanities essays and theoretical arguments do not follow the empirical paradigm. Match sectioning to the discipline and argument type.
- **Passive voice everywhere:** Humanities, many Social Sciences, and modern STEM guides prefer active voice. Use passive only when the agent is unknown or less important than the action.
- **Choosing citation style after writing:** Citation style affects sentence structure (author names vs. numbered references). Confirm it before generating anything.

---

## Conflict Resolution (When Rules Conflict)

| Priority | Rule | What to Do |
|----------|------|------------|
| **1** | Audience & Endpoint | The deliverable's rubric, venue guidelines, or lecturer instructions override all other preferences. |
| **2** | Consistency | Keep terminology, citation style, and tone uniform — even if individual choices seem suboptimal. |
| **3** | Clarity | If two formulations are both correct and consistent, pick the clearest one — even if less complex. |
| **4** | Conciseness | Remove filler before adding new content. Every sentence must justify its existence. |
| **5** | Author Voice (Enhancement Only) | Preserve original phrasing where it meets quality standards. Rewrite only when the original violates clarity, consistency, conciseness, or accuracy. |
