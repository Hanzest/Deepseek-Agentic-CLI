// ---------------------------------------------------------------------------
// Shared ANSI color palette
// Centralized so all modules use consistent color conventions.
// ---------------------------------------------------------------------------

export const C = {
    // Semantic
    user:       "\x1b[32m",     // green       — user input
    model:      "",             // default     — model output (no color)
    system:     "\x1b[36m",     // cyan        — system info / status
    warning:    "\x1b[93m",     // yellow      — warnings
    error:      "\x1b[91m",     // red         — errors
    success:    "\x1b[92m",     // bright green— success confirmations

    // Decorative
    tool:       "\x1b[35m",     // magenta     — tool execution alerts
    border:     "\x1b[90m",     // dark gray   — separators, borders
    heading:    "\x1b[1;97m",   // bright white— headings

    // Special (kept for backward compat in template.js / callToolsInBatch.js)
    alert:      "\x1b[93m",     // yellow      — same as warning
    consent:    "\x1b[96m",     // bright cyan — consent prompts
    dim:        "\x1b[90m",     // dark gray   — same as border

    reset:      "\x1b[0m",
};

/**
 * Apply a color and reset after. Returns a no-op if color is empty string.
 */
export function colorize(text, color) {
    if (!color) return text;
    return `${color}${text}${C.reset}`;
}
