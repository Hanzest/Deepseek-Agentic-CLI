import { execSync } from "child_process";
import { createToolHandler } from "./template.js";
import { ask } from "../lib/cliInput.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export const execute_terminal_command_schema = {
    type: "function",
    function: {
        name: "execute_terminal_command",
        description:
            "Executes a shell/bash command on the user's terminal (PowerShell on Windows). " +
            "Returns the command's stdout as a string. **Requires user consent** — prefer " +
            "read-only tools (get_project_tree, read_file_chunk) when possible. " +
            "Do NOT use for filesystem exploration; use get_project_tree instead.",
        parameters: {
            type: "object",
            properties: {
                command: {
                    type: "string",
                    description: "The bash/shell command to execute.",
                },
            },
            required: ["command"],
        },
    },
};

// ---------------------------------------------------------------------------
// Pure handler logic (no consent, no logging — handled by template)
// ---------------------------------------------------------------------------
async function executeTerminalCore({ command }) {
    if (command.toLowerCase().includes(".env")) {
        console.log(`\n\x1b[93m[Security Warning] Command references '.env' file.\x1b[0m`);
        const consent = await ask("\x1b[96m  Approve this command? (y/n): \x1b[0m");
        if (consent.trim().toLowerCase() !== "y") {
            const msg = "Operation denied by user due to .env reference in command.";
            console.log(`\x1b[91m${msg}\x1b[0m`);
            return msg;
        }
    }

    try {
        const output = execSync(command, {
            shell: "powershell.exe",
            encoding: "utf-8",
            timeout: 15000,
            maxBuffer: 10 * 1024 * 1024, // 10 MB
        });

        const result = output
            ? output
            : "Command executed successfully with no output.";

        console.log(`\x1b[92m[Execution Result]:\x1b[0m\n${result}`);
        return result;
    } catch (e) {
        if (e.killed || e.code === "ETIMEDOUT") {
            const error_msg =
                "Error: Command execution timed out after 15 seconds. Process terminated.";
            console.log(`\x1b[91m${error_msg}\x1b[0m`);
            return error_msg;
        }
        const error_msg = `Error executing command: ${e.message || e.stderr || e}`;
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }
}

// ---------------------------------------------------------------------------
// Wrapped handler (consent required)
// ---------------------------------------------------------------------------
export const execute_terminal_command = createToolHandler(
    "execute_terminal_command",
    executeTerminalCore,
    false
);
