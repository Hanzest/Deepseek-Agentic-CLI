import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Independent terminal window manager for sub-agents.
//
// Each sub-agent gets its own PowerShell window that tails a temp log file.
// This keeps sub-agent output isolated from the main orchestrator terminal.
// ---------------------------------------------------------------------------

/**
 * Creates an independent terminal window for a sub-agent.
 *
 * Spawns a new PowerShell window that tails a temp log file. Returns a logger
 * object with write() and close() methods. All sub-agent output sent through
 * write() appears in the dedicated window.
 *
 * @param {string} subAgentName - Display name for the terminal window title
 * @returns {{ write: Function, close: Function, logPath: string }}
 */
export function createSubAgentTerminal(subAgentName) {
    const sanitized = subAgentName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const tempDir = os.tmpdir();
    const logPath = path.join(
        tempDir,
        "subagent-" + sanitized + "-" + Date.now() + ".log"
    );

    // Seed the log file so tail doesn't fail on empty file
    fs.writeFileSync(
        logPath,
        "=== Sub-Agent: " + subAgentName + " ===\n\n",
        "utf-8"
    );

    // Escape single quotes for PowerShell
    const escapedName = subAgentName.replace(/'/g, "''");
    const escapedPath = logPath.replace(/'/g, "''");

    const psCommand =
        "$host.UI.RawUI.WindowTitle = 'Sub-Agent: " + escapedName + "'; " +
        "Get-Content -Path '" + escapedPath + "' -Wait -Tail 100";

    const child = spawn(
        "powershell",
        ["-NoExit", "-Command", psCommand],
        {
            detached: true,
            stdio: "ignore",
            windowsHide: false,
        }
    );

    // Detach so the main process doesn't wait for the window to close
    child.unref();

    console.log(
        "\x1b[90m[Terminal] Spawned independent window for sub-agent: \x1b[93m" +
        subAgentName + "\x1b[0m"
    );

    let closed = false;

    return {
        logPath,

        /**
         * Write a line of text to the sub-agent's terminal window.
         * Strips ANSI escape codes since Get-Content doesn't render them.
         */
        write(line) {
            if (closed) return;
            try {
                const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
                fs.appendFileSync(logPath, clean + "\n", "utf-8");
            } catch (_) {
                // If write fails (e.g., disk full), silently ignore
            }
        },

        /**
         * Close the terminal window by killing the PowerShell process.
         * Cleans up the temp log file after a delay so the user can see
         * the completion marker.
         */
        close() {
            if (closed) return;
            closed = true;
            try {
                fs.appendFileSync(
                    logPath,
                    "\n=== Sub-agent finished ===\n",
                    "utf-8"
                );
            } catch (_) {
                // ignore
            }
            try {
                child.kill("SIGTERM");
            } catch (_) {
                // ignore
            }
            // Delay cleanup so the tail window renders the completion marker
            setTimeout(() => {
                try {
                    if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
                } catch (_) {
                    // ignore
                }
            }, 2000);
        },
    };
}
