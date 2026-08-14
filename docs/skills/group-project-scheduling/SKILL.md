# SKILL.md

## Metadata

- **Name:** Group-Project-Scheduling
- **Description:** Build Vietnamese group-project work schedules as styled Excel (.xlsx) files that faithfully reproduce the user's own template conventions (navy headers, dark-red title bar, yellow highlights — see `examples/template-spec.md`). Conversational intake of project facts → structured schedule JSON → generated .xlsx via `scripts/generate-schedule.js`. Supports the full lifecycle: initial generation, progress/status tracking, and re-planning when deadlines slip. Deadlines are always anchored to the user-provided final deadline: compute `final_deadline − today`, allocate each task a complexity-weighted slice (L1/L2/L3), add ~20% buffer, never make anything unnecessarily urgent.
- **Tags:** group-project, scheduling, work-plan, excel, xlsx, timeline, deadline, pic, task-assignment, lifecycle, re-planning
- **Version:** 1.0.0

---

## When to Use

- **USE WHEN:** The user needs a group-project work plan / assignment table (Bảng phân công), a task timeline with PIC + deadlines, a tracking sheet for progress (Tiến độ / Trạng thái), or a re-planning of an existing schedule when deadlines slip. Output must be a styled Excel file in the user's template style.
- **DO NOT USE FOR:** Individual personal task planning (no group/PIC dimension), code-repo task trackers (use issue trackers), generic meeting minutes, or schedule generation where the user explicitly wants a plain/unstyled table in chat only.

---

## Constraints & Rules

### Rule 1 — Visual fidelity to the user's templates is mandatory
- Follow `examples/template-spec.md` exactly: navy `FF073763` header fills, dark-red `FF980000` title bar, yellow `FFFFD966` highlight rows, red `FFFF0000` deadline text, Google Sans fonts, merge patterns, column widths.
- Never invent colors, fonts, or layouts. The spec was extracted from the user's real templates — treat it as the only source of truth.

### Rule 2 — All schedule content MUST be in Vietnamese
- Headers, task descriptions, notes, and statuses in Vietnamese (e.g., `Nhiệm vụ`, `Task cụ thể`, `PIC`, `Deadline`, `Tiến độ`, `Trạng thái`, `xem xét`, `Notes`).
- Deadline strings follow template phrasing: `12h00 trưa 17/07/2026`, `23h59 ngày 20/04/2026`, `21h00 tối 19/07/2026`.

### Rule 3 — Deadlines are anchored to the final deadline, never invented
- The user provides the **final deadline**; the agent computes the total window as
  `final_deadline − today` (date difference) and derives every intermediate deadline from it.
- Complexity weights: **L1 (easy) = 1, L2 (medium) = 2, L3 (heavy) = 3**. Each task's deadline =
  `today + (weight ÷ maxWeight) × (window × 0.8)` — so **easy tasks get short deadlines (sooner)
  and heavy tasks get extended deadlines (later)**, with a **~20% buffer** kept before the final
  deadline.
- Easy tasks get short deadlines; heavy tasks get extended deadlines. **No deadline is
  unnecessarily urgent**; all lie strictly between today and the final deadline, which is the hard
  outer bound.
- User-explicit deadlines override computed ones, but still must not exceed the final deadline.

### Rule 4 — The schedule JSON is the source of truth; .xlsx is a rendering
- Always persist the schedule JSON (per `scripts/schedule.schema.json`) alongside the generated
  `.xlsx` so tracking and re-planning operate on the same structure.

### Rule 5 — Tracking uses the allowed status set
- `Trạng thái` ∈ { `Chưa bắt đầu`, `Đang thực hiện`, `Hoàn thành`, `Trễ hạn` }; `Tiến độ` holds free-text progress notes. Statuses reflect template convention.

---

## Core Principles

- **The output must look like the user's own sheet.** Visual identity (palette, merges, fonts) is
  part of the deliverable, not decoration.
- **Deadlines are derived, not guessed.** Complexity and the remaining window decide the date; the
  final deadline bounds everything.
- **Never urgent.** If a computed deadline lands closer than ~48h for a non-trivial task, re-allocate
  window instead of forcing it.
- **Incremental tracking, safe re-planning.** Finished work is never overwritten; re-planning shifts
  only future tasks, recomputed from the new "today".

---

## Workflow (factors to consider at each stage)

### Phase 1 — Intake (conversational)
Gather, in chat: course/subject, group members (PIC names), the **final deadline**, phase structure,
deliverables (chapters/sections/artifacts), task dependencies, and any user-specified assignments.
Ask for missing pieces before generating — do not guess member names or the final deadline.

### Phase 2 — Structure
Decompose into phases → tasks; assign sequential IDs; map each task to the 9 columns
(`Nhiệm vụ | ID | Task cụ thể | PIC | Deadline | Tiến độ | Trạng thái | xem xét | Notes`); record
dependencies in Notes (template pattern: *"Chọn phần này thì viết luôn phần ID X"*).

### Phase 3 — Calibrate deadlines
Compute `final_deadline − today`; assign complexity L1/L2/L3 per task; weight-normalize slices
across the window; apply ~20% buffer; clamp everything inside the window. Consider phase boundaries
so heavy phases get more room.

### Phase 4 — Balance
Present the user's stated PIC assignments as-is. When one member's load is clearly skewed, offer a
balancing suggestion as an optional step — never silently reassign.

### Phase 5 — Generate & verify
Build the JSON per the schema, run `node scripts/generate-schedule.js <input.json> <output.xlsx>`,
and verify the file renders (exit 0, opens, colors/merges match the spec).

### Phase 6 — Track
On later sessions, update `Tiến độ` / `Trạng thái` for completed tasks and regenerate. The JSON
preserves history; the .xlsx is refreshed.

### Phase 7 — Re-plan on slip
When a deadline is missed: recompute the window from the new "today", shift downstream tasks,
preserve completed rows, and flag the slipped task as `Trễ hạn` before re-generating.

---

## Anti-patterns

- **Inventing the palette** — using generic blue/red instead of the spec hexes; the sheet stops
  looking like the user's. Overlooked: visual fidelity is a hard requirement.
- **Gut-feel deadlines** — assigning dates with no anchor to the final deadline. Overlooked:
  the final deadline bounds all work.
- **Urgent easy tasks / tight heavy tasks** — giving an L1 task a 3-day window while an L3 chapter
  gets 1 day. Overlooked: complexity proportionality.
- **Deadlines beyond the final date** — scheduling past the hard outer bound. Overlooked: the
  final deadline is non-negotiable.
- **English output** — mixing English into a Vietnamese sheet. Overlooked: template convention.
- **Silent reassignment** — moving PIC without asking. Overlooked: group trust.
- **Regenerating from scratch on re-plan** — losing completed progress. Overlooked: incremental
  tracking.
- **Skipping verification** — shipping a .xlsx that fails to open. Overlooked: the generator
  contract in the spec.

---

## Decision Framework (deadline conflicts)

When deadline constraints collide, resolve in this priority order:
1. **User-explicit deadline** (unless it exceeds the final deadline → then flag it).
2. **Final deadline as hard outer bound** — never exceeded.
3. **Complexity proportionality** — L3 gets more window than L1.
4. **~20% buffer** — applied after proportional allocation.
5. **No urgency** — if the result is < ~48h for a non-trivial task, re-allocate window from
   downstream tasks instead.

---

## Self-Check Checklist

- [ ] 9 columns in the exact spec order (`Nhiệm vụ | ID | Task cụ thể | PIC | Deadline | Tiến độ | Trạng thái | xem xét | Notes`).
- [ ] Palette hexes match `template-spec.md` (navy `FF073763`, dark red `FF980000`, yellow `FFFFD966`).
- [ ] Every intermediate deadline lies strictly between today and `final_deadline`.
- [ ] Every L3 task's window ≥ every L1 task's window; ~20% buffer applied.
- [ ] No deadline inside the final 48h before the final deadline unless the user demands it.
- [ ] All content Vietnamese; deadline strings in template phrasing.
- [ ] Schedule JSON persisted per schema; statuses from the allowed set.
- [ ] `generate-schedule.js` exited 0 and the .xlsx opens (read-back check).

---

## Related Skills

- See also: **Group-Project-Feedback** for reviewing members' document deliverables.
- See also: **Academic-Writing-Clarification** for report-section scoping used when splitting chapters into tasks.
