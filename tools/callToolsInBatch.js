// ---------------------------------------------------------------------------
// Batch tool execution - runs tool call handlers locally (NO model API calls).
//
// The orchestrator sends a SINGLE model API request; the model may respond
// with N tool_calls. This module executes all N tool handlers (consent tools
// sequentially, read-only tools concurrently), then the orchestrator makes
// ONE follow-up model API call with all results. This is NOT a per-tool API
// batching mechanism - it batches local tool execution only.
//
// Phases:
//   Phase 1 - Batch summary display
//   Phase 2 - Unified execution: consent tools serialized via lock,
//             read-only tools concurrent via Promise.all
//   Phase 3 - Progress indicators with per-tool timing (Item 8)
// ---------------------------------------------------------------------------

import { resetAlertCounter } from "./template.js";
import { MUTATION_BLOCKED_TOOLS } from "../lib/orchestrator.js";
import { C, colorize } from "../lib/colors.js";

const READ_ONLY_CACHED_TOOLS = new Set([
    "get_project_tree",
    "read_file_chunk",
    "multi_file_search_string"
]);

const readOnlyCache = new Map();

export function clearReadOnlyCache() {
    readOnlyCache.clear();
}

function isSafePlanModeCommand(command) {
    if (!command) return false;
    const trimmed = command.trim();
    // Allow basic git status / git diff
    if (/^git\s+(status|diff)(\s+|$)/i.test(trimmed)) {
        return true;
    }
    // Allow commands redirecting to artifacts/ directory
    if (/>+?\s*artifacts[\/\\]/i.test(trimmed)) {
        return true;
    }
    return false;
}

const W = 56; // separator width

/**
 * Attempts to repair a truncated JSON string by closing unterminated strings
 * and balancing braces/brackets. Returns repaired JSON or null if irreparable.
 */
function repairTruncatedJSON(rawArgs) {
    try {
        let repaired = rawArgs;

        // 1. Close unterminated string values: find the last occurrence of ":
        //    (colon followed by opening quote) and close the string if it was
        //    not properly terminated.
        const lastColonQuote = repaired.lastIndexOf('": "');
        if (lastColonQuote !== -1) {
            const afterColonQuote = repaired.substring(lastColonQuote + 4);
            // If there are no more closing quotes after this point (except possibly
            // at the very end), the string value is unterminated
            const remainingQuotes = afterColonQuote.match(/"/g);
            if (!remainingQuotes || remainingQuotes.length === 0) {
                repaired = repaired + '"';
            }
        }

        // 2. Balance braces
        let openBraces = 0;
        let openBrackets = 0;
        let inString = false;
        let escapeNext = false;
        for (const ch of repaired) {
            if (escapeNext) { escapeNext = false; continue; }
            if (ch === '\\') { escapeNext = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') openBraces++;
            if (ch === '}') openBraces--;
            if (ch === '[') openBrackets++;
            if (ch === ']') openBrackets--;
        }
        // Close any unclosed string at the end (brace/bracket counting may be
        // off if string was unterminated)
        if (inString) repaired = repaired + '"';

        // Append missing closing braces/brackets
        repaired = repaired + '}'.repeat(Math.max(0, openBraces));
        repaired = repaired + ']'.repeat(Math.max(0, openBrackets));

        // 3. Try parsing
        const args = JSON.parse(repaired);
        return args;
    } catch (_) {
        return null;
    }
}

/**
 * Parse a tool call object. Returns { name, args, parseError }.
 * If JSON parsing fails, parseError is set and args is null.
 */
function parseToolCall(tc) {
    const name = tc.function.name;
    try {
        let rawArgs = tc.function.arguments.trim();
        // Strip markdown code fences Gemini may hallucinate
        rawArgs = rawArgs.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/, '');
        // Strip zero-width/invisible characters that trip JSON.parse
        rawArgs = rawArgs.replace(/[\u200B-\u200D\uFEFF]/g, '');
        const args = JSON.parse(rawArgs);
        return { name, args, parseError: null };
    } catch (e) {
        // Attempt auto-repair for truncated/malformed JSON (e.g. large file writes)
        const repaired = repairTruncatedJSON(tc.function.arguments.trim()
            .replace(/^```(?:json)?\s*\n?/i, '')
            .replace(/\n?\s*```\s*$/, '')
            .replace(/[\u200B-\u200D\uFEFF]/g, ''));
        if (repaired) {
            console.warn(colorize(
                `[Auto-Repair] Arguments for '${name}' were truncated/malformed. JSON was auto-repaired (content beyond truncation point is lost).`,
                C.warning
            ));
            return { name, args: repaired, parseError: null };
        }
        console.error(colorize(`Error parsing arguments for tool '${name}':`, C.error), e);
        return { name, args: null, parseError: e.message || String(e) };
    }
}

function truncate(v) {
    if (typeof v === "string" && v.length > 200) {
        return v.substring(0, 200) + "...";
    }
    return v;
}

function printBatchSummary(parsed) {
    const count = parsed.length;
    console.log(colorize(`\n${'═'.repeat(W)}`, C.border));
    console.log(colorize(`  Batch Tool Execution - ${count} tool(s)`, C.heading));
    console.log(colorize(`${'═'.repeat(W)}`, C.border));

    for (let i = 0; i < parsed.length; i++) {
        const { name, args, needsConsent } = parsed[i];
        const consentTag = needsConsent
            ? colorize("[consent required]", C.alert)
            : colorize("[read-only]", C.success);
        console.log(
            `${colorize(`  #${i + 1}`, C.heading)}  ${colorize(name, C.tool)}  ${consentTag}`
        );
        for (const [key, value] of Object.entries(args || {})) {
            console.log(`${colorize(`       ${key}:`, C.dim)} ${JSON.stringify(truncate(value))}`);
        }
        if (i < parsed.length - 1) {
            console.log(colorize(`  ${'·'.repeat(W - 4)}`, C.border));
        }
    }
    console.log(colorize(`${'═'.repeat(W)}`, C.border) + "\n");
}

function printBatchFooter(count, timings) {
    console.log(colorize(`${'─'.repeat(W)}`, C.border));
    if (timings && timings.length > 0) {
        for (const t of timings) {
            const ms = t.ms === 0 ? "cached" :
                t.ms < 1 ? `${(t.ms * 1000).toFixed(0)}μs` :
                t.ms < 1000 ? `${t.ms.toFixed(1)}ms` :
                    `${(t.ms / 1000).toFixed(1)}s`;
            console.log(colorize(`  [done] ${t.name} (${ms})`, C.success));
        }
        console.log(colorize(`${'─'.repeat(W)}`, C.border));
    }
    console.log(colorize(`  All ${count} tool(s) executed.`, C.success));
    console.log(colorize(`${'─'.repeat(W)}`, C.border) + "\n");
}

/**
 * Checks whether a file-mutation tool targets a path inside the artifacts/
 * folder (safe workspace). If so, the tool is allowed even in Plan Mode.
 */
function isArtifactsPath(args) {
    const filePath = args?.file_path || "";
    // Normalize to forward slashes for reliable comparison
    const normalized = filePath.replace(/\\/g, "/");
    return normalized.startsWith("artifacts/") || normalized.startsWith("artifacts\\") || filePath === "artifacts";
}

function compressToolResult(toolName, content) {
    if (typeof content !== "string") return content;

    if (toolName === "get_project_tree" && content.length > 10000) {
        const truncated = content.substring(0, 10000);
        const warning = `\n\n... [TRUNCATED 10,000+ characters. Tool output is too large. Consider searching specific subdirectories or using search tools.]`;
        console.log(colorize(`  [UX Alert] Truncated get_project_tree output (${content.length} -> 10,000 chars)`, C.warning));
        return truncated + warning;
    }

    if (toolName === "fetch_url" && content.length > 5000) {
        const keep = 2500;
        const prefix = content.substring(0, keep);
        const suffix = content.substring(content.length - keep);
        const msg = `\n\n... [TRUNCATED ${content.length - 2 * keep} characters in the middle for brevity] ...\n\n`;
        console.log(colorize(`  [UX Alert] Truncated fetch_url output (${content.length} -> 5,000 chars)`, C.warning));
        return prefix + msg + suffix;
    }

    if (toolName === "execute_terminal_command" && content.length > 4000) {
        const keep = 2000;
        const prefix = content.substring(0, keep);
        const suffix = content.substring(content.length - keep);
        const msg = `\n\n... [TRUNCATED ${content.length - 2 * keep} characters in the middle for brevity] ...\n\n`;
        console.log(colorize(`  [UX Alert] Truncated execute_terminal_command output (${content.length} -> 4,000 chars)`, C.warning));
        return prefix + msg + suffix;
    }

    if (toolName === "multi_file_search_string" && content.length > 6000) {
        const keepPrefix = 4000;
        const keepSuffix = 2000;
        const prefix = content.substring(0, keepPrefix);
        const suffix = content.substring(content.length - keepSuffix);
        const msg = `\n\n... [TRUNCATED ${content.length - (keepPrefix + keepSuffix)} characters in the middle for brevity] ...\n\n`;
        console.log(colorize(`  [UX Alert] Truncated multi_file_search_string output (${content.length} -> 6,000 chars)`, C.warning));
        return prefix + msg + suffix;
    }

    return content;
}

/**
 * Executes tool calls in batch with clear visual separation.
 *
 * Consent-required tools run SEQUENTIALLY (one at a time) so their
 * alerts and consent prompts never interleave. Read-only tools run
 * CONCURRENTLY for performance.
 *
 * @param {Array} tool_calls - Array of tool call objects from the model response
 * @param {Object} TOOL_REGISTRY - Each entry: [schema, wrappedHandler, needsConsent]
 * @param {Array} messages - Conversation messages array (mutated in-place)
 * @param {string} [agentMode="agent"] - "plan" blocks mutation/execution tools (artifacts/ exempt)
 * @returns {number} Number of tool calls executed
 */
export async function callToolsInBatch(tool_calls, TOOL_REGISTRY, messages, agentMode = "agent") {
    if (!tool_calls || tool_calls.length === 0) return 0;

    const parsed = tool_calls.map((tc) => {
        const { name, args, parseError } = parseToolCall(tc);
        const [, , needsConsent] = TOOL_REGISTRY[name] || [];
        return { id: tc.id, name, args, parseError, needsConsent: !!needsConsent };
    });

    // ---- Phase 1: Batch summary ----
    resetAlertCounter();
    printBatchSummary(parsed);

    const executableCount = parsed.filter(p => !p.parseError && TOOL_REGISTRY[p.name]).length;
    console.log(colorize(`  Executing ${executableCount} tool(s) concurrently...`, C.system));
    const timings = [];

    // ---- Phase 2: Execute ----
    // Build one promise per tool (in original order). Consent tools run sequentially
    // via an internal async lock; read-only tools run concurrently.
    // All results are collected in original order - no post-hoc sort needed.
    let consentLock = Promise.resolve();
    const resultPromises = parsed.map((p, index) => {
        if (p.parseError) {
            return {
                role: "tool",
                tool_call_id: p.id,
                name: p.name,
                content: JSON.stringify({
                    error: true,
                    tool: p.name,
                    message: `Failed to parse arguments: ${p.parseError}`,
                }),
            };
        }

        if (!TOOL_REGISTRY[p.name]) {
            return {
                role: "tool",
                tool_call_id: p.id,
                name: p.name,
                content: JSON.stringify({
                    error: true,
                    tool: p.name,
                    message: `Tool '${p.name}' does not exist in the registry.`,
                }),
            };
        }

        const [, handler] = TOOL_REGISTRY[p.name];

        // ---- Plan Mode gate: block mutation/execution tools (artifacts/ exempt) ----
        if (agentMode === "plan" && MUTATION_BLOCKED_TOOLS.has(p.name)) {
            // Allow writes into artifacts/ folder (safe workspace for plans)
            const isSafeTerminal = p.name === "execute_terminal_command" && isSafePlanModeCommand(p.args?.command);
            if ((p.name !== "execute_terminal_command" && isArtifactsPath(p.args)) || isSafeTerminal) {
            } else {
                const blockedMsg =
                    "Blocked: File mutation and system execution are disabled in Plan Mode. " +
                    "Switch to Agent Mode (/agent) to proceed. " +
                    "(Writes to artifacts/ folder are allowed.)";
                console.log(colorize(`  [Plan Mode] Blocked '${p.name}'`, C.error));
                return {
                    role: "tool",
                    tool_call_id: p.id,
                    name: p.name,
                    content: JSON.stringify({
                        error: true,
                        tool: p.name,
                        message: blockedMsg,
                    }),
                };
            }
        }

        const timedHandler = async () => {
            if (MUTATION_BLOCKED_TOOLS.has(p.name)) {
                clearReadOnlyCache();
            }
            if (p.name === "read_file_chunk" && p.args?.file_path) {
                const normalized = p.args.file_path.replace(/\\/g, "/");
                const m = normalized.match(/docs\/skills\/([^\/]+)\/SKILL\.md/i);
                if (m) {
                    const domain = m[1].toUpperCase();
                    console.log(colorize(`\n  📘 [Skill] Applied ${domain} domain principles from ${p.args.file_path}\n`, C.success));
                }
            }
            const start = performance.now();
            let result = await handler(p.args);
            const ms = performance.now() - start;
            timings.push({ name: p.name, ms, index });
            result = compressToolResult(p.name, result);
            return result;
        };

        if (p.needsConsent) {
            // Chain onto consentLock so consent tools run one at a time
            const prev = consentLock;
            let releaseLock;
            consentLock = new Promise((resolve) => { releaseLock = resolve; });
            return prev.then(async () => {
                try {
                    const content = await timedHandler();
                    return {
                        role: "tool",
                        tool_call_id: p.id,
                        name: p.name,
                        content,
                    };
                } finally {
                    releaseLock();
                }
            });
        }

        // Read-only tool → run immediately (concurrent with other read-only tools)
        if (READ_ONLY_CACHED_TOOLS.has(p.name)) {
            const cacheKey = `${p.name}:${JSON.stringify(p.args)}`;
            return (async () => {
                if (readOnlyCache.has(cacheKey)) {
                    const cachedResult = readOnlyCache.get(cacheKey);
                    timings.push({ name: p.name, ms: 0, index });
                    return {
                        role: "tool",
                        tool_call_id: p.id,
                        name: p.name,
                        content: cachedResult,
                    };
                }
                const content = await timedHandler();
                readOnlyCache.set(cacheKey, content);
                return {
                    role: "tool",
                    tool_call_id: p.id,
                    name: p.name,
                    content,
                };
            })();
        }

        return (async () => {
            const content = await timedHandler();
            return {
                role: "tool",
                tool_call_id: p.id,
                name: p.name,
                content,
            };
        })();
    });

    const results = await Promise.all(resultPromises);
    for (const entry of results) {
        messages.push(entry);
    }

    timings.sort((a, b) => a.index - b.index);

    printBatchFooter(tool_calls.length, timings);

    return tool_calls.length;
}
