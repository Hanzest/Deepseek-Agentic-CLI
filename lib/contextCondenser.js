/**
 * Context Condenser — Core Engine (refactored)
 *
 * Identifies eligible conversation messages, spawns a deepseek-v4-flash model
 * to distill them into structured JSON, and replaces the chunk with a single
 * condensed message tagged `condensed: true`.
 *
 * Eligibility logic is shared via lib/condenserEligibility.js and reused
 * by the clone condenser (lib/cloneCondenser.js).
 *
 * @module lib/contextCondenser
 */

import { CONDENSER_SYSTEM_PROMPT } from "./condenserPrompt.js";
import { estimateTokens } from "./tokenizer.js";
import {
    CONDENSER_HYPERPARAMETERS,
    findEligibleIndices,
    buildCondenserInput,
    validateCondenserSchema,
    removeOrphanedToolMessages,
    calculateCondensationStats,
} from "./condenserEligibility.js";

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
    const threshold = options.threshold ?? CONDENSER_HYPERPARAMETERS.threshold;
    const maxRetries = options.maxRetries ?? CONDENSER_HYPERPARAMETERS.maxRetries;
    const preserveTailCount = options.preserveTailCount ?? CONDENSER_HYPERPARAMETERS.preserveTailCount;

    // --- Step 1: Threshold check ---
    const currentTokens = estimateTokens(messages, "", 1.5).total_tokens;
    if (currentTokens < tokenLimit * threshold) {
        return null; // No condensation needed
    }

    // --- Step 2: Find eligible indices (shared logic) ---
    const eligibility = findEligibleIndices(messages, preserveTailCount);
    if (!eligibility) {
        return null; // No eligible messages
    }

    const { targetIndices, eligibleStart, eligibleEnd } = eligibility;

    // --- Step 3: Build condenser input ---
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

    // --- Step 4: Call the condenser model with retry ---
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await client.chat.completions.create({
                model: modelName,
                messages: [
                    { role: "system", content: CONDENSER_SYSTEM_PROMPT },
                    { role: "user", content: condenserInput },
                ],
                max_tokens: Math.min(CONDENSER_HYPERPARAMETERS.maxTokensCap, Math.floor(tokenLimit * CONDENSER_HYPERPARAMETERS.maxTokensRatio)),
                stream: false,
                temperature: CONDENSER_HYPERPARAMETERS.temperature,
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

            validateCondenserSchema(parsed);

            // --- Step 5: Build condensed message and splice ---
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

            // Safety net: remove any orphaned tool messages
            removeOrphanedToolMessages(newMessages);

            // Calculate stats
            const stats = calculateCondensationStats(
                messages.slice(eligibleStart, eligibleEnd + 1),
                condensedMsg,
                targetIndices.length
            );

            return {
                condensed: parsed,
                newMessages,
                stats,
            };
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                const backoffMs = 1000 * (attempt + 1); // 1s, 2s, ...
                console.warn(`[Context Condenser] Attempt ${attempt + 1}/${maxRetries + 1} failed. Retrying in ${backoffMs}ms...`);
                await sleep(backoffMs);
            }
        }
    }

    // All retries exhausted
    console.warn(
        `[Context Condenser] All ${maxRetries + 1} attempt(s) exhausted. Last error: ${lastError?.message || "Unknown"}. Falling back to sliding-window splice.`
    );
    return null;
}

// Re-export shared constants for external consumers
export { CONDENSER_HYPERPARAMETERS } from "./condenserEligibility.js";
