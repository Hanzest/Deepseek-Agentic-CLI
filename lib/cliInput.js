import readline from "readline";
import { C, colorize } from "./colors.js";

// ---------------------------------------------------------------------------
// Console input helper (simple, one-shot — kept for backward compat)
// ---------------------------------------------------------------------------
export function ask(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

// ---------------------------------------------------------------------------
// Item 1: Reusable yes/no helper
// ---------------------------------------------------------------------------
export async function askYesNo(question, defaultYes = false) {
    const hint = defaultYes ? " (Y/n): " : " (y/N): ";
    const answer = await ask(question + hint);
    const clean = answer.trim().toLowerCase();
    if (clean === "y" || clean === "yes") return true;
    if (clean === "n" || clean === "no") return false;
    return defaultYes;
}

// ---------------------------------------------------------------------------
// Item 10: Persistent prompt loop with input history (arrow-up recall)
// ---------------------------------------------------------------------------
export function createPromptLoop() {
    const history = [];
    let rl = null;

    function ensureInterface() {
        if (rl) return rl;
        rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            history: history,
            historySize: 1000,
        });
        // Node.js 22+ supports history array. For older versions, we
        // maintain our own array and use it when available.
        // If the readline impl doesn't use the history option, fall back:
        // we push to history ourselves on each line.
        return rl;
    }

    /**
     * Ask a question using the persistent interface. Returns a Promise
     * that resolves with the user's input line.
     */
    function askWithHistory(question) {
        const iface = ensureInterface();
        return new Promise((resolve) => {
            iface.question(question, (answer) => {
                // Only add non-empty lines to history
                if (answer.trim()) {
                    history.push(answer);
                }
                resolve(answer);
            });
        });
    }

    /**
     * Manually add a line to history (useful for programmatic additions).
     */
    function addToHistory(line) {
        if (line && line.trim()) {
            history.push(line);
        }
    }

    /**
     * Close the persistent interface. Call on shutdown.
     */
    function close() {
        if (rl) {
            rl.close();
            rl = null;
        }
    }

    /**
     * Get the current history array (read-only reference).
     */
    function getHistory() {
        return history;
    }

    return { ask: askWithHistory, addToHistory, close, getHistory };
}

// ---------------------------------------------------------------------------
// Model selection
// ---------------------------------------------------------------------------
export async function startChat() {
    console.log(colorize("Choose a model to interact with:", C.heading));
    console.log("  1. deepseek-v4-flash");
    console.log("  2. deepseek-v4-pro");

    const model_choice = await ask(
        colorize("Enter your choice (1 or 2): ", C.system)
    );

    if (model_choice === "1") {
        return "deepseek-v4-flash";
    } else if (model_choice === "2") {
        return "deepseek-v4-pro";
    } else {
        console.log(colorize("Invalid choice. Using deepseek-v4-flash by default.", C.warning));
        return "deepseek-v4-flash";
    }
}

// ---------------------------------------------------------------------------
// Reasoning / thinking toggle
// ---------------------------------------------------------------------------
export async function thinkingToggle() {
    console.log(colorize("Choose reasoning content option:", C.heading));
    console.log("  1. Disabled");
    console.log("  2. Enabled");

    const choice = await ask(
        colorize("Enter your choice (1 or 2): ", C.system)
    );
    if (choice === "1" || choice === "2") {
        console.log(colorize("[Mode] You are using Plan Mode — file mutation and system execution are now restricted (artifacts/ exempt).", C.system));
    }
    if (choice === "1") {
        return { thinking: { type: "disabled" } };
    } else if (choice === "2") {
        return { thinking: { type: "enabled" } };
    } else {
        console.log(colorize("Invalid choice. Disabled reasoning content by default.", C.warning));
        return { thinking: { type: "disabled" } };
    }
}
