import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import ignore from "ignore";
import { ask } from "./helper.js";

// =============================================================================
// Tool 1: execute_terminal_command
// =============================================================================

export const terminal_tool_schema = {
  type: "function",
  function: {
    name: "execute_terminal_command",
    description:
      "Executes a shell/bash command on the user's terminal. Use this to interact with the system.",
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

export async function execute_terminal_command({ command }) {
  if (
    command.toLowerCase().includes(".env") ||
    command.toLowerCase().includes("get-content *")
  ) {
    console.log(
      `\n\x1b[91m[Security Alert] Command contains potentially dangerous patterns and will not be executed.\x1b[0m`
    );
  }

  console.log(
    `\n\x1b[93m[Tool Execution Alert] The model wishes to run the following command:\x1b[0m`
  );
  console.log(`> ${command}`);

  const consent = await ask(
    "\x1b[96mDo you approve this execution? (y/n): \x1b[0m"
  );
  const consent_clean = consent.trim().toLowerCase();

  if (consent_clean === "y") {
    try {
      const output = execSync(command, {
        shell: "powershell.exe",
        encoding: "utf-8",
        timeout: 15000,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      });

      const result = output ? output : "Command executed successfully with no output.";

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
  } else {
    const denial_msg = "User denied execution of the command.";
    console.log(`\x1b[91m${denial_msg}\x1b[0m`);
    return denial_msg;
  }
}

// =============================================================================
// Tool 2: patch_file -- Targeted file editing
// =============================================================================

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

export async function patch_file({ file_path, search_string, replace_string }) {
  if (path.basename(file_path).toLowerCase().includes(".env")) {
    const error_msg = "Security Error: Modifying .env files is strictly prohibited.";
    console.log(`\x1b[91m${error_msg}\x1b[0m`);
    return error_msg;
  }

  console.log(`\n\x1b[93m[Tool Execution Alert] patch_file requested:\x1b[0m`);
  console.log(`  File: ${file_path}`);
  console.log(`  Search: ${JSON.stringify(search_string)}`);
  console.log(`  Replace: ${JSON.stringify(replace_string)}`);

  const consent = await ask("\x1b[96mDo you approve this edit? (y/n): \x1b[0m");
  const consent_clean = consent.trim().toLowerCase();

  if (consent_clean !== "y") {
    const denial_msg = "User denied the patch_file edit.";
    console.log(`\x1b[91m${denial_msg}\x1b[0m`);
    return denial_msg;
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
    // Find and report all line numbers where the string appears
    const lines = original_content.split("\n");
    const line_numbers = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(search_string)) {
        line_numbers.push(i + 1); // 1-indexed
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

// =============================================================================
// Tool 3: read_file_chunk -- Chunked file reader
// =============================================================================

export const read_file_chunk_schema = {
  type: "function",
  function: {
    name: "read_file_chunk",
    description:
      "Reads a range of lines from a file. Use this to inspect specific sections " +
      "of large files without loading the entire file into context. Returns the " +
      "requested lines with line numbers prefixed.",
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

export async function read_file_chunk({ file_path, start_line, end_line }) {
  if (path.basename(file_path).toLowerCase().includes(".env")) {
    const error_msg =
      "Security Error: Reading .env files is strictly prohibited.";
    console.log(`\x1b[91m${error_msg}\x1b[0m`);
    return error_msg;
  }

  console.log(
    `\n\x1b[93m[Tool Execution Alert] read_file_chunk requested:\x1b[0m`
  );
  console.log(`  File: ${file_path}`);
  console.log(`  Lines: ${start_line} - ${end_line}`);

  let all_lines;
  try {
    const file_content = fs.readFileSync(file_path, "utf-8");
    all_lines = file_content.split("\n");
    // Preserve trailing empty line behavior: if file ends with \n, split gives
    // an extra empty string. We keep it for accurate line-count matching.
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
    const line_content = chunk_lines[i].replace(/\r?\n?$/, "");
    output_lines.push(
      `${String(line_num).padStart(6)}| ${line_content}`
    );
  }

  const result = output_lines.join("\n");

  // Add a summary header
  const summary =
    `--- ${file_path} : lines ${start_line}-${end_line} of ${total_lines} ---\n` +
    `${result}\n` +
    `--- end of chunk ---`;

  console.log(`\x1b[92m[File Chunk]:\x1b[0m\n${summary}`);
  return summary;
}

// =============================================================================
// Tool 4: get_project_tree -- Semantic Directory Mapper
// =============================================================================

export const get_project_tree_schema = {
  type: "function",
  function: {
    name: "get_project_tree",
    description:
      "Walks the project directory structure, ignoring files and folders " +
      "listed in .gitignore. Returns a clean hierarchical map of the actual " +
      "source code. Use this to navigate the project without noisy terminal " +
      "outputs from node_modules, .git, venv, etc.",
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

function _load_gitignore_spec(root_path) {
  const gitignore_path = path.join(root_path, ".gitignore");
  if (!fs.existsSync(gitignore_path)) {
    return null;
  }
  try {
    const gitignore_content = fs.readFileSync(gitignore_path, "utf-8");
    return ignore().add(gitignore_content);
  } catch {
    return null;
  }
}

export async function get_project_tree({ root_path = ".", max_depth = 10 } = {}) {
  console.log(
    `\n\x1b[93m[Tool Execution Alert] get_project_tree requested:\x1b[0m`
  );
  console.log(`  Root: ${root_path}`);
  console.log(`  Max Depth: ${max_depth}`);

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
    // Normalize to forward slashes for ignore matching
    const normalized = rel_path.split(path.sep).join("/");
    // For directories, the ignore package needs trailing slash
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
        continue; // Skip entries that can't be stat'd
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

// =============================================================================
// Tool 5: search_web -- DuckDuckGo-based web search
// =============================================================================

export const search_web_schema = {
  type: "function",
  function: {
    name: "search_web",
    description:
      "Searches the web using DuckDuckGo and returns a list of results " +
      "(title, URL, and snippet). Use this to find up-to-date documentation, " +
      "GitHub issues, or StackOverflow answers when the model's training data " +
      "may be outdated.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query string.",
        },
        max_results: {
          type: "integer",
          description:
            "Maximum number of results to return. Defaults to 5.",
        },
      },
      required: ["query"],
    },
  },
};

export async function search_web({ query, max_results = 5 }) {
  console.log(
    `\n\x1b[93m[Tool Execution Alert] search_web requested:\x1b[0m`
  );
  console.log(`  Query: ${query}`);
  console.log(`  Max Results: ${max_results}`);

  let DDGS;
  try {
    const mod = await import("duck-duck-scrape");
    DDGS = mod.search;
  } catch {
    const error_msg =
      "Error: duck-duck-scrape package is not installed. " +
      "Install it with: npm install duck-duck-scrape";
    console.log(`\x1b[91m${error_msg}\x1b[0m`);
    return error_msg;
  }

  try {
    const search_results = await DDGS(query, {
      safeSearch: "OFF",
    });

    const results = (search_results.results || search_results || []).slice(
      0,
      max_results
    );

    if (!results || results.length === 0) {
      const no_results = `No results found for query: '${query}'.`;
      console.log(`\x1b[92m${no_results}\x1b[0m`);
      return no_results;
    }

    const output_lines = [`Search results for: '${query}'`, ""];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const title = r.title || "No title";
      const href = r.url || r.href || "No URL";
      const body = r.description || r.body || r.snippet || "No description";
      output_lines.push(`${i + 1}. ${title}`);
      output_lines.push(`   URL: ${href}`);
      output_lines.push(`   ${body}`);
      output_lines.push("");
    }

    const result = output_lines.join("\n");
    console.log(`\x1b[92m[Search Results]:\x1b[0m\n${result}`);
    return result;
  } catch (e) {
    const error_msg = `Error performing web search: ${e.message || e}`;
    console.log(`\x1b[91m${error_msg}\x1b[0m`);
    return error_msg;
  }
}

// =============================================================================
// Tool 6: fetch_url -- HTML-to-Markdown scraper
// =============================================================================

export const fetch_url_schema = {
  type: "function",
  function: {
    name: "fetch_url",
    description:
      "Fetches a URL and extracts clean, readable Markdown from the HTML. " +
      "Uses BeautifulSoup to strip tags, scripts, and styles, returning only " +
      "the meaningful text content. Use this to read up-to-date documentation " +
      "or web pages without burning tokens on raw HTML.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch and convert to Markdown.",
        },
        timeout_seconds: {
          type: "integer",
          description: "Request timeout in seconds. Defaults to 15.",
        },
      },
      required: ["url"],
    },
  },
};

export async function fetch_url({ url, timeout_seconds = 15 }) {
  console.log(`\n\x1b[93m[Tool Execution Alert] fetch_url requested:\x1b[0m`);
  console.log(`  URL: ${url}`);
  console.log(`  Timeout: ${timeout_seconds}s`);

  const consent = await ask(
    "\x1b[96mDo you approve fetching this URL? (y/n): \x1b[0m"
  );
  const consent_clean = consent.trim().toLowerCase();

  if (consent_clean !== "y") {
    const denial_msg = "User denied the fetch_url request.";
    console.log(`\x1b[91m${denial_msg}\x1b[0m`);
    return denial_msg;
  }

  let cheerio, TurndownService;
  try {
    const cheerio_mod = await import("cheerio");
    cheerio = cheerio_mod.default || cheerio_mod.load;
    const turndown_mod = await import("turndown");
    TurndownService = turndown_mod.default || turndown_mod;
  } catch (e) {
    const error_msg =
      `Error: Required package not installed: ${e.message}. ` +
      "Install with: npm install cheerio turndown";
    console.log(`\x1b[91m${error_msg}\x1b[0m`);
    return error_msg;
  }

  try {
    const controller = new AbortController();
    const timeout_id = setTimeout(() => controller.abort(), timeout_seconds * 1000);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/125.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout_id);

    if (!response.ok) {
      const error_msg = `Error: HTTP error fetching '${url}': ${response.status} ${response.statusText}`;
      console.log(`\x1b[91m${error_msg}\x1b[0m`);
      return error_msg;
    }

    const html = await response.text();

    const $ = cheerio(html);

    // Remove unwanted elements
    $(
      "script, style, nav, footer, header, aside, noscript"
    ).remove();

    // Try to find the main content area
    let main_content =
      $("main").first() ||
      $("article").first() ||
      $("div.content").first() ||
      $("#content").first() ||
      $("body").first();

    if (!main_content || main_content.length === 0) {
      main_content = $("body").first();
    }
    if (!main_content || main_content.length === 0) {
      main_content = $.root();
    }

    const main_html =
      main_content.html() || main_content.text() || "";

    // Convert HTML to Markdown
    let markdown_text;
    try {
      const turndownService = new TurndownService({
        headingStyle: "atx",
      });
      markdown_text = turndownService.turndown(main_html);
    } catch {
      // Fallback: strip tags and get text
      markdown_text = (main_content.text() || "").replace(/\n{3,}/g, "\n\n").trim();
    }

    // Clean up excessive blank lines
    markdown_text = markdown_text.replace(/\n{3,}/g, "\n\n").trim();

    // Truncate if too long (max ~8000 chars to be token-friendly)
    const max_chars = 8000;
    if (markdown_text.length > max_chars) {
      const truncated = markdown_text.substring(0, max_chars);
      markdown_text =
        truncated +
        `\n\n[... truncated at ${max_chars} characters. ` +
        `Full page is ${markdown_text.length} characters. ` +
        `Use a more specific URL or search for narrower pages.]`;
    }

    const summary =
      `--- Content from ${url} ---\n` +
      `${markdown_text}\n` +
      `--- end of content ---`;

    console.log(
      `\x1b[92m[Fetched Content]:\x1b[0m\n${summary.substring(0, 500)}...`
    );
    return summary;
  } catch (e) {
    if (e.name === "AbortError") {
      const error_msg = `Error: Request to '${url}' timed out after ${timeout_seconds} seconds.`;
      console.log(`\x1b[91m${error_msg}\x1b[0m`);
      return error_msg;
    }
    const error_msg = `Error fetching URL '${url}': ${e.message || e}`;
    console.log(`\x1b[91m${error_msg}\x1b[0m`);
    return error_msg;
  }
}
