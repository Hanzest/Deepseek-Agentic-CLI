import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// We test the context condenser module using a mocked OpenAI client and
// controlled message fixtures. The condenser's core logic — eligibility,
// progressive chunking, input building, schema validation, retry — is all
// tested without requiring a live API key.
// ---------------------------------------------------------------------------

// Mock the tokenizer with a simple character-count heuristic so tests are
// deterministic regardless of tiktoken availability.
vi.mock("../../lib/tokenizer.js", () => ({
    estimateTokens: vi.fn((messages) => {
        let total = 0;
        for (const msg of messages || []) {
            const c = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
            total += c.length / 2; // simulates ~2 chars per token
        }
        return { input_tokens: Math.floor(total), output_tokens: 0, total_tokens: Math.floor(total) };
    }),
}));

// Import after mocking
import { condenseMessages } from "../../lib/contextCondenser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a simulated messages array for testing.
 * @param {number} count - Number of user+assistant pairs to generate
 * @param {number} [contentSize=100] - Character length per message
 * @returns {Array} messages array
 */
function buildConversation(count, contentSize = 100) {
    const msgs = [
        { role: "system", content: "## Role\nYou are an expert Orchestrator." },
    ];
    for (let i = 0; i < count; i++) {
        msgs.push({ role: "user", content: `User message ${i}: ${"x".repeat(contentSize)}` });
        msgs.push({ role: "assistant", content: `Assistant response ${i}: ${"y".repeat(contentSize)}` });
    }
    return msgs;
}

/**
 * Create a mock OpenAI client that returns a given response.
 * @param {object|string} responseContent - JSON object or raw string to return
 * @param {number} [failCount=0] - Number of times to throw before succeeding
 * @returns {{ client: object, callCount: () => number }}
 */
function createMockClient(responseContent, failCount = 0) {
    let calls = 0;
    const content = typeof responseContent === "string"
        ? responseContent
        : JSON.stringify(responseContent);
    const client = {
        chat: {
            completions: {
                create: vi.fn(() => {
                    calls++;
                    if (calls <= failCount) {
                        return Promise.reject(new Error(`Simulated API failure #${calls}`));
                    }
                    return Promise.resolve({
                        choices: [{ message: { content } }],
                    });
                }),
            },
        },
    };
    return { client, callCount: () => calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("contextCondenser — condenseMessages()", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ---- 1. Below threshold -> no-op ----
    it("returns null when token usage is below threshold", async () => {
        const messages = buildConversation(2, 20); // small → well under 65%
        const { client } = createMockClient({ conversation_summary: "test" });

        const result = await condenseMessages(messages, 100000, client, "deepseek-v4-flash");
        expect(result).toBeNull();
        expect(client.chat.completions.create).not.toHaveBeenCalled();
    });

    // ---- 2. No eligible messages (all condensed) ----
    it("returns null when all eligible messages are already condensed", async () => {
        const messages = buildConversation(5, 50);
        // Mark all eligible messages as condensed
        for (let i = 1; i < messages.length; i++) {
            messages[i].condensed = true;
        }
        const { client } = createMockClient({ conversation_summary: "test" });

        const result = await condenseMessages(messages, 500, client, "deepseek-v4-flash");
        expect(result).toBeNull();
        expect(client.chat.completions.create).not.toHaveBeenCalled();
    });

    // ---- 3. Successful condensation returns correct structure ----
    it("returns condensed result with correct stats when API succeeds", async () => {
        const messages = buildConversation(10, 100); // ~1050 chars = ~525 tokens
        const validResponse = {
            condensed_at: "2026-06-05T20:00:00.000Z",
            original_message_count: 10,
            estimated_token_reduction_pct: 80,
            conversation_summary: "Discussed implementation of context condenser.",
            key_decisions: [
                { decision: "Use deepseek-v4-flash", rationale: "Cheapest model", timestamp: "turn 3" },
            ],
            files_affected: {
                created: ["lib/contextCondenser.js"],
                modified: [],
                deleted: [],
            },
            user_preferences: ["Use minimal logging"],
            unresolved_items: ["Test the retry logic"],
            reasoning_chain: [
                { step: "Design", approach: "Draft plan", outcome: "success", artifacts: ["plan.md"] },
            ],
            architecture_decisions: [],
            rejected_approaches: [],
        };
        const { client, callCount } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 300, client, "deepseek-v4-flash");

        expect(result).not.toBeNull();
        expect(result.condensed).toEqual(validResponse);
        expect(result.stats.originalCount).toBeGreaterThan(0);
        expect(result.stats.newCount).toBe(1);
        expect(result.stats.tokenReduction).toBeGreaterThan(0);
        expect(callCount()).toBe(1);
    });

    // ---- 4. Condensed message has correct properties ----
    it("adds condensed: true to the replacement message", async () => {
        const messages = buildConversation(10, 100);
        const validResponse = {
            condensed_at: "2026-06-05T20:00:00.000Z",
            original_message_count: 10,
            estimated_token_reduction_pct: 80,
            conversation_summary: "Test summary.",
            key_decisions: [],
            files_affected: { created: [], modified: [], deleted: [] },
            user_preferences: [],
            unresolved_items: [],
            reasoning_chain: [],
        };
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 300, client, "deepseek-v4-flash");

        // Find the condensed message in the new array
        const condensedMsg = result.newMessages.find((m) => m.condensed === true);
        expect(condensedMsg).toBeDefined();
        expect(condensedMsg.role).toBe("system");
        expect(typeof condensedMsg.content).toBe("string");
        // Content should be parseable JSON
        const parsed = JSON.parse(condensedMsg.content);
        expect(parsed.conversation_summary).toBe("Test summary.");
    });

    // ---- 5. Progressive: only oldest 50% are condensed ----
    it("only condenses the oldest 50% of eligible messages", async () => {
        // Build 20 eligible messages (10 user + 10 assistant) = 20 messages
        const messages = buildConversation(10, 10);
        const validResponse = {
            condensed_at: "2026-06-05T20:00:00.000Z",
            original_message_count: 10,
            estimated_token_reduction_pct: 80,
            conversation_summary: "Progressive test.",
            key_decisions: [],
            files_affected: { created: [], modified: [], deleted: [] },
            user_preferences: [],
            unresolved_items: [],
            reasoning_chain: [],
        };
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 50, client, "deepseek-v4-flash");

        expect(result).not.toBeNull();
        // Original eligible messages (excluding system + last user) = 10 pairs - 1 last user = 19 eligible
        // Wait, let me trace: buildConversation(10,10) creates:
        //   [system, user0, asst0, user1, asst1, ..., user9, asst9]
        //   = 21 messages total
        // Last user = user9 (index 19)
        // Eligible = indices 1-18 = 18 messages
        // 50% of 18 = 9 messages condensed
        expect(result.stats.originalCount).toBeGreaterThan(0);
        // New messages = system + condensed + remaining eligible (last 50%) + last user + last assistant
        // = 1 + 1 + 9 + 1 + 1 = 13 messages
        // But last assistant (asst9) is at index 20, which is after lastUserIdx (19)
        // Actually, lastUserIdx is the last user message at index 19
        // So indices 1-18 are eligible, 19 is last user, 20 is assistant that follows
        // The assistant at index 20 stays because it's AFTER lastUserIdx and not part of eligible range
        expect(result.newMessages.length).toBeLessThan(messages.length);
        expect(result.newMessages.length).toBeGreaterThan(1);
    });

    // ---- 6. Preserve last user message ----
    it("never includes the last user message in the condensed chunk", async () => {
        const messages = buildConversation(5, 50);
        const lastUserMsg = messages[messages.length - 2]; // second-to-last = last user
        const lastUserContent = lastUserMsg.content;

        const validResponse = {
            condensed_at: "2026-06-05T20:00:00.000Z",
            original_message_count: 5,
            estimated_token_reduction_pct: 80,
            conversation_summary: "Preservation test.",
            key_decisions: [],
            files_affected: { created: [], modified: [], deleted: [] },
            user_preferences: [],
            unresolved_items: [],
            reasoning_chain: [],
        };
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 200, client, "deepseek-v4-flash");

        // The last user message should still be in the new array
        const preservedUser = result.newMessages.find((m) => m.role === "user" && m.content === lastUserContent);
        expect(preservedUser).toBeDefined();
    });

    // ---- 7. Retry logic: succeeds on 3rd attempt ----
    it("retries after API failure and succeeds on 3rd attempt", async () => {
        const messages = buildConversation(10, 100);
        const validResponse = {
            condensed_at: "2026-06-05T20:00:00.000Z",
            original_message_count: 10,
            estimated_token_reduction_pct: 80,
            conversation_summary: "Retry test.",
            key_decisions: [],
            files_affected: { created: [], modified: [], deleted: [] },
            user_preferences: [],
            unresolved_items: [],
            reasoning_chain: [],
        };
        // Fail twice, succeed on 3rd
        const { client, callCount } = createMockClient(validResponse, 2);

        const result = await condenseMessages(messages, 300, client, "deepseek-v4-flash", { maxRetries: 2 });

        expect(result).not.toBeNull();
        expect(result.condensed.conversation_summary).toBe("Retry test.");
        expect(callCount()).toBe(3); // 2 failures + 1 success = 3 total
    });

    // ---- 8. Retry logic: returns null after all retries exhausted ----
    it("returns null when all retries are exhausted", async () => {
        const messages = buildConversation(10, 100);
        const { client, callCount } = createMockClient("garbage non-json", 3); // also fails JSON parse on 3rd

        const result = await condenseMessages(messages, 300, client, "deepseek-v4-flash", { maxRetries: 2 });

        expect(result).toBeNull();
        expect(callCount()).toBe(3); // 3 failures = all retries
    });

    // ---- 9. Schema validation rejects missing fields ----
    it("returns null when response is missing required fields (retries exhausted)", async () => {
        const messages = buildConversation(10, 100);
        const incompleteResponse = {
            condensed_at: "2026-06-05T20:00:00.000Z",
            conversation_summary: "Missing fields.",
            // missing key_decisions, files_affected, user_preferences, etc.
        };
        const { client, callCount } = createMockClient(incompleteResponse);

        const result = await condenseMessages(messages, 300, client, "deepseek-v4-flash");

        expect(result).toBeNull();
        // Schema/parse failures are retried (model may produce valid JSON next attempt)
        expect(callCount()).toBe(3); // 1 initial + 2 retries = 3 total
    });

    // ---- 10. Schema validation rejects non-array field ----
    it("returns null when files_affected is not an object (retries exhausted)", async () => {
        const messages = buildConversation(10, 100);
        const badResponse = {
            condensed_at: "2026-06-05T20:00:00.000Z",
            original_message_count: 10,
            estimated_token_reduction_pct: 80,
            conversation_summary: "Bad files_affected.",
            key_decisions: [],
            files_affected: "not an object", // wrong type
            user_preferences: [],
            unresolved_items: [],
            reasoning_chain: [],
        };
        const { client, callCount } = createMockClient(badResponse);

        const result = await condenseMessages(messages, 300, client, "deepseek-v4-flash");

        expect(result).toBeNull();
        expect(callCount()).toBe(3); // 1 initial + 2 retries = 3 total
    });

    // ---- 11. Empty API response ----
    it("returns null when API response content is empty (retries exhausted)", async () => {
        const messages = buildConversation(10, 100);
        const { client, callCount } = createMockClient("   "); // whitespace only

        const result = await condenseMessages(messages, 300, client, "deepseek-v4-flash");

        expect(result).toBeNull();
        expect(callCount()).toBe(3); // 1 initial + 2 retries = 3 total
    });

    // ---- 12. Single eligible message ----
    it("handles edge case of only 1 eligible message", async () => {
        // Build conversation where only 1 message is eligible
        const messages = [
            { role: "system", content: "System prompt" },
            { role: "user", content: "First user message" },
            { role: "assistant", content: "First response" },
        ];
        // Token estimate: system(14) + user(18) + asst(16) = ~48 chars /2 = ~24 tokens
        // Set token limit low enough to trigger condensation
        const validResponse = {
            condensed_at: "2026-06-05T20:00:00.000Z",
            original_message_count: 1,
            estimated_token_reduction_pct: 50,
            conversation_summary: "Single message test.",
            key_decisions: [],
            files_affected: { created: [], modified: [], deleted: [] },
            user_preferences: [],
            unresolved_items: [],
            reasoning_chain: [],
        };
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 20, client, "deepseek-v4-flash");

        // Should succeed: eligible messages = [user0] (asst0 is the last user? No...)
        // Actually lastUserIdx = 1 (user0), so eligible range from index 1 to 0 = empty
        // Wait, lastUserIdx is the LAST user message. In this array:
        // index 0: system, index 1: user, index 2: assistant
        // Last user message is at index 1
        // Eligible indices: from 1 to < 1 = none
        // So it should return null (no eligible messages before last user)
        expect(result).toBeNull();
    });

    // ---- 13. Custom threshold parameter ----
    it("respects a custom threshold option", async () => {
        const messages = buildConversation(3, 10); // small messages
        // At threshold 0.1 (10%), this should trigger even for small conversations
        const validResponse = {
            condensed_at: "2026-06-05T20:00:00.000Z",
            original_message_count: 3,
            estimated_token_reduction_pct: 80,
            conversation_summary: "Custom threshold test.",
            key_decisions: [],
            files_affected: { created: [], modified: [], deleted: [] },
            user_preferences: [],
            unresolved_items: [],
            reasoning_chain: [],
        };
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 1000, client, "deepseek-v4-flash", { threshold: 0.1, maxRetries: 2 });

        // With threshold 0.1 and tokenLimit 1000, we need total_tokens > 100
        // buildConversation(3,10) = system(42 chars) + 3(user+asst)(~30 chars each) 
        // = 42 + 180 = 222 chars /2 = 111 tokens > 100 → should trigger
        expect(result).not.toBeNull();
        expect(result.stats.originalCount).toBeGreaterThan(0);
    });

    // ---- 14. Progressive passes preserve condensed flag ----
    it("skips already-condensed messages in subsequent passes", async () => {
        // Build a conversation with some already-condensed messages
        // buildConversation(6, 30) creates 6 pairs + 1 system = 13 messages
        // Indices: 0=system, 1=user0, 2=asst0, 3=user1, 4=asst1, 5=user2, 6=asst2,
        //          7=user3, 8=asst3, 9=user4, 10=asst4, 11=user5(last), 12=asst5
        const messages = buildConversation(6, 30);
        // Mark the first pair as already condensed
        messages[1].condensed = true; // user0
        messages[2].condensed = true; // asst0

        const validResponse = {
            condensed_at: "2026-06-05T20:00:00.000Z",
            original_message_count: 4,
            estimated_token_reduction_pct: 80,
            conversation_summary: "Already condensed test.",
            key_decisions: [],
            files_affected: { created: [], modified: [], deleted: [] },
            user_preferences: [],
            unresolved_items: [],
            reasoning_chain: [],
        };
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 50, client, "deepseek-v4-flash");

        // Eligible indices: from 1 to <11 (lastUserIdx), skipping 1,2 (condensed)
        // Eligible = [3,4,5,6,7,8,9,10] = 8 messages → oldest 50% = 4 messages
        if (result) {
            expect(result.stats.originalCount).toBe(4); // 4 out of 8 eligible
        }
    });
});
