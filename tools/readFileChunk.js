import fs from "fs";
import path from "path";
import { createToolHandler } from "./template.js";
import { readFileUtf8Normalized } from "../lib/fileReader.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export const read_file_chunk_schema = {
    type: "function",
    function: {
        name: "read_file_chunk",
        description:
            "Reads a range of lines from a specific start line to an end line in a file. " +
            "Use this to inspect specific sections of large files without loading the " +
            "entire file into context. Returns the requested lines from line X to line Y " +
            "with line numbers prefixed.",
        parameters: {
            type: "object",
            properties: {
                file_path: {
                    type: "string",
                    description: "Absolute or relative path to the file to read.",
                },
                start_line: {
                    type: "integer",
                    description:
                        "The first line number to read (1-indexed, inclusive).",
                },
                end_line: {
                    type: "integer",
                    description:
                        "The last line number to read (1-indexed, inclusive).",
                },
            },
            required: ["file_path", "start_line", "end_line"],
        },
    },
};

// ---------------------------------------------------------------------------
// Pure handler logic (no consent needed - read-only)
// ---------------------------------------------------------------------------
async function readFileChunkCore({ file_path, start_line, end_line }) {
    if (path.basename(file_path).toLowerCase().includes(".env")) {
        const error_msg =
            "Security Error: Reading .env files is strictly prohibited.";
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }

    let all_lines;
    try {
        const file_content = readFileUtf8Normalized(file_path);
        all_lines = file_content.split("\n");
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

    const total_lines = all_lines.length;

    // Validate line range
    if (start_line < 1) start_line = 1;
    if (end_line > total_lines) end_line = total_lines;

    if (start_line > total_lines) {
        const error_msg =
            `Error: start_line (${start_line}) exceeds total lines in file ` +
            `(${total_lines}). No content returned.`;
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }
    if (start_line > end_line) {
        const error_msg =
            `Error: start_line (${start_line}) is greater than end_line ` +
            `(${end_line}). No content returned.`;
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }

    // Extract the requested chunk (convert from 1-indexed to 0-indexed)
    const chunk_lines = all_lines.slice(start_line - 1, end_line);

    // Format output with line numbers
    const output_lines = [];
    for (let i = 0; i < chunk_lines.length; i++) {
        const line_num = start_line + i;
        const line_content = chunk_lines[i];
        output_lines.push(
            `${String(line_num).padStart(6)}| ${line_content}`
        );
    }

    const result = output_lines.join("\n");
    console.log(`--- ${file_path} : read from line ${start_line} to line ${end_line} (of ${total_lines}) ---`)
    // Add a summary header
    const summary =
        `--- ${file_path} : read from line ${start_line} to line ${end_line} (of ${total_lines}) ---\n` +
        `${result}\n` +
        `--- end of chunk ---`;

    // console.log(`\x1b[92m[File Chunk]:\x1b[0m\n${summary}`);
    return summary;
}

// ---------------------------------------------------------------------------
// Wrapped handler (no consent - read-only tool)
// ---------------------------------------------------------------------------
export const read_file_chunk = createToolHandler(
    "read_file_chunk",
    readFileChunkCore,
    false
);
