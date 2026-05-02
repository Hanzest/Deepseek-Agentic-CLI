import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createToolHandler } from "./template.js";
import { ask } from "../lib/cliInput.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export const write_or_create_file_schema = {
    type: "function",
    function: {
        name: "write_or_create_file",
        description:
            "Writes content to a file, creating it if it doesn't exist. " +
            "Optionally creates parent directories. Can overwrite or append. " +
            "Use this as the primary tool for creating new files or writing " +
            "complete file contents. Security: refuses to write to .env files.",
        parameters: {
            type: "object",
            properties: {
                file_path: {
                    type: "string",
                    description:
                        "Absolute or relative path to the file to write.",
                },
                content: {
                    type: "string",
                    description:
                        "The full content to write to the file.",
                },
                create_parents: {
                    type: "boolean",
                    description:
                        "Create parent directories if they don't exist. " +
                        "Defaults to true.",
                },
                mode: {
                    type: "string",
                    enum: ["write", "append"],
                    description:
                        "'write' - overwrite the file (default). " +
                        "'append' - append to the end of the file.",
                },
            },
            required: ["file_path", "content"],
        },
    },
};

// ---------------------------------------------------------------------------
// Pure handler logic
// ---------------------------------------------------------------------------
async function writeOrCreateFileCore({
    file_path,
    content,
    create_parents = true,
    mode = "write",
}) {
    const resolved_path = path.resolve(file_path);

    // ---- Security: block writes outside the project root ----
    const normalizedRoot = path.resolve(PROJECT_ROOT) + path.sep;
    if (!resolved_path.startsWith(normalizedRoot)) {
        const msg = "Security: Refusing to write outside the project directory. Path resolves to '" + resolved_path + "' which is outside '" + PROJECT_ROOT + "'.";
        console.log('\x1b[91m' + msg + '\x1b[0m');
        return msg;
    }

    // ---- Security: block .env files (exact basename check) ----
    const basename = path.basename(resolved_path);
    if (basename === ".env" || basename.startsWith(".env.") || basename.startsWith(".env-")) {
        console.log(
            '\n\x1b[93m[Security Warning] Write targets .env file.\x1b[0m'
        );
        const consent = await ask(
            "\x1b[96m  Approve writing to this file? (y/n): \x1b[0m"
        );
        if (consent.trim().toLowerCase() !== "y") {
            const msg = "Operation denied by user due to .env file target.";
            console.log('\x1b[91m' + msg + '\x1b[0m');
            return msg;
        }
    }

    // ---- Create parent directories ----
    if (create_parents) {
        const dir = path.dirname(resolved_path);
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true });
                console.log(
                    '\x1b[90mCreated parent directories: ' + dir + '\x1b[0m'
                );
            } catch (e) {
                const error_msg =
                    "Error creating directories '" + dir + "': " + e.message;
                console.log('\x1b[91m' + error_msg + '\x1b[0m');
                return error_msg;
            }
        }
    }

    // ---- Write or append ----
    try {
        const flag = mode === "append" ? "a" : "w";
        fs.writeFileSync(resolved_path, content, { encoding: "utf-8", flag });
        const action = mode === "append" ? "Appended to" : "Written";
        const size = Buffer.byteLength(content, "utf-8");
        console.log(
            '\x1b[32m' + action + " '" + resolved_path + "' (" + size + " bytes)\x1b[0m"
        );
        return JSON.stringify({
            success: true,
            tool: "write_or_create_file",
            file_path: resolved_path,
            bytes_written: size,
            mode,
        });
    } catch (e) {
        const error_msg =
            "Error writing to '" + resolved_path + "': " + e.message;
        console.log('\x1b[91m' + error_msg + '\x1b[0m');
        return error_msg;
    }
}

// ---------------------------------------------------------------------------
// Wrapped handler (consent managed via registry, but we add .env double-check)
// ---------------------------------------------------------------------------
export const write_or_create_file = createToolHandler(
    "write_or_create_file",
    writeOrCreateFileCore,
    true // needsConsent - filesystem mutation
);