/**
 * Condenser Eligibility — Shared Logic
 *
 * Extracts the eligibility-selection and atomic-pair-alignment logic from
 * contextCondenser.js so it can be reused by both the original condenser
 * (deepseek-v4-flash fallback) and the new clone condenser
 * (orchestrator-model cache-hit path).
 *
 * @module lib/condenserEligibility
 */

import { estimateTokens } from "./tokenizer.js";

// ---------------------------------------------------------------------------
// Hyperparameters — Tuning knobs for the condensation feature
// ---------------------------------------------------------------------------

export const CONDENSER_HYPERPARAMETERS = {
    threshold: 0.7,
    maxRetries: 1,
    preserveTailCount: 5,
    temperature: 0.1,
    maxTokensRatio: 0.1,
    maxTokensCap: 20000,
};

// ---------------------------------------------------------------------------
// Schema Validation
// ---------------------------------------------------------------------------

/**
 * Validates that a parsed condenser response conforms to the expected schema.
 * Throws on first missing required field.
 *
 * @param {unknown} parsed - The parsed JSON value.
 * @returns {asserts parsed is object}
 */
export function validateCondenserSchema(parsed) {
    if (!parsed || typeof parsed !== "object") {
        throw new Error("Schema validation failed: response is not a non-null object");
    }
    const obj = /** @type {Record<string, unknown>} */ (parsed);

    const required = [
        "condensed_at",
        "original_message_count",
        "conversation_summary",
        "key_decisions",
        "files_affected",
        "user_preferences",
        "unresolved_items",
        "reasoning_chain",
    ];
    for (const field of required) {
        if (!(field in obj)) {
            throw new Error(`Schema validation failed: missing required field "${field}"`);
        }
    }

    // Validate nested structure for files_affected
    const fa = obj.files_affected;
    if (!fa || typeof fa !== "object") {
        throw new Error('Schema validation failed: "files_affected" is not an object');
    }
    for (const sub of ["created", "modified", "deleted"]) {
        if (!(sub in fa) || !Array.isArray(fa[sub])) {
            throw new Error(`Schema validation failed: "files_affected.${sub}" is not an array`);
        }
    }

    // Validate arrays
    for (const arrField of ["key_decisions", "user_preferences", "unresolved_items", "reasoning_chain", "architecture_decisions", "rejected_approaches"]) {
        if (arrField in obj && !Array.isArray(obj[arrField])) {
            throw new Error(`Schema validation failed: "${arrField}" is not an array`);
        }
    }
}

// ---------------------------------------------------------------------------
// Input Builder
// ---------------------------------------------------------------------------

/**
 * Builds a plain-text representation of messages for the condenser.
 * Strips reasoning_content to keep the input lean.
 *
 * @param {Array} messages - Slice of conversation messages to format
 * @returns {string} Formatted input string
 */
export function buildCondenserInput(messages) {
    return messages
        .map((msg) => {
            const role = msg.role || "unknown";
            let content = "";
            if (typeof msg.content === "string") {
                content = msg.content;
            } else if (msg.content) {
                content = JSON.stringify(msg.content);
            }
            // If assistant had tool_calls, include a summary
            if (msg.role === "assistant" && msg.tool_calls) {
                const toolNames = msg.tool_calls.map((tc) => tc.function?.name || "unknown").join(", ");
                content += `\n[Tool calls: ${toolNames}]`;
            }
            // If tool result, note the tool_call_id
            if (msg.role === "tool" && msg.tool_call_id) {
                content = `[Result for tool_call ${msg.tool_call_id}]: ${content}`;
            }
            return `[${role.toUpperCase()}]: ${content}`;
        })
        .join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Eligibility Selection
// ---------------------------------------------------------------------------

/**
 * Finds eligible message indices for condensation.
 *
 * **Eligibility rules:**
 * - Skips the system prompt (index 0)
 * - Skips messages already tagged `condensed: true`
 * - Skips the **last user message** (always preserve current input verbatim)
 * - Applies atomic pair alignment (tool_call ↔ tool results are indivisible)
 * - Takes the oldest 50% (by count) of remaining eligible messages
 * - Expands atomic pairs at the boundaries so paired messages are never orphaned
 *
 * @param {Array} messages - Full conversation messages array
 * @param {number} [preserveTailCount=5] - Number of trailing messages to protect
 * @returns {{ targetIndices: number[], eligibleStart: number, eligibleEnd: number } | null}
 *          Returns null if no eligible messages found.
 */
export function findEligibleIndices(messages, preserveTailCount = 5) {
    // --- Find the last user message index ---
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.role === "user") {
            lastUserIdx = i;
            break;
        }
    }

    if (lastUserIdx < 1) {
        return null; // No user message found
    }

    // Calculate eligible range (stop preserveTailCount before the end)
    const eligibleEndExclusive = messages.length - 1 - preserveTailCount;
    if (eligibleEndExclusive < 1) {
        return null; // All messages are in the safe zone
    }

    // Collect eligible indices
    let eligibleIndices = [];
    for (let i = 1; i <= eligibleEndExclusive; i++) {
        if (messages[i]?.condensed === true) continue;
        if (i === lastUserIdx) continue;
        eligibleIndices.push(i);
    }

    if (eligibleIndices.length === 0) {
        return null;
    }

    // --- Atomic pair alignment (downward-safe) ---
    const eligibleSet = new Set(eligibleIndices);
    const alignedEligible = [];
    for (const idx of eligibleIndices) {
        const msg = messages[idx];
        const hasToolCalls = msg?.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
        if (hasToolCalls) {
            const toolCallIds = new Set(msg.tool_calls.map(tc => tc.id));
            let allToolResultsInEligible = true;
            let scanIdx = idx + 1;
            while (
                scanIdx < messages.length &&
                messages[scanIdx]?.role === "tool" &&
                messages[scanIdx]?.tool_call_id &&
                toolCallIds.has(messages[scanIdx].tool_call_id)
            ) {
                if (!eligibleSet.has(scanIdx)) {
                    allToolResultsInEligible = false;
                    break;
                }
                scanIdx++;
            }
            if (!allToolResultsInEligible) {
                continue;
            }
        }

        // Reverse check: if tool message, ensure its paired assistant is eligible
        if (msg?.role === "tool" && msg?.tool_call_id) {
            const matchId = msg.tool_call_id;
            let foundParent = false;
            for (let scanIdx = idx - 1; scanIdx >= 0; scanIdx--) {
                const candidate = messages[scanIdx];
                if (candidate?.role === "assistant" && candidate?.tool_calls) {
                    if (candidate.tool_calls.some(tc => tc.id === matchId)) {
                        if (eligibleSet.has(scanIdx)) {
                            foundParent = true;
                        }
                        break;
                    }
                }
            }
            if (!foundParent) {
                continue;
            }
        }

        alignedEligible.push(idx);
    }

    if (alignedEligible.length === 0) {
        return null;
    }
    eligibleIndices = alignedEligible;

    // --- Take oldest 50% ---
    const halfCount = Math.max(1, Math.ceil(eligibleIndices.length / 2));
    const targetIndices = eligibleIndices.slice(0, halfCount);
    let eligibleStart = targetIndices[0];
    let eligibleEnd = targetIndices[targetIndices.length - 1];

    // --- Atomic pair expansion at boundaries ---
    // If last message has tool_calls, expand forward to include paired results
    const lastTargetMsg = messages[eligibleEnd];
    if (
        lastTargetMsg?.tool_calls &&
        Array.isArray(lastTargetMsg.tool_calls) &&
        lastTargetMsg.tool_calls.length > 0
    ) {
        const toolCallIds = new Set(lastTargetMsg.tool_calls.map(tc => tc.id));
        let expandIdx = eligibleEnd + 1;
        while (
            expandIdx < messages.length &&
            messages[expandIdx]?.role === "tool" &&
            messages[expandIdx]?.tool_call_id &&
            toolCallIds.has(messages[expandIdx].tool_call_id)
        ) {
            targetIndices.push(expandIdx);
            eligibleEnd = expandIdx;
            expandIdx++;
        }
    }

    // If first message is a tool result, expand backward
    const firstTargetMsg = messages[eligibleStart];
    if (
        firstTargetMsg?.role === "tool" &&
        firstTargetMsg?.tool_call_id
    ) {
        const matchId = firstTargetMsg.tool_call_id;
        for (let scanIdx = eligibleStart - 1; scanIdx >= 0; scanIdx--) {
            const candidate = messages[scanIdx];
            if (candidate?.role === "assistant" && candidate?.tool_calls) {
                if (candidate.tool_calls.some(tc => tc.id === matchId)) {
                    targetIndices.unshift(scanIdx);
                    eligibleStart = scanIdx;
                    break;
                }
            }
        }
    }

    return { targetIndices, eligibleStart, eligibleEnd };
}

// ---------------------------------------------------------------------------
// Splice Helpers
// ---------------------------------------------------------------------------

/**
 * Removes orphaned tool messages from a messages array.
 * Orphaned = tool result whose paired assistant (with tool_calls)
 * was condensed away.
 *
 * @param {Array} newMessages - Messages array to clean (mutated in-place)
 * @returns {number} Number of orphaned messages removed
 */
export function removeOrphanedToolMessages(newMessages) {
    const orphanedToolIds = new Set();
    for (let i = newMessages.length - 1; i >= 0; i--) {
        const m = newMessages[i];
        if (m?.role === "assistant" && m?.tool_calls) {
            for (const tc of m.tool_calls) {
                orphanedToolIds.delete(tc.id);
            }
        } else if (m?.role === "tool" && m?.tool_call_id) {
            if (!orphanedToolIds.has(m.tool_call_id)) {
                orphanedToolIds.add(m.tool_call_id);
            }
        }
    }

    if (orphanedToolIds.size === 0) return 0;

    const removed = [];
    for (let i = newMessages.length - 1; i >= 0; i--) {
        const m = newMessages[i];
        if (m?.role === "tool" && m?.tool_call_id && orphanedToolIds.has(m.tool_call_id)) {
            removed.push({ index: i, tool_call_id: m.tool_call_id });
            newMessages.splice(i, 1);
        }
    }

    if (removed.length > 0) {
        console.warn(
            `[Condenser Eligibility] Safety net: removed ${removed.length} orphaned tool message(s). ` +
            `IDs: ${removed.map(r => r.tool_call_id).join(", ")}`
        );
    }

    return removed.length;
}

/**
 * Calculates token stats for a condensation operation.
 *
 * @param {Array} originalSlice - The messages that were condensed
 * @param {object} condensedMsg - The new condensed message
 * @param {number} targetCount - Number of original messages condensed
 * @returns {{ originalCount: number, newCount: number, tokenReduction: number, originalTokens: number, newTokens: number }}
 */
export function calculateCondensationStats(originalSlice, condensedMsg, targetCount) {
    const originalTokens = estimateTokens(originalSlice, "", 1.5).total_tokens;
    const newTokens = estimateTokens([condensedMsg], "", 1.5).total_tokens;

    return {
        originalCount: targetCount,
        newCount: 1,
        tokenReduction: originalTokens - newTokens,
        originalTokens,
        newTokens,
    };
}
