// ---------------------------------------------------------------------------
// Streaming Markdown-to-Terminal Renderer
//
// Converts plain markdown content from the agent's output into terminal-
// formatted text using ANSI escape codes and Unicode box-drawing characters.
//
// Features:
//   - Inline **bold** → ANSI bold (\x1b[1m...\x1b[22m)
//   - Markdown table blocks (|...|) → rendered with box-drawing chars
//   - Automatic text wrapping in table cells (terminal-width-aware)
//   - Streaming-friendly: line-buffered state machine
//
// Usage (streaming):
//   const r = new MarkdownRenderer();
//   for (const chunk of stream) {
//     const out = r.process(chunk);
//     if (out) process.stdout.write(out);
//   }
//   process.stdout.write(r.flush());
// ---------------------------------------------------------------------------

import { C } from "./colors.js";

// Unicode box-drawing characters
const BOX = {
    h: "\u2500",       // ─ horizontal
    v: "\u2502",       // │ vertical
    tl: "\u250c",      // ┌ top-left
    tm: "\u252c",      // ┬ top-mid
    tr: "\u2510",      // ┐ top-right
    ml: "\u251c",      // ├ left-mid
    mm: "\u253c",      // ┼ centre-mid
    mr: "\u2524",      // ┤ right-mid
    bl: "\u2514",      // └ bottom-left
    bm: "\u2534",      // ┴ bottom-mid
    br: "\u2518",      // ┘ bottom-right
};

const BOLD_START = "\x1b[1m";
const BOLD_END = "\x1b[22m";
const RESET = "\x1b[0m";

// Matches a markdown table data row: | cell | cell | ... |
const TABLE_ROW_RE = /^\|.*\|$/;
// Matches a separator row: | --- | :--- | ---: |:---:| etc.
const TABLE_SEP_RE = /^\|[\s:.-]+\|/;

// Regex to match inline **bold** markers
// Uses a negative lookbehind to avoid matching ** that is part of a
// larger pattern, and a non-greedy match for the content.
const BOLD_RE = /\*\*(.+?)\*\*/g;

// Regex for inline `code` spans
const INLINE_CODE_RE = /`([^`]+)`/g;

// Regex for markdown headings: # to ######
const HEADING_RE = /^(#{1,6})\s+(.+)$/;

// Regex for fenced code block delimiters (optional language tag)
const FENCE_RE = /^```(\w*)\s*$/;

// ANSI formatting codes for headings, inline code, and code blocks
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const WHITE = "\x1b[37m";
const DIM = "\x1b[2;37m";
const BRIGHT_WHITE = "\x1b[1;97m";
const ITALIC_START = "\x1b[3m";
const ITALIC_END = "\x1b[23m";

export class MarkdownRenderer {
    /**
     * @param {number} [termWidth] - Override terminal width (for testing).
     *   Defaults to process.stdout.columns || 80.
     */
    constructor(termWidth) {
        this._buffer = "";               // incomplete trailing line
        this._tableBuffer = [];          // lines of the current table block
        this._inTable = false;
        this._boldOpen = false;          // tracks cross-line bold spans
        this._termWidth = termWidth ?? process.stdout.columns ?? 80;
        this._minColWidth = 3;           // minimum column width (padding only)
        this._tablePadding = 1;          // spaces inside each cell (left + right)
        this._lastLineWasTableRow = false; // tracks if the most recently processed line was a table row

        // ── Code block state ──────────────────────────────────────────────
        this._inCodeBlock = false;          // currently inside a ``` block
        this._codeBlockBuffer = [];         // lines of the current code block
        this._codeBlockLang = "";           // language tag after opening ```
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Process a streaming chunk of markdown content.
     * Returns a string to write to stdout, or an empty string if buffering.
     * May buffer table lines internally and emit them when the table ends.
     *
     * @param {string} chunk - A partial or complete piece of markdown content.
     * @returns {string} Formatted text to write to stdout.
     */
    process(chunk) {
        if (!chunk) return "";

        // Pre-process: handle bold that might span across chunks
        // If the previous chunk ended with an unclosed **, the next chunk
        // might start with the rest of the bold text.
        chunk = this._handleCrossChunkBold(chunk);

        this._buffer += chunk;
        const lines = this._buffer.split("\n");
        // Last element is the incomplete trailing line
        this._buffer = lines.pop();

        const outputs = [];
        for (const line of lines) {
            const result = this._processLine(line);
            if (result !== null) {
                outputs.push(result);
            }
        }

        // If we're inside a table and the buffer is empty (from a trailing
        // newline), flush the table — BUT only if the last processed line was
        // NOT a table row. If the last line was a table row, we're still
        // collecting rows (the next chunk may bring more). This prevents
        // premature table rendering when headers and separators arrive in
        // separate streaming chunks (the root cause of inconsistent column
        // widths and phantom empty-row tables).
        if (this._inTable && this._buffer === "" && !this._lastLineWasTableRow) {
            const result = this._processLine(this._buffer);
            if (result !== null) {
                outputs.push(result);
            }
        }

        return outputs.join("");
    }

    /**
     * Flush any remaining buffered content (table block or trailing line).
     * Must be called once after the stream ends.
     *
     * @returns {string} Remaining formatted output.
     */
    flush() {
        let output = "";

        // Flush any buffered code block (stream ended without closing fence)
        if (this._inCodeBlock && this._codeBlockBuffer.length > 0) {
            output += this._renderCodeBlock(this._codeBlockBuffer, this._codeBlockLang);
            this._inCodeBlock = false;
            this._codeBlockBuffer = [];
            this._codeBlockLang = "";
        }

        if (this._inTable && this._tableBuffer.length > 0) {
            output += this._renderTable(this._tableBuffer);
            this._inTable = false;
            this._tableBuffer = [];
        }

        if (this._buffer) {
            output += (output && !output.endsWith("\n") ? "\n" : "") +
                this._formatInline(this._buffer);
            this._buffer = "";
        }

        return output;
    }

    /**
     * Reset the renderer state completely (for re-use).
     */
    reset() {
        this._buffer = "";
        this._tableBuffer = [];
        this._inTable = false;
        this._boldOpen = false;
        this._inCodeBlock = false;
        this._codeBlockBuffer = [];
        this._codeBlockLang = "";
    }

    // -----------------------------------------------------------------------
    // Internal: Line processing
    // -----------------------------------------------------------------------

    /**
     * Process a single complete line (no trailing newline).
     * Returns the formatted string, or null if the line is buffered.
     */
    _processLine(line) {
        const trimmed = line.trim();

        // ── Code block mode ────────────────────────────────────────────────
        if (this._inCodeBlock) {
            // Check for closing fence
            if (FENCE_RE.test(trimmed)) {
                this._inCodeBlock = false;
                const output = this._renderCodeBlock(this._codeBlockBuffer, this._codeBlockLang);
                this._codeBlockBuffer = [];
                this._codeBlockLang = "";
                return output;
            }
            // Still inside code block — buffer the line (keep original spacing)
            this._codeBlockBuffer.push(line);
            return null;
        }

        // ── Opening fence check ────────────────────────────────────────────
        if (FENCE_RE.test(trimmed)) {
            const match = trimmed.match(FENCE_RE);
            this._inCodeBlock = true;
            this._codeBlockBuffer = [];
            this._codeBlockLang = match ? match[1] : "";
            return null;
        }

        // ── Heading check ─────────────────────────────────────────────────
        const headingMatch = trimmed.match(HEADING_RE);
        if (headingMatch) {
            const level = headingMatch[1].length; // number of # characters
            const headingText = headingMatch[2];
            this._lastLineWasTableRow = false;
            return this._renderHeading(headingText, level, line);
        }

        // ── Table detection (existing logic) ───────────────────────────────
        if (TABLE_ROW_RE.test(trimmed)) {
            this._lastLineWasTableRow = true;
            // Skip separator rows (| --- | --- |)
            if (TABLE_SEP_RE.test(trimmed)) {
                // Guard: require at least one real separator character
                // (-, :, or .) — otherwise it's a data row with empty
                // cells (|   |   |) that just happens to match via \s.
                if (!/[.:-]/.test(trimmed)) {
                    // Whitespace-only cells — treat as a normal data row,
                    // not a separator. Fall through below.
                } else if (this._inTable) {
                    // Still in table, just skip the separator
                    return null;
                } else {
                    // Separator without a preceding header row — start a new
                    // table with an auto-generated empty header, then skip
                    // the separator. The empty header is later suppressed
                    // by _renderTable.
                    this._inTable = true;
                    this._tableBuffer = [];
                    const numCols = this._parseRow(trimmed).length;
                    const emptyHeader = "| " + Array(numCols).fill("").join(" | ") + " |";
                    this._tableBuffer.push(emptyHeader);
                    return null;
                }
            }

            // It's a data row
            if (!this._inTable) {
                this._inTable = true;
                this._tableBuffer = [];
            }
            this._tableBuffer.push(line);
            return null;
        }

        // Not a table row
        this._lastLineWasTableRow = false;
        if (this._inTable) {
            // Table just ended — render it
            this._inTable = false;
            const tableOutput = this._renderTable(this._tableBuffer);
            this._tableBuffer = [];

            // If the line is empty, just output the table
            if (!line) {
                return tableOutput + "\n";
            }

            // Otherwise, output table + the current line
            return tableOutput + "\n" + this._formatInline(line) + "\n";
        }

        // Normal (non-table) line
        return this._formatInline(line) + "\n";
    }

    // -----------------------------------------------------------------------
    // Internal: Inline formatting (bold)
    // -----------------------------------------------------------------------

    /**
     * Stateless bold conversion: replace **text** with ANSI bold codes.
     * No cross-line state tracking — safe for independent text segments
     * such as individual table cells.
     *
     * @param {string} text
     * @returns {string}
     */
    _applyBold(text) {
        return text.replace(BOLD_RE, (_, boldText) => {
            return BOLD_START + boldText + BOLD_END;
        });
    }

    /**
     * Replace inline `code` spans with cyan ANSI color codes.
     * Similar structure to _applyBold — no cross-line state needed.
     *
     * @param {string} text
     * @returns {string}
     */
    _applyInlineCode(text) {
        return text.replace(INLINE_CODE_RE, (_, codeText) => {
            return CYAN + codeText + RESET;
        });
    }

    /**
     * Apply inline markdown formatting to a single line of text.
     * Currently handles **bold** only. Tracks cross-line bold spans
     * via the _boldOpen state flag.
     */
    _formatInline(text) {
        // Handle bold that started on a previous line
        if (this._boldOpen) {
            const idx = text.indexOf("**");
            if (idx !== -1) {
                // Close bold
                const before = text.slice(0, idx);
                const after = text.slice(idx + 2);
                this._boldOpen = false;
                return BOLD_END + before + this._formatInline(after);
            }
            // No closing **, entire text is bold
            return text;
        }

        // Apply bold formatting first, then inline code (cyan) on top
        let result = this._applyBold(text);
        result = this._applyInlineCode(result);

        // Check for unclosed ** at end
        const lastBoldStart = result.lastIndexOf(BOLD_START);
        const lastBoldEnd = result.lastIndexOf(BOLD_END);
        if (lastBoldStart > lastBoldEnd) {
            this._boldOpen = true;
            return result.slice(0, lastBoldStart) + "**";
        }

        return result;
    }

    /**
     * Handle the case where **bold** text spans across two chunks.
     * E.g., chunk1 ends with "**hel", chunk2 starts with "lo**".
     * This is a best-effort heuristic.
     */
    _handleCrossChunkBold(chunk) {
        if (!this._boldOpen) return chunk;

        // We're in the middle of bold text from a previous chunk.
        // The chunk might start with text and contain the closing **.
        const idx = chunk.indexOf("**");
        if (idx !== -1) {
            // Close bold before the matched **
            const boldContent = chunk.slice(0, idx);
            const rest = chunk.slice(idx + 2);
            this._boldOpen = false;
            return BOLD_END + boldContent + rest;
        }

        // Entire chunk is still bold — no closing ** found
        return chunk;
    }

    // -----------------------------------------------------------------------
    // Internal: Heading rendering
    // -----------------------------------------------------------------------

    /**
     * Render a markdown heading line with level-based styling.
     *
     * H1: bright white bold banner with full-width ─ lines above & below
     * H2: bright white bold with underline (─ line below)
     * H3: cyan bold
     * H4: dim bold
     * H5: dim
     * H6: dim italic
     *
     * @param {string} line - The heading text (without # prefix)
     * @param {number} level - Heading level (1-6)
     * @param {string} rawLine - The original raw line (for spacing preservation)
     * @returns {string} Formatted heading string.
     */
    _renderHeading(line, level, rawLine) {
        const headingText = line.trim();

        // Build a full-width horizontal line using dim ─ characters
        const fullWidthLine = this._dimFullLine();

        switch (level) {
            case 1:
                // Banner: blank line + dim line + heading + dim line + blank line
                return "\n" + fullWidthLine + "\n" +
                    BRIGHT_WHITE + BOLD_START + headingText + RESET + "\n" +
                    fullWidthLine + "\n";

            case 2:
                // Underline: heading + dim line below
                return BRIGHT_WHITE + BOLD_START + headingText + RESET + "\n" +
                    fullWidthLine + "\n";

            case 3:
                return CYAN + BOLD_START + headingText + RESET + "\n";

            case 4:
                return YELLOW + BOLD_START + headingText + RESET + "\n";

            case 5:
                return WHITE + headingText + RESET + "\n";

            case 6:
                return WHITE + ITALIC_START + headingText + ITALIC_END + RESET + "\n";

            default:
                return headingText + "\n";
        }
    }

    /**
     * Generate a full-width dim horizontal line using ─ characters,
     * with 2-character padding on each side to avoid terminal wrapping issues.
     *
     * @returns {string} e.g., "\x1b[90m──────────────────────────────────────\x1b[0m"
     */
    _dimFullLine() {
        // Leave 2-char padding on each side so the line doesn't touch screen edges
        const lineLen = Math.max(1, this._termWidth - 4);
        return DIM + BOX.h.repeat(lineLen) + RESET;
    }

    // -----------------------------------------------------------------------
    // Internal: Fenced code block rendering
    // -----------------------------------------------------------------------

    _highlightCodeLine(line, lang) {
    if (!lang) return DIM + line + RESET;
    const lowerLang = lang.toLowerCase();

    // JS/TS/JSON
    if (lowerLang === "javascript" || lowerLang === "js" || lowerLang === "typescript" || lowerLang === "ts" || lowerLang === "json") {
        let comment = "";
        let code = line;

        const commentIdx = line.indexOf("//");
        if (commentIdx !== -1) {
            const before = line.substring(0, commentIdx);
            const quoteCount1 = (before.match(/"/g) || []).length;
            const quoteCount2 = (before.match(/'/g) || []).length;
            if (quoteCount1 % 2 === 0 && quoteCount2 % 2 === 0) {
                code = line.substring(0, commentIdx);
                comment = "\x1b[90m" + line.substring(commentIdx) + RESET;
            }
        }

        let highlighted = code
            .replace(/\b(\d+)\b/g, "\x1b[33m$1\x1b[2;37m")
            .replace(/(["'`])(.*?)\1/g, "\x1b[32m$1$2$1\x1b[2;37m")
            .replace(/\b(const|let|var|function|return|if|else|for|while|switch|case|break|export|import|from|class|extends|new|typeof|try|catch|finally|throw|async|await)\b/g, "\x1b[36m$1\x1b[2;37m")
            .replace(/\b(true|false|null|undefined)\b/g, "\x1b[35m$1\x1b[2;37m");

        return DIM + highlighted + RESET + comment;
    }

    // Python
    if (lowerLang === "python" || lowerLang === "py") {
        let comment = "";
        let code = line;
        const commentIdx = line.indexOf("#");
        if (commentIdx !== -1) {
            const before = line.substring(0, commentIdx);
            const quoteCount1 = (before.match(/"/g) || []).length;
            const quoteCount2 = (before.match(/'/g) || []).length;
            if (quoteCount1 % 2 === 0 && quoteCount2 % 2 === 0) {
                code = line.substring(0, commentIdx);
                comment = "\x1b[90m" + line.substring(commentIdx) + RESET;
            }
        }

        let highlighted = code
            .replace(/\b(\d+)\b/g, "\x1b[33m$1\x1b[2;37m")
            .replace(/(["'])(.*?)\1/g, "\x1b[32m$1$2$1\x1b[2;37m")
            .replace(/\b(def|class|return|if|elif|else|for|while|in|import|from|as|try|except|finally|raise|assert|with|lambda|pass|break|continue|global|nonlocal|and|or|not|is)\b/g, "\x1b[36m$1\x1b[2;37m")
            .replace(/\b(True|False|None)\b/g, "\x1b[35m$1\x1b[2;37m");

        return DIM + highlighted + RESET + comment;
    }

    // HTML/XML
    if (lowerLang === "html" || lowerLang === "xml") {
        let highlighted = line
            .replace(/(["'])(.*?)\1/g, "\x1b[32m$1$2$1\x1b[2;37m")
            .replace(/(<\/?[a-zA-Z0-9:-]+)/g, "\x1b[36m$1\x1b[2;37m")
            .replace(/(\/?>)/g, "\x1b[36m$1\x1b[2;37m");

        return DIM + highlighted + RESET;
    }

    // Bash/Shell
    if (lowerLang === "bash" || lowerLang === "sh") {
        let comment = "";
        let code = line;
        const commentIdx = line.indexOf("#");
        if (commentIdx !== -1) {
            const before = line.substring(0, commentIdx);
            const quoteCount1 = (before.match(/"/g) || []).length;
            const quoteCount2 = (before.match(/'/g) || []).length;
            if (quoteCount1 % 2 === 0 && quoteCount2 % 2 === 0) {
                code = line.substring(0, commentIdx);
                comment = "\x1b[90m" + line.substring(commentIdx) + RESET;
            }
        }

        let highlighted = code
            .replace(/(["'])(.*?)\1/g, "\x1b[32m$1$2$1\x1b[2;37m")
            .replace(/\b(echo|cd|ls|git|npm|npx|node|if|then|else|fi|for|in|do|done|exit|sudo|mkdir|rm|cp|mv)\b/g, "\x1b[36m$1\x1b[2;37m");

        return DIM + highlighted + RESET + comment;
    }

    return DIM + line + RESET;
}

    /**
     * Render a fenced code block with dim horizontal separators and dim text.
     *
     * @param {string[]} lines - Code content lines (between ``` fences)
     * @param {string} lang - Optional language tag from the opening fence
     * @returns {string} Formatted code block string.
     */
    _renderCodeBlock(lines, lang) {
        const fullWidthLine = this._dimFullLine();

        // Colorize the code content lines (if any)
        let content;
        if (lines.length === 0) {
            content = ""; // empty code block — just separators
        } else {
            content = lines.map(l => {
                const trimmed = l.trimEnd();
                return this._highlightCodeLine(trimmed, lang);
            }).join("\n") + "\n";
        }

        // Blank line padding + top separator + dim content + bottom separator + blank line
        return "\n" + fullWidthLine + "\n" + content + fullWidthLine + "\n";
    }

    // -----------------------------------------------------------------------
    // Internal: Table rendering
    // -----------------------------------------------------------------------

    /**
     * Render a set of markdown table data rows as a formatted terminal table.
     *
     * @param {string[]} rows - Array of markdown table rows (| a | b | c |)
     * @returns {string} Formatted table string with box-drawing characters.
     */
    _renderTable(rows) {
        if (rows.length === 0) return "";

        // 1. Parse all rows into cells
        const parsedRows = rows.map(row => this._parseRow(row));

        // 1a. Strip leading empty rows (e.g., auto-generated empty header
        // from separator-first tables).
        while (parsedRows.length > 1 && parsedRows[0].every(c => !c.trim())) {
            parsedRows.shift();
        }
        if (parsedRows.length === 0) return "";

        // 2. Determine number of columns (use max across rows)
        const numCols = Math.max(...parsedRows.map(r => r.length), 1);

        // Normalise all rows to the same column count
        for (const row of parsedRows) {
            while (row.length < numCols) row.push("");
        }

        // 2b. Apply bold formatting to cell content.
        // Must happen before width calculation so _stringWidth sees ANSI codes
        // (which it strips) rather than raw ** markers (which inflate width).
        for (const row of parsedRows) {
            for (let ci = 0; ci < row.length; ci++) {
                row[ci] = this._applyBold(row[ci]);
                row[ci] = this._applyInlineCode(row[ci]);
            }
        }

        // 3. Calculate column widths
        const colWidths = this._calcColumnWidths(parsedRows, numCols);

        // 4. Word-wrap cells and build wrapped rows
        const wrappedRows = parsedRows.map(row =>
            row.map((cell, ci) => this._wordWrap(cell, colWidths[ci]))
        );

        // 5. Render the table
        return this._buildTable(wrappedRows, colWidths, numCols);
    }

    /**
     * Split a markdown table row into individual cells.
     * Handles leading/trailing pipes and trims whitespace.
     *
     * @param {string} row - e.g., "| a | b | c |"
     * @returns {string[]}
     */
    _parseRow(row) {
        const trimmed = row.trim();
        // Remove leading and trailing pipe if present
        const inner = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
        const end = inner.endsWith("|") ? inner.slice(0, -1) : inner;

        // Split by pipe, trim each cell
        return end.split("|").map(cell => cell.trim());
    }

    /**
     * Calculate the display width of each column based on content and
     * available terminal width.
     */
    _calcColumnWidths(parsedRows, numCols) {
        // Calculate max content width per column (without padding)
        const maxContentWidths = Array(numCols).fill(0);
        for (const row of parsedRows) {
            for (let ci = 0; ci < numCols; ci++) {
                const cellWidth = this._stringWidth(row[ci] || "");
                if (cellWidth > maxContentWidths[ci]) {
                    maxContentWidths[ci] = cellWidth;
                }
            }
        }

        // Total padding per column: _tablePadding on each side = _tablePadding * 2
        // Plus 1 for the box-drawing vertical separator between columns
        // Total overhead per column = _tablePadding * 2 + 1
        const colOverhead = this._tablePadding * 2 + 1; // spaces + separator
        const totalOverhead = colOverhead * numCols + 1; // +1 for left border

        const availableWidth = this._termWidth - totalOverhead;

        // If content fits comfortably, use natural widths
        const totalContentWidth = maxContentWidths.reduce((a, b) => a + b, 0);

        if (totalContentWidth <= availableWidth) {
            return maxContentWidths.map(w =>
                Math.max(w, this._minColWidth)
            );
        }

        // Content is wider than terminal — distribute proportionally
        const distributed = Array(numCols).fill(0);
        let remaining = availableWidth;

        // First pass: give each column at least minColWidth
        for (let ci = 0; ci < numCols; ci++) {
            distributed[ci] = Math.min(
                maxContentWidths[ci],
                Math.max(this._minColWidth, Math.floor(availableWidth / numCols))
            );
            remaining -= distributed[ci];
        }

        // Second pass: distribute remaining width proportionally
        if (remaining > 0) {
            const sortedByNeed = Array.from({ length: numCols }, (_, i) => i)
                .sort((a, b) => maxContentWidths[b] - maxContentWidths[a]);

            for (const ci of sortedByNeed) {
                const extra = maxContentWidths[ci] - distributed[ci];
                if (extra > 0 && remaining > 0) {
                    const give = Math.min(extra, remaining);
                    distributed[ci] += give;
                    remaining -= give;
                }
            }
        }

        return distributed.map(w => Math.max(w, this._minColWidth));
    }

    /**
     * Word-wrap text to a given width.
     * Splits on spaces to avoid breaking words mid-word.
     *
     * @param {string} text
     * @param {number} width
     * @returns {string[]} Array of wrapped lines.
     */
    _charWidth(char) {
        const code = char.codePointAt(0);

        // ── Zero-width characters ─────────────────────────────────────────
        // Variation selectors, combining diacritical marks, ZWJ/ZWNJ.
        if (
            code === 0xFE0F ||                      // Variation Selector-16 (emoji presentation)
            code === 0xFE0E ||                      // Variation Selector-15 (text presentation)
            code === 0x200D ||                      // Zero-Width Joiner (ZWJ)
            code === 0x200C ||                      // Zero-Width Non-Joiner
            (code >= 0x0300 && code <= 0x036F) ||  // Combining Diacritical Marks
            (code >= 0x0483 && code <= 0x0489) ||  // Cyrillic combining marks
            (code >= 0x0591 && code <= 0x05BD) ||  // Hebrew combining marks
            (code >= 0x0610 && code <= 0x061A) ||  // Arabic combining marks
            (code >= 0x064B && code <= 0x065F) ||  // Arabic combining marks
            (code >= 0x0670 && code <= 0x06D6) ||  // Arabic combining marks
            (code >= 0x0E31 && code <= 0x0E3A) ||  // Thai combining marks
            (code >= 0x0E47 && code <= 0x0E4E) ||  // Thai combining marks
            (code >= 0x0EB1 && code <= 0x0EB9) ||  // Lao combining marks
            (code >= 0x0EBB && code <= 0x0EBC) ||  // Lao combining marks
            (code >= 0x0EC8 && code <= 0x0ECD) ||  // Lao combining marks
            (code >= 0x1AB0 && code <= 0x1AFF) ||  // Combining Diacritical Marks Extended
            (code >= 0x1DC0 && code <= 0x1DFF) ||  // Combining Diacritical Marks Supplement
            (code >= 0x20D0 && code <= 0x20FF) ||  // Combining Diacritical Marks for Symbols
            // NOTE: 0x2600-0x26FF is correctly handled as width 2 below.
            // The old range (0x2605-0x2622) was a copy-paste error causing ★⚠♻
            // to be classified as zero-width. Removed.
            (code >= 0x2CEF && code <= 0x2CF1) ||  // Coptic combining marks
            (code >= 0x2DE0 && code <= 0x2DFF) ||  // Cyrillic Extended-A combining
            (code >= 0xA66F && code <= 0xA672) ||  // Cyrillic combining marks
            (code >= 0xA67C && code <= 0xA67D) ||  // Cyrillic combining marks
            (code >= 0xA802 && code <= 0xA806) ||  // Devanagari combining
            (code >= 0xA80B && code <= 0xA823) ||  // Devanagari combining
            (code >= 0xA825 && code <= 0xA826) ||  // Devanagari combining
            (code >= 0xA82C && code <= 0xA8C4) ||  // Devanagari combining
            (code >= 0xFE00 && code <= 0xFE0F) ||  // Variation Selectors (full range)
            (code >= 0xFE20 && code <= 0xFE2F) ||  // Combining Half Marks
            (code >= 0xE0100 && code <= 0xE01EF)    // Variation Selectors Supplement
        ) {
            return 0;
        }

        // ── CJK characters (width 2) ──────────────────────────────────────
        if (
            (code >= 0x1100 && code <= 0x11FF) ||   // Hangul Jamo
            (code >= 0x2E80 && code <= 0x9FFF) ||   // CJK Radicals + CJK Unified
            (code >= 0xA000 && code <= 0xA4CF) ||   // Yi
            (code >= 0xAC00 && code <= 0xD7AF) ||   // Hangul Syllables
            (code >= 0xF900 && code <= 0xFAFF) ||   // CJK Compatibility Ideographs
            (code >= 0xFE10 && code <= 0xFE1F) ||   // Vertical Forms
            (code >= 0xFE30 && code <= 0xFE6F) ||   // CJK Compatibility Forms
            (code >= 0xFF01 && code <= 0xFF60) ||   // Fullwidth Forms
            (code >= 0xFFE0 && code <= 0xFFE6)      // Fullwidth Signs
        ) {
            return 2;
        }

        // ── Emoji & icon characters (width 2 in modern terminals) ─────────
        if (
            (code >= 0x2316 && code <= 0x23FF) ||   // Miscellaneous Technical (⌚, ⌨, ⏏, ⏳)
            (code >= 0x2460 && code <= 0x24FF) ||   // Enclosed Alphanumerics (Ⓜ, ⓟ)
            (code >= 0x25A0 && code <= 0x27BF) ||   // Geometric Shapes + Dingbats (◆, ✈, ➡, ✓, ✨)

            (code >= 0x2600 && code <= 0x26A0) ||   // Misc Symbols Part 1 (☀, ☁, ⚡, ⚠)
            (code >= 0x26A1 && code <= 0x26FF) ||   // Misc Symbols Part 2 (♻, ♥)
            
            (code >= 0x2934 && code <= 0x2935) ||   // Arrows (⤴, ⤵)
            (code >= 0x2B05 && code <= 0x2B55) ||   // Arrows + Misc (⬅, ⬆, ⬇, ⭕, ⭐, ⬛)
            (code >= 0x3030 && code <= 0x303D) ||   // CJK Symbols (〰, 〽)
            (code >= 0x3297 && code <= 0x3299) ||   // Enclosed CJK (㊗, ㊙)
            (code >= 0x1F000 && code <= 0x1F9FF) || // Mahjong + Domino + Enclosed Alphanum +
                                                    //   Emoticons + Ornamental + Transport +
                                                    //   Alchemical + Geometric Shapes Extended +
                                                    //   Suppl. Symbols & Pictographs +
                                                    //   Emoticons + Emoji Extended
            (code >= 0x1FA00 && code <= 0x1FA6F) || // Chess Symbols
            (code >= 0x1FA70 && code <= 0x1FAFF) || // Symbols and Pictographs Extended-A
            (code >= 0x1FB00 && code <= 0x1FBFF)    // Symbols for Legacy Computing
        ) {
            return 2;
        }

        return 1;
    }

    /**
     * Slice a string by visible display width, skipping ANSI escape codes.
     * Stops at (but does not exceed) maxWidth visible characters.
     */
    _ansiAwareSlice(text, maxWidth) {
        if (maxWidth <= 0) return "";
        if (this._stringWidth(text) <= maxWidth) return text;

        const ansiRe = /\x1b\[[0-9;]*m/g;
        let result = "";
        let visibleWidth = 0;
        let lastIndex = 0;
        let match;

        ansiRe.lastIndex = 0;

        while ((match = ansiRe.exec(text)) !== null) {
            const before = text.slice(lastIndex, match.index);
            for (const char of before) {
                if (visibleWidth >= maxWidth) break;
                const charWidth = this._charWidth(char);
                if (visibleWidth + charWidth > maxWidth) break;
                result += char;
                visibleWidth += charWidth;
            }
            if (visibleWidth >= maxWidth) break;

            result += match[0];
            lastIndex = ansiRe.lastIndex;
        }

        if (visibleWidth < maxWidth) {
            const remaining = text.slice(lastIndex);
            for (const char of remaining) {
                if (visibleWidth >= maxWidth) break;
                const charWidth = this._charWidth(char);
                if (visibleWidth + charWidth > maxWidth) break;
                result += char;
                visibleWidth += charWidth;
            }
        }

        return result;
    }

    _wordWrap(text, width) {
        if (!text || width <= 0) return [""];

        // Handle text shorter than width
        if (this._stringWidth(text) <= width) return [text];

        const words = text.split(" ");
        const lines = [];
        let currentLine = "";

        for (const word of words) {
            const spaceNeeded = currentLine ? 1 : 0;
            if (this._stringWidth(currentLine) + spaceNeeded + this._stringWidth(word) <= width) {
                currentLine = currentLine ? currentLine + " " + word : word;
            } else {
                if (currentLine) {
                    lines.push(currentLine);
                }
                // If the word itself is wider than the column, hard-split it
                if (this._stringWidth(word) > width) {
                    // Hard-split the long word (ANSI-aware to avoid corrupting bold codes)
                    let remaining = word;
                    while (this._stringWidth(remaining) > width) {
                        const slice = this._ansiAwareSlice(remaining, width);
                        lines.push(slice);
                        remaining = remaining.slice(slice.length);
                    }
                    currentLine = remaining;
                } else {
                    currentLine = word;
                }
            }
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines.length > 0 ? lines : [""];
    }

    /**
     * Build the full table string with box-drawing characters.
     *
     * @param {string[][][]} wrappedRows - Each row is an array of cell-lines arrays
     * @param {number[]} colWidths - Display width of each column
     * @param {number} numCols - Number of columns
     * @returns {string}
     */
    _buildTable(wrappedRows, colWidths, numCols) {
        const lines = [];

        // Calculate the maximum number of sub-lines per row (for wrapped cells)
        const rowHeights = wrappedRows.map(row =>
            Math.max(...row.map(cell => cell.length), 1)
        );

        // Top border
        lines.push(this._borderLine("top", colWidths, numCols));

        for (let ri = 0; ri < wrappedRows.length; ri++) {
            const row = wrappedRows[ri];
            const height = rowHeights[ri];

            // Data rows (possibly multi-line due to wrapping)
            for (let li = 0; li < height; li++) {
                const cells = row.map((cell, ci) => {
                    const cellText = cell[li] || "";
                    return this._padCell(cellText, colWidths[ci]);
                });
                lines.push(BOX.v + cells.join(BOX.v) + BOX.v);
            }

            // Separator between rows (but not after the last row)
            if (ri < wrappedRows.length - 1) {
                lines.push(this._borderLine("mid", colWidths, numCols));
            }
        }

        // Bottom border
        lines.push(this._borderLine("bottom", colWidths, numCols));

        return lines.join("\n");
    }

    /**
     * Create a horizontal border line.
     *
     * @param {"top"|"mid"|"bottom"} type
     * @param {number[]} colWidths
     * @param {number} numCols
     * @returns {string}
     */
    _borderLine(type, colWidths, numCols) {
        const horiz = (len) => BOX.h.repeat(len + this._tablePadding * 2);

        let left, join, right;

        switch (type) {
            case "top":
                left = BOX.tl;
                join = BOX.tm;
                right = BOX.tr;
                break;
            case "mid":
                left = BOX.ml;
                join = BOX.mm;
                right = BOX.mr;
                break;
            case "bottom":
                left = BOX.bl;
                join = BOX.bm;
                right = BOX.br;
                break;
        }

        const segments = colWidths.map(w => horiz(w));
        return left + segments.join(join) + right;
    }

    /**
     * Pad a cell's text to the specified width with spaces.
     * Uses ANSI-aware padding (doesn't count escape codes as visible chars).
     *
     * @param {string} text
     * @param {number} width
     * @returns {string}
     */
    _padCell(text, width) {
        const visibleLen = this._stringWidth(text);
        const pad = Math.max(0, width - visibleLen);
        const leftPad = " ".repeat(this._tablePadding);
        const rightPad = " ".repeat(this._tablePadding + pad);
        return leftPad + text + rightPad;
    }

    /**
     * Calculate the visible width of a string, ignoring ANSI escape codes.
     *
     * @param {string} str
     * @returns {number}
     */
    _stringWidth(str) {
        // Remove ANSI escape codes before measuring
        const clean = str.replace(/\x1b\[[0-9;]*m/g, "");
        // Count visible characters using _charWidth (DRY)
        let width = 0;
        for (const char of clean) {
            width += this._charWidth(char);
        }
        return width;
    }
}

// Re-export colors for convenience
export { BOLD_START, BOLD_END, RESET };
