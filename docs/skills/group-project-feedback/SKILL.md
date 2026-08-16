# SKILL.md

## Metadata

- **Name:** Group-Project-Feedback
- **Description:** Generate inline review feedback on group project documents (reports, essays, assignments) that sounds authentically like the user — not AI-generated. Learns the user's feedback tone and vocabulary from sample comments in the examples/ folder. Every comment must cite the exact location (section, paragraph, or line) it refers to as proof.
- **Tags:** group-project, peer-review, feedback, inline-comments, document-review, tone-matching, citation-proof, academic-feedback
- **Version:** 1.0.0

---

## When to Use

- **USE WHEN:** You are asked to review, comment on, or give feedback on a group member's document deliverable (report, essay, assignment section, research draft). The deliverable is a written document, not code.
- **DO NOT USE FOR:** Code review (use code review tools), self-review of the user's own writing (use academic-writing-clarification skill), grading with numeric scores, creative writing critique.

---

## Core Principle — The Feedback Must Sound Like YOU, Not AI

> The entire purpose of this skill is to produce feedback that reads as if the user personally wrote every comment. The AI is invisible. If the output reads like a generic AI review, the skill has failed.

---

## Compliance Rules

### Rule 1 — You MUST study the user's feedback style BEFORE generating any comments.

1. Read ALL files in `docs/skills/group-project-feedback/examples/`.
2. Extract the user's:
   - **Vocabulary patterns** — words and phrases they repeat across comments.
   - **Sentence structure** — short vs. long, imperative vs. suggestive, question-style vs. statement-style.
   - **Criticism style** — how they phrase negative feedback (direct? softened? rhetorical question?).
   - **Praise style** — how they phrase positive feedback (brief acknowledgment? detailed compliment? or no praise at all?).
   - **Signature phrases** — any recurring expressions, filler words, or stylistic quirks unique to the user.
   - **Language register** — formality level, use of slang or colloquial Vietnamese.
3. If no example files exist, ask the user to provide 3–5 sample feedback comments before proceeding.
4. Do NOT generate feedback until style extraction is complete.

### Rule 2 — ALL feedback MUST be written in Vietnamese.

- Match the user's Vietnamese writing style from the examples.
- Do not mix in English unless the user's examples show a pattern of code-switching.
- Use Vietnamese academic terminology where appropriate.

### Rule 3 — Every comment MUST cite its exact location as proof.

Every feedback comment MUST include a location reference in this format:

```
[Mục X.X / Đoạn Y / Dòng Z] — <comment>
```

Examples:
- `[Mục 2.1 / Đoạn 3] — Lập luận ở đây chưa thuyết phục vì thiếu dẫn chứng cụ thể.`
- `[Mục 3 / Đoạn 1 / Dòng 5-8] — Câu này quá dài, nên tách thành 2 câu riêng.`
- `[Phần Kết luận / Đoạn 2] — Kết luận không phản ánh đúng nội dung đã phân tích ở Mục 2.`

If the document has no section numbers, use page numbers, paragraph counts from the top, or direct quotes as anchors:
- `[Trang 3 / Đoạn 2] — ...`
- `["Theo nghiên cứu của Nguyễn..."] — Nguồn trích dẫn này không có trong danh mục tài liệu tham khảo.`

### Rule 4 — Feedback MUST focus on these 3 dimensions (in priority order).

| Priority | Dimension | What to check |
|---|---|---|
| **1** | **Logical coherence & argument flow** | Does the argument make sense? Are claims supported? Is the reasoning chain complete? Are there logical gaps or contradictions between sections? |
| **2** | **Content accuracy & depth** | Are facts correct? Is the analysis deep enough or superficial? Are key aspects missing? Does the content match the stated objective? |
| **3** | **Citation & reference correctness** | Are all claims properly cited? Do in-text citations match the reference list? Are sources credible and recent enough? Any missing or phantom references? |

Do NOT focus on grammar, spelling, or formatting unless the user's example feedback shows they typically comment on those too.

### Rule 5 — Do NOT sound like a teacher, professor, or AI assistant.

- Do NOT use phrases like: "Em cần cải thiện...", "Bài viết cần được chỉnh sửa...", "Đề xuất: ...", "Nhận xét chung: ..."
- DO sound like a peer teammate giving honest, direct feedback.
- Match the user's natural phrasing from the examples — even if it's informal, blunt, or uses colloquial language.

### Rule 6 — Organize feedback as inline comments, NOT as a summary essay.

Output format:

```
## Nhận xét chi tiết

[Mục 1.2 / Đoạn 1] — <comment in user's voice>

[Mục 2.1 / Đoạn 3] — <comment in user's voice>

[Mục 2.3 / Đoạn 2 / Dòng 4-6] — <comment in user's voice>

...
```

- One comment per issue. Do not merge multiple issues into one paragraph.
- Order comments by document position (top to bottom), not by severity.
- At the end, optionally add a brief `## Tổng kết` (2–3 sentences max) summarizing the overall impression — but ONLY if the user's example feedback shows they typically write a summary.

### Rule 7 — Preserve the distinction between YOUR work and THEIR work.

- Never phrase feedback as if you wrote the document. You are reviewing someone else's contribution.
- If the task involves reviewing a specific group member's section, make it clear which section you are reviewing and who authored it (if known).

---

## Execution Order (You MUST follow this sequence)

### Phase 1 — Load Voice Profile
1. Read all files in `docs/skills/group-project-feedback/examples/`.
2. Extract the user's feedback vocabulary, sentence patterns, criticism/praise style, and signature phrases.
3. If no examples exist, stop and ask the user for sample comments.

### Phase 2 — Read the Document
1. Read the document to be reviewed (use `read_file_chunk` or `extract_content`).
2. Map the document structure: identify sections, headings, paragraphs, and page/line numbers.
3. Note which group member authored which section (if specified by the user).

### Phase 3 — Generate Inline Feedback
1. Walk through the document section by section, top to bottom.
2. For each issue found, write a comment in the user's voice with an exact location citation.
3. Focus on the 3 priority dimensions: logic → content → citations.
4. Cross-check: does each comment sound like something the user would actually write? If not, rephrase.

### Phase 4 — Verify
Run these checks on the final output:
- [ ] Every comment has a location citation (`[Mục X / Đoạn Y]` format).
- [ ] All feedback is in Vietnamese.
- [ ] No AI-sounding phrases (no "Đề xuất:", no "Nhận xét chung:", no teacher-tone).
- [ ] Feedback style matches the examples in `examples/` folder.
- [ ] Comments are ordered by document position (top to bottom).
- [ ] The 3 focus dimensions (logic, content, citations) are covered.

---

## Anti-patterns — You MUST Avoid These

- **Generic AI feedback tone:** "Bài viết cần được cải thiện ở phần..." — this sounds like an AI. Match the user's actual voice.
- **Feedback without location proof:** Every comment must have `[Mục/Đoạn/Dòng]`. No floating opinions.
- **Commenting on grammar/formatting when not asked:** Only comment on grammar if the user's examples show they do this.
- **Writing a summary essay instead of inline comments:** Output must be a list of located comments, not a report about the report.
- **Mixing English unnecessarily:** Feedback is in Vietnamese. English only if the user's examples show code-switching patterns.
- **Praising excessively to soften criticism:** Match the user's actual praise-to-criticism ratio from examples. If the user rarely praises, don't add fake praise.
- **Skipping the example study phase:** You MUST read examples first. No shortcuts.

---

## Examples Directory

Place your sample feedback files in:
```
docs/skills/group-project-feedback/examples/
```

Accepted formats: `.md`, `.txt`, `.docx`

Each file should contain real feedback you have previously given to group members. The more examples, the better the voice matching. Minimum recommended: 3 files.
