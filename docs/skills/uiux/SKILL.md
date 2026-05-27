# SKILL.md

## Metadata

- **Name:** UI/UX Design
- **Description:** User interface and user experience design principles for digital products — covering usability, accessibility, visual hierarchy, interaction patterns, and design-system thinking.

---

## When to Use

- **USE WHEN:** Designing or evaluating user-facing interfaces; making layout, navigation, visual, or interaction decisions that affect how a person perceives and operates the product.
- **DO NOT USE FOR:** Backend architecture decisions, API design, database schema design, or any purely machine-to-machine interaction.

---

## Constraints & Rules

- **Accessibility compliance level:** Consider the regulatory and user-impact threshold (e.g., WCAG 2.1 AA is a common minimum; Section 508 applies to US government; some regions have binding EN 301 549 standards). Non-compliance introduces legal risk and excludes users.
- **Device & input diversity:** Factor in the range of viewport sizes, input methods (touch, keyboard, mouse, screen reader, voice), and network conditions your audience actually uses. Designing for a single device class ignores real-world fragmentation.
- **Brand & design-system fidelity:** Evaluate how much deviation from existing brand guidelines or design tokens is tolerable. Unconstrained creativity destroys consistency; rigid adherence can prevent necessary evolution.
- **Cognitive load budget:** Users have finite attention and working memory. Consider complexity against task frequency — a feature used daily can afford deeper learning curve than one used monthly.
- **Feedback latency tolerance:** Users expect sub-100ms response for direct manipulation, sub-1s for task completion feedback, and loading indicators beyond that. Silent delays erode trust.

---

## Core Principles

- **Usability heuristics over aesthetics:** Visibility of system state, match between system and real world, user control and freedom, consistency, error prevention, recognition over recall, flexibility, minimalist design, help users recognize errors, help and documentation — prioritize these before visual polish.
- **Progressive disclosure:** Show the most common actions by default; reveal advanced options contextually. This reduces surface complexity without removing capability.
- **Fitts's Law factor:** The time to acquire a target is a function of distance and size. Frequently used interactive elements should be larger and closer to the user's current focus area.
- **Hick's Law factor:** Decision time increases logarithmically with the number of choices. When offering more than ~5–7 simultaneous options, consider categorization or step-wizard patterns.
- **Accessibility is not a feature layer:** Accessible design is a baseline property of the interaction model, not an audit-fix cycle at the end. Color contrast, keyboard navigation, and screen-reader semantics must be designed into the component model from the start.
- **Consistency reduces learning cost:** Users transfer expectations from one part of the UI to another. Inconsistencies in terminology, placement, behavior, or visual treatment force re-learning with zero user benefit.

---

## Workflow

- **Discovery phase — factors to consider:**
  - What is the user's goal and context of use? (casual browsing vs. high-stakes data entry? mobile walking vs. desktop focused?)
  - What existing mental models does the user bring from analogous tools?
  - What are the most frequent tasks vs. the most error-prone tasks?

- **Design phase — factors to consider:**
  - Does the navigation model match user expectations (top-down vs. lateral browsing, flat vs. hierarchical)?
  - How does the layout hierarchy guide attention? (size, color, spacing, typography weight)
  - What feedback does every interaction produce? (visual, haptic, audible — map each state: idle, hover, active, disabled, loading, error, success)
  - Are there adequate affordances? (a user should recognize interactable elements without trial-and-error)

- **Evaluation phase — factors to consider:**
  - Can every task be completed with keyboard-only navigation? With a screen reader?
  - What is the error rate for critical paths? Are errors recoverable without data loss?
  - Does the design pass contrast ratio thresholds for normal text (4.5:1) and large text (3:1), and maintained across all supported themes variations (e.g., Light, Dark, High Contrast, etc.)?

---

## Anti-patterns

- **Decorative-first design:** Prioritizing visual flair over clarity. Leads to discoverability failures, accessibility violations, and increased development cost. The overlooked factor: usability heuristics should precede visual design decisions.
- **Self-referential terminology:** Using internal jargon, technical labels, or clever metaphors users don't share. Increases cognitive load and support tickets. The overlooked factor: the interface should speak the user's language, not the developer's.
- **Over-engineered micro-interactions:** Animations and transitions that delay task completion or trigger motion sensitivity. The overlooked factor: every interaction has a latency budget — decorative motion consumes it with no user benefit.
- **Assuming one-size-fits-all accessibility:** Adding alt text and calling it accessible. True accessibility requires evaluating keyboard navigation, focus management, screen-reader semantics, color independence, motion reduction, and cognitive load — holistically, not checklist-style.
