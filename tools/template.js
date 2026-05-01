import { ask } from "../lib/cliInput.js";

// ---------------------------------------------------------------------------
// Shared console helpers
// ---------------------------------------------------------------------------
function logAlert(name, args) {
    const safeArgs = { ...args };
    // Never log full command content in case of sensitive data
    console.log(`\n\x1b[93m[Tool Execution Alert] ${name} requested:\x1b[0m`);
    for (const [key, value] of Object.entries(safeArgs)) {
        const display = typeof value === "string" && value.length > 200
            ? value.substring(0, 200) + "..."
            : value;
        console.log(`  ${key}: ${JSON.stringify(display)}`);
    }
}

function formatError(name, e) {
    const error_msg = `Error in tool '${name}': ${e.message || e}`;
    console.log(`\x1b[91m${error_msg}\x1b[0m`);
    return error_msg;
}

// ---------------------------------------------------------------------------
// Factory: creates a standardized tool handler
// ---------------------------------------------------------------------------
export function createToolHandler(name, handler, needsConsent = false) {
    return async (args) => {
        logAlert(name, args);

        if (needsConsent) {
            const consent = await ask(
                "\x1b[96mDo you approve this operation? (y/n): \x1b[0m"
            );
            const consent_clean = consent.trim().toLowerCase();
            if (consent_clean !== "y") {
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
