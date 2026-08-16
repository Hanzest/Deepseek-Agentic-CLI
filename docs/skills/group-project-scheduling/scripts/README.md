# scripts/ — xlsx Generator for the Group-Project-Scheduling Skill

The imperative layer behind the skill. `SKILL.md` (docs) defines the domain rules;
this folder turns a schedule JSON into a styled `.xlsx` file.

## Setup (one-time)

```powershell
cd docs/skills/group-project-scheduling/scripts
npm install          # installs exceljs into ./node_modules (isolated; repo-root tree is untouched)
```

> The scripts package is intentionally **self-contained** — the repo root has an unrelated
> peer-dependency conflict (`tree-sitter-cpp` vs `tree-sitter`), so exceljs lives here only.

## Generate a schedule

```powershell
node generate-schedule.js <input.json> <output.xlsx> [--compute-deadlines]
```

- `<input.json>` — schedule per `schedule.schema.json` (see `example-input.json`).
- `--compute-deadlines` — derive missing deadlines from `final_deadline − today`:
  `usable = (final − today) × 0.8` (≈20% global buffer); each task's deadline =
  `today + (complexityWeight / maxWeight) × usable`, so **easy tasks end soon (short deadline) and
  heavy tasks end later (extended deadline)**, and nothing exceeds the final deadline.

### Example

```powershell
node generate-schedule.js example-input.json example-output.xlsx --compute-deadlines
```

## Styling contract

Rendered per `../examples/template-spec.md`:
- Title bar: dark red `FF980000`, light text, Google Sans 17 bold, merged across all columns.
- Header row: navy `FF073763`, white bold Google Sans 15.
- Task rows: `Nhiệm vụ` bold, `PIC` bold, `Deadline` red `FFFF0000` (explicit deadlines),
  `Trạng thái` from the allowed set, thin borders, wrapped text, centered.
- `highlight: true` → full yellow row `FFFFD966`; `milestone: true` → full red row `FFFF0000`
  with white bold text (final-submission rows).

## Lifecycle usage

1. **Generate** — build JSON conversationally, run the script, verify the output.
2. **Track** — edit the same JSON (`tiến độ`, `trạng thái`) and regenerate.
3. **Re-plan** — update `today` (or leave it as generation date), shift downstream tasks,
   mark slipped ones `Trễ hạn`, regenerate. Completed work is never overwritten.

## Notes

- Fonts: `Google Sans` (template default; Excel falls back if missing).
- `_inspect.js` is a developer utility to dump styling from a template workbook
  (`node _inspect.js some.xlsx`) — not required at runtime.
- `_verify.js` is a regression test: `node _verify.js` regenerates from `example-input.json`,
  reads the output back, and asserts the styling contract + deadline-anchoring rules
  (18 checks; exits non-zero on failure).
- `example-output.xlsx` is a generated demo of `example-input.json` (regenerate anytime).
