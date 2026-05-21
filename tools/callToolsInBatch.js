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
//   Phase 3 — Progress indicators with per-tool timing (Item 8)
// ---------------------------------------------------------------------------

import { resetAlertCounter } from "./template.js";
import { MUTATION_BLOCKED_TOOLS } from "../lib/orchestrator.js";
import { C, colorize } from "../lib/colors.js";

const W = 56; // separator width

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
    console.log(colorize(`  Batch Tool Execution — ${count} tool(s)`, C.heading));
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
            const ms = t.ms < 1 ? `${(t.ms * 1000).toFixed(0)}μs` :
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
    // All results are collected in original order — no post-hoc sort needed.
    let consentLock = Promise.resolve();
    const resultPromises = parsed.map((p, index) => {
        if (p.parseError) {
            return {
                role: "tool",
                tool_call_id: p.id,

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
                } else {
                const blockedMsg =
                    "Blocked: File mutation and system execution are disabled in Plan Mode. " +
                    "Switch to Agent Mode (/agent) to proceed. " +
                    "(Writes to artifacts/ folder are allowed.)";
                console.log(colorize(`  [Plan Mode] Blocked '${p.name}'`, C.error));
                return {
                    role: "tool",
                    tool_call_id: p.id,

                    content: JSON.stringify({
                        error: true,
                        tool: p.name,
                        message: blockedMsg,
                    }),
                };
            }
        }

        const timedHandler = async () => {
            const start = performance.now();
            const result = await handler(p.args);
            const ms = performance.now() - start;
            timings.push({ name: p.name, ms, index });
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

                        content,
                    };
                } finally {
                    releaseLock();
                }
            });
        }

        // Read-only tool → run immediately (concurrent with other read-only tools)
        return (async () => {
            const content = await timedHandler();
            return {
                role: "tool",
                tool_call_id: p.id,

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
