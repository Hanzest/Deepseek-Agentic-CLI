import { describe, it, expect, beforeEach } from "vitest";
import { MarkdownRenderer, BOLD_START, BOLD_END } from "../../lib/markdownFormatter.js";

// Helper to strip ANSI codes for readability in test diffs
function stripAnsi(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// Box-drawing characters used in table output
const BOX = {
    h: "\u2500",
    v: "\u2502",
    tl: "\u250c",
    tm: "\u252c",
    tr: "\u2510",
    ml: "\u251c",
    mm: "\u253c",
    mr: "\u2524",
    bl: "\u2514",
    bm: "\u2534",
    br: "\u2518",
};

describe("MarkdownRenderer", () => {
    let renderer;

    beforeEach(() => {
        renderer = new MarkdownRenderer(80); // fixed terminal width for tests
    });

    // Helper that feeds input through process() and finishes with flush(),
    // simulating the end-of-stream behaviour in production (streamHandler.js).
    // Use this for any test that expects a fully rendered table.
    function renderFull(...inputs) {
        let output = "";
        for (const input of inputs) {
            output += renderer.process(input);
        }
        return output + renderer.flush();
    }

    // -----------------------------------------------------------------------
    // Bold formatting
    // -----------------------------------------------------------------------

    describe("bold formatting", () => {
        it("converts **bold** to ANSI bold codes", () => {
            const result = renderer.process("this is **bold** text\n");
            expect(result).toContain(BOLD_START);
            expect(result).toContain(BOLD_END);
            expect(stripAnsi(result)).toBe("this is bold text\n");
        });

        it("handles multiple bold sections on the same line", () => {
            const result = renderer.process("**first** and **second**\n");
            const stripped = stripAnsi(result);
            expect(stripped).toBe("first and second\n");
            // Count bold start/end pairs
            const starts = result.match(new RegExp(BOLD_START.replace("[", "\\[").replace("m", "m"), "g"));
            const ends = result.match(new RegExp(BOLD_END.replace("[", "\\[").replace("m", "m"), "g"));
            expect(starts).toHaveLength(2);
            expect(ends).toHaveLength(2);
        });

        it("handles bold at start of line", () => {
            const result = renderer.process("**start** here\n");
            expect(stripAnsi(result)).toBe("start here\n");
        });

        it("handles bold end of line", () => {
            const result = renderer.process("here **end**\n");
            expect(stripAnsi(result)).toBe("here end\n");
        });

        it("does not modify text without bold markers", () => {
            const result = renderer.process("plain text without bold\n");
            expect(result).toBe("plain text without bold\n");
        });

        it("handles empty strings", () => {
            const result = renderer.process("");
            expect(result).toBe("");
        });

        it("handles bold text in the middle of a longer sentence", () => {
            const result = renderer.process("The **quick brown** fox jumps over the **lazy** dog.\n");
            expect(stripAnsi(result)).toBe("The quick brown fox jumps over the lazy dog.\n");
        });
    });

    // -----------------------------------------------------------------------
    // Table rendering
    // -----------------------------------------------------------------------

    // -------------------------------------------------------------------
    // Helpers: extract column segment lengths from rendered table lines
    // -------------------------------------------------------------------

    /**
     * Compute the visible display width of a string, mirroring the logic
     * in MarkdownRenderer._charWidth() so that emoji, CJK, and zero-width
     * characters are counted correctly.
     *
     * - Surrogate pairs (emoji)  → width 2 per code point
     * - CJK characters           → width 2
     * - Emoji/icon characters    → width 2
     * - Zero-width chars         → width 0
     * - ASCII / others           → width 1
     */
    function displayWidth(str) {
        let width = 0;
        let i = 0;
        while (i < str.length) {
            const code = str.codePointAt(i);
            const isSurrogate = code > 0xFFFF;
            i += isSurrogate ? 2 : 1;

            // Zero-width
            if (
                code === 0xFE0F || code === 0xFE0E ||
                code === 0x200D || code === 0x200C ||
                (code >= 0x0300 && code <= 0x036F) ||
                (code >= 0xFE00 && code <= 0xFE0F) ||
                (code >= 0xFE20 && code <= 0xFE2F) ||
                (code >= 0xE0100 && code <= 0xE01EF) ||
                (code >= 0x20D0 && code <= 0x20FF)
            ) {
                continue;
            }

            // CJK width 2
            if (
                (code >= 0x1100 && code <= 0x11FF) ||
                (code >= 0x2E80 && code <= 0x9FFF) ||
                (code >= 0xA000 && code <= 0xA4CF) ||
                (code >= 0xAC00 && code <= 0xD7AF) ||
                (code >= 0xF900 && code <= 0xFAFF) ||
                (code >= 0xFE10 && code <= 0xFE1F) ||
                (code >= 0xFE30 && code <= 0xFE6F) ||
                (code >= 0xFF01 && code <= 0xFF60) ||
                (code >= 0xFFE0 && code <= 0xFFE6)
            ) {
                width += 2;
                continue;
            }

            // Emoji/icon width 2
            if (
                (code >= 0x2316 && code <= 0x23FF) ||
                (code >= 0x2460 && code <= 0x24FF) ||
                (code >= 0x25A0 && code <= 0x27BF) ||
                (code >= 0x2600 && code <= 0x26FF) ||
                (code >= 0x2934 && code <= 0x2935) ||
                (code >= 0x2B05 && code <= 0x2B55) ||
                (code >= 0x3030 && code <= 0x303D) ||
                (code >= 0x3297 && code <= 0x3299) ||
                (code >= 0x1F000 && code <= 0x1F9FF) ||
                (code >= 0x1FA00 && code <= 0x1FA6F) ||
                (code >= 0x1FA70 && code <= 0x1FAFF) ||
                (code >= 0x1FB00 && code <= 0x1FBFF)
            ) {
                width += 2;
                continue;
            }

            width += 1;
        }
        return width;
    }

    /**
     * Given a rendered data line (│ name │ value │), return an array of
     * segment visible-display-widths measured between the box-drawing
     * vertical bars.
     * E.g., "│  Alice  │  42  │" → [9, 6] (includes padding).
     */
    function getColumnSegmentLengths(line) {
        // Split on vertical bar (│) and trim leading empty segments
        const parts = line.split(BOX.v).filter(p => p !== undefined);
        // The first and last segments are outside the table (empty after split)
        // Internal segments are the cell contents
        const cells = [];
        for (let i = 1; i < parts.length - 1; i++) {
            cells.push(displayWidth(parts[i]));
        }
        return cells;
    }

    /**
     * Given a rendered border line (├────┼────┤), return an array of
     * segment lengths measured between the junction characters.
     */
    function getBorderSegmentLengths(line) {
        // Split on any box-drawing junction character (┬, ┼, ┴, ┤, ├, etc.)
        // We want the ── segments between them
        const segs = line.split(/[┬┼┴┤├┌┐└┘]/g).filter(s => s.length > 0);
        return segs.map(s => s.length);
    }

    describe("table rendering", () => {
        it("renders a simple 2-column table with box-drawing characters", () => {
            const input = "| Name | Value |\n| --- | --- |\n| Alice | 42 |\n| Bob | 17 |\n";
            const result = renderFull(input);

            // Should contain box-drawing characters
            expect(result).toContain(BOX.tl);
            expect(result).toContain(BOX.tr);
            expect(result).toContain(BOX.bl);
            expect(result).toContain(BOX.br);
            expect(result).toContain(BOX.v); // vertical separators
            expect(stripAnsi(result)).toContain("Name");
            expect(stripAnsi(result)).toContain("Value");
            expect(stripAnsi(result)).toContain("Alice");
            expect(stripAnsi(result)).toContain("Bob");
            expect(stripAnsi(result)).toContain("42");
            expect(stripAnsi(result)).toContain("17");
        });

        it("handles a single-row table", () => {
            const input = "| A | B |\n| --- | --- |\n| 1 | 2 |\n";
            const result = renderFull(input);
            expect(stripAnsi(result)).toContain("A");
            expect(stripAnsi(result)).toContain("B");
            expect(stripAnsi(result)).toContain("1");
            expect(stripAnsi(result)).toContain("2");
        });

        it("handles multi-column tables (4 columns)", () => {
            const input = "| W | X | Y | Z |\n| --- | --- | --- | --- |\n| 1 | 2 | 3 | 4 |\n";
            const result = renderFull(input);
            expect(stripAnsi(result)).toContain("W");
            expect(stripAnsi(result)).toContain("X");
            expect(stripAnsi(result)).toContain("Y");
            expect(stripAnsi(result)).toContain("Z");
        });

        it("wraps long cell content to fit terminal width", () => {
            // Use a narrow terminal width to force wrapping
            const narrow = new MarkdownRenderer(40);
            const longText = "A".repeat(50);
            const input = `| Short | Long |\n| --- | --- |\n| OK | ${longText} |\n`;
            const result = narrow.process(input) + narrow.flush();

            // The long text should be wrapped across multiple lines
            const stripped = stripAnsi(result);
            const lines = stripped.split("\n").filter(l => l.includes("│"));

            // There should be more than 1 data line (wrapping occurred)
            const dataLines = lines.filter(l => !l.includes("┌") && !l.includes("└") && !l.includes("├") && !l.includes("┴") && !l.includes("┬") && !l.includes("┼"));
            expect(dataLines.length).toBeGreaterThan(1);
        });

        it("handles text with spaces for word-wrapping", () => {
            const narrow = new MarkdownRenderer(40);
            const sentence = "This is a long sentence that should wrap to multiple lines in a narrow column";
            const input = `| Col |\n| --- |\n| ${sentence} |\n`;
            const result = narrow.process(input) + narrow.flush();

            const stripped = stripAnsi(result);
            const lines = stripped.split("\n").filter(l => l.includes("│") && !l.match(/^[┌├└┬┼┴]/));

            // Should have multiple lines for the wrapped content
            const dataLines = lines.filter(l => l.includes("│") && !l.includes("─"));
            expect(dataLines.length).toBeGreaterThan(1);
        });

        it("preserves normal text before and after a table", () => {
            const input = "Before table\n| A | B |\n| --- | --- |\n| 1 | 2 |\nAfter table\n";
            const result = renderer.process(input);

            expect(stripAnsi(result)).toContain("Before table");
            expect(stripAnsi(result)).toContain("After table");
        });

        it("handles leading newlines before a table", () => {
            const input = "\n| A | B |\n| --- | --- |\n| 1 | 2 |\n";
            const result = renderFull(input);
            expect(result).toContain(BOX.tl);
        });

        it("renders header row differently from data rows", () => {
            const input = "| Name | Value |\n| --- | --- |\n| Alice | 42 |\n";
            const result = renderFull(input);
            const stripped = stripAnsi(result);

            // Header should be the first row after top border
            const lines = stripped.split("\n");
            const headerLine = lines.findIndex(l => l.includes("Name"));
            expect(headerLine).toBeGreaterThanOrEqual(0);
            // The header row should appear after the top border
            expect(lines[0]).toContain("┌");
            expect(lines[1]).toContain("│");
            expect(lines[1]).toContain("Name");
        });

        // -------------------------------------------------------------------
        // Visual-structure tests (column width consistency, alignment)
        // -------------------------------------------------------------------

        it("has consistent column widths across all rows", () => {
            const input = "| Name | Value | Age |\n| --- | --- | --- |\n| Alice | 42 | 30 |\n| Bob | 17 | 25 |\n";
            const result = renderFull(input);
            const stripped = stripAnsi(result);
            const lines = stripped.split("\n");

            // Collect column segment lengths from all data+header rows
            const dataLines = lines.filter(l => l.startsWith(BOX.v));
            const colSegs = dataLines.map(l => getColumnSegmentLengths(l));

            // Every row should have the same number of columns
            const numCols = colSegs[0].length;
            for (const segs of colSegs) {
                expect(segs).toHaveLength(numCols);
            }

            // Each column's segment length must be identical across all rows
            for (let ci = 0; ci < numCols; ci++) {
                const lengths = colSegs.map(s => s[ci]);
                expect(new Set(lengths).size).toBe(1);
            }
        });

        it("aligns border segments with cell segments (same total line length)", () => {
            const input = "| Name | Value |\n| --- | --- |\n| Alice | 42 |\n";
            const result = renderFull(input);
            const lines = result.split("\n");

            // Every border line should have the same length as the
            // data line it's adjacent to
            for (let i = 0; i < lines.length - 1; i++) {
                const isBorder = /[┌├└┬┼┴┐┤┘]/.test(lines[i]);
                const nextIsData = lines[i + 1]?.includes(BOX.v);
                if (isBorder && nextIsData) {
                    expect(lines[i].length).toBe(lines[i + 1].length);
                }
            }
        });

        it("does not eat rows with all-empty (whitespace-only) cells", () => {
            // The row |   |   | has whitespace-only cells and should NOT
            // be treated as a separator
            const input = "| A | B |\n| --- | --- |\n|   |   |\n| 1 | 2 |\n";
            const result = renderFull(input);
            const stripped = stripAnsi(result);

            // Should contain the empty-cell row's data (just the vertical bars)
            const lines = stripped.split("\n").filter(l => l.includes(BOX.v));
            // With 3 data rows (header, empty, data) + 1 header = 4 vertical-bar lines
            // But the empty row... let's check we have at least 3 data lines
            // (header row + empty row + data row)
            expect(lines.length).toBeGreaterThanOrEqual(3);
        });

        it("separator-first table has no blank header row", () => {
            const input = "| --- | --- |\n| Data | 42 |\n";
            const result = renderFull(input);
            const stripped = stripAnsi(result);
            const lines = stripped.split("\n");

            // The first data line should directly follow the top border
            // (no empty header row in between)
            expect(lines[0]).toContain("┌");
            // Find the first │ line
            const firstDataIdx = lines.findIndex(l => l.includes(BOX.v));
            expect(firstDataIdx).toBe(1); // immediately after top border
            // And it should contain "Data", not be empty
            expect(lines[firstDataIdx]).toContain("Data");
        });

        it("handles a single-column table", () => {
            const input = "| Value |\n| --- |\n| Hello |\n| World |\n";
            const result = renderFull(input);
            const stripped = stripAnsi(result);

            expect(stripped).toContain("Value");
            expect(stripped).toContain("Hello");
            expect(stripped).toContain("World");
            // Should have proper box-drawing borders
            expect(result).toContain(BOX.tl);
            expect(result).toContain(BOX.bl);
            expect(result).toContain(BOX.v);
        });

        it("handles consecutive tables separated by blank lines", () => {
            const input = "| A | B |\n| --- | --- |\n| 1 | 2 |\n\n| C | D |\n| --- | --- |\n| 3 | 4 |\n";
            const result = renderFull(input);
            const stripped = stripAnsi(result);

            // Both tables should be present
            expect(stripped).toContain("A");
            expect(stripped).toContain("B");
            expect(stripped).toContain("1");
            expect(stripped).toContain("2");
            expect(stripped).toContain("C");
            expect(stripped).toContain("D");
            expect(stripped).toContain("3");
            expect(stripped).toContain("4");

            // Should have two sets of table borders (2 tops, 2 bottoms)
            const topBorders = (stripped.match(/┌/g) || []).length;
            const bottomBorders = (stripped.match(/└/g) || []).length;
            expect(topBorders).toBe(2);
            expect(bottomBorders).toBe(2);
        });

        it("renders a 6-column table with bold text and wraps a 70+ word cell", () => {
            // Construct a descriptive paragraph of ~80 words for the Description cell
            const longDesc =
                "The authentication service handles user login registration password " +
                "reset session management and multi-factor authentication across all " +
                "platform interfaces including web mobile and API endpoints It integrates " +
                "with OAuth providers such as Google GitHub and Microsoft for single " +
                "sign-on capabilities The service implements rate limiting brute force " +
                "detection and IP-based blocking to prevent unauthorized access attempts " +
                "All passwords are hashed using bcrypt with configurable cost factors and " +
                "session tokens use JWT with refresh token rotation for enhanced security " +
                "Audit logging captures all authentication events for compliance and " +
                "forensic analysis across the entire platform infrastructure";

            // Verify it's truly 70+ words
            const wordCount = longDesc.split(/\s+/).length;
            expect(wordCount).toBeGreaterThanOrEqual(70);

            // Use short words in narrow columns to avoid hard-split distraction;
            // the lengthy Description column is the primary wrapping target.
            const input = [
                "| **Module** | **Status** | Owner | **Priority** | Description | **Notes** |",
                "| --- | --- | --- | --- | --- | --- |",
                `| **Auth** | **Active** | Alice | **High** | ${longDesc} | **Critical** |`,
                "| Payment  | Done       | Bob   | Medium  | Handles Stripe and PayPal integrations | Stable |",
                "| NotifSvc | **Hold**   | Char  | Low     | SendGrid and Twilio connectors        | **Key pending** |",
            ].join("\n");

            const result = renderFull(input + "\n");
            const stripped = stripAnsi(result);

            // 1. Box-drawing characters are present
            expect(result).toContain(BOX.tl);
            expect(result).toContain(BOX.tr);
            expect(result).toContain(BOX.bl);
            expect(result).toContain(BOX.br);
            expect(result).toContain(BOX.v);

            // 2. All 6 column headers appear
            expect(stripped).toContain("Module");
            expect(stripped).toContain("Status");
            expect(stripped).toContain("Owner");
            expect(stripped).toContain("Priority");
            expect(stripped).toContain("Description");
            expect(stripped).toContain("Notes");

            // 3. Core data cell values appear (words short enough to fit column width)
            expect(stripped).toContain("Auth");
            expect(stripped).toContain("Active");
            expect(stripped).toContain("Alice");
            expect(stripped).toContain("High");
            expect(stripped).toContain("Payment");
            expect(stripped).toContain("Bob");
            expect(stripped).toContain("NotifSvc");
            expect(stripped).toContain("Hold");

            // 4. No raw markdown ** markers remain in output
            expect(stripped).not.toContain("**");

            // 5. ANSI bold codes are present (Module, Status, Auth, Active, Priority,
            //    Notes, High, Critical, Hold, Key pending = at least 8 bold spans)
            const boldStarts = result.match(/\x1b\[1m/g);
            expect(boldStarts).toBeDefined();
            expect(boldStarts.length).toBeGreaterThanOrEqual(8);

            // 6. The lengthy Description column forces wrapping — the first data row
            //    should span many visual lines (well more than 1)
            const lines = stripped.split("\n");
            const dataLines = lines.filter(l =>
                l.includes(BOX.v) &&
                !l.includes("┌") && !l.includes("└") &&
                !l.includes("├") && !l.includes("┴") &&
                !l.includes("┬") && !l.includes("┼")
            );
            // 3 data rows, but the first row has a 70+ word cell → ≥ 6 visual lines
            expect(dataLines.length).toBeGreaterThanOrEqual(6);

            // 7. Column widths are consistent across all visual rows
            const colSegs = dataLines.map(l => getColumnSegmentLengths(l));
            const numCols = colSegs[0].length;
            expect(numCols).toBe(6);
            for (let ci = 0; ci < numCols; ci++) {
                const lengths = colSegs.map(s => s[ci]);
                expect(new Set(lengths).size).toBe(1);
            }

            // 8. ANSI codes are properly paired — no orphaned bold start/end
            //    (each \x1b[1m must have a matching \x1b[22m at some point)
            const boldStartsArr = [...result.matchAll(/\x1b\[1m/g)];
            const boldEndsArr = [...result.matchAll(/\x1b\[22m/g)];
            expect(boldStartsArr.length).toBe(boldEndsArr.length);
        });

        it("renders a table with emoji and icon characters without border misalignment", () => {
            // Emoji/icon characters (🚀, ✅, ❌, ⚠, ⚡) are width-2 in terminals.
            // If _charWidth undercounts them as width-1, the column widths
            // would be miscalculated and borders would shift by 1 char per emoji.
            const input =
                "| **Feature** | **Status** | Notes |\n" +
                "| --- | --- | --- |\n" +
                "| 🚀 Deploy  | ✅ Done   | Auto-scaling enabled |\n" +
                "| ⚠ Test     | ❌ Failed | Memory leak detected |\n" +
                "| ⚡ Pipeline | ✅ Done   | All checks passed    |\n";

            const result = renderFull(input + "\n");
            const stripped = stripAnsi(result);
            const lines = stripped.split("\n");

            // 1. Box-drawing characters are present
            expect(result).toContain(BOX.tl);
            expect(result).toContain(BOX.tr);
            expect(result).toContain(BOX.bl);
            expect(result).toContain(BOX.br);
            expect(result).toContain(BOX.v);

            // 2. All content appears (emoji stripped from ANSI output still shows)
            expect(stripped).toContain("Deploy");
            expect(stripped).toContain("Done");
            expect(stripped).toContain("Failed");
            expect(stripped).toContain("Pipeline");

            // 3. Column widths are consistent across all rows (regression: the
            //    key check — border lines and data lines must have matching lengths)
            const dataLines = lines.filter(l =>
                l.includes(BOX.v) &&
                !l.includes("┌") && !l.includes("└") &&
                !l.includes("├") && !l.includes("┴") &&
                !l.includes("┬") && !l.includes("┼")
            );
            expect(dataLines.length).toBeGreaterThanOrEqual(3);

            const colSegs = dataLines.map(l => getColumnSegmentLengths(l));
            const numCols = colSegs[0].length;
            expect(numCols).toBe(3);
            for (let ci = 0; ci < numCols; ci++) {
                const lengths = colSegs.map(s => s[ci]);
                expect(new Set(lengths).size).toBe(1);
            }

            // 4. Every border line's display width matches its adjacent data line's display width.
            //    Use displayWidth() instead of .length because surrogate-pair emojis (🚀) inflate
            //    JS string length while box-drawing borders have only BMP chars.
            for (let i = 0; i < lines.length - 1; i++) {
                const isBorder = /[┌├└┬┼┴┐┤┘]/.test(lines[i]);
                const nextIsData = lines[i + 1]?.includes(BOX.v);
                if (isBorder && nextIsData) {
                    expect(displayWidth(lines[i])).toBe(displayWidth(lines[i + 1]));
                }
            }
        });

        it("renders a table with emoji cell content and wraps correctly in narrow terminal", () => {
            // Narrow terminal forces wrapping even with emoji characters
            const narrow = new MarkdownRenderer(30);
            const text = "This ✅ is a **long** description 🚀 that should wrap";
            const input =
                "| Icon | Description |\n" +
                "| --- | --- |\n" +
                `| 🚀 | ${text} |\n`;

            const result = narrow.process(input) + narrow.flush();
            const stripped = stripAnsi(result);

            expect(stripped).toContain("Icon");
            expect(stripped).toContain("Description");
            expect(stripped).toContain("🚀");

            // ANSI bold codes for **long** should be present
            expect(result).toContain(BOLD_START);
            expect(result).toContain(BOLD_END);

            // No raw markdown ** remaining
            expect(stripped).not.toContain("**");

            // Column widths consistent
            const lines = stripped.split("\n").filter(l => l.includes(BOX.v) && !l.includes("┌") && !l.includes("└") && !l.includes("├") && !l.includes("┴") && !l.includes("┬") && !l.includes("┼"));
            const colSegs = lines.map(l => getColumnSegmentLengths(l));
            for (let ci = 0; ci < colSegs[0].length; ci++) {
                const lengths = colSegs.map(s => s[ci]);
                expect(new Set(lengths).size).toBe(1);
            }
        });
    });

    // -----------------------------------------------------------------------
    // Streaming behavior
    // -----------------------------------------------------------------------

    describe("streaming behavior", () => {
        it("processes content in chunks (simulating streaming)", () => {
            // Simulate streaming where content arrives in small pieces
            const chunks = [
                "Here is some **bold** text.\n",
                "| Col A | Col B |\n",
                "| --- | --- |\n",
                "| Cell 1 | Cell 2 |\n",
                "| Cell 3 | Cell 4 |\n",
                "More text **after** the table.\n",
            ];

            let output = "";
            for (const chunk of chunks) {
                output += renderer.process(chunk);
            }
            output += renderer.flush();

            const stripped = stripAnsi(output);
            expect(stripped).toContain("Here is some bold text.");
            expect(stripped).toContain("Col A");
            expect(stripped).toContain("Col B");
            expect(stripped).toContain("Cell 1");
            expect(stripped).toContain("Cell 2");
            expect(stripped).toContain("Cell 3");
            expect(stripped).toContain("Cell 4");
            expect(stripped).toContain("More text after the table.");
            expect(output).toContain(BOX.tl);
            expect(output).toContain(BOX.br);
        });

        it("flushes remaining content at the end", () => {
            // When the table is complete but the stream has ended,
            // flush() should render the buffered table.
            renderer.process("| A | B |\n| --- | --- |\n| 1 | 2 |\n");
            const flushed = renderer.flush();
            const stripped = stripAnsi(flushed);
            expect(stripped).toContain("A");
            expect(stripped).toContain("B");
            expect(stripped).toContain("1");
            expect(stripped).toContain("2");
            expect(flushed).toContain(BOX.tl);
            expect(flushed).toContain(BOX.bl);
        });

        it("flushes trailing incomplete line", () => {
            renderer.process("incomplete line");
            const flushed = renderer.flush();
            expect(stripAnsi(flushed)).toBe("incomplete line");
        });

        it("can be reused after reset", () => {
            renderer.process("first **bold**\n");
            renderer.reset();

            const result = renderer.process("second **bold**\n");
            expect(stripAnsi(result)).toBe("second bold\n");
        });

        // -------------------------------------------------------------------
        // Regression tests for premature table flush bug
        // -------------------------------------------------------------------

        it("does NOT render header prematurely when separator arrives in later chunk", () => {
            // Bug scenario: header arrives in chunk 1, separator in chunk 2.
            // Without the fix, the header row would be rendered as a standalone
            // table, then the separator would start an empty table.
            const chunks = [
                "| Klobber | Grentis | Vorphax | Zandril | Morkleph | Snargen |\n",
                "| --- | --- | --- | --- | --- | --- |\n",
                "| short_A | short_B | short_C | short_D | short_E | short_F |\n",
            ];

            let output = "";
            for (const chunk of chunks) {
                output += renderer.process(chunk);
            }
            output += renderer.flush();

            const stripped = stripAnsi(output);

            // All headers should appear
            expect(stripped).toContain("Klobber");
            expect(stripped).toContain("Grentis");
            expect(stripped).toContain("Vorphax");
            expect(stripped).toContain("Zandril");
            expect(stripped).toContain("Morkleph");
            expect(stripped).toContain("Snargen");

            // Data should appear
            expect(stripped).toContain("short_A");
            expect(stripped).toContain("short_F");

            // Should be exactly ONE table (one top border, one bottom border)
            const topBorders = (stripped.match(/┌/g) || []).length;
            const bottomBorders = (stripped.match(/└/g) || []).length;
            expect(topBorders).toBe(1);
            expect(bottomBorders).toBe(1);

            // Column widths must be consistent across all rows
            const lines = stripped.split("\n").filter(l => l.includes(BOX.v));
            const colSegs = lines.map(l => getColumnSegmentLengths(l));
            const numCols = colSegs[0].length;
            expect(numCols).toBe(6);
            for (let ci = 0; ci < numCols; ci++) {
                const lengths = colSegs.map(s => s[ci]);
                expect(new Set(lengths).size).toBe(1);
            }
        });

        it("renders a complete table when header+separator arrive in the same chunk", () => {
            // This should work correctly both with and without the fix
            const chunks = [
                "| Name | Value | Age |\n| --- | --- | --- |\n",
                "| Alice | 42 | 30 |\n| Bob | 17 | 25 |\n",
            ];

            let output = "";
            for (const chunk of chunks) {
                output += renderer.process(chunk);
            }
            output += renderer.flush();

            const stripped = stripAnsi(output);
            expect(stripped).toContain("Name");
            expect(stripped).toContain("Value");
            expect(stripped).toContain("Age");
            expect(stripped).toContain("Alice");
            expect(stripped).toContain("Bob");
            expect(stripped).toContain("42");
            expect(stripped).toContain("17");

            // Exactly ONE table
            const topBorders = (stripped.match(/┌/g) || []).length;
            expect(topBorders).toBe(1);

            // Consistent column widths
            const lines = stripped.split("\n").filter(l => l.includes(BOX.v));
            const colSegs = lines.map(l => getColumnSegmentLengths(l));
            expect(colSegs.length).toBeGreaterThanOrEqual(3); // header + 2 data rows
            const numCols = colSegs[0].length;
            expect(numCols).toBe(3);
            for (let ci = 0; ci < numCols; ci++) {
                const lengths = colSegs.map(s => s[ci]);
                expect(new Set(lengths).size).toBe(1);
            }
        });

        it("flushes buffered table via flush() when stream ends without trailing newline", () => {
            // Table data that does NOT end with \n — flush() must render it
            renderer.process("| X | Y |\n| --- | --- |\n| A | B |");
            const flushed = renderer.flush();
            const stripped = stripAnsi(flushed);

            expect(stripped).toContain("X");
            expect(stripped).toContain("Y");
            expect(stripped).toContain("A");
            expect(stripped).toContain("B");
            expect(flushed).toContain(BOX.tl);
            expect(flushed).toContain(BOX.bl);

            // Consistent column widths
            const lines = stripped.split("\n").filter(l => l.includes(BOX.v));
            const colSegs = lines.map(l => getColumnSegmentLengths(l));
            for (let ci = 0; ci < colSegs[0].length; ci++) {
                const lengths = colSegs.map(s => s[ci]);
                expect(new Set(lengths).size).toBe(1);
            }
        });

        it("renders two consecutive tables separated by blank line correctly", () => {
            // Blank line between tables should end the first and start the second
            const chunks = [
                "| Table1 | Data |\n| --- | --- |\n| A | 1 |\n",
                "\n",
                "| Table2 | Data |\n| --- | --- |\n| B | 2 |\n",
            ];

            let output = "";
            for (const chunk of chunks) {
                output += renderer.process(chunk);
            }
            output += renderer.flush();

            const stripped = stripAnsi(output);
            expect(stripped).toContain("Table1");
            expect(stripped).toContain("Table2");
            expect(stripped).toContain("A");
            expect(stripped).toContain("B");

            // Exactly TWO tables (2 top borders)
            const topBorders = (stripped.match(/┌/g) || []).length;
            expect(topBorders).toBe(2);
        });
    });

    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------

    describe("edge cases", () => {
        it("handles malformed table (missing trailing pipe)", () => {
            const input = "| A | B\n| --- | ---\n| 1 | 2\n";
            // Should not crash, should produce reasonable output
            expect(() => renderer.process(input)).not.toThrow();
        });

        it("handles pipe character in regular text (not a table)", () => {
            const result = renderer.process("Use | as a pipe character\n");
            expect(result).toBe("Use | as a pipe character\n");
        });

        it("handlines empty lines between table rows", () => {
            const input = "| A | B |\n| --- | --- |\n| 1 | 2 |\n\n| C | D |\n| --- | --- |\n| 3 | 4 |\n";
            const result = renderFull(input);
            const stripped = stripAnsi(result);
            expect(stripped).toContain("A");
            expect(stripped).toContain("C");
            expect(stripped).toContain("1");
            expect(stripped).toContain("3");
        });

        it("handles empty cell content", () => {
            const input = "| A | B | C |\n| --- | --- | --- |\n| 1 | | 3 |\n";
            const result = renderFull(input);
            const stripped = stripAnsi(result);
            expect(stripped).toContain("A");
            expect(stripped).toContain("B");
            expect(stripped).toContain("C");
            expect(stripped).toContain("1");
            expect(stripped).toContain("3");
        });

        it("handles very long unbroken word in cell (hard-wrap)", () => {
            const narrow = new MarkdownRenderer(30);
            const longWord = "Supercalifragilisticexpialidocious";
            const input = `| Word |\n| --- |\n| ${longWord} |\n`;
            const result = narrow.process(input) + narrow.flush();
            const stripped = stripAnsi(result);
            // The word is hard-split across lines; verify it doesn't crash
            // and that parts of the word appear
            expect(stripped).toContain("Supercali");
            expect(stripped).toContain("docious");
        });

        it("handles content with both bold and tables", () => {
            const input = "**Header**\n| Name | **Value** |\n| --- | --- |\n| **Alice** | 42 |\n**Footer**\n";
            const result = renderer.process(input);
            const stripped = stripAnsi(result);
            expect(stripped).toContain("Header");
            expect(stripped).toContain("Name");
            expect(stripped).toContain("Value");
            expect(stripped).toContain("Alice");
            expect(stripped).toContain("Footer");
            expect(stripped).toContain("42");
            // Bold markers ** should NOT appear in the output
            expect(stripped).not.toContain("**");
            // ANSI bold codes SHOULD be present (at least 3 pairs: Header, Value, Alice)
            const boldStarts = result.match(/\x1b\[1m/g);
            expect(boldStarts).toBeDefined();
            expect(boldStarts.length).toBeGreaterThanOrEqual(3);
        });

        it("handles table without a header row (separator first)", () => {
            const input = "| --- | --- |\n| Data | 42 |\n| More | 17 |\n";
            const result = renderFull(input);
            const stripped = stripAnsi(result);
            // Should render as a proper table with box-drawing characters
            expect(result).toContain(BOX.tl);
            expect(result).toContain(BOX.bl);
            expect(result).toContain(BOX.v);
            // Should contain the data
            expect(stripped).toContain("Data");
            expect(stripped).toContain("42");
            expect(stripped).toContain("More");
            expect(stripped).toContain("17");
            // Should NOT contain raw separator markers
            expect(stripped).not.toContain("---");
            // Should NOT contain raw pipe characters (all should be box-drawing)
            const pipeCount = (stripped.match(/\|/g) || []).length;
            expect(pipeCount).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // String width (ANSI-aware)
    // -----------------------------------------------------------------------

    describe("_stringWidth", () => {
        it("measures plain text correctly", () => {
            expect(renderer._stringWidth("hello")).toBe(5);
        });

        it("measures empty string as zero", () => {
            expect(renderer._stringWidth("")).toBe(0);
        });

        it("ignores ANSI escape codes in width calculation", () => {
            const ansiText = `${BOLD_START}hello${BOLD_END}`;
            expect(renderer._stringWidth(ansiText)).toBe(5);
        });

        it("measures CJK characters as width 2", () => {
            expect(renderer._stringWidth("中文")).toBe(4);
        });

        it("measures mixed content correctly", () => {
            const mixed = `${BOLD_START}hello中文${BOLD_END}`;
            expect(renderer._stringWidth(mixed)).toBe(9); // 5 + 4
        });

        it("measures common emoji characters as width 2", () => {
            // 🚀 (rocket, U+1F680), ✅ (check mark, U+2705), ❌ (cross mark, U+274C)
            expect(renderer._stringWidth("🚀")).toBe(2);
            expect(renderer._stringWidth("✅")).toBe(2);
            expect(renderer._stringWidth("❌")).toBe(2);
            expect(renderer._stringWidth("✨")).toBe(2);
        });

        it("measures miscellaneous icon symbols as width 2", () => {
            // ⚠ (warning, U+26A0), ★ (star, U+2605), ♻ (recycle, U+267B)
            expect(renderer._stringWidth("⚠")).toBe(2);
            expect(renderer._stringWidth("★")).toBe(2);
            expect(renderer._stringWidth("♻")).toBe(2);
        });

        it("measures variation selector-16 (U+FE0F) as zero-width", () => {
            // U+FE0F is zero-width; U+2764 (❤) + U+FE0F = ❤️ (heart emoji style)
            const vs16 = String.fromCodePoint(0xFE0F);
            expect(renderer._stringWidth(vs16)).toBe(0);
            // The heart alone is width 1 (Dingbat range 0x2700-0x27BF includes ❤)
            expect(renderer._stringWidth("❤")).toBe(2);
            // heart + VS16 should still be 2 (VS16 contributes 0)
            expect(renderer._stringWidth("❤" + vs16)).toBe(2);
        });

        it("measures zero-width joiner (U+200D) as zero-width", () => {
            const zwj = String.fromCodePoint(0x200D);
            expect(renderer._stringWidth(zwj)).toBe(0);
        });

        it("measures text with emoji and regular text correctly", () => {
            // "Status: 🚀 Active" = 7 (Status:) + 1 (space) + 2 (🚀) + 1 (space) + 6 (Active)
            expect(renderer._stringWidth("Status: 🚀 Active")).toBe(17);
        });

        it("measures flag emoji (regional indicator pair approximation) as width 2 each", () => {
            // Each regional indicator letter is width 2 (approximation for the pair)
            // U+1F1FA (🇺) and U+1F1F8 (🇸) form the US flag
            expect(renderer._stringWidth("🇺")).toBe(2);
            expect(renderer._stringWidth("🇸")).toBe(2);
        });
    });
});
