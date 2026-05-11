import readline from "readline";
import { C, colorize } from "./colors.js";

// ---------------------------------------------------------------------------
// Global stdin mutex — ensures only ONE readline interface touches
// process.stdin at a time. This prevents terminal mode corruption on Windows
// (raw/cooked mode race) when tools like ask_user_preferences create/destroy
// multiple temporary readline interfaces between pauses of the persistent
// prompt loop.
// ---------------------------------------------------------------------------
let _stdinLock = Promise.resolve();

function acquireStdin() {
    let release;
    const prev = _stdinLock;
    _stdinLock = new Promise((resolve) => { release = resolve; });
    return prev.then(() => release);
}

// ---------------------------------------------------------------------------
// Standalone one-shot ask (used by tools, init prompts, etc.)
// ---------------------------------------------------------------------------
export async function ask(question) {
    const release = await acquireStdin();
    try {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        return new Promise((resolve) => {
            rl.question(question, (answer) => {
                // Register close listener BEFORE calling close() so the
                // 'close' event (which may fire on the same tick on some
                // Windows Node.js builds) is never missed.
                rl.on("close", () => {
                    release();
                    resolve(answer);
                });
                rl.close();
            });
        });
    } catch (e) {
        release();
        throw e;
    }
}

export async function askYesNo(question, defaultYes = false) {
    const hint = defaultYes ? " (Y/n): " : " (y/N): ";
    const answer = await ask(question + hint);
    const clean = answer.trim().toLowerCase();
    if (clean === "y" || clean === "yes") return true;
    if (clean === "n" || clean === "no") return false;
    return defaultYes;
}

// ---------------------------------------------------------------------------
// Persistent prompt loop with input history (arrow-up recall)
//
// Integrates with the global stdin mutex: the persistent interface acquires
// the lock on creation and releases it on pause/close. This guarantees that
// no tool-created readline interface races with the persistent one.
// ---------------------------------------------------------------------------
export function createPromptLoop() {
    const history = [];
    let rl = null;
    let _release = null; // mutex release function while interface is active

    // -------------------------------------------------------------------
    // Shared helper: closes the current readline interface (if any),
    // releases the stdin mutex, and waits for full cleanup. Used by
    // ensureInterface(), pause(), and close() to avoid duplication.
    // -------------------------------------------------------------------
    function _closeCurrentRL() {
        if (!rl) return Promise.resolve();
        return new Promise((resolve) => {
            rl.on("close", () => {
                rl = null;
                if (_release) {
                    _release();
                    _release = null;
                }
                // On Windows, rapid SetConsoleMode transitions can leave
                // the console input buffer in an inconsistent state.
                // Explicitly resume stdin to flush any stale paused state
                // before the next readline interface takes over.
                if (process.stdin.isTTY) {
                    process.stdin.resume();
                }
                resolve();
            });
            rl.close();
        });
    }

    // -------------------------------------------------------------------
    // Always creates a FRESH readline interface — never reuses a stale
    // one. This prevents Windows console mode corruption caused by
    // reusing an interface that sat idle during API streaming or after
    // rapid tool-driven ask() cycles.
    //
    // The history array (arrow-up recall) is maintained independently
    // and passed to each new interface, so history is preserved.
    // -------------------------------------------------------------------
    async function ensureInterface() {
        // Close any previous interface first to guarantee a clean stdin
        await _closeCurrentRL();

        // Acquire the stdin lock before creating a new interface
        _release = await acquireStdin();

        // Belt-and-suspenders: ensure stdin is flowing before readline
        // takes control. On Windows, a previous close may have left
        // stdin in a paused state that resume() hasn't fully flushed.
        if (process.stdin.isTTY) {
            process.stdin.resume();
        }

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

    async function askWithHistory(question) {
        const iface = await ensureInterface();
        return new Promise((resolve) => {
            iface.question(question, (answer) => {
                if (answer.trim()) {
                    history.push(answer);
                }
                resolve(answer);
            });
        });
    }

    function addToHistory(line) {
        if (line && line.trim()) {
            history.push(line);
        }
    }

    function getHistory() {
        return history;
    }

    /**
     * Fully close the persistent interface and release the stdin lock.
     * Used when the chat session ends.
     */
    function close() {
        return _closeCurrentRL();
    }

    /**
     * Pause the persistent interface by closing it and releasing the
     * stdin lock. The interface is automatically recreated (and the lock
     * re-acquired) on the next askWithHistory() call.
     *
     * Use this BEFORE:
     *  - Running tool batches (tools may call ask() which needs the lock)
     *  - Calling standalone ask() from the orchestrator (save prompts,
     *    iteration guard, etc.)
     *
     * This avoids double-echo of keystrokes AND terminal mode corruption
     * caused by two readline interfaces on the same stdin.
     */
    function pause() {
        return _closeCurrentRL();
    }

    return { ask: askWithHistory, addToHistory, close, pause, getHistory };
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
