import fs from "fs";
import path from "path";
import ignore from "ignore";
import { createToolHandler } from "./template.js";
import { readFileUtf8Normalized } from "../lib/fileReader.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export const get_project_tree_schema = {
    type: "function",
    function: {
        name: "get_project_tree",
        description:
            "Walks the project directory structure, ignoring files and folders " +
            "listed in .gitignore. Returns a clean hierarchical map of the actual " +
            "source code. Use this to navigate the project without noisy terminal " +
            "outputs from node_modules, .git, venv, etc. " +
            "Use this instead of execute_terminal_command for filesystem exploration " +
            "(dir/ls/tree) — it is read-only, respects .gitignore, and never requires " +
            "user consent.",
        parameters: {
            type: "object",
            properties: {
                root_path: {
                    type: "string",
                    description:
                        "Absolute or relative path to the root directory to map. " +
                        "Defaults to '.' (current working directory).",
                },
                max_depth: {
                    type: "integer",
                    description:
                        "Maximum depth to traverse. Defaults to 10. Use lower values for large projects.",
                },
            },
            required: [],
        },
    },
};

// ---------------------------------------------------------------------------
// Internal: load gitignore spec
// ---------------------------------------------------------------------------
function _load_gitignore_spec(root_path) {
    const gitignore_path = path.join(root_path, ".gitignore");
    if (!fs.existsSync(gitignore_path)) {
        return null;
    }
    try {
        const gitignore_content = readFileUtf8Normalized(gitignore_path);
        return ignore().add(gitignore_content);
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Pure handler logic (no consent — read-only tool)
// ---------------------------------------------------------------------------
async function getProjectTreeCore({ root_path = ".", max_depth = 10 } = {}) {
    root_path = path.resolve(root_path);

    if (!fs.existsSync(root_path) || !fs.statSync(root_path).isDirectory()) {
        const error_msg = `Error: Directory not found at '${root_path}'.`;
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }

    const spec = _load_gitignore_spec(root_path);

    // Always-ignored patterns
    const always_ignore = ignore().add(
        [".git", "__pycache__", "*.pyc", ".pytest_cache", "node_modules"].join("\n")
    );

    function is_ignored(rel_path, is_dir) {
        const normalized = rel_path.split(path.sep).join("/");
        const check_path = is_dir ? normalized + "/" : normalized;
        if (always_ignore.ignores(check_path)) {
            return true;
        }
        if (spec && spec.ignores(check_path)) {
            return true;
        }
        return false;
    }

    function collect_entries(current_path, depth) {
        if (depth > max_depth) {
            return [];
        }

        let entries;
        try {
            entries = fs.readdirSync(current_path);
        } catch {
            return [`${"  ".repeat(depth - 1)}|-- [Permission Denied]`];
        }

        const dirs = [];
        const files = [];

        for (const entry of entries) {
            const full_path = path.join(current_path, entry);
            const rel_path = path.relative(root_path, full_path);

            let is_dir;
            try {
                is_dir = fs.statSync(full_path).isDirectory();
            } catch {
                continue;
            }

            if (is_ignored(rel_path, is_dir)) {
                continue;
            }

            if (is_dir) {
                dirs.push([entry, full_path]);
            } else {
                files.push(entry);
            }
        }

        dirs.sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
        files.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        const result = [];

        for (const [entry, full_path] of dirs) {
            const prefix = depth > 0 ? "  ".repeat(depth - 1) : "";
            result.push(`${prefix}|-- ${entry}/`);
            result.push(...collect_entries(full_path, depth + 1));
        }

        for (const entry of files) {
            const prefix = depth > 0 ? "  ".repeat(depth - 1) : "";
            result.push(`${prefix}|-- ${entry}`);
        }

        return result;
    }

    const root_name = path.basename(root_path) || root_path;
    const result_lines = [
        `Project tree for: ${root_path}`,
        `(respecting .gitignore, max depth ${max_depth})`,
        "",
        `${root_name}/`,
    ];

    const tree_entries = collect_entries(root_path, 1);
    result_lines.push(...tree_entries);

    if (tree_entries.length === 0) {
        result_lines.push("  (empty directory)");
    }

    const result = result_lines.join("\n");

    console.log(`\x1b[92m[Project Tree]:\x1b[0m\n${result}`);
    return result;
}

// ---------------------------------------------------------------------------
// Wrapped handler (no consent — read-only tool)
// ---------------------------------------------------------------------------
export const get_project_tree = createToolHandler(
    "get_project_tree",
    getProjectTreeCore,
    false
);
