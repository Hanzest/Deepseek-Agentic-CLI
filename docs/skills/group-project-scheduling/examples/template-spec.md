# Template Specification — Group-Project Schedule (Extracted)

Authoritative spec extracted from the user's real templates in this folder. **Apply this spec
when generating a schedule** — never re-derive styling by eyeballing the binary files.

| Source | Role |
|---|---|
| `KNKD_N10.xlsx` (sheet `General`) | Visual identity: palette, fonts, merges, column widths |
| `TDTK_Nhóm_7.xlsx` (sheet `Task`) | Lifecycle/tracking: phase rows, status column, milestone rows |
| `MIS_Nhóm_3_Tuần_.pdf` | Table structure: 9 semantic columns, phases, dependency notes |

---

## 1. Color Palette (ARGB hex, read from files)

| Role | ARGB | RGB | Used for |
|---|---|---|---|
| **Navy (primary header)** | `FF073763` | `#073763` | Column-header row, phase header rows, section headers |
| **Dark red (title bar)** | `FF980000` | `#980000` | Document title bar / banner row |
| **Yellow highlight** | `FFFFD966` | `#FFD966` | Priority / voting / critical rows (full row) |
| **Red (deadline text)** | `FFFF0000` | `#FF0000` | Deadline cell text (urgent emphasis) |
| **Red (milestone row)** | `FFFF0000` | `#FF0000` | Milestone/deadline banner row (white bold text) |
| **Orange (secondary accent)** | `FFB45F06` | `#B45F06` | Secondary section headers (content sheets) |
| White (header text) | `FFFFFFFF` | `#FFFFFF` | Text on navy/dark-red/red fills |
| Body text | `FF1F1F1F` | `#1F1F1F` | Data cells |
| Title text on dark red | `FFF3F3F3` | `#F3F3F3` | Title-bar text |

### Phase-band fills (TDTK tracking style — for life-cycle rows)
| Fill | RGB | Usage |
|---|---|---|
| `FFFFF2CC` | `#FFF2CC` | Phase-1 band (week range + phase name cells) |
| `FFCFE2F3` | `#CFE2F3` | Phase-2 band |
| `FFD9D2E9` | `#D9D2E9` | Phase-3 band |
| `FFB7B7B7` | `#B7B7B7` | Sub-group rows (e.g., slide-prep tasks) |
| `FFF4CCCC` | `#F4CCCC` | Deadline cell with tight/meeting deadline |
| `FFD9EAD3` | `#D9EAD3` | Header band of tracking sheet |
| `FFF3F3F3` | `#F3F3F3` | PIC cell banding |

---

## 2. Fonts

| Context | Font | Size | Weight |
|---|---|---|---|
| Title bar | Google Sans | 17 | Bold |
| Column header | Google Sans | 15 | Bold |
| Body / data | Google Sans | 15 | Regular (bold for Role/PIC/Deadline) |
| Section header (content) | Google Sans | 19 | Bold |
| Tracking sheet (TDTK) | Calibri | 11 | Bold headers; regular body |
| Tracking body variant | Cambria | 11 | Some Task/Deadline/PIC cells |

> Google Sans is the template's font (exported from Google Sheets). Keep it as the font name;
> Excel falls back to a default if unavailable. `Calibri 11` is the safe alternative for
> tracking-style sheets.

---

## 3. Semantic Column Layout (merge of the 3 templates)

The generated schedule uses the **PDF's 9-column assignment table**, styled with the KNKD palette:

| # | Column (VN) | Content |
|---|---|---|
| 1 | `Nhiệm vụ` | Role / group label (bold, often merged vertically across sub-rows) |
| 2 | `ID` | Numeric task ID |
| 3 | `Task cụ thể` | Specific deliverable description (wraps, spans wide column) |
| 4 | `PIC` | Person-in-charge (bold) |
| 5 | `Deadline` | Vietnamese date-time string (see §5) |
| 6 | `Tiến độ` | Progress notes (lifecycle) |
| 7 | `Trạng thái` | Status: `Chưa bắt đầu` / `Đang thực hiện` / `Hoàn thành` / `Trễ hạn` |
| 8 | `xem xét` | Review/QA checkbox or note |
| 9 | `Notes` | Dependency notes, e.g., `Chọn phần này thì viết luôn phần ID 14` |

**KNKD column widths (source for task-table columns):** A=41.63, B=55.5, C=20.25, D=25.25,
E=47, F=32.5. For the 9-column layout, keep: Task cụ thể widest, Deadline ≈47, Notes ≈32.5,
Nhiệm vụ ≈41.6.

**Merge patterns to reproduce (from KNKD General):**
- Title bar merged across all columns (`A1:F1`).
- Task description merged across 2 columns (`B5:C5`).
- Vertical merges for repeated group/role, deadline, and note values (`A6:A12`, `E6:E12`, `F5:F12`).
- Yellow-highlight row merged full-width (`A13:D13` + `E13:F13`).
- Phase header rows merged across all columns (navy fill, white bold text).

---

## 4. Structure & Lifecycle Conventions

- **Phases** — rows grouped under a phase header (Giai đoạn 1/2/3…); phase header = merged row,
  navy fill, white bold text. Phase band cells (week range + phase name) reuse the phase-band
  fills when the tracking style is requested.
- **Milestone rows** — full red fill (`FFFF0000`), white bold text, for final-deadline /
  submission / report rows (see TDTK r38).
- **Status values** (Trạng thái): `Chưa bắt đầu`, `Đang thực hiện`, `Hoàn thành`, `Trễ hạn`
  (from TDTK `Đã hoàn thành`/`Chưa bắt đầu`; `Tiến độ` holds free-text progress notes).
- **Dependency notes** — PDF pattern: *"Chọn phần này thì viết luôn phần ID X"* (Notes column).
- **Deadline emphasis** — deadline text in red (`FFFF0000`) for dates the user flags as firm;
  yellow highlight for decision/vote windows.

---

## 5. Deadline String Format (Vietnamese)

Follow the templates' phrasing:
- `12h00 trưa 17/07/2026`
- `23h59 ngày 20/04/2026`
- `21h00 tối 19/07/2026`
- `2h45 ngày 29/04/2026` (early morning)

**Deadline anchoring rule (user requirement):** intermediate deadlines are derived from the
**final deadline** — compute `final_deadline − today` (date difference) as the total window, then
allocate each task a complexity-weighted slice (L1 easy = 1, L2 medium = 2, L3 heavy = 3,
normalized against the sum of weights), plus ~20% buffer. All intermediate deadlines lie strictly
between today and the final deadline; the final deadline is the hard outer bound. Easy → short
slice; heavy → extended slice; never unnecessarily urgent.

---

## 6. Generator Output Contract

`scripts/generate-schedule.js` must render, for a schedule JSON:
1. Row 1: title bar — dark red fill `FF980000`, light text `FFF3F3F3`, Google Sans 17 bold, merged across all columns.
2. Row 2 (optional): subtitle/instructions — Google Sans 14–15, wrap.
3. Header row: 9 column headers, navy fill `FF073763`, white bold Google Sans 15, center/middle, wrap.
4. For each phase: a phase header row merged across all columns (navy fill, white bold) followed by its task rows.
5. Task rows: `Nhiệm vụ` bold; `Task cụ thể` wrapped; `PIC` bold; `Deadline` bold, red text `FFFF0000`; `Trạng thái` from the allowed set; `Notes` wrap.
6. Yellow-highlight rows `FFFFD966` for tasks flagged `highlight: true`.
7. Milestone rows (fill `FFFF0000`, white bold text) for tasks flagged `milestone: true` (e.g., the final deadline).
8. Borders: thin on all data cells; column widths per §3; wrapText on all body cells; vertical center.
