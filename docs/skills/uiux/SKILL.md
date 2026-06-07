# SKILL.md

## Metadata

- **Name:** UI/UX Design
- **Description:** User interface and user experience design principles for digital products - covering usability, accessibility, visual hierarchy, interaction patterns, and design-system thinking.

---

## When to Use

- **USE WHEN:** Designing or evaluating user-facing interfaces; making layout, navigation, visual, or interaction decisions that affect how a person perceives and operates the product.
- **DO NOT USE FOR:** Backend architecture decisions, API design, database schema design, or any purely machine-to-machine interaction.

---

## Constraints & Rules

- **Accessibility compliance level:** Meet **WCAG 2.1 AA** as the minimum threshold. If targeting US government, Section 508 applies; EU regions have binding EN 301 549. **Measurable:** All text must achieve **4.5:1 contrast ratio** (normal text) / **3:1** (large text ≥18px bold or ≥24px regular). Non-compliance introduces legal risk and excludes ~15% of users.
- **Device & input diversity — measurable thresholds:**
  - Viewport: Layout must function without horizontal overflow at **320px–1920px** width.
  - Touch targets: Every interactive element must be **≥44×44px** (WCAG 2.5.8 / Apple HIG).
  - Keyboard: All interactive elements must be reachable via **Tab key** in logical DOM order.
  - Reduced motion: All animations must respect `prefers-reduced-motion` via `@media`.
- **Brand & design-system fidelity:** Evaluate how much deviation from existing brand guidelines or design tokens is tolerable. Unconstrained creativity destroys consistency; rigid adherence can prevent necessary evolution. **Measurable:** When brand color fails contrast thresholds (Priority 2 in Decision Framework), accessibility overrides brand fidelity.
- **Cognitive load budget — measurable rule:** A view must not present **more than 7 top-level navigation items** (Hick's Law). Forms should not exceed **10 inputs per step** without pagination or grouping. A feature used monthly must demand zero learning curve — rely on conventions users already know.
- **Feedback latency tolerance — measurable thresholds:**
  - Direct manipulation (click, keypress, drag): respond **<100ms** or user perceives lag.
  - Task completion feedback (form submit, save): respond **<1s** or show a loading indicator.
  - Operations >1s: show a **determinate progress bar** (not a spinner) so user can estimate wait.

---

## Core Principles

- **Usability heuristics over aesthetics:** Visibility of system state, match between system and real world, user control and freedom, consistency, error prevention, recognition over recall, flexibility, minimalist design, help users recognize errors, help and documentation - prioritize these before visual polish.
- **Progressive disclosure:** Show the most common actions by default; reveal advanced options contextually. This reduces surface complexity without removing capability.
- **Fitts's Law factor:** The time to acquire a target is a function of distance and size. Frequently used interactive elements should be larger and closer to the user's current focus area.
- **Hick's Law factor:** Decision time increases logarithmically with the number of choices. When offering more than ~5–7 simultaneous options, consider categorization or step-wizard patterns.
- **Accessibility is not a feature layer:** Accessible design is a baseline property of the interaction model, not an audit-fix cycle at the end. Color contrast, keyboard navigation, and screen-reader semantics must be designed into the component model from the start.
- **Consistency reduces learning cost:** Users transfer expectations from one part of the UI to another. Inconsistencies in terminology, placement, behavior, or visual treatment force re-learning with zero user benefit.

---

## Decision Framework (Conflict Resolution)

When principles conflict, apply this priority ladder — higher priority overrides lower:

| Priority | Principle | Rule | Example |
|----------|-----------|------|---------|
| **1** | **Functionality first** | A broken or non-functional interaction outweighs any aesthetic concern. | Don't hide a critical "Save" button behind a hover animation that doesn't work on touch. |
| **2** | **Accessibility compliance** | WCAG 2.1 AA pass criteria override visual preferences. | Brand color `#FFCC00` on white = 3.0:1 contrast. Priority 2 says: adjust the color or add background treatment to reach 4.5:1, regardless of brand guidelines. |
| **3** | **Error prevention & recovery** | Prevent data loss and enable undo before minimizing screen elements. | A confirmation dialog before destructive action takes priority over "keep the UI clean." |
| **4** | **Consistency** | Use existing UI patterns from the same product over inventing new ones. | If the product uses modals for confirmations, don't switch to a toast pattern for the same use case. |
| **5** | **Aesthetics** | Visual polish is applied only after priorities 1–4 are satisfied. | Shadows, gradients, animations are the last layer — never the first design decision. |

**How to use:** When two design considerations conflict (e.g., "this brand color looks good" vs. "this brand color fails contrast"), scan from priority 1 downward. The first matching rule that addresses the conflict wins.

---

## Workflow

- **Discovery phase - factors to consider:**
  - What is the user's goal and context of use? (casual browsing vs. high-stakes data entry? mobile walking vs. desktop focused?)
  - What existing mental models does the user bring from analogous tools?
  - What are the most frequent tasks vs. the most error-prone tasks?

- **Design phase - factors to consider:**
  - Does the navigation model match user expectations (top-down vs. lateral browsing, flat vs. hierarchical)?
  - How does the layout hierarchy guide attention? (size, color, spacing, typography weight)
  - What feedback does every interaction produce? (visual, haptic, audible — map each state: idle, hover, active, focus-visible, disabled, loading, error, success)
  - Are there adequate affordances? (a user should recognize interactable elements without trial-and-error)
  - Are there interactive components to attract the user's attention and improve their experience?
  - **Pattern-matching guide for component selection:**

    | If the user task involves... | Prefer this pattern | Principles applied |
    |----------------------------|-------------------|-------------------|
    | Selecting from **2–5 options** | Radio buttons or segmented control | Low decision time; all options visible at once |
    | Selecting from **5–7 options** | Dropdown with grouped categories | Reduces visual noise; satisfies Hick's Law |
    | Selecting from **7+ options** | Searchable multi-select, combobox, or step-wizard | Avoids overwhelming user; progressive disclosure |
    | Entering structured data | Form with per-field inline validation | Error prevention at point of entry |
    | Viewing hierarchical content | Accordion, tabs, or progressive disclosure | Fitts's Law — interaction target close to content |
    | Performing a single primary action | Large, high-contrast button above the fold | Fitts's Law + visual hierarchy |

- **Evaluation phase - factors to consider:**
  - Can every task be completed with keyboard-only navigation? With a screen reader?
  - What is the error rate for critical paths? Are errors recoverable without data loss?
  - Are there interactive components that distract from the primary task or cause unnecessary cognitive load?
  - Does the design pass contrast ratio thresholds for normal text (4.5:1) and large text (3:1), and maintained across all supported themes variations (e.g., Light, Dark, High Contrast, etc.)?

---

## Anti-patterns (Detection Criteria)

| Anti-Pattern | How to Detect in Your Output | Fix |
|-------------|------------------------------|-----|
| **Decorative-first design** | Non-interactive elements (decorative icons, spacers, illustrations) with `z-index`, `box-shadow`, `transform`, or `animation` that overlap, distract from, or visually compete with actionable content | Remove decoration on elements that are not primary CTAs. Apply `aria-hidden="true"` to decorative-only elements. |
| **Self-referential terminology** | Labels, button text, or messages containing camelCase words, developer jargon (`onClick`, `payload`, `state`, `props`, `mutation`, `query`), or internal project names users wouldn't know | Rewrite all user-facing strings as plain English nouns the target user would naturally say aloud. |
| **Over-engineered micro-interactions** | Any animation with `animation-duration` or `transition-duration` **>300ms** that is NOT a page-transition or loading indicator | Reduce to ≤200ms, or wrap in `@media (prefers-reduced-motion: no-preference)`. Decorative motion exceeding 300ms consumes the latency budget with no user benefit. |
| **One-size-fits-all accessibility** | Only alt-text is added, but: no `aria-label` on icon-only buttons, no focus-trap for modals, no `aria-live` for dynamic content, no keyboard event handlers for click-only interactions | Audit holistically: keyboard nav → focus management → screen-reader semantics → color independence → motion reduction → cognitive load. Each is independently required. |

---

## Self-Check Checklist (Run After Generating UI Code)

- [ ] All interactive elements have visible focus indicators (`:focus-visible` with ≥3px outline or equivalent)
- [ ] Touch/click targets are **≥44×44px** (buttons, links, inputs, icon-only controls)
- [ ] Layout works at **320px viewport width** without horizontal overflow or content cut-off
- [ ] No `aria-hidden="true"` on focusable elements
- [ ] Form inputs have associated `<label>` elements (placeholder-only labels are insufficient)
- [ ] Color is never the sole differentiator for status/state — add icons, text, or patterns
- [ ] Animations respect `prefers-reduced-motion` via `@media (prefers-reduced-motion: no-preference)`
- [ ] Navigation uses **fewer than 7 top-level items**, or items are logically grouped/categorized
- [ ] All interactive elements are reachable via **Tab key** in logical DOM order
- [ ] Error messages are descriptive and placed **adjacent to the input** that caused them
