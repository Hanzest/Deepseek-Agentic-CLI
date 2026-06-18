import readline from "readline";
import { C, colorize } from "./colors.js";

// ---------------------------------------------------------------------------
// Global stdin mutex - ensures only ONE readline interface touches
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
        // Ensure stdin is flowing before creating a new readline interface.
        // On Windows, a previous close may have left stdin in a paused or
        // inconsistent console mode state. This mirrors the same safeguard
        // in ensureInterface().
        if (process.stdin.isTTY) {
            process.stdin.resume();
        }
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
                    // Ensure stdin is fully resumed after close before
                    // releasing the lock. On Windows, readline's internal
                    // close handler restores the original console mode, but
                    // rapid create/close cycles (e.g. ask_user_preferences
                    // calling ask() repeatedly) can leave the console input
                    // buffer in an inconsistent state. An explicit resume()
                    // here mirrors the same pattern used by _closeCurrentRL().
                    if (process.stdin.isTTY) {
                        process.stdin.resume();
                    }
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

export async function askSearchKeyword(question) {
    const release = await acquireStdin();
    try {
        if (process.stdin.isTTY) {
            process.stdin.resume();
        }
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        return new Promise((resolve) => {
            let resolved = false;

            rl.on("SIGINT", () => {
                if (!resolved) {
                    resolved = true;
                    rl.close();
                    if (process.stdin.isTTY) {
                        process.stdin.resume();
                    }
                    release();
                    resolve(null);
                }
            });

            rl.question(question, (answer) => {
                if (!resolved) {
                    resolved = true;
                    rl.close();
                    if (process.stdin.isTTY) {
                        process.stdin.resume();
                    }
                    release();
                    resolve(answer);
                }
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
    function _closeCurrentRL(isFinal = false) {
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
                // Skip during final teardown to avoid uv_handle_closing race.
                if (!isFinal && process.stdin.isTTY) {
                    try {
                        process.stdin.setRawMode(false);
                    } catch (_) {}
                    process.stdin.resume();
                }
                resolve();
            });
            rl.close();
        });
    }

    // -------------------------------------------------------------------
    // Always creates a FRESH readline interface - never reuses a stale
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
            try {
                process.stdin.setRawMode(false);
            } catch (_) {}
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
        return _closeCurrentRL(true).then(() => {
            // Destroy stdin so the event loop drains and Node.js can exit
            // naturally on Windows. _closeCurrentRL(true) skips the
            // resume() call to prevent a uv_handle_closing race when
            // destroy() is called immediately after.
            if (process.stdin.isTTY) {
                process.stdin.destroy();
            }
        });
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
        return _closeCurrentRL(false);
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

    while (true) {
        const model_choice = await ask(
            colorize("Enter your choice (1 or 2): ", C.system)
        );

        if (model_choice === "1") {
            return {
                model_name: "deepseek-v4-flash",
                apiKey: process.env.DEEPSEEK_API_KEY,
                baseURL: process.env.DEEPSEEK_BASE_URL,
                provider: "deepseek",
            };
        } else if (model_choice === "2") {
            return {
                model_name: "deepseek-v4-pro",
                apiKey: process.env.DEEPSEEK_API_KEY,
                baseURL: process.env.DEEPSEEK_BASE_URL,
                provider: "deepseek",
            };
        } else {
            console.log(colorize("Invalid choice. Please enter 1 or 2.", C.warning));
        }
    }
}

// ---------------------------------------------------------------------------
// Reasoning / thinking toggle
// ---------------------------------------------------------------------------
export async function thinkingToggle(provider = "deepseek") {
    // DeepSeek (default)
    console.log(colorize("Choose reasoning content option:", C.heading));
    console.log("  1. Disabled");
    console.log("  2. Enabled");

    while (true) {
        const choice = await ask(
            colorize("Enter your choice (1 or 2): ", C.system)
        );
        if (choice === "1") {
            console.log(colorize("[Mode] You are using Plan Mode - file mutation and system execution are now restricted (artifacts/ exempt).", C.system));
            return { thinking: { type: "disabled" } };
        } else if (choice === "2") {
            console.log(colorize("[Mode] You are using Plan Mode - file mutation and system execution are now restricted (artifacts/ exempt).", C.system));
            return { thinking: { type: "enabled" } };
        } else {
            console.log(colorize("Invalid choice. Please enter 1 or 2.", C.warning));
        }
    }
}

export async function selectFromList(title, options, initialIndex = 0) {
    const release = await acquireStdin();
    const isTTY = process.stdin.isTTY && typeof process.stdin.setRawMode === "function";

    if (!isTTY) {
        // Fallback for non-TTY
        console.log("\n" + title);
        options.forEach((opt, idx) => {
            console.log(`  [${idx + 1}] ${opt.label}`);
            if (opt.description) {
                console.log(`      ${opt.description}`);
            }
        });
        const ans = await new Promise((resolve) => {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            rl.question("  Select option (number): ", (val) => {
                rl.close();
                resolve(val);
            });
        });
        release();
        const num = parseInt(ans.trim(), 10);
        if (isNaN(num) || num < 1 || num > options.length) return null;
        return options[num - 1].value;
    }

    return new Promise((resolve) => {
        let selectedIndex = initialIndex;
        if (selectedIndex < 0 || selectedIndex >= options.length) {
            selectedIndex = 0;
        }

        // Hide cursor
        process.stdout.write("\x1b[?25l");

        function render() {
            console.clear();

            let output = "";
            output += title + "\n";

            options.forEach((opt, idx) => {
                const isSelected = idx === selectedIndex;
                const marker = isSelected ? "  > " : "    ";
                const lineContent = isSelected 
                    ? `\x1b[1m\x1b[36m${marker}${opt.label}\x1b[0m` // bold cyan
                    : `\x1b[2m${marker}${opt.label}\x1b[0m`;       // dim
                
                output += lineContent + "\n";

                if (opt.description) {
                    const descMarker = "      ";
                    const descContent = isSelected
                        ? `\x1b[36m${descMarker}${opt.description}\x1b[0m`
                        : `\x1b[90m${descMarker}${opt.description}\x1b[0m`;
                    output += descContent + "\n";
                }
            });

            process.stdout.write(output);
        }

        render();

        process.stdin.setRawMode(true);
        process.stdin.resume();
        readline.emitKeypressEvents(process.stdin);

        function onKeypress(str, key) {
            const name = (key && key.name) || str;
            if (!name) return;

            if (key && key.ctrl && name === 'c') {
                cleanup(null);
                return;
            }

            const lowerName = name.toLowerCase();

            if (lowerName === 'up' || lowerName === 'w') {
                selectedIndex = (selectedIndex - 1 + options.length) % options.length;
                render();
            } else if (lowerName === 'down' || lowerName === 's') {
                selectedIndex = (selectedIndex + 1) % options.length;
                render();
            } else if (lowerName === 'left' || lowerName === 'a') {
                cleanup({ type: "keyAction", action: "left" });
            } else if (lowerName === 'right' || lowerName === 'd') {
                cleanup({ type: "keyAction", action: "right" });
            } else if (lowerName === 'return' || lowerName === 'enter') {
                cleanup(options[selectedIndex].value);
            } else if (lowerName === 'escape' || lowerName === 'q' || lowerName === 'c') {
                cleanup(null);
            }
        }

        process.stdin.on('keypress', onKeypress);

        function cleanup(result) {
            process.stdin.removeListener('keypress', onKeypress);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            
            // Show cursor
            process.stdout.write("\x1b[?25h");
            console.clear();
            
            release();
            resolve(result);
        }
    });
}



