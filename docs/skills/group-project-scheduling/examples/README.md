# Examples — Sample Group-Project Schedule Templates

These files are the user's real schedule templates. The skill reproduces their structure and
visual identity when generating new group-project schedules.

| File | Role | What it contributes |
|---|---|---|
| `KNKD_N10.xlsx` | **Visual + structural spec source** (Excel) | Sheet layout, column widths, merges, fonts, and the navy / dark-red / yellow palette used in headers and highlights. |
| `TDTK_Nhóm_7.xlsx` | **Visual + structural spec source** (Excel) | Second independent instance of the same visual conventions — confirms which colors/layouts are intentional vs. one-off. |
| `MIS_Nhóm_3_Tuần_.pdf` | **Structural spec source** (table) | The 9-column assignment table (`Nhiệm vụ | ID | Task cụ thể | PIC | Deadline | Tiến độ | Trạng thái | xem xét | Notes`), phase grouping (Giai đoạn 1/2/3), dependency notes ("Chọn phần này thì viết luôn phần ID X"), and deadline rules. |

**Authoritative extracted spec:** `template-spec.md` (in this folder) contains the exact hex
colors, fonts, merges, and column widths read from the Excel files, plus the PDF's table
conventions. When generating a schedule, apply `template-spec.md` — do not re-derive styling by
eyeballing these binaries.

> Note: the Excel files are binary; they are kept here for human reference and for the
> generator's golden-output checks, not for RAG indexing.
