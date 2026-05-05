// ---------------------------------------------------------------------------
// Batch tool execution — runs tool call handlers locally (NO model API calls).
//
// The orchestrator sends a SINGLE model API request; the model may respond
// with N tool_calls. This module executes all N tool handlers (consent tools
// sequentially, read-only tools concurrently), then the orchestrator makes
// ONE follow-up model API call with all results. This is NOT a per-tool API
// batching mechanism — it batches local tool execution only.
//
// Phases:
//   Phase 1 — Batch summary display
//   Phase 2 — Unified execution: consent tools serialized via lock,
//             read-only tools concurrent via Promise.all
// ---------------------------------------------------------------------------

import { resetAlertCounter } from "./template.js";
import { MUTATION_BLOCKED_TOOLS } from "../lib/orchestrator.js";

const W = 56; // separator width

/**
 * Parse a tool call object. Returns { name, args, parseError }.
 * If JSON parsing fails, parseError is set and args is null.
 */
function parseToolCall(tc) {
    const name = tc.function.name;
    try {
        const args = JSON.parse(tc.function.arguments);
        return { name, args, parseError: null };
    } catch (e) {
        console.error(`Error parsing arguments for tool '${name}':`, e);
        return { name, args: null, parseError: e.message || String(e) };
    }
}

/**
 * Truncate long string values for display.
 */
function truncate(v) {
    if (typeof v === "string" && v.length > 200) {
        return v.substring(0, 200) + "...";
    }
    return v;
}

/**
 * Print the pre-execution batch summary header.
 */
function printBatchSummary(parsed) {
    const count = parsed.length;
    console.log(`\n\x1b[90m${'═'.repeat(W)}\x1b[0m`);
    console.log(`\x1b[1;97m  Batch Tool Execution — ${count} tool(s)\x1b[0m`);
    console.log(`\x1b[90m${'═'.repeat(W)}\x1b[0m`);

    for (let i = 0; i < parsed.length; i++) {
        const { name, args, needsConsent } = parsed[i];
        const consentTag = needsConsent
            ? `\x1b[33m[consent required]\x1b[0m`
            : `\x1b[32m[read-only]\x1b[0m`;
        console.log(
            `\x1b[97m  #${i + 1}\x1b[0m  \x1b[93m${name}\x1b[0m  ${consentTag}`
        );
        for (const [key, value] of Object.entries(args || {})) {
            console.log(`\x1b[90m       ${key}:\x1b[0m ${JSON.stringify(truncate(value))}`);
        }
        if (i < parsed.length - 1) {
            console.log(`\x1b[90m  ${'·'.repeat(W - 4)}\x1b[0m`);
        }
    }
    console.log(`\x1b[90m${'═'.repeat(W)}\x1b[0m\n`);
}

/**
 * Print the post-execution batch summary footer.
 */
function printBatchFooter(count) {
    console.log(`\x1b[90m${'─'.repeat(W)}\x1b[0m`);
    console.log(`\x1b[32m  All ${count} tool(s) executed.\x1b[0m`);
    console.log(`\x1b[90m${'─'.repeat(W)}\x1b[0m\n`);
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

    // ---- Phase 2: Execute ----
    // Build one promise per tool (in original order). Consent tools run sequentially
    // via an internal async lock; read-only tools run concurrently.
    // All results are collected in original order — no post-hoc sort needed.
    let consentLock = Promise.resolve();
    const resultPromises = parsed.map((p) => {
        // JSON parse error → skip execution, return structured error
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

        // Missing from registry → return structured error
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
            if (p.name !== "execute_terminal_command" && isArtifactsPath(p.args)) {
                // Fall through — allowed
            } else {
                const blockedMsg =
                    "Blocked: File mutation and system execution are disabled in Plan Mode. " +
                    "Switch to Agent Mode (/agent) to proceed. " +
                    "(Writes to artifacts/ folder are allowed.)";
                console.log(`\x1b[91m  [Plan Mode] Blocked '${p.name}'\x1b[0m`);
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

        if (p.needsConsent) {
            // Chain onto consentLock so consent tools run one at a time
            const prev = consentLock;
            let releaseLock;
            consentLock = new Promise((resolve) => { releaseLock = resolve; });
            return prev.then(async () => {
                try {
                    const content = await handler(p.args);
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
        return (async () => {
            const content = await handler(p.args);
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

    printBatchFooter(tool_calls.length);

    return tool_calls.length;
}
