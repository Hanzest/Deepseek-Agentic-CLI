/**
 * Context Condenser — Core Engine
 *
 * Identifies eligible conversation messages, spawns a deepseek-v4-flash model
 * to distill them into structured JSON, and replaces the chunk with a single
 * condensed message tagged `condensed: true`.
 *
 * @module lib/contextCondenser
 */

import { CONDENSER_SYSTEM_PROMPT } from "./condenserPrompt.js";
import { estimateTokens } from "./tokenizer.js";

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Validates that a parsed condenser response conforms to the expected schema.
 * Throws on first missing required field.
 *
 * @param {unknown} parsed - The parsed JSON value.
 * @returns {asserts parsed is object}
 */
function validateSchema(parsed) {
    if (!parsed || typeof parsed !== "object") {
        throw new Error("Schema validation failed: response is not a non-null object");
    }
    const obj = /** @type {Record<string, unknown>} */ (parsed);

    const required = [
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

/**
 * Builds the input string for the condenser from an array of messages.
 * Strips reasoning_content to keep the input lean.
 *
 * @param {Array} messages - Slice of conversation messages to condense
 * @returns {string} Formatted input for the condenser
 */
function buildCondenserInput(messages) {
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
// Main Export
// ---------------------------------------------------------------------------

/**
 * Attempts to condense the oldest 50% of eligible non-condensed messages into
 * a single structured JSON message using a lightweight deepseek-v4-flash call.
 *
 * **Eligibility rules:**
 * - Skips the system prompt (index 0)
 * - Skips messages already tagged `condensed: true`
 * - Skips the **last user message** (always preserve current input verbatim)
 * - Takes the oldest 50% (by count) of remaining eligible messages
 *
 * **Error handling:**
 * - Retries up to `maxRetries` times with exponential backoff (1s, 2s, ...)
 * - Validates the JSON response against the expected schema
 * - Returns `null` on any failure → caller falls back to sliding-window splice
 *
 * @param {Array} messages - Full conversation messages array (mutated in-place)
 * @param {number} tokenLimit - Total token budget (e.g. HYPERPARAMETERS.token_limit)
 * @param {import("openai").default} client - OpenAI client instance
 * @param {string} modelName - Model to use (e.g. "deepseek-v4-flash")
 * @param {Object} [options]
 * @param {number} [options.threshold=0.65] - Token ratio to trigger condensation
 * @param {number} [options.maxRetries=2] - Number of API retries on failure
 * @returns {Promise<{condensed: Object, newMessages: Array, stats: {originalCount: number, newCount: number, tokenReduction: number, originalTokens: number, newTokens: number}} | null>}
 */
export async function condenseMessages(messages, tokenLimit, client, modelName, options = {}) {
    const threshold = options.threshold ?? 0.65;
    const maxRetries = options.maxRetries ?? 2;

    // --- Step 1: Threshold check ---
    const currentTokens = estimateTokens(messages, "", 1.5).total_tokens;
    if (currentTokens < tokenLimit * threshold) {
        return null; // No condensation needed
    }

    // --- Step 2: Find eligible messages ---
    // Skip system prompt (index 0), already-condensed messages, and the last user message
    let eligibleStart = -1;
    let eligibleEnd = -1;

    // Find the last user message index
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.role === "user") {
            lastUserIdx = i;
            break;
        }
    }

    // If no user message found, nothing to condense
    if (lastUserIdx <= 1) return null;

    // Collect eligible range: from index 1 (after system) up to (but not including) lastUserIdx
    // Exclude messages that are already condensed
    let eligibleIndices = [];
    for (let i = 1; i < lastUserIdx; i++) {
        if (messages[i]?.condensed === true) continue;
        eligibleIndices.push(i);
    }

    if (eligibleIndices.length === 0) {
        return null; // Everything is already condensed
    }

    // --- Step 3: Take oldest 50% of eligible messages ---
    const halfCount = Math.max(1, Math.ceil(eligibleIndices.length / 2));
    const targetIndices = eligibleIndices.slice(0, halfCount);
    eligibleStart = targetIndices[0];
    eligibleEnd = targetIndices[targetIndices.length - 1];

    // --- Step 4: Build condenser input ---
    const sliceToCondense = targetIndices.map((idx) => messages[idx]);
    const condenserInput = buildCondenserInput(sliceToCondense);

    // Estimate input tokens for the condenser call
    const inputTokens = estimateTokens(
        [
            { role: "system", content: CONDENSER_SYSTEM_PROMPT },
            { role: "user", content: condenserInput },
        ],
        "",
        1.5
    ).total_tokens;

    // --- Step 5: Call the condenser model with retry ---
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await client.chat.completions.create({
                model: modelName,
                messages: [
                    { role: "system", content: CONDENSER_SYSTEM_PROMPT },
                    { role: "user", content: condenserInput },
                ],
                max_tokens: Math.min(4096, Math.floor(tokenLimit * 0.05)),
                stream: false,
                temperature: 0.1,
            });

            const rawContent = response.choices?.[0]?.message?.content?.trim();
            if (!rawContent) {
                throw new Error("Empty response from condenser model");
            }

            let parsed;
            try {
                parsed = JSON.parse(rawContent);
            } catch (parseErr) {
                throw new Error(`JSON parse failed: ${parseErr.message}`);
            }

            validateSchema(parsed);

            // --- Step 6: Build condensed message and splice ---
            const condensedMsg = {
                role: "system",
                content: JSON.stringify(parsed),
                condensed: true,
            };

            // Build new messages array: everything before eligibleStart + condensed + everything after eligibleEnd
            const newMessages = [
                ...messages.slice(0, eligibleStart),
                condensedMsg,
                ...messages.slice(eligibleEnd + 1),
            ];

            // Calculate stats
            const originalTokens = estimateTokens(
                messages.slice(eligibleStart, eligibleEnd + 1),
                "",
                1.5
            ).total_tokens;

            const newTokens = estimateTokens([condensedMsg], "", 1.5).total_tokens;

            return {
                condensed: parsed,
                newMessages,
                stats: {
                    originalCount: targetIndices.length,
                    newCount: 1,
                    tokenReduction: originalTokens - newTokens,
                    originalTokens,
                    newTokens,
                },
            };
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                const backoffMs = 1000 * (attempt + 1); // 1s, 2s, ...
                await sleep(backoffMs);
            }
        }
    }

    // All retries exhausted
    return null;
}
