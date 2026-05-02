import fs from "fs";
import path from "path";
import { createToolHandler } from "./template.js";
import { ask } from "../lib/cliInput.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export const patch_file_schema = {
    type: "function",
    function: {
        name: "patch_file",
        description:
            "Performs a targeted edit on a file by searching for a string and replacing it. " +
            "If the search_string is found exactly once, it is replaced with replace_string. " +
            "If found multiple times, the tool reports the line numbers and asks for a more " +
            "specific search string. Use this instead of rewriting entire files for small changes.",
        parameters: {
            type: "object",
            properties: {
                file_path: {
                    type: "string",
                    description: "Absolute or relative path to the file to edit.",
                },
                search_string: {
                    type: "string",
                    description:
                        "The exact string to search for in the file. Must match exactly once.",
                },
                replace_string: {
                    type: "string",
                    description: "The string to replace the search_string with.",
                },
            },
            required: ["file_path", "search_string", "replace_string"],
        },
    },
};

// ---------------------------------------------------------------------------
// Pure handler logic
// ---------------------------------------------------------------------------
async function patchFileCore({ file_path, search_string, replace_string }) {
    if (path.basename(file_path).toLowerCase().includes(".env")) {
        console.log(`\n\x1b[93m[Security Warning] Patch targets '.env' file.\x1b[0m`);
        const consent = await ask("\x1b[96m  Approve this patch? (y/n): \x1b[0m");
        if (consent.trim().toLowerCase() !== "y") {
            const msg = "Operation denied by user due to .env file target.";
            console.log(`\x1b[91m${msg}\x1b[0m`);
            return msg;
        }
    }

    let original_content;
    try {
        original_content = fs.readFileSync(file_path, "utf-8");
    } catch (e) {
        if (e.code === "ENOENT") {
            const error_msg = `Error: File not found at '${file_path}'.`;
            console.log(`\x1b[91m${error_msg}\x1b[0m`);
            return error_msg;
        }
        const error_msg = `Error reading file '${file_path}': ${e.message}`;
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }

    // Count occurrences by splitting
    const occurrences =
        original_content.split(search_string).length - 1;

    if (occurrences === 0) {
        const error_msg =
            `Error: search_string not found in '${file_path}'. ` +
            `No changes were made. Verify the search string and try again.`;
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }

    if (occurrences > 1) {
        const lines = original_content.split("\n");
        const line_numbers = [];
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(search_string)) {
                line_numbers.push(i + 1);
            }
        }

        const error_msg =
            `Error: search_string found ${occurrences} times in '${file_path}' ` +
            `(lines: [${line_numbers.join(", ")}]). Please provide a more specific ` +
            `search_string that matches exactly once. No changes were made.`;
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }

    // Exactly one match -- perform the replacement
    const new_content = original_content.replace(search_string, replace_string);

    try {
        fs.writeFileSync(file_path, new_content, "utf-8");
        const success_msg =
            `Successfully patched '${file_path}'. ` +
            `Replaced 1 occurrence of the search string.`;
        console.log(`\x1b[92m${success_msg}\x1b[0m`);
        return success_msg;
    } catch (e) {
        const error_msg = `Error writing to file '${file_path}': ${e.message}`;
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }
}

// ---------------------------------------------------------------------------
// Wrapped handler (consent required)
// ---------------------------------------------------------------------------
export const patch_file = createToolHandler(
    "patch_file",
    patchFileCore,
    false
);
