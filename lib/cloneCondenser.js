/**
 * Clone Condenser — Cache-Hit Optimized Condensation
 *
 * Instead of calling a separate deepseek-v4-flash model with a different
 * system prompt (which pays full cache_miss rates), this module clones the
 * orchestrator's conversation state, appends a synthetic "condense this"
 * user message, and calls the SAME orchestrator model.
 *
 * Because the system prompt prefix is identical to the orchestrator's last
 * API call, DeepSeek serves most input tokens from cache → ~50× cheaper
 * input tokens (cache_hit rate of $0.0028/M vs cache_miss $0.14/M).
 *
 * @module lib/cloneCondenser
 */

import { estimateTokens } from "./tokenizer.js";
import {
    CONDENSER_HYPERPARAMETERS,
    findEligibleIndices,
    validateCondenserSchema,
    removeOrphanedToolMessages,
    calculateCondensationStats,
} from "./condenserEligibility.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLONE_TEMPERATURE = 0.1;
const CLONE_BACKOFF_MS = 1000;
const CLONE_MAX_RETRIES = 1;

// ---------------------------------------------------------------------------
// Prompt Builder
// ---------------------------------------------------------------------------

/**
 * Builds the synthetic user message that instructs the orchestrator model
 * to condense the conversation history into structured JSON.
 *
 * @returns {string} The instruction prompt
 */
function buildCloneCondenserPrompt() {
    return [
        "## CONTEXT CONDENSATION REQUEST",
        "",
        "I need you to condense the conversation history above into structured JSON.",
        "This is a background task — do NOT execute any tools.",
        "",
        "Return ONLY valid JSON with this schema:",
        "{",
        '  "condensed_at": "<ISO 8601 timestamp>",',
        '  "original_message_count": <integer>,',
        '  "conversation_summary": "<500 - 1500 words>",',
        '  "key_decisions": [',
        '    { "decision": "<what was decided>", "rationale": "<why>", "timestamp": "<approximate context>" }',
        "  ],",
        '  "files_affected": {',
        '    "created": ["<relative file path>"],',
        '    "modified": ["<relative file path>"],',
        '    "deleted": ["<relative file path>"]',
        "  },",
        '  "user_preferences": ["<verbatim preference>"],',
        '  "unresolved_items": ["<open question or pending item>"],',
        '  "reasoning_chain": [',
        '    { "step": "<short description>", "approach": "<what was tried>", "outcome": "<success|failure|pending>", "artifacts": ["<file paths produced>"] }',
        "  ],",
        '  "architecture_decisions": [',
        '    { "component": "<module or file>", "pattern": "<structural decision>", "rationale": "<why this pattern>" }',
        "  ],",
        '  "rejected_approaches": [',
        '    { "approach": "<what was considered>", "reason_rejected": "<why it wasn\'t chosen>" }',
        "  ]",
        "}",
        "",
        "## Rules",
        "1. PRESERVE every file path exactly as written — do not modify or truncate.",
        "2. PRESERVE every user preference or constraint VERBATIM.",
        "3. PRESERVE every architectural decision with its rationale.",
        "4. PRESERVE every unresolved question — these are critical for the next turn.",
        "5. PRESERVE the reasoning chain: what was tried, what succeeded, what failed.",
        "6. Do NOT editorialize or add opinions.",
        "7. Do NOT infer decisions that weren't explicitly made.",
        "8. Do NOT merge distinct decisions into one entry.",
        "9. If a section has no entries, use an empty array [].",
        '10. The "condensed_at" field MUST be the current UTC ISO 8601 timestamp.',
        "11. Return ONLY the raw JSON object — NO markdown fences, NO commentary, NO explanation.",
    ].join("\n");
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Condenses conversation history by cloning the orchestrator's message state
 * and calling the SAME model with the SAME system prompt prefix.
 *
 * This maximizes API cache hits because the system prompt + leading messages
 * are identical to the orchestrator's last call.
 *
 * **Eligibility rules** (same as condenseMessages):
 * - Skips system prompt (index 0)
 * - Skips already-condensed messages
 * - Skips the last user message
 * - Takes the oldest 50% of remaining eligible messages
 *
 * **Error handling:**
 * - Retries once with a 1s backoff
 * - Validates the JSON response against the expected schema
 * - Returns `null` on failure → caller falls back to sliding-window splice
 *   or the original deepseek-v4-flash condenser
 *
 * @param {Array} messages - Full conversation messages array
 * @param {string} orchestratorSystemPrompt - The orchestrator's system prompt (cache-hit key)
 * @param {number} tokenLimit - Total token budget
 * @param {import("openai").default} client - OpenAI client instance
 * @param {string} modelName - The orchestrator's model (e.g. "deepseek-v4-pro")
 * @param {Object} [options]
 * @param {number} [options.threshold=0.65] - Token ratio to trigger condensation
 * @param {number} [options.maxTokensCap=20000] - Max tokens for condenser response
 * @param {number} [options.maxTokensRatio=0.1] - Ratio of token limit for max_tokens
 * @returns {Promise<{condensed: Object, newMessages: Array, stats: {originalCount: number, newCount: number, tokenReduction: number, originalTokens: number, newTokens: number}, cloneMessages: Array} | null>}
 *          Returns null if no condensation needed or on failure.
 *          `cloneMessages` is included for audit/debugging purposes.
 */
export async function condenseViaClone(messages, orchestratorSystemPrompt, tokenLimit, client, modelName, options = {}) {
    const threshold = options.threshold ?? CONDENSER_HYPERPARAMETERS.threshold;
    const maxTokensCap = options.maxTokensCap ?? CONDENSER_HYPERPARAMETERS.maxTokensCap;
    const maxTokensRatio = options.maxTokensRatio ?? CONDENSER_HYPERPARAMETERS.maxTokensRatio;
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

    // --- Step 3: Build the clone message array ---
    // The system prompt is the ORCHESTRATOR's system prompt (not the condenser prompt)
    // This is what enables the API cache hit on the prefix.
    const eligibleMessages = targetIndices.map((idx) => messages[idx]);

    const cloneMessages = [
        { role: "system", content: orchestratorSystemPrompt },
        ...eligibleMessages,
        { role: "user", content: buildCloneCondenserPrompt() },
    ];

    // --- Step 4: Call the SAME model (no tools) with retry ---
    let lastError = null;
    for (let attempt = 0; attempt <= CLONE_MAX_RETRIES; attempt++) {
        try {
            const response = await client.chat.completions.create({
                model: modelName,
                messages: cloneMessages,
                max_tokens: Math.min(maxTokensCap, Math.floor(tokenLimit * maxTokensRatio)),
                stream: false,
                temperature: CLONE_TEMPERATURE,
                // Explicitly disable tools — the model must only return JSON, no function calls
            });

            const rawContent = response.choices?.[0]?.message?.content?.trim();
            if (!rawContent) {
                throw new Error("Empty response from clone condenser");
            }

            // Strip markdown code fences if the model wrapped the JSON
            let jsonContent = rawContent;
            const fenceMatch = rawContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
            if (fenceMatch) {
                jsonContent = fenceMatch[1].trim();
            }

            let parsed;
            try {
                parsed = JSON.parse(jsonContent);
            } catch (parseErr) {
                throw new Error(`JSON parse failed: ${parseErr.message}. Raw content: ${rawContent.substring(0, 200)}`);
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
                cloneMessages, // included for audit/debugging
            };
        } catch (err) {
            lastError = err;
            if (attempt < CLONE_MAX_RETRIES) {
                console.warn(`[Clone Condenser] Attempt ${attempt + 1}/${CLONE_MAX_RETRIES + 1} failed. Retrying in ${CLONE_BACKOFF_MS}ms...`);
                await new Promise((r) => setTimeout(r, CLONE_BACKOFF_MS));
            }
        }
    }

    // All retries exhausted
    console.warn(
        `[Clone Condenser] All ${CLONE_MAX_RETRIES + 1} attempt(s) exhausted. Last error: ${lastError?.message || "Unknown"}. Falling back.`
    );
    return null;
}
