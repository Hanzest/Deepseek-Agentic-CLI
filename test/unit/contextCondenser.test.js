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
 * Build a multi-turn conversation history with condensed entries.
 * Each turn adds: [condensedMsg?, user, assistant, tool-calls...]
 *
 * @param {number} turnsWithCondensed - Number of prior turns that have condensed entries
 * @param {boolean} includeToolFlow - If true, last turn includes tool_calls + tool results
 * @param {object} [options]
 * @param {number} [options.contentSize=80] - Character length per content
 * @returns {Array} messages array simulating multi-turn history
 */
function buildMultiTurnConversation(turnsWithCondensed, includeToolFlow = false, options = {}) {
    const contentSize = options.contentSize ?? 80;
    const msgs = [
        { role: "system", content: "## Role\nYou are an expert Orchestrator." },
    ];

    for (let t = 0; t < turnsWithCondensed; t++) {
        // Each prior turn was condensed into a single condensed message
        msgs.push({
            role: "system",
            content: JSON.stringify({
                condensed_at: `2026-06-07T${String(t + 10).padStart(2, "0")}:00:00.000Z`,
                original_message_count: 3,
                conversation_summary: `Summary of turn ${t + 1}.`,
                key_decisions: [],
                files_affected: { created: [], modified: [], deleted: [] },
                user_preferences: [],
                unresolved_items: [],
                reasoning_chain: [],
            }),
            condensed: true,
        });
    }

    // Current turn: user message
    msgs.push({ role: "user", content: `Turn ${turnsWithCondensed + 1} input: ${"x".repeat(contentSize)}` });

    if (includeToolFlow) {
        // Tool-calling assistant
        msgs.push({
            role: "assistant",
            content: "",
            tool_calls: [
                { id: `tc_t${turnsWithCondensed + 1}_1`, function: { name: "read_file_chunk", arguments: "{}" } },
                { id: `tc_t${turnsWithCondensed + 1}_2`, function: { name: "get_project_tree", arguments: "{}" } },
            ],
        });
        msgs.push({ role: "tool", tool_call_id: `tc_t${turnsWithCondensed + 1}_1`, content: "file content here" });
        msgs.push({ role: "tool", tool_call_id: `tc_t${turnsWithCondensed + 1}_2`, content: "project tree here" });
        msgs.push({ role: "assistant", content: `Summary after tool calls turn ${turnsWithCondensed + 1}.` });
    }

    return msgs;
}

/**
 * Build a standard valid condenser response for testing.
 * @param {object} [overrides]
 * @returns {object}
 */
function buildValidResponse(overrides = {}) {
    return {
        condensed_at: "2026-06-07T12:00:00.000Z",
        original_message_count: 3,
        estimated_token_reduction_pct: 75,
        conversation_summary: "Discussed condenser implementation.",
        key_decisions: [
            { decision: "Use progressive condensation", rationale: "Balance cost vs context", timestamp: "turn 1" },
        ],
        files_affected: {
            created: ["lib/contextCondenser.js"],
            modified: [],
            deleted: [],
        },
        user_preferences: ["Use minimal logging"],
        unresolved_items: ["Test retry logic"],
        reasoning_chain: [
            { step: "Design", approach: "Draft plan", outcome: "success", artifacts: ["plan.md"] },
        ],
        architecture_decisions: [],
        rejected_approaches: [],
        ...overrides,
    };
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
        const { client } = createMockClient(buildValidResponse());

        const result = await condenseMessages(messages, 100000, client, "deepseek-v4-flash");
        expect(result).toBeNull();
        expect(client.chat.completions.create).not.toHaveBeenCalled();
    });

    // ---- 2. No eligible messages (all condensed) ----
    it("returns null when all eligible messages are already condensed", async () => {
        const messages = buildConversation(5, 50);
        for (let i = 1; i < messages.length; i++) {
            messages[i].condensed = true;
        }
        const { client } = createMockClient(buildValidResponse());

        const result = await condenseMessages(messages, 500, client, "deepseek-v4-flash");
        expect(result).toBeNull();
        expect(client.chat.completions.create).not.toHaveBeenCalled();
    });

    // ---- 3. Successful condensation (merged from old Test 3 + 4) ----
    it("returns condensed result with correct structure and properties when API succeeds", async () => {
        const messages = buildConversation(10, 100);
        const validResponse = buildValidResponse({ original_message_count: 10 });
        const { client, callCount } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 300, client, "deepseek-v4-flash");

        expect(result).not.toBeNull();
        expect(result.condensed).toEqual(validResponse);
        expect(result.stats.originalCount).toBeGreaterThan(0);
        expect(result.stats.newCount).toBe(1);
        expect(result.stats.tokenReduction).toBeGreaterThan(0);
        expect(callCount()).toBe(1);

        // Verify condensed message properties (merged from old Test 4)
        const condensedMsg = result.newMessages.find((m) => m.condensed === true);
        expect(condensedMsg).toBeDefined();
        expect(condensedMsg.role).toBe("system");
        expect(typeof condensedMsg.content).toBe("string");
        const parsed = JSON.parse(condensedMsg.content);
        expect(parsed.conversation_summary).toBe("Discussed condenser implementation.");
    });

    // ---- 4. Progressive: only oldest 50% + preserves last user (merged from old Test 5 + 6) ----
    it("only condenses the oldest 50% of eligible messages and preserves last user", async () => {
        const messages = buildConversation(10, 10);
        const lastUserContent = messages[messages.length - 2].content;
        const validResponse = buildValidResponse({ conversation_summary: "Progressive test." });
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 50, client, "deepseek-v4-flash");

        expect(result).not.toBeNull();
        // Original eligible messages (excluding system + last user) should be ~18 eligible out of 21 total
        // 50% of 18 = 9 condensed
        expect(result.stats.originalCount).toBeGreaterThan(0);
        expect(result.newMessages.length).toBeLessThan(messages.length);
        expect(result.newMessages.length).toBeGreaterThan(1);

        // The last user message should still be in the new array (merged from old Test 6)
        const preservedUser = result.newMessages.find((m) => m.role === "user" && m.content === lastUserContent);
        expect(preservedUser).toBeDefined();
    });

    // ---- 5. Retry logic: returns null after all retries exhausted ----
    it("returns null when all retries are exhausted", async () => {
        const messages = buildConversation(10, 100);
        const { client, callCount } = createMockClient("garbage non-json", 3);

        const result = await condenseMessages(messages, 300, client, "deepseek-v4-flash", { maxRetries: 2 });

        expect(result).toBeNull();
        expect(callCount()).toBe(3); // 3 failures = all retries
    });

    // ---- 6. Schema validation errors (parameterized: merged from old Test 9, 10, 11) ----
    it.each([
        ["missing required fields", { conversation_summary: "Only summary." }, "missing required field"],
        ["files_affected is wrong type", {
            condensed_at: "2026-06-07T12:00:00.000Z",
            original_message_count: 1,
            conversation_summary: "Bad files_affected.",
            key_decisions: [],
            files_affected: "not an object",
            user_preferences: [],
            unresolved_items: [],
            reasoning_chain: [],
        }, '"files_affected" is not an object'],
        ["empty/whitespace content", "   ", "Empty response"],
    ])("returns null when API response has %s (retries exhausted)", async (_label, responseContent, _errHint) => {
        const messages = buildConversation(10, 100);
        const { client, callCount } = createMockClient(responseContent);

        const result = await condenseMessages(messages, 300, client, "deepseek-v4-flash", { maxRetries: 2 });

        expect(result).toBeNull();
        // Schema/parse failures are retried (model may produce valid JSON next attempt)
        expect(callCount()).toBe(3); // 1 initial + 2 retries = 3 total
    });

    // ---- 7. Tool messages after user are eligible (T3/Eligibility) ----
    it("includes tool call/result messages after last user in eligible set", async () => {
        const messages = [
            { role: "system", content: "System prompt" },
            { role: "system", content: '{"conversation_summary":"Previous turn"}', condensed: true },
            { role: "user", content: "Build 3 files" },
            { role: "assistant", content: "", tool_calls: [{ id: "tc1", function: { name: "write_or_create_file", arguments: '{}' } }] },
            { role: "tool", tool_call_id: "tc1", content: "File created" },
            { role: "assistant", content: "Done with round 1", tool_calls: [{ id: "tc2", function: { name: "read_file_chunk", arguments: '{}' } }] },
            { role: "tool", tool_call_id: "tc2", content: "File content" },
            { role: "assistant", content: "All done" },
        ];
        const validResponse = buildValidResponse({
            original_message_count: 2,
            estimated_token_reduction_pct: 50,
            conversation_summary: "Tool messages are eligible now.",
        });
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 10, client, "deepseek-v4-flash", { maxRetries: 1, preserveTailCount: 3 });

        expect(result).not.toBeNull();
        expect(result.stats.originalCount).toBe(2);
    });

    // ---- 8. preserveTailCount protects trailing messages + turn-intent (merged from old Test 13 + 15) ----
    it("protects trailing messages from condensation and never condenses current turn's user input", async () => {
        const messages = [
            { role: "system", content: "System prompt" },
            { role: "user", content: "msg1" },
            { role: "assistant", content: "resp1" },
            { role: "user", content: "CURRENT TURN INPUT - MUST BE PRESERVED" }, // lastUserIdx
            { role: "assistant", content: "", tool_calls: [{ id: "t1", function: { name: "test", arguments: "{}" } }] }, // pairs with index 5
            { role: "tool", tool_call_id: "t1", content: "result1" }, // safe zone
            { role: "assistant", content: "resp2" }, // safe zone
            { role: "assistant", content: "resp3" }, // safe zone
        ];
        const validResponse = buildValidResponse({
            original_message_count: 2,
            estimated_token_reduction_pct: 50,
            conversation_summary: "Tail protected.",
        });
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 10, client, "deepseek-v4-flash", { maxRetries: 1, preserveTailCount: 3 });

        expect(result).not.toBeNull();
        expect(result.stats.originalCount).toBe(1);
        // Verify safe-zone messages survived intact
        expect(result.newMessages.find((m) => m.content === "resp3")).toBeDefined();
        expect(result.newMessages.find((m) => m.content === "result1")).toBeDefined();
        // Verify current turn user input was never condensed (merged from old Test 15)
        expect(result.newMessages.find((m) => m.role === "user" && m.content === "CURRENT TURN INPUT - MUST BE PRESERVED")).toBeDefined();
    });

    // ---- 9. Downward-safe atomic pair alignment (T3/AtomicPairs) ----
    it("removes tool_call from eligibility when paired tool_result is in safe zone", async () => {
        const messages = [
            { role: "system", content: "System prompt" },
            { role: "user", content: "Hello" },
            { role: "assistant", content: "", tool_calls: [{ id: "tc1", function: { name: "test", arguments: "{}" } }] },
            { role: "tool", tool_call_id: "tc1", content: "Result" },
            { role: "assistant", content: "Done" },
        ];

        const { client } = createMockClient(buildValidResponse({ conversation_summary: "Should not be called." }));

        const result = await condenseMessages(messages, 10, client, "deepseek-v4-flash", { maxRetries: 1, preserveTailCount: 2 });

        // No API call because all candidates removed by atomic alignment
        expect(result).toBeNull();
        expect(client.chat.completions.create).not.toHaveBeenCalled();
    });

    // ---- 10. preserveTailCount=0 makes all eligible (aggressive brink) ----
    it("allows all non-protected messages when preserveTailCount=0", async () => {
        const messages = [
            { role: "system", content: "System" },
            { role: "user", content: "User 1" },
            { role: "assistant", content: "Asst 1" },
            { role: "user", content: "User 2" }, // lastUserIdx
        ];
        const validResponse = buildValidResponse({
            original_message_count: 2,
            estimated_token_reduction_pct: 50,
            conversation_summary: "Aggressive brink test.",
        });
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 10, client, "deepseek-v4-flash", { maxRetries: 1, preserveTailCount: 0 });

        expect(result).not.toBeNull();
        expect(result.stats.originalCount).toBe(1);
    });

    // ---- 11. Custom threshold parameter (simplified) ----
    it("respects a custom threshold option", async () => {
        const messages = buildConversation(3, 10);
        const validResponse = buildValidResponse({ conversation_summary: "Custom threshold test." });
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 1000, client, "deepseek-v4-flash", { threshold: 0.1, maxRetries: 2 });

        // With threshold 0.1 and tokenLimit 1000, we need total_tokens > 100
        // buildConversation(3,10) = system(42 chars) + 3(user+asst)(~30 chars each)
        // = 42 + 180 = 222 chars /2 = 111 tokens > 100 → should trigger
        expect(result).not.toBeNull();
        expect(result.stats.originalCount).toBeGreaterThan(0);
    });

    // ---- 12. Progressive passes preserve condensed flag ----
    it("skips already-condensed messages in subsequent passes", async () => {
        const messages = buildConversation(6, 30);
        // Mark the first pair as already condensed
        messages[1].condensed = true; // user0
        messages[2].condensed = true; // asst0

        const validResponse = buildValidResponse({
            original_message_count: 4,
            estimated_token_reduction_pct: 80,
            conversation_summary: "Already condensed test.",
        });
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 50, client, "deepseek-v4-flash", { preserveTailCount: 1 });

        // Eligible indices: from 1 to <11 (lastUserIdx), skipping 1,2 (condensed)
        // Eligible = [3,4,5,6,7,8,9,10] = 8 messages → oldest 50% = 4 messages
        expect(result).not.toBeNull();
        expect(result.stats.originalCount).toBe(4);
    });

    // =====================================================================
    // NEW: Multi-turn progressive condensation tests (TC-A through TC-F)
    // =====================================================================

    // ---- TC-A: First mid-turn condense (Turn 1) ----
    it("TC-A: first mid-turn condensation condenses tool-flow messages while preserving first user input", async () => {
        // Simulate Turn 1 mid-turn: user message + tool calls that grew the context
        const messages = buildMultiTurnConversation(0, true, { contentSize: 200 });

        // messages = [system, user1, asst-with-tc, tool1, tool2, asst-summary] = 6 messages
        // lastUserIdx = 1 (user1)
        // Eligible range with preserveTailCount=4: i=1 to (6-1-4)=1 → i=1 only, but lastUserIdx=1 → skipped
        // So with default preserveTailCount=5, eligible range: i=1 to (6-1-5)=0 → empty
        // Let's use preserveTailCount=2 so there's room
        // eligibleEndExclusive = 6-1-2 = 3
        // Eligible: i=1 (user1 - skipped as lastUser), i=2 (asst-with-tc), i=3 (tool1)
        // But tool1 needs its pair → backward expansion finds asst at 2 (already eligible)
        // tool2 at index 4 is in safe zone (>= eligibleEndExclusive+1=4) → should be protected
        // Actually wait, tool2 at index 4 - preserveTailCount=2 means indices 4,5 are safe
        // So eligible = [2,3] (asst-with-tc + tool1)
        // Atomic pairs: asst-with-tc has tc_t1_1, tc_t1_2 → need tool1 for tc_t1_1 and tool2 for tc_t1_2
        // tool1 at index 3 (eligible) ✓, tool2 at index 4 (safe zone) ✗
        // So asst-with-tc's pair NOT complete → removed from eligibility
        // eligibleIndices becomes [] → null

        // Use preserveTailCount=0 to allow aggressive condensation for this test
        const validResponse = buildValidResponse({
            original_message_count: 2,
            conversation_summary: "First mid-turn condense.",
        });
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 10, client, "deepseek-v4-flash", {
            maxRetries: 1,
            preserveTailCount: 0,
            threshold: 0.0,
        });

        // With preserveTailCount=0, all non-last-user messages are eligible
        // Eligible: [1(skipped-lastUser), 2(asst-tc), 3(tool1), 4(tool2), 5(asst-summary)]
        // = [2,3,4,5] = 4 eligible → oldest 50% = 2 messages
        // But tool2 at index 4 pairs with asst-tc at 2 - both are eligible, so OK
        expect(result).not.toBeNull();
        expect(result.stats.originalCount).toBe(2);

        // Verify first user message is preserved
        const firstUserContent = messages.find((m) => m.role === "user").content;
        const preservedUser = result.newMessages.find((m) => m.role === "user" && m.content === firstUserContent);
        expect(preservedUser).toBeDefined();

        // Verify condensed message exists
        const condensedMsg = result.newMessages.find((m) => m.condensed === true);
        expect(condensedMsg).toBeDefined();
    });

    // ---- TC-B: First end-turn condense (Turn 1 → Turn 2) ----
    it("TC-B: first end-turn condensation condenses prior turn's messages when second user input arrives", async () => {
        // Simulate Turn 2 start: Turn 1's full history (uncondensed) + new user input
        // Use buildConversation to create a full first turn, then add a new user message
        const turn1Messages = buildConversation(3, 150); // system + 3 pairs = 7 msgs, ~large
        const turn2User = { role: "user", content: "Second turn input: continue the work." };
        const messages = [...turn1Messages, turn2User];

        // lastUserIdx = 7 (turn2User)
        // Eligible: i=1 to (8-1-3)=4 → indices 1..4
        // i=7 is past the range, so all of turn1's messages below index 4 are eligible
        const validResponse = buildValidResponse({
            original_message_count: 2,
            conversation_summary: "First end-turn condense.",
        });
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 50, client, "deepseek-v4-flash", {
            maxRetries: 1,
            preserveTailCount: 3,
        });

        expect(result).not.toBeNull();
        expect(result.stats.originalCount).toBeGreaterThan(0);

        // Verify turn2 user input is preserved
        const preservedUser = result.newMessages.find((m) => m.role === "user" && m.content === turn2User.content);
        expect(preservedUser).toBeDefined();

        // Verify condensed message is present
        const condensedMsg = result.newMessages.find((m) => m.condensed === true);
        expect(condensedMsg).toBeDefined();
        expect(condensedMsg.role).toBe("system");
    });

    // ---- TC-C: Second mid-turn condense (Turn 2) ----
    it("TC-C: second mid-turn condensation skips existing condensed entry and condenses turn 2 tool messages", async () => {
        // Simulate Turn 2 mid-turn: 1 prior condensed entry + turn 2 user + tool flow
        const messages = buildMultiTurnConversation(1, true, { contentSize: 150 });

        // messages = [system, condensed(turn1), user2, asst2-tc, tool2-1, tool2-2, asst2-summary]
        // = 7 messages, lastUserIdx = 2
        // preserveTailCount=0 for simplicity
        const validResponse = buildValidResponse({
            original_message_count: 2,
            conversation_summary: "Second mid-turn condense.",
        });
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 10, client, "deepseek-v4-flash", {
            maxRetries: 1,
            preserveTailCount: 0,
            threshold: 0.0,
        });

        expect(result).not.toBeNull();
        // Eligible: index 1 (condensed - skipped), index 2 (user2 - skipped as lastUser)
        // indices 3,4,5,6 (asst2-tc, tool2-1, tool2-2, asst2-summary) = 4 eligible
        // oldest 50% = 2 messages
        expect(result.stats.originalCount).toBeGreaterThan(0);

        // Verify the prior condensed entry survived
        const priorCondensed = result.newMessages.find(
            (m) => m.condensed === true && m.content.includes("Summary of turn 1")
        );
        expect(priorCondensed).toBeDefined();

        // Verify user2 input preserved
        const userContent = messages[2].content;
        expect(result.newMessages.find((m) => m.role === "user" && m.content === userContent)).toBeDefined();

        // Verify a new condensed entry was added (or the existing one updated)
        const allCondensed = result.newMessages.filter((m) => m.condensed === true);
        expect(allCondensed.length).toBeGreaterThanOrEqual(1);
    });

    // ---- TC-D: Second end-turn condense (Turn 2 → Turn 3) ----
    it("TC-D: second end-turn condensation preserves two prior condensed entries and condenses oldest eligible", async () => {
        // Simulate Turn 3 start: 2 prior condensed entries + third user input
        const messages = buildMultiTurnConversation(2, false, { contentSize: 100 });

        // messages = [system, condensed(turn1), condensed(turn2), user3]
        // = 4 messages, lastUserIdx = 3
        // Eligible: i=1,2 but both are condensed=true → skipped
        // No eligible messages → null
        // So we need more messages. Let's add some uncondensed assistant messages.
        messages.push({ role: "assistant", content: "Response to turn 3 input." });
        messages.push({ role: "assistant", content: "Additional processing notes." });

        // Now = 6 messages, lastUserIdx = 3
        // Eligible: i=1,2 (condensed - skipped), i=3 (lastUser - skipped)
        // i=4,5 (assistant responses) = 2 eligible → oldest 50% = 1
        const validResponse = buildValidResponse({
            original_message_count: 1,
            conversation_summary: "Second end-turn condense.",
        });
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 10, client, "deepseek-v4-flash", {
            maxRetries: 1,
            preserveTailCount: 0,
            threshold: 0.0,
        });

        expect(result).not.toBeNull();
        expect(result.stats.originalCount).toBe(1);

        // Verify both prior condensed entries survived
        const condensedEntries = result.newMessages.filter((m) => m.condensed === true);
        expect(condensedEntries.length).toBeGreaterThanOrEqual(2);

        // Verify user3 preserved
        expect(result.newMessages.find((m) => m.role === "user" && m.content.includes("Turn 3 input"))).toBeDefined();
    });

    // ---- TC-E: Fifth mid-turn condense (Turn 5) ----
    it("TC-E: fifth mid-turn condensation preserves 4 prior condensed entries and condenses turn 5 tool messages", async () => {
        // Simulate Turn 5 mid-turn: 4 prior condensed entries + turn 5 user + tool flow
        const messages = buildMultiTurnConversation(4, true, { contentSize: 120 });

        // messages = [system, c1, c2, c3, c4, user5, asst5-tc, tool5-1, tool5-2, asst5-summary]
        // = 10 messages, lastUserIdx = 5
        const validResponse = buildValidResponse({
            original_message_count: 3,
            conversation_summary: "Fifth mid-turn condense.",
        });
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 10, client, "deepseek-v4-flash", {
            maxRetries: 1,
            preserveTailCount: 0,
            threshold: 0.0,
        });

        expect(result).not.toBeNull();
        expect(result.stats.originalCount).toBeGreaterThan(0);

        // Verify all 4 prior condensed entries survived
        for (let t = 1; t <= 4; t++) {
            const entry = result.newMessages.find(
                (m) => m.condensed === true && m.content.includes(`Summary of turn ${t}`)
            );
            expect(entry).toBeDefined();
        }

        // Verify user5 preserved
        expect(result.newMessages.find((m) => m.role === "user" && m.content.includes("Turn 5 input"))).toBeDefined();
    });

    // ---- TC-F: Fifth end-turn condense (Turn 5 → Turn 6) ----
    it("TC-F: fifth end-turn condensation preserves 5 prior condensed entries and sixth user input", async () => {
        // Simulate Turn 6 start: 5 prior condensed entries + sixth user input
        const messages = buildMultiTurnConversation(5, false, { contentSize: 100 });

        // messages = [system, c1, c2, c3, c4, c5, user6]
        // = 7 messages, lastUserIdx = 6
        // All non-system, non-lastUser messages are condensed=true → no eligible → null
        // Add some trailing assistant messages to create eligible candidates
        messages.push({ role: "assistant", content: "Turn 6 response with detailed analysis." });
        messages.push({ role: "assistant", content: "Follow-up notes after response." });

        // = 9 messages, lastUserIdx = 6
        // Eligible: i=1..5 (condensed - skipped), i=6 (lastUser - skipped)
        // i=7,8 (assistant responses) = 2 eligible
        const validResponse = buildValidResponse({
            original_message_count: 1,
            conversation_summary: "Fifth end-turn condense.",
        });
        const { client } = createMockClient(validResponse);

        const result = await condenseMessages(messages, 10, client, "deepseek-v4-flash", {
            maxRetries: 1,
            preserveTailCount: 0,
            threshold: 0.0,
        });

        expect(result).not.toBeNull();
        expect(result.stats.originalCount).toBe(1);

        // Verify all 5 prior condensed entries survived
        for (let t = 1; t <= 5; t++) {
            const entry = result.newMessages.find(
                (m) => m.condensed === true && m.content.includes(`Summary of turn ${t}`)
            );
            expect(entry).toBeDefined();
        }

        // Verify user6 preserved
        expect(result.newMessages.find((m) => m.role === "user" && m.content.includes("Turn 6 input"))).toBeDefined();
    });
});
