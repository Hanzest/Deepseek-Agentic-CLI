import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createToolHandler } from "./template.js";
import { ask } from "../lib/cliInput.js";
import { readFileUtf8Normalized } from "../lib/fileReader.js";
import { isPlanFile, archiveActiveToHistory, extractTaskName, timestampedFilename, ACTIVE_DIR } from "../lib/artifactManager.js";

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
            "For small targeted edits, prefer patch_file instead — it transmits only the diff " +
            "and saves significant tokens. Use write_or_create_file as the primary tool for " +
            "creating new files, writing complete file contents, or replacing large sections. " +
            "Optionally creates parent directories. Can overwrite, append, " +
            "or replace a specific line range. When both start_line and " +
            "end_line are provided, only that line range is overwritten " +
            "with the given content. Use this as the primary tool for " +
            "creating new files or writing complete file contents. " +
            "Security: refuses to write to .env files.",
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
                start_line: {
                    type: "integer",
                    description:
                        "Start line number (1-indexed) for line-range " +
                        "overwrite. Must be used together with end_line. " +
                        "When provided, the content replaces lines " +
                        "start_line through end_line.",
                },
                end_line: {
                    type: "integer",
                    description:
                        "End line number (1-indexed) for line-range " +
                        "overwrite. Must be used together with start_line. " +
                        "When provided, the content replaces lines " +
                        "start_line through end_line.",
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
    start_line,
    end_line,
}) {
    const resolved_path = path.resolve(file_path);

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

    // ---- Artifact archive hook: if creating a new plan file in active/, archive first ----
    const activePath = path.resolve(PROJECT_ROOT, ACTIVE_DIR) + path.sep;
    const isInActive = resolved_path.startsWith(activePath);
    const fileExists = fs.existsSync(resolved_path);
    const isNewPlan = isInActive && !fileExists && isPlanFile(resolved_path);

    if (isNewPlan) {
        const taskName = extractTaskName(resolved_path);
        const archivedTo = archiveActiveToHistory(taskName);
        if (archivedTo) {
            console.log(
                '\x1b[90mArchived previous active session to: ' + archivedTo + '\x1b[0m'
            );
        }
    }

    // ---- Timestamp prefix for new files written to artifacts/active/ ----
    let actual_path = resolved_path;
    if (isInActive && !fileExists && mode !== "append") {
        const dir = path.dirname(resolved_path);
        const base = path.basename(resolved_path);
        // Only timestamp if the basename does not already have a timestamp prefix
        if (!/^\d{4}-\d{2}-\d{2}_\d{2}\.\d{2}\.\d{2}_/.test(base)) {
            actual_path = path.join(dir, timestampedFilename(base));
        }
    }

    // ---- Create parent directories ----
    if (create_parents) {
        const dir = path.dirname(actual_path);
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

    // ---- Line-range overwrite ----
    if (start_line !== undefined && end_line !== undefined) {
        // Read existing file
        let existing;
        try {
            existing = readFileUtf8Normalized(actual_path);
        } catch (e) {
            if (e.code === "ENOENT") {
                const error_msg =
                    "Error: Cannot perform line-range overwrite on '" +
                    actual_path + "' because the file does not exist.";
                console.log('\x1b[91m' + error_msg + '\x1b[0m');
                return error_msg;
            }
            const error_msg =
                "Error reading '" + actual_path + "': " + e.message;
            console.log('\x1b[91m' + error_msg + '\x1b[0m');
            return error_msg;
        }

        const lines = existing.split("\n");

        // Validate range
        if (start_line < 1) {
            const error_msg =
                "Error: start_line must be >= 1, got " + start_line + ".";
            console.log('\x1b[91m' + error_msg + '\x1b[0m');
            return error_msg;
        }
        if (end_line < start_line) {
            const error_msg =
                "Error: end_line (" + end_line +
                ") must be >= start_line (" + start_line + ").";
            console.log('\x1b[91m' + error_msg + '\x1b[0m');
            return error_msg;
        }
        if (end_line > lines.length) {
            const error_msg =
                "Error: end_line (" + end_line +
                ") exceeds file length (" + lines.length +
                " lines) in '" + actual_path + "'.";
            console.log('\x1b[91m' + error_msg + '\x1b[0m');
            return error_msg;
        }

        // Splice: replace lines[start_line-1] through lines[end_line-1]
        const newLines = content.split("\n");
        lines.splice(start_line - 1, end_line - start_line + 1, ...newLines);
        const newContent = lines.join("\n");

        try {
            fs.writeFileSync(actual_path, newContent, { encoding: "utf-8", flag: "w" });
            const size = Buffer.byteLength(newContent, "utf-8");
            console.log(
                '\x1b[32mLine-range overwritten ' +
                "'" + actual_path + "' (lines " + start_line +
                "-" + end_line + ", " + size + " bytes)\x1b[0m"
            );
            return JSON.stringify({
                success: true,
                tool: "write_or_create_file",
                file_path: actual_path,
                bytes_written: size,
                mode: "line_range",
                start_line,
                end_line,
            });
        } catch (e) {
            const error_msg =
                "Error writing to '" + actual_path + "': " + e.message;
            console.log('\x1b[91m' + error_msg + '\x1b[0m');
            return error_msg;
        }
    }

    // ---- Write or append ----
    try {
        const flag = mode === "append" ? "a" : "w";
        fs.writeFileSync(actual_path, content, { encoding: "utf-8", flag });
        const action = mode === "append" ? "Appended to" : "Written";
        const size = Buffer.byteLength(content, "utf-8");
        console.log(
            '\x1b[32m' + action + " '" + actual_path + "' (" + size + " bytes)\x1b[0m"
        );
        return JSON.stringify({
            success: true,
            tool: "write_or_create_file",
            file_path: actual_path,
            bytes_written: size,
            mode,
        });
    } catch (e) {
        const error_msg =
            "Error writing to '" + actual_path + "': " + e.message;
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