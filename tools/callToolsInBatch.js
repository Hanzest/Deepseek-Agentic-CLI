// ---------------------------------------------------------------------------
// Batch tool execution
// Runs tool calls in two phases:
//   Phase 1 — Batch summary display + sequential consent collection
//   Phase 2 — Concurrent execution of approved tools
// This prevents interleaved console output and stacked consent prompts.
// ---------------------------------------------------------------------------

import { resetAlertCounter } from "./template.js";

const W = 56; // separator width

/**
 * Parse a tool call object into { name, args }.
 */
function parseToolCall(tc) {
    const name = tc.function.name;
    let args;
    try {
        args = JSON.parse(tc.function.arguments);
    } catch(e) {
        console.error(`Error parsing arguments for tool '${tc.function.name}':`, e);
    }
    return { name, args };
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
        for (const [key, value] of Object.entries(args)) {
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
 * Executes tool calls in batch with clear visual separation.
 *
 * Consent-required tools run SEQUENTIALLY (one at a time) so their
 * alerts and consent prompts never interleave. Read-only tools run
 * CONCURRENTLY for performance.
 *
 * @param {Array} tool_calls - Array of tool call objects from the model response
 * @param {Object} TOOL_REGISTRY - Each entry: [schema, wrappedHandler, needsConsent]
 * @param {Array} messages - Conversation messages array (mutated in-place)
 * @returns {number} Number of tool calls executed
 */
export async function callToolsInBatch(tool_calls, TOOL_REGISTRY, messages) {
    if (!tool_calls || tool_calls.length === 0) return 0;

    const parsed = tool_calls.map((tc) => {
        const { name, args } = parseToolCall(tc);
        const [, , needsConsent] = TOOL_REGISTRY[name] || [];
        return { id: tc.id, name, args, needsConsent: !!needsConsent };
    });

    // ---- Phase 1: Batch summary ----
    resetAlertCounter();
    printBatchSummary(parsed);

    // ---- Phase 2: Execute ----
    // Consent tools run sequentially (one at a time) to avoid interleaved prompts.
    // Read-only tools run concurrently for performance.
    const results = [];

    // 2a. Consent-required tools → sequential
    for (const p of parsed) {
        if (!p.needsConsent) continue;
        if (!TOOL_REGISTRY[p.name]) {
            results.push({
                role: "tool",
                tool_call_id: p.id,
                name: p.name,
                content: `Error: Tool '${p.name}' does not exist in the registry.`
            });
            continue; // or return for read-only map
        }
        const [, handler] = TOOL_REGISTRY[p.name];
        // Each call triggers logAlert + consent prompt + execution (blocking per tool)
        const content = await handler(p.args);
        results.push({
            role: "tool",
            tool_call_id: p.id,
            name: p.name,
            content,
        });
    }

    // 2b. Read-only tools → concurrent
    const readOnlyPromises = parsed
        .filter((p) => !p.needsConsent)
        .map(async (p) => {
            if (!TOOL_REGISTRY[p.name]) {
                return {
                    role: "tool",
                    tool_call_id: p.id,
                    name: p.name,
                    content: `Error: Tool '${p.name}' does not exist in the registry.`
                };
            }
            const [, handler] = TOOL_REGISTRY[p.name];
            const content = await handler(p.args);
            return {
                role: "tool",
                tool_call_id: p.id,
                name: p.name,
                content,
            };
        });
    const readOnlyResults = await Promise.all(readOnlyPromises);
    results.push(...readOnlyResults);

    const orderMap = new Map();
    tool_calls.forEach((tc, idx) => orderMap.set(tc.id, idx));
    results.sort((a, b) => (orderMap.get(a.tool_call_id) ?? 0) - (orderMap.get(b.tool_call_id) ?? 0));
    for (const entry of results) {
        messages.push(entry);
    }

    printBatchFooter(tool_calls.length);

    return tool_calls.length;
}
