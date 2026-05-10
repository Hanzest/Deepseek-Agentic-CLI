import { ask } from "../lib/cliInput.js";
import { C, colorize } from "../lib/colors.js";

// ---------------------------------------------------------------------------
// Shared console helpers
// ---------------------------------------------------------------------------
let _alertCounter = 0;

/**
 * Reset the alert counter (called at the start of a batch).
 */
export function resetAlertCounter() {
    _alertCounter = 0;
}

function logAlert(name, args) {
    _alertCounter++;
    const safeArgs = { ...args };
    const num = _alertCounter;
    // Horizontal rule + numbered alert header
    console.log(colorize(`\n${'─'.repeat(56)}`, C.border));
    console.log(colorize(`[#${num}] [Tool Execution Alert] ${name} requested:`, C.alert));
    for (const [key, value] of Object.entries(safeArgs)) {
        const display = typeof value === "string" && value.length > 200
            ? value.substring(0, 200) + "..."
            : value;
        console.log(colorize(`  ${key}:`, C.dim) + ` ${JSON.stringify(display)}`);
    }
}

/**
 * Format a structured error return so the model can programmatically
 * distinguish errors from successful results.
 */
function formatError(name, e) {
    const error_msg = `Error in tool '${name}': ${e.message || e}`;
    console.log(colorize(`${'─'.repeat(56)}`, C.border));
    console.log(colorize(error_msg, C.error));
    console.log(colorize(`${'─'.repeat(56)}`, C.border));
    return JSON.stringify({ error: true, tool: name, message: error_msg });
}

// ---------------------------------------------------------------------------
// Factory: creates a standardized tool handler
// ---------------------------------------------------------------------------
export function createToolHandler(name, handler, needsConsent = false) {
    return async (args) => {
        if (needsConsent) {
            logAlert(name, args);
            console.log(""); // blank line before consent prompt
            const consent = await ask(
                colorize("  Do you approve this operation? (y/n): ", C.consent)
            );
            const consent_clean = consent.trim().toLowerCase();
            if (consent_clean !== "y") {
                console.log(colorize(`${'─'.repeat(56)}`, C.border));
                const denial_msg = "User denied the operation.";
                console.log(colorize(denial_msg, C.error));
                return JSON.stringify({ error: true, tool: name, message: denial_msg });
            }
        }

        try {
            return await handler(args);
        } catch (e) {
            return formatError(name, e);
        }
    };
}
