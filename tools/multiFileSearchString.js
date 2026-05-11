import fs from "fs";
import path from "path";
import ignore from "ignore";
import { createToolHandler } from "./template.js";

export const multi_file_search_string_schema = {
    type: "function",
    function: {
        name: "multi_file_search_string",
        description:
            "Searches for a string across multiple files matching a glob pattern. " +
            "Returns file paths with line numbers, matched lines, and optional context. " +
            "Respects .gitignore and always ignores node_modules, .git, and .env files. " +
            "Use this to find usages of variables, functions, imports, or any text pattern " +
            "across the codebase without reading each file individually.",
        parameters: {
            type: "object",
            properties: {
                search_string: {
                    type: "string",
                    description:
                        "The exact string to search for across all matching files. " +
                        "When regex is true, this is treated as a regular expression pattern.",
                },
                glob_pattern: {
                    type: "string",
                    description:
                        "Glob pattern to filter which files to search. " +
                        "Examples: '**/*.js', '**/*.md', 'src/**/*.js'. " +
                        "Defaults to '**/*' (all files).",
                },
                root_path: {
                    type: "string",
                    description:
                        "Root directory to search from. " +
                        "Defaults to '.' (current working directory).",
                },
                max_results: {
                    type: "integer",
                    description:
                        "Maximum number of match results to return. " +
                        "Defaults to 50. Set to 0 for unlimited.",
                },
                include_context: {
                    type: "boolean",
                    description:
                        "Whether to include surrounding lines for context. " +
                        "Defaults to true.",
                },
                context_lines: {
                    type: "integer",
                    description:
                        "Number of context lines to show before and after each match. " +
                        "Only used if include_context is true. Defaults to 2.",
                },
                regex: {
                    type: "boolean",
                    description:
                        "If true, search_string is treated as a regular expression pattern. " +
                        "Defaults to false.",
                },
            },
            required: ["search_string"],
        },
    },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _load_gitignore_spec(root_path) {
    const p = path.join(root_path, ".gitignore");
    if (!fs.existsSync(p)) return null;
    try { return ignore().add(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

function _is_ignored(rel_path, is_dir, spec) {
    const n = rel_path.split(path.sep).join("/");
    const c = is_dir ? n + "/" : n;
    const ai = ignore().add([".git", "node_modules", ".env", "__pycache__", "*.pyc", ".pytest_cache"].join("\n"));
    if (ai.ignores(c)) return true;
    if (spec && spec.ignores(c)) return true;
    return false;
}

const MAX_FILE_SIZE_BYTES = 150 * 1024; // 150 KB

function _is_binary_file(fp) {
    try {
        const fd = fs.openSync(fp, "r");
        const buf = Buffer.alloc(512);
        const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
        fs.closeSync(fd);
        for (let i = 0; i < bytesRead; i++) {
            if (buf[i] === 0) return true; // null byte => binary
        }
        return false;
    } catch {
        return true; // unreadable => treat as binary, skip it
    }
}

function _collect_files(root_path, spec) {
    const r = [];
    (function walk(cp) {
        let e;
        try { e = fs.readdirSync(cp); } catch { return; }
        for (const en of e) {
            const fp = path.join(cp, en);
            const rp = path.relative(root_path, fp);
            let isDir;
            try {
                isDir = fs.statSync(fp).isDirectory();
            } catch {
                // Permission error on single entry — skip it, don't abort the walk
                continue;
            }
            if (_is_ignored(rp, isDir, spec)) continue;
            if (isDir) {
                walk(fp);
            } else {
                r.push(fp);
            }
        }
    })(root_path);
    return r;
}

function _glob_to_regex(gp) {
    let s = gp.replace(/[.+^{}()|[\]\\]/g, "\\$&");
    s = s.replace(/\*\*/g, "___DS___").replace(/\*/g, "___S___").replace(/\?/g, "___Q___");
    s = s.replace(/___DS___/g, ".*").replace(/___S___/g, "[^/]*").replace(/___Q___/g, ".");
    // Allow **/ prefix to be optional so root-level files also match
    // e.g. "**/*.txt" regex becomes "^(.*/)?[^/]*\.txt$" matching both "a.txt" and "sub/a.txt"
    s = s.replace(/^\.\*\//, "(.*/)?");
    return new RegExp("^" + s + "$");
}

function _path_matches_glob(fp, rp, gp) {
    const r = path.relative(rp, fp).split(path.sep).join("/");
    if (gp === "**/*" || gp === "*") return true;
    return _glob_to_regex(gp).test(r);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
async function multiFileSearchStringCore({
    search_string,
    glob_pattern = "**/*",
    root_path = ".",
    max_results = 50,
    include_context = true,
    context_lines = 2,
    regex = false,
} = {}) {
    root_path = path.resolve(root_path);
    if (!fs.existsSync(root_path)) {
        const e = "Error: Root path not found at '" + root_path + "'.";
        console.log("\x1b[91m" + e + "\x1b[0m");
        return e;
    }

    let regexPattern = null;
    if (regex) {
        try {
            regexPattern = new RegExp(search_string);
        } catch (e) {
            const err = "Error: Invalid regex pattern '" + search_string + "': " + e.message;
            console.log("\x1b[91m" + err + "\x1b[0m");
            return err;
        }
    }

    const spec = _load_gitignore_spec(root_path);
    const all_files = _collect_files(root_path, spec);
    const mf = glob_pattern
        ? all_files.filter(function(f) { return _path_matches_glob(f, root_path, glob_pattern); })
        : all_files;

    if (mf.length === 0) {
        const msg = "No files found matching pattern '" + glob_pattern + "' in '" + root_path + "'.";
        console.log("\x1b[93m" + msg + "\x1b[0m");
        return msg;
    }

    const results = [];
    let skipped_binary = 0;
    let skipped_size = 0;

    for (const fp of mf) {
        if (max_results > 0 && results.length >= max_results) break;

        // Check file size before reading (DoS protection)
        let stat;
        try { stat = fs.statSync(fp); } catch { continue; }
        if (stat.size > MAX_FILE_SIZE_BYTES) {
            skipped_size++;
            continue;
        }

        // Skip binary files
        if (_is_binary_file(fp)) {
            skipped_binary++;
            continue;
        }

        let lines;
        try { lines = fs.readFileSync(fp, "utf-8").split("\n"); } catch { continue; }
        for (let i = 0; i < lines.length; i++) {
            if (max_results > 0 && results.length >= max_results) break;
            const line = lines[i];
            if (regex && regexPattern ? regexPattern.test(line) : line.includes(search_string)) {
                const match = {
                    file: path.relative(root_path, fp).split(path.sep).join("/"),
                    absolute_path: fp,
                    line_number: i + 1,
                    line_content: line,
                };
                if (include_context && context_lines > 0) {
                    const s = Math.max(0, i - context_lines);
                    const e = Math.min(lines.length, i + context_lines + 1);
                    match.context = [];
                    for (let j = s; j < e; j++) {
                        match.context.push({ line_number: j + 1, content: lines[j], is_match: j === i });
                    }
                }
                results.push(match);
            }
        }
    }

    const limited = max_results > 0 && results.length > max_results;
    const returned = limited ? results.slice(0, max_results) : results;

    const output = {
        success: true,
        tool: "multi_file_search_string",
        search_string: search_string,
        regex: !!regex,
        glob_pattern: glob_pattern,
        root_path: root_path,
        total_matches: results.length,
        matches_returned: returned.length,
        files_searched: mf.length,
        files_skipped_binary: skipped_binary,
        files_skipped_size: skipped_size,
        max_file_size_bytes: MAX_FILE_SIZE_BYTES,
        truncated: limited,
        matches: returned,
    };

    console.log("\x1b[90m----------------------------------------\x1b[0m");
    console.log("\x1b[32m  Search: \"" + search_string + "\" | " + returned.length + "/" + results.length + " matches across " + mf.length + " files\x1b[0m");
    if (skipped_binary > 0 || skipped_size > 0) {
        const parts = [];
        if (skipped_binary > 0) parts.push(skipped_binary + " binary");
        if (skipped_size > 0) parts.push(skipped_size + " oversized (>" + (MAX_FILE_SIZE_BYTES / 1024) + " KB)");
        console.log("\x1b[90m  Skipped: " + parts.join(", ") + "\x1b[0m");
    }
    console.log("\x1b[90m----------------------------------------\x1b[0m");
    for (const m of returned) {
        console.log("\x1b[93m  " + m.file + ":" + m.line_number + "\x1b[0m  " + m.line_content.trim());
    }
    if (limited) {
        console.log("\x1b[33m  ... and " + (results.length - max_results) + " more match(es). Increase max_results to see all.\x1b[0m");
    }
    return JSON.stringify(output);
}

export const multi_file_search_string = createToolHandler(
    "multi_file_search_string",
    multiFileSearchStringCore,
    false
);
