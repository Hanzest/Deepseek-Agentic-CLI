import { ask } from "../lib/cliInput.js";

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
    console.log(`\n\x1b[90m${'─'.repeat(56)}\x1b[0m`);
    console.log(`\x1b[93m[#${num}] [Tool Execution Alert] ${name} requested:\x1b[0m`);
    for (const [key, value] of Object.entries(safeArgs)) {
        const display = typeof value === "string" && value.length > 200
            ? value.substring(0, 200) + "..."
            : value;
        console.log(`\x1b[90m  ${key}:\x1b[0m ${JSON.stringify(display)}`);
    }
}

function formatError(name, e) {
    const error_msg = `Error in tool '${name}': ${e.message || e}`;
    console.log(`\x1b[90m${'─'.repeat(56)}\x1b[0m`);
    console.log(`\x1b[91m${error_msg}\x1b[0m`);
    console.log(`\x1b[90m${'─'.repeat(56)}\x1b[0m`);
    return error_msg;
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
                "\x1b[96m  Do you approve this operation? (y/n): \x1b[0m"
            );
            const consent_clean = consent.trim().toLowerCase();
            if (consent_clean !== "y") {
                console.log(`\x1b[90m${'─'.repeat(56)}\x1b[0m`);
                const denial_msg = "User denied the operation.";
                console.log(`\x1b[91m${denial_msg}\x1b[0m`);
                return denial_msg;
            }
        }

        try {
            return await handler(args);
        } catch (e) {
            return formatError(name, e);
        }
    };
}
