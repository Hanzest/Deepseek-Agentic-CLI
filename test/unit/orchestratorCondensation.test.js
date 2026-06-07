/**
 * Integration-style test for the orchestrator's context condensation pipeline.
 *
 * Validates that when token usage exceeds 65% of a 150-token limit, the
 * condensation code path is triggered and `messages` is safely reassigned
 * without throwing `TypeError: Assignment to constant variable`.
 *
 * The test mocks ALL external dependencies (OpenAI client, CLI input,
 * tokenizer, condenser, file I/O) to run deterministically without a
 * live API key, real terminal, or filesystem side effects.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock ALL orchestrator dependencies
// ---------------------------------------------------------------------------

vi.mock("openai", () => {
    const mockCreate = vi.fn(() =>
        Promise.resolve({
            choices: [{ message: { content: "Mock assistant response.", tool_calls: null } }],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
        })
    );
    return {
        default: vi.fn(() => ({
            chat: { completions: { create: mockCreate } },
        })),
    };
});

vi.mock("../../lib/cliInput.js", () => {
    // Simulate two turns: one long user prompt, then "exit"
    let callCount = 0;
    const mockAskWithHistory = vi.fn(() => {
        callCount++;
        if (callCount <= 1) {
            return Promise.resolve(
                "Write a very long and detailed response that exceeds the token limit. " +
                "Do not be brief. Elaborate on every possible aspect of this topic extensively."
            );
        }
        return Promise.resolve("exit");
    });

    return {
        ask: vi.fn(() => Promise.resolve("2")), // skip save
        askYesNo: vi.fn(() => Promise.resolve(false)),
        startChat: vi.fn(() =>
            Promise.resolve({
                model_name: "deepseek-v4-flash",
                apiKey: "test-key",
                baseURL: "https://api.test.com",
                provider: "deepseek",
            })
        ),
        thinkingToggle: vi.fn(() => Promise.resolve({ thinking: { type: "disabled" } })),
        createPromptLoop: vi.fn(() => ({
            ask: mockAskWithHistory,
            addToHistory: vi.fn(),
            close: vi.fn(() => Promise.resolve()),
            pause: vi.fn(() => Promise.resolve()),
            getHistory: vi.fn(() => []),
        })),
    };
});

vi.mock("../../lib/tokenizer.js", () => ({
    // Always return total_tokens > 65% of default 10000 (= 130000) to force condensation.
    // We cannot modify HYPERPARAMETERS.token_limit from outside because it is not exported,
    // so we inflate the mock estimate instead.
    estimateTokens: vi.fn(() => ({
        input_tokens: 220000,
        output_tokens: 0,
        total_tokens: 220000,
    })),
}));

vi.mock("../../lib/contextCondenser.js", () => ({
    condenseMessages: vi.fn(() =>
        Promise.resolve({
            newMessages: [
                { role: "system", content: "## Role\nYou are an expert Orchestrator." },
                { role: "user", content: "Condensed conversation summary.", condensed: true },
            ],
            stats: {
                originalCount: 5,
                tokenReduction: 150,
                originalTokens: 200,
                newTokens: 50,
            },
        })
    ),
}));

vi.mock("../../lib/chatHistory.js", () => ({
    saveChatHistory: vi.fn(() => Promise.resolve("2025-06-01T00-00-00-000Z")),
    saveAuditHistory: vi.fn(() => Promise.resolve()),
    saveCondensedAudit: vi.fn(),
    sanitizeFilename: vi.fn((s) => s),
}));

vi.mock("../../lib/artifactManager.js", () => ({
    archiveActiveToHistory: vi.fn(() => Promise.resolve()),
    copyActiveToHistory: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../lib/streamHandler.js", () => ({
    printStreamResponse: vi.fn(() =>
        Promise.resolve({
            reasoning_content: null,
            content: "Test assistant response without tool calls.",
            tool_calls: null,
            usage: { prompt_tokens: 100, completion_tokens: 50 },
        })
    ),
}));

vi.mock("../../lib/colors.js", () => ({
    C: {
        system: "",
        heading: "",
        border: "",
        dim: "",
        warning: "",
        success: "",
        error: "",
        user: "",
        consent: "",
    },
    colorize: vi.fn((str) => str ?? ""),
}));

vi.mock("../../tools/registry.js", () => {
    const dummySchema = {
        type: "function",
        function: {
            name: "read_file_chunk",
            description: "Read a file chunk.",
            parameters: {
                type: "object",
                properties: { file_path: { type: "string" } },
                required: ["file_path"],
            },
        },
    };
    return {
        ORCHESTRATOR_TOOLS: {
            read_file_chunk: [dummySchema, vi.fn(), false],
            get_project_tree: [dummySchema, vi.fn(), false],
        },
        callToolsInBatch: vi.fn(),
    };
});

vi.mock("../../tools/callToolsInBatch.js", () => ({
    clearReadOnlyCache: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are registered (vitest hoists them)
// ---------------------------------------------------------------------------
import { runChat, SessionContext } from "../../lib/orchestrator.js";
import { condenseMessages } from "../../lib/contextCondenser.js";
import { estimateTokens } from "../../lib/tokenizer.js";

describe("orchestrator — context condensation pipeline", () => {
    let exitSpy;

    beforeEach(() => {
        vi.clearAllMocks();

        // Prevent process.exit(0) in runChat from killing the test runner
        exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { });

        // Simulate non-TTY environment to avoid readline/terminal issues
        Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    });

    afterEach(() => {
        exitSpy?.mockRestore();
        // Restore the default mock implementation for condenseMessages
        // (T4 test overrides it to return null)
        vi.mocked(condenseMessages).mockImplementation(() =>
            Promise.resolve({
                newMessages: [
                    { role: "system", content: "## Role\nYou are an expert Orchestrator." },
                    { role: "user", content: "Condensed conversation summary.", condensed: true },
                ],
                stats: {
                    originalCount: 5,
                    tokenReduction: 150,
                    originalTokens: 200,
                    newTokens: 50,
                },
            })
        );
    });

    it("should handle condensation failure gracefully without crashing", async () => {
        // Temporarily make condenseMessages return null (failure) for this test
        condenseMessages.mockImplementation(() => Promise.resolve(null));

        // --- Act ---
        // With condenseMessages returning null, outer/mid-turn/brink condensation
        // all skip. The orchestrator should not crash but continue gracefully.
        await expect(runChat()).resolves.toBeUndefined();

        // --- Assert ---

        // 1. Condensation was called at least once
        expect(condenseMessages).toHaveBeenCalled();

        // 2. Token estimation was called (confirms the flow continued past condensation)
        expect(estimateTokens).toHaveBeenCalled();

        // 3. The condensation audit trail may be empty (all failures)
        // This is acceptable - the key assertion is that runChat() resolved
        // without throwing.
    });

    it("should trigger condensation and NOT throw TypeError on messages reassignment", async () => {
        // --- Act ---
        // runChat() starts the interactive session and enters multiTurnLoop.
        // With a 150-token limit and mocked estimateTokens returning 120,
        // the condensation threshold (65% of 150 = 97.5) is exceeded on every turn.
        //
        // If the fix (const → let on line 806) were missing, this would throw:
        //   TypeError: Assignment to constant variable.
        await expect(runChat()).resolves.toBeUndefined();

        // --- Assert ---

        // 1. Condensation was triggered at least once
        expect(condenseMessages).toHaveBeenCalled();

        // 2. Token estimation was called (confirms the flow reached that point)
        expect(estimateTokens).toHaveBeenCalled();

        // 3. The condensation audit trail has entries (confirms success)
        expect(SessionContext.condensationAuditTrail.length).toBeGreaterThanOrEqual(1);

        // 4. The audit entry contains expected stats shape
        const lastEntry = SessionContext.condensationAuditTrail.at(-1);
        expect(lastEntry).toMatchObject({
            originalCount: expect.any(Number),
            tokenReduction: expect.any(Number),
            originalTokens: expect.any(Number),
            newTokens: expect.any(Number),
        });
    });
});
